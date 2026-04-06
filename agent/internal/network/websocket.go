package network

import (
	"context"
	"encoding/json"
	"log"
	"math"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"time"

	"github.com/10kk/agent/internal/docker"
	"github.com/10kk/agent/internal/metrics"
	"github.com/10kk/agent/internal/telemetry"
	"github.com/10kk/agent/internal/updater"
	"github.com/gorilla/websocket"
)

const (
	maxBackoff     = 60 * time.Second
	writeTimeout   = 10 * time.Second
	pingInterval   = 15 * time.Second
)

// inboundMsg is the shape of commands received from the master.
type inboundMsg struct {
	Type        string            `json:"type"`
	Action      string            `json:"action"`
	ContainerID string            `json:"container_id,omitempty"`
	UpdateURL   string            `json:"url,omitempty"`
	Version     string            `json:"version,omitempty"`
	Command     string            `json:"command,omitempty"`
	SessionID   string            `json:"sessionId,omitempty"`
	// deploy fields
	Repo             string            `json:"repo,omitempty"`
	Branch           string            `json:"branch,omitempty"`
	ImageName        string            `json:"imageName,omitempty"`
	EnvVars          map[string]string `json:"envVars,omitempty"`
	ProxyHost        string            `json:"proxyHost,omitempty"`
	ProxyPort        int               `json:"proxyPort,omitempty"`
	HealthCheckURL   string            `json:"healthCheckUrl,omitempty"`
	HealthCheckDelay int               `json:"healthCheckDelay,omitempty"`
}

// RunConnectionLoop dials the master and re-dials on any disconnect.
// It exits only when ctx is cancelled (agent shutdown).
func RunConnectionLoop(ctx context.Context, masterURL, token string, metricsCh <-chan metrics.HostMetrics) {
	attempt := 0
	for {
		select {
		case <-ctx.Done():
			docker.StopAllStreams()
			return
		default:
		}

		err := connect(ctx, masterURL, token, metricsCh)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			backoff := backoffDuration(attempt)
			log.Printf("[ws] disconnected (%v); reconnecting in %s", err, backoff)
			attempt++
			select {
			case <-time.After(backoff):
			case <-ctx.Done():
				return
			}
		} else {
			attempt = 0
		}
	}
}

// connect establishes a single WebSocket session with the master.
func connect(ctx context.Context, masterURL, token string, metricsCh <-chan metrics.HostMetrics) error {
	tlsCfg, err := LoadTLSConfig()
	if err != nil {
		log.Printf("[ws] mTLS config error: %v — falling back to system TLS", err)
		tlsCfg = nil // the server may also accept non-mTLS connections
	}

	dialer := websocket.Dialer{
		TLSClientConfig:  tlsCfg,
		HandshakeTimeout: 10 * time.Second,
	}

	headers := http.Header{}
	headers.Set("Authorization", "Bearer "+token)
	headers.Set("X-Agent-OS", os.Getenv("GOOS"))
	headers.Set("X-Agent-Version", agentVersion())

	conn, _, err := dialer.DialContext(ctx, masterURL, headers)
	if err != nil {
		return err
	}
	defer conn.Close()

	log.Printf("[ws] connected to %s", masterURL)

	// Outbound channel — all goroutines write here; single writer sends to WS.
	outCh := make(chan []byte, 32)

	// --- Goroutine: relay metrics ---
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case m, ok := <-metricsCh:
				if !ok {
					return
				}
				b, err := json.Marshal(map[string]any{"type": "metrics", "data": m})
				if err == nil {
					outCh <- b
				}
			}
		}
	}()

	// --- Goroutine: periodic ping ---
	go func() {
		ticker := time.NewTicker(pingInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				b, _ := json.Marshal(map[string]string{"type": "ping"})
				outCh <- b
			}
		}
	}()

	// --- Goroutine: periodic telemetry ---
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				t, err := telemetry.Collect()
				if err == nil && t != nil {
					b, err := json.Marshal(map[string]any{"type": "telemetry", "payload": t})
					if err == nil {
						outCh <- b
					}
				}
			}
		}
	}()

	// --- Goroutine: read commands from master ---
	readErrCh := make(chan error, 1)
	go func() {
		for {
			_, raw, err := conn.ReadMessage()
			if err != nil {
				readErrCh <- err
				return
			}
			var msg inboundMsg
			if err := json.Unmarshal(raw, &msg); err != nil {
				continue
			}
			handleCommand(ctx, msg, outCh)
		}
	}()

	// --- Main write loop ---
	for {
		select {
		case <-ctx.Done():
			conn.WriteMessage(websocket.CloseMessage,
				websocket.FormatCloseMessage(websocket.CloseNormalClosure, "agent stopping"))
			return nil

		case b := <-outCh:
			conn.SetWriteDeadline(time.Now().Add(writeTimeout))
			if err := conn.WriteMessage(websocket.TextMessage, b); err != nil {
				return err
			}

		case err := <-readErrCh:
			return err
		}
	}
}

// handleCommand dispatches an inbound command from the master.
func handleCommand(ctx context.Context, msg inboundMsg, out chan<- []byte) {
	switch msg.Action {
	case "stream_logs":
		docker.StartStream(ctx, msg.ContainerID, out)

	case "stop_logs":
		docker.StopStream(msg.ContainerID)

	case "shell":
		go func() {
			send := func(v any) {
				b, err := json.Marshal(v)
				if err != nil { return }
				select {
				case out <- b:
				case <-ctx.Done():
				}
			}

			// Use the OS-appropriate shell.
			var import_exec *exec.Cmd
			if runtime.GOOS == "windows" {
				import_exec = exec.Command("cmd", "/C", msg.Command)
			} else {
				import_exec = exec.Command("sh", "-c", msg.Command)
			}
			
			// We stream stdout/stderr live
			stdout, err := import_exec.StdoutPipe()
			if err != nil {
				send(map[string]any{"type": "shell_output", "sessionId": msg.SessionID, "message": "Exec error: " + err.Error() + "\n"})
				send(map[string]any{"type": "shell_exit", "sessionId": msg.SessionID, "code": -1})
				return
			}
			stderr, err := import_exec.StderrPipe()
			if err != nil {
				send(map[string]any{"type": "shell_output", "sessionId": msg.SessionID, "message": "Exec error: " + err.Error() + "\n"})
				send(map[string]any{"type": "shell_exit", "sessionId": msg.SessionID, "code": -1})
				return
			}

			if err := import_exec.Start(); err != nil {
				send(map[string]any{"type": "shell_output", "sessionId": msg.SessionID, "message": "Exec start error: " + err.Error() + "\n"})
				send(map[string]any{"type": "shell_exit", "sessionId": msg.SessionID, "code": -1})
				return
			}

			// Read loops
			go func() {
				buf := make([]byte, 1024)
				for {
					n, err := stdout.Read(buf)
					if n > 0 {
						send(map[string]any{"type": "shell_output", "sessionId": msg.SessionID, "message": string(buf[:n])})
					}
					if err != nil { break }
				}
			}()

			go func() {
				buf := make([]byte, 1024)
				for {
					n, err := stderr.Read(buf)
					if n > 0 {
						send(map[string]any{"type": "shell_output", "sessionId": msg.SessionID, "message": string(buf[:n])})
					}
					if err != nil { break }
				}
			}()

			err = import_exec.Wait()
			exitCode := 0
			if exitCodeErr, ok := err.(*exec.ExitError); ok {
				exitCode = exitCodeErr.ExitCode()
			} else if err != nil {
				send(map[string]any{"type": "shell_output", "sessionId": msg.SessionID, "message": "\nCommand error: " + err.Error() + "\n"})
				exitCode = -1
			}

			send(map[string]any{"type": "shell_exit", "sessionId": msg.SessionID, "code": exitCode})
		}()

	case "update":
		if msg.UpdateURL != "" && msg.Version != "" {
			go func() {
				if err := updater.DoUpdate(msg.UpdateURL, msg.Version); err != nil {
					log.Printf("[updater] failed: %v", err)
				}
			}()
		}

	case "deploy":
		go func() {
			send := func(v any) {
				b, err := json.Marshal(v)
				if err != nil {
					return
				}
				select {
				case out <- b:
				case <-ctx.Done():
				}
			}

			logFn := func(line string) {
				send(map[string]string{"type": "log_line", "message": line})
			}

			req := docker.DeployRequest{
				Repo:             msg.Repo,
				Branch:           msg.Branch,
				ImageName:        msg.ImageName,
				EnvVars:          msg.EnvVars,
				ProxyHost:        msg.ProxyHost,
				ProxyPort:        msg.ProxyPort,
				HealthCheckURL:   msg.HealthCheckURL,
				HealthCheckDelay: msg.HealthCheckDelay,
			}

			result := docker.RunDeploy(ctx, req, logFn)

			if result.RolledBack {
				log.Printf("[deploy] rolled back: %v", result.Err)
				send(map[string]string{"type": "deploy_rolled_back", "message": result.Err.Error()})
				return
			}

			if result.Err != nil {
				log.Printf("[deploy] failed: %v", result.Err)
				send(map[string]string{"type": "deploy_failed", "message": result.Err.Error()})
				return
			}

			// If proxy labels were set, register the gateway route on the master
			if msg.ProxyHost != "" && msg.ProxyPort > 0 {
				send(map[string]any{
					"type":          "route_register",
					"host":          msg.ProxyHost,
					"port":          msg.ProxyPort,
					"containerName": msg.ImageName,
				})
			}

			send(map[string]string{"type": "deploy_done"})
		}()

	default:
		log.Printf("[ws] unknown action: %s", msg.Action)
	}
}

// backoffDuration returns exponential backoff capped at maxBackoff.
func backoffDuration(attempt int) time.Duration {
	d := time.Duration(math.Pow(2, float64(attempt))) * time.Second
	if d > maxBackoff {
		return maxBackoff
	}
	return d
}

func agentVersion() string {
	if v := os.Getenv("AGENT_VERSION"); v != "" {
		return v
	}
	return "v1.0.0"
}

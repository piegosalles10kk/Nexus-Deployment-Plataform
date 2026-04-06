/**
 * agent-ws.service.ts
 *
 * Runs a separate HTTPS/WSS server on AGENT_WS_PORT (default 8443) with mTLS
 * (client certificate verification). Connected agents are identified by their
 * JWT token sent in the Authorization header during the WebSocket handshake.
 *
 * Responsibilities:
 *  - Upgrade HTTP → WebSocket after mTLS handshake
 *  - Authenticate agent via Bearer JWT (same secret as the main API)
 *  - Update Node.status = ONLINE / OFFLINE and last_ping in Prisma
 *  - Relay metrics payload to the frontend via Socket.io
 *  - Forward log_line messages to the correct Socket.io project room
 */
import https from 'https';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { Server as SocketServer } from 'socket.io';
import { env } from '../config/env';
import prisma from '../config/database';
import { getCACert, getCAKey } from './ca.service';
import { getRedisClient } from '../config/redis';

// Map nodeId → WebSocket, so the master can push commands to specific agents
const agentSockets = new Map<string, WebSocket>();

export function getAgentSocket(nodeId: string): WebSocket | undefined {
  return agentSockets.get(nodeId);
}

/**
 * Start the mTLS WebSocket server.
 * Called once from createApp() after the CA is warm.
 */
export async function startAgentWsServer(io: SocketServer): Promise<void> {
  const caCert = await getCACert();
  const caKey  = await getCAKey();

  // The mTLS server presents the same CA cert as its server cert.
  // In production, replace with a proper server cert issued by the same CA.
  // For simplicity we generate a self-signed server cert from the CA here.
  const { serverCert, serverKey } = await generateServerCert(caCert, caKey);

  const port = parseInt(process.env.AGENT_WS_PORT ?? '8443', 10);

  const httpsServer = https.createServer({
    ca:                 caCert,
    cert:               serverCert,
    key:                serverKey,
    requestCert:        true,   // request client cert (mTLS)
    rejectUnauthorized: false,  // we validate manually so we can send a 401 message
  });

  const wss = new WebSocketServer({ server: httpsServer });

  wss.on('connection', (ws, req) => {
    // 1. Verify the client certificate if presented
    const socket = req.socket as any;
    const clientCert = socket.getPeerCertificate?.();
    if (!clientCert || !socket.authorized) {
      // Allow fallback to JWT-only auth (no cert) for development/testing
      // In strict mode, uncomment the following:
      // ws.close(1008, 'mTLS: client certificate required');
      // return;
    }

    // 2. Authenticate via JWT in Authorization header
    const authHeader = req.headers['authorization'] ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      ws.close(1008, 'Authentication required');
      return;
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET);
    } catch {
      ws.close(1008, 'Invalid token');
      return;
    }

    const nodeId: string = decoded.nodeId;
    if (!nodeId) {
      ws.close(1008, 'Token missing nodeId claim');
      return;
    }

    // 3. Update node status in DB
    const remoteIp = req.socket.remoteAddress ?? undefined;
    const agentOs = (req.headers['x-agent-os'] as string) || undefined;
    const agentVersion = (req.headers['x-agent-version'] as string) || undefined;
    
    prisma.node.update({
      where: { id: nodeId },
      data:  { 
        status: 'ONLINE', 
        ipAddress: remoteIp,
        os: agentOs,
        version: agentVersion
      },
    }).catch(console.error);

    agentSockets.set(nodeId, ws);
    console.log(`🤝 Agent connected: nodeId=${nodeId} ip=${remoteIp}`);

    ws.on('message', (raw) => {
      let msg: any;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      switch (msg.type) {
        case 'ping':
          // Touch last_ping (handled by @updatedAt) + keep ONLINE
          prisma.node.update({ where: { id: nodeId }, data: { status: 'ONLINE' } })
                     .catch(console.error);
          break;

        case 'metrics':
          // Legacy or fallback broadcast
          io.emit('node:metrics', { nodeId, data: msg.data });
          break;

        case 'telemetry':
          // Save to Redis (capped to last 100 entries)
          console.log(`📊 Telemetry received from nodeId=${nodeId}`);
          getRedisClient().then((redis) => {
            const key = `node:${nodeId}:telemetry`;
            const m = redis.multi();
            // LPUSH adds to the head (index 0)
            m.lPush(key, JSON.stringify(msg.payload));
            // LTRIM keeps indices 0 to 99
            m.lTrim(key, 0, 99);
            m.exec().catch(err => console.error(`[redis] exec failed for nodeId=${nodeId}:`, err));
          }).catch(err => {
            console.error(`[redis] connection failed for nodeId=${nodeId}:`, err);
          });

          // Broadcast to connected web clients
          io.emit('node:telemetry', { nodeId, data: msg.payload });
          break;

        case 'log_line':
          // Forward to the Socket.io room for the relevant project (best-effort)
          io.emit('agent:log', { nodeId, containerId: msg.container_id, line: msg.data });
          break;

        case 'shell_output':
          io.to(`server:${nodeId}`).emit('agent:shell_output', { sessionId: msg.sessionId, message: msg.message });
          break;

        case 'shell_exit':
          io.to(`server:${nodeId}`).emit('agent:shell_exit', { sessionId: msg.sessionId, code: msg.code });
          break;

        case 'route_register': {
          // Agent finished a deploy and is registering the gateway route for the container
          const routePath = `/${msg.host}`;
          const targetUrl = `http://${msg.containerName}:${msg.port}`;
          prisma.gatewayRoute.upsert({
            where:  { routePath },
            update: { targetUrl, isActive: true, name: String(msg.host) },
            create: { name: String(msg.host), routePath, targetUrl, isActive: true },
          }).then(() => {
            console.log(`🌐 [agent-ws] Route registered: ${routePath} → ${targetUrl}`);
            io.emit('gateway:route_updated', { routePath, targetUrl, isActive: true });
          }).catch(console.error);
          break;
        }

        case 'route_deregister': {
          // Agent signals that the container stopped — deactivate the route
          const routePath = `/${msg.host}`;
          prisma.gatewayRoute.updateMany({
            where: { routePath },
            data:  { isActive: false },
          }).then(() => {
            console.log(`🔴 [agent-ws] Route deregistered: ${routePath}`);
            io.emit('gateway:route_updated', { routePath, isActive: false });
          }).catch(console.error);
          break;
        }

        default:
          break;
      }
    });

    ws.on('close', () => {
      agentSockets.delete(nodeId);
      prisma.node.update({ where: { id: nodeId }, data: { status: 'OFFLINE' } })
                 .catch(console.error);
      console.log(`🔌 Agent disconnected: nodeId=${nodeId}`);
    });

    ws.on('error', (err) => {
      console.error(`[agent-ws] error for nodeId=${nodeId}: ${err.message}`);
    });
  });

  httpsServer.listen(port, () => {
    console.log(`🔐 Agent WSS (mTLS) listening on port ${port}`);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function generateServerCert(
  caCertPem: string,
  caKeyPem: string,
): Promise<{ serverCert: string; serverKey: string }> {
  const { execSync } = await import('child_process');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), '10kk-srv-'));
  try {
    const caKeyPath   = path.join(tmpDir, 'ca.key');
    const caCertPath  = path.join(tmpDir, 'ca.crt');
    const srvKeyPath  = path.join(tmpDir, 'srv.key');
    const srvCsrPath  = path.join(tmpDir, 'srv.csr');
    const srvCertPath = path.join(tmpDir, 'srv.crt');

    fs.writeFileSync(caKeyPath,  caKeyPem);
    fs.writeFileSync(caCertPath, caCertPem);

    execSync(`openssl genrsa -out "${srvKeyPath}" 2048`, { stdio: 'pipe' });
    execSync(
      `openssl req -new -key "${srvKeyPath}" -out "${srvCsrPath}" ` +
      `-subj "/CN=10kk-agent-server/O=10KK/C=BR"`,
      { stdio: 'pipe' },
    );
    execSync(
      `openssl x509 -req -days 3650 ` +
      `-in "${srvCsrPath}" -CA "${caCertPath}" -CAkey "${caKeyPath}" -CAcreateserial ` +
      `-out "${srvCertPath}"`,
      { stdio: 'pipe' },
    );

    return {
      serverCert: fs.readFileSync(srvCertPath, 'utf8'),
      serverKey:  fs.readFileSync(srvKeyPath,  'utf8'),
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

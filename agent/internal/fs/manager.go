// Package fs provides safe file-system operations scoped to a project's
// persistent clone directory.  All paths are validated to prevent traversal
// attacks before any OS operation is performed.
package fs

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// ProjectsBaseDir is the root under which each project's repo is cloned.
const ProjectsBaseDir = "./projects"

// FileEntry represents a single file or directory within a project.
type FileEntry struct {
	Name  string `json:"name"`
	Path  string `json:"path"`  // relative to project root
	IsDir bool   `json:"isDir"`
	Size  int64  `json:"size"`
}

// safeAbs resolves relPath inside the project's base directory and returns the
// absolute OS path.  Returns an error if the resolved path would escape the
// project root (path-traversal protection).
func safeAbs(imageName, relPath string) (string, error) {
	// Sanitise imageName — strip any path separators so it stays a single dir.
	clean := filepath.Base(filepath.Clean(imageName))
	if clean == "." || clean == ".." || clean == "" {
		return "", fmt.Errorf("invalid imageName")
	}

	base := filepath.Join(ProjectsBaseDir, clean)

	// filepath.Join already cleans the path; Join(base, "") == base.
	target := filepath.Join(base, relPath)

	// Verify the target is still under base.
	rel, err := filepath.Rel(base, target)
	if err != nil || strings.HasPrefix(rel, "..") {
		return "", fmt.Errorf("path escapes project directory")
	}

	return target, nil
}

// ListFiles returns the immediate children of relPath inside the project
// directory.  The special ".git" directory is always excluded.
func ListFiles(imageName, relPath string) ([]FileEntry, error) {
	abs, err := safeAbs(imageName, relPath)
	if err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(abs)
	if err != nil {
		return nil, fmt.Errorf("listFiles: %w", err)
	}

	result := make([]FileEntry, 0, len(entries))
	for _, e := range entries {
		if e.Name() == ".git" {
			continue
		}

		var size int64
		if !e.IsDir() {
			if info, infoErr := e.Info(); infoErr == nil {
				size = info.Size()
			}
		}

		// Build a clean relative path to the child.
		childRel := e.Name()
		if relPath != "" && relPath != "/" && relPath != "." {
			childRel = filepath.Join(relPath, e.Name())
		}

		result = append(result, FileEntry{
			Name:  e.Name(),
			Path:  childRel,
			IsDir: e.IsDir(),
			Size:  size,
		})
	}
	return result, nil
}

// ReadFile returns the text content of the file at relPath.
// Returns an error if the file is larger than 1 MB to protect the WebSocket channel.
func ReadFile(imageName, relPath string) (string, error) {
	abs, err := safeAbs(imageName, relPath)
	if err != nil {
		return "", err
	}

	info, err := os.Stat(abs)
	if err != nil {
		return "", fmt.Errorf("readFile stat: %w", err)
	}
	if info.IsDir() {
		return "", fmt.Errorf("path is a directory")
	}
	const maxBytes = 1 * 1024 * 1024 // 1 MB
	if info.Size() > maxBytes {
		return "", fmt.Errorf("file too large (%d bytes; limit %d)", info.Size(), maxBytes)
	}

	b, err := os.ReadFile(abs)
	if err != nil {
		return "", fmt.Errorf("readFile: %w", err)
	}
	return string(b), nil
}

// WriteFile writes content to the file at relPath, creating it if it does not
// exist.  Parent directories are created as needed.
func WriteFile(imageName, relPath, content string) error {
	abs, err := safeAbs(imageName, relPath)
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(abs), 0755); err != nil {
		return fmt.Errorf("writeFile mkdir: %w", err)
	}

	return os.WriteFile(abs, []byte(content), 0644)
}

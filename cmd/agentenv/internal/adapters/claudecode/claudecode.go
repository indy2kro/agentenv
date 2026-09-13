// Package claudecode implements the Claude Code adapter for agentenv.
package claudecode

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/indy2kro/agentenv/cmd/agentenv/internal/config"
)

// ClaudeCodeSettings represents the structure of .claude/settings.json.
type ClaudeCodeSettings struct {
	Permissions    *ClaudePermissions `json:"permissions,omitempty"`
	StatusLine     *StatusLine        `json:"statusLine,omitempty"`
	EnabledPlugins map[string]bool    `json:"enabledPlugins,omitempty"`
	ExtraKnownMarketplaces map[string]interface{} `json:"extraKnownMarketplaces,omitempty"`
	AutoUpdatesChannel string `json:"autoUpdatesChannel,omitempty"`
	TUI          string `json:"tui,omitempty"`
	SkipAutoPermissionPrompt bool `json:"skipAutoPermissionPrompt,omitempty"`
	Model        string `json:"model,omitempty"`
	Hooks        *Hooks    `json:"hooks,omitempty"`
	Env          map[string]string `json:"env,omitempty"`
}

// ClaudePermissions represents permission settings.
type ClaudePermissions struct {
	Allow   []string `json:"allow"`
	Deny    []string `json:"deny"`
	DefaultMode string `json:"defaultMode"`
}

// StatusLine represents status line configuration.
type StatusLine struct {
	Type    string `json:"type"`
	Command string `json:"command"`
}

// Hooks represents hook configuration.
type Hooks struct {
	PreToolUse  []HookEntry `json:"PreToolUse,omitempty"`
	PostToolUse []HookEntry `json:"PostToolUse,omitempty"`
	SessionStart []HookEntry `json:"SessionStart,omitempty"`
}

// HookEntry represents a single hook entry.
type HookEntry struct {
	Matcher string     `json:"matcher"`
	Hooks   []HookSpec `json:"hooks"`
}

// HookSpec represents a single hook specification.
type HookSpec struct {
	Type    string `json:"type"`
	Command string `json:"command"`
}

// SettingsFilePath returns the path to the Claude Code settings file.
func SettingsFilePath(scope config.Scope, baseDir string) string {
	if scope == config.ScopeUser {
		home, _ := os.UserHomeDir()
		return filepath.Join(home, ".claude", "settings.json")
	}
	// Project scope
	return filepath.Join(baseDir, ".claude", "settings.json")
}

// GenerateSettings generates Claude Code settings with rtk hooks.
func GenerateSettings(cfg *config.Config, baseDir string) (*ClaudeCodeSettings, error) {
	settings := &ClaudeCodeSettings{
		Permissions: &ClaudePermissions{
			Allow: []string{
				"Bash(mkdir:*)",
				"Bash(go:*)",
				"Write(*)",
				"Bash(ls:*)",
				"Bash(git:*)",
				"Update(*:*)",
				"Bash(mv:*)",
				"Bash(echo:*)",
				"Bash(sed:*)",
				"Bash(source:*)",
				"Bash(head:*)",
				"Bash(tail:*)",
				"Bash(npm:*)",
				"Bash(npx:*)",
				"Bash(pkill:*)",
				"Bash(touch:*)",
				"Bash(grep:*)",
				"Bash(deadcode:*)",
				"Bash(sqlite3:*)",
				"Bash(curl:*)",
				"Bash(rg:*)",
				"Bash(chmod:*)",
				"Bash(lsof:*)",
				"Bash(make:*)",
				"Bash(PORT=:*)",
				"Bash(find:*)",
				"Bash(docker:*)",
				"Bash(poetry:*)",
				"Bash(python:*)",
				"Bash(python3:*)",
				"Update(*)",
			},
			DefaultMode: "auto",
		},
		Env: map[string]string{},
	}

	// Add rtk hook if enabled
	if cfg.RTK.Enabled && cfg.RTK.Init.ClaudeCode {
		settings.Hooks = &Hooks{
			PreToolUse: []HookEntry{
				{
					Matcher: "Bash",
					Hooks: []HookSpec{
						{
							Type:    "command",
							Command: "rtk hook claude",
						},
					},
				},
			},
		}
	}

	// Add shell configuration for Windows if Tier0 is enabled
	if cfg.Tier0.CheckEnabled {
		// On Windows, configure Git Bash path
		if runtimeOS := getOS(); runtimeOS == "windows" {
			info, err := detectGitBash()
			if err == nil && info.IsInstalled {
				settings.Env["CLAUDE_CODE_GIT_BASH_PATH"] = info.BashPath
			}
		}
	}

	return settings, nil
}

// WriteSettings writes the settings to the appropriate file.
func WriteSettings(settings *ClaudeCodeSettings, path string) error {
	// Ensure directory exists
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}

	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal settings: %w", err)
	}

	if err := os.WriteFile(path, data, 0o644); err != nil {
		return fmt.Errorf("failed to write settings: %w", err)
	}

	return nil
}

// WriteCLAUDEMD writes the CLAUDE.md pointer file.
func WriteCLAUDEMD(scope config.Scope, baseDir string) error {
	var path string
	if scope == config.ScopeUser {
		home, _ := os.UserHomeDir()
		path = filepath.Join(home, ".claude", "CLAUDE.md")
	} else {
		path = filepath.Join(baseDir, ".claude", "CLAUDE.md")
	}

	// Ensure directory exists
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}

	content := `# CLAUDE.md

Please see [AGENTS.md](../AGENTS.md) for AI agent instructions.
`

	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		return fmt.Errorf("failed to write CLAUDE.md: %w", err)
	}

	return nil
}

// getOS returns the current operating system.
func getOS() string {
	// This is a simplified version; in a real implementation, use runtime.GOOS
	// or a proper OS detection mechanism
	return "windows" // Placeholder
}

// detectGitBash detects Git for Windows installation.
func detectGitBash() (*GitBashInfo, error) {
	// Simplified version; in a real implementation, use the shell package
	paths := []string{
		"C:\\Program Files\\Git\\usr\\bin\\bash.exe",
		"C:\\Program Files\\Git\\bin\\bash.exe",
	}

	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			return &GitBashInfo{
				BashPath:   p,
				BinPath:    filepath.Dir(p),
				UsrBinPath: filepath.Join(filepath.Dir(filepath.Dir(p)), "usr", "bin"),
				IsInstalled: true,
			}, nil
		}
	}

	return &GitBashInfo{IsInstalled: false}, nil
}

// GitBashInfo contains information about Git for Windows.
type GitBashInfo struct {
	BashPath   string
	BinPath    string
	UsrBinPath string
	IsInstalled bool
}

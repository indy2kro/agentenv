// Package config defines the agentenv.toml schema and provides load/save/validate/diff operations.
package config

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/pelletier/go-toml/v2"
)

// Scope indicates the configuration scope (project or user).
type Scope string

const (
	ScopeProject Scope = "project"
	ScopeUser   Scope = "user"
)

// AgentConfig defines which agents are enabled.
type AgentConfig struct {
	ClaudeCode bool `toml:"claude_code"`
	CodexCLI  bool `toml:"codex_cli"`
	Copilot   bool `toml:"copilot"`
	OpenCode  bool `toml:"opencode"`
}

// ToolConfig defines which tools are enabled/disabled.
type ToolConfig struct {
	// Tier 1: Essential
	Ripgrep bool `toml:"ripgrep"`
	Fd      bool `toml:"fd"`
	Jq      bool `toml:"jq"`
	Rtk     bool `toml:"rtk"`

	// Tier 2: AI-coding value-add
	AstGrep    bool `toml:"ast_grep"`
	GitDelta  bool `toml:"git_delta"`
	Ctags     bool `toml:"universal_ctags"`
	Gh        bool `toml:"gh"`
	Difftastic bool `toml:"difftastic"`

	// Tier 3: Power-user
	Yq          bool `toml:"yq"`
	Bat         bool `toml:"bat"`
	Eza         bool `toml:"eza"`
	Miller      bool `toml:"miller"`
	Tokei       bool `toml:"tokei"`
	Hyperfine   bool `toml:"hyperfine"`
	Fzf         bool `toml:"fzf"`
	Just        bool `toml:"just"`
	Watchexec   bool `toml:"watchexec"`
	Direnv      bool `toml:"direnv"`
}

// CustomTool defines a custom tool that the user wants to include.
type CustomTool struct {
	Name        string `toml:"name"`
	Description string `toml:"description"`
	// If already installed, provide OS-specific paths
	AlreadyInstalled bool   `toml:"already_installed"`
	PathWindows     string `toml:"path.windows"`
	PathMacOS       string `toml:"path.macos"`
	PathLinux       string `toml:"path.linux"`
	// If installable via mise
	MiseSource string `toml:"mise_source"`
	Version     string `toml:"version"`
}

// RTKConfig defines rtk-specific configuration.
type RTKConfig struct {
	Enabled   bool `toml:"enabled"`
	Init      struct {
		ClaudeCode bool `toml:"claude_code"`
		CodexCLI  bool `toml:"codex_cli"`
		Copilot   bool `toml:"copilot"`
		OpenCode  bool `toml:"opencode"`
	} `toml:"init"`
}

// Tier0Config defines Tier 0 (shell) configuration.
type Tier0Config struct {
	CheckEnabled bool   `toml:"check_enabled"`
	GitBashPath  string `toml:"git_bash_path"` // Windows-specific override
}

// GenerateConfig defines generation options.
type GenerateConfig struct {
	MarkerStart string   `toml:"marker_start"`
	MarkerEnd   string   `toml:"marker_end"`
	Files       []string `toml:"generated_files"`
}

// AdvancedConfig defines advanced options.
type AdvancedConfig struct {
	DefaultMode    string `toml:"default_mode"`    // "simple" or "advanced"
	ShowDiffPreview bool   `toml:"show_diff_preview"`
}

// Config is the root configuration structure.
type Config struct {
	Scope     Scope        `toml:"scope"`
	Agents    AgentConfig  `toml:"agents"`
	Tools     ToolConfig   `toml:"tools"`
	CustomTools []CustomTool `toml:"custom_tools"`
	RTK       RTKConfig    `toml:"rtk"`
	Tier0     Tier0Config  `toml:"tier0"`
	Generate  GenerateConfig `toml:"generate"`
	Advanced  AdvancedConfig `toml:"advanced"`
}

// DefaultConfig returns a new Config with sensible defaults.
func DefaultConfig() *Config {
	return &Config{
		Scope: ScopeProject,
		Agents: AgentConfig{
			ClaudeCode: true,
			CodexCLI:  true,
			Copilot:   true,
			OpenCode:  true,
		},
		Tools: ToolConfig{
			// Tier 1: Essential (Simple mode default)
			Ripgrep: true,
			Fd:      true,
			Jq:      true,
			Rtk:     true,
			// Tier 2: AI-coding value-add (on by default in Simple mode)
			AstGrep:    true,
			GitDelta:  true,
			Ctags:     false, // Disabled by default (no mise registry entry)
			Gh:        true,
			Difftastic: true,
			// Tier 3: Power-user (Advanced mode only)
			Yq:        true,
			Bat:       true,
			Eza:       true,
			Miller:    true,
			Tokei:     false, // Disabled by default (requires Rust)
			Hyperfine: true,
			Fzf:       true,
			Just:      true,
			Watchexec: true,
			Direnv:    true,
		},
		RTK: RTKConfig{
			Enabled: true,
			Init: struct {
				ClaudeCode bool `toml:"claude_code"`
				CodexCLI  bool `toml:"codex_cli"`
				Copilot   bool `toml:"copilot"`
				OpenCode  bool `toml:"opencode"`
			}{
				ClaudeCode: true,
				CodexCLI:  true,
				Copilot:   true,
				OpenCode:  true,
			},
		},
		Tier0: Tier0Config{
			CheckEnabled: true,
		},
		Generate: GenerateConfig{
			MarkerStart: "<!-- agentenv-managed-start -->",
			MarkerEnd:   "<!-- agentenv-managed-end -->",
			Files: []string{
				"AGENTS.md",
				"CLAUDE.md",
				"mise.toml",
				".claude/settings.json",
				".codex/config.toml",
				".codex/hooks.json",
				".copilot/hooks/*",
				"opencode.json",
			},
		},
		Advanced: AdvancedConfig{
			DefaultMode:    "simple",
			ShowDiffPreview: true,
		},
	}
}

// Load reads and parses an agentenv.toml file.
func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	var cfg Config
	if err := toml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse config: %w", err)
	}

	return &cfg, nil
}

// Save writes the config to a file.
func Save(cfg *Config, path string) error {
	data, err := toml.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	// Ensure directory exists
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}

	if err := os.WriteFile(path, data, 0o644); err != nil {
		return fmt.Errorf("failed to write config: %w", err)
	}

	return nil
}

// Validate checks the config for errors.
func Validate(cfg *Config) error {
	// Check at least one agent is enabled
	if !cfg.Agents.ClaudeCode && !cfg.Agents.CodexCLI && !cfg.Agents.Copilot && !cfg.Agents.OpenCode {
		return fmt.Errorf("at least one agent must be enabled")
	}

	// Check at least one tool is enabled
	// This is a simplified check; in practice, we'd check all tool fields
	if !cfg.Tools.Ripgrep && !cfg.Tools.Fd && !cfg.Tools.Jq && !cfg.Tools.Rtk {
		return fmt.Errorf("at least one Tier 1 tool must be enabled")
	}

	return nil
}

// Diff compares two configs and returns the differences.
func Diff(old, new *Config) []string {
	var diffs []string

	// Simple diff for now; in practice, use a proper diff library
	if old.Scope != new.Scope {
		diffs = append(diffs, fmt.Sprintf("scope: %s -> %s", old.Scope, new.Scope))
	}

	// Compare agents
	if old.Agents.ClaudeCode != new.Agents.ClaudeCode {
		diffs = append(diffs, fmt.Sprintf("agents.claude_code: %v -> %v", old.Agents.ClaudeCode, new.Agents.ClaudeCode))
	}
	if old.Agents.CodexCLI != new.Agents.CodexCLI {
		diffs = append(diffs, fmt.Sprintf("agents.codex_cli: %v -> %v", old.Agents.CodexCLI, new.Agents.CodexCLI))
	}
	if old.Agents.Copilot != new.Agents.Copilot {
		diffs = append(diffs, fmt.Sprintf("agents.copilot: %v -> %v", old.Agents.Copilot, new.Agents.Copilot))
	}
	if old.Agents.OpenCode != new.Agents.OpenCode {
		diffs = append(diffs, fmt.Sprintf("agents.opencode: %v -> %v", old.Agents.OpenCode, new.Agents.OpenCode))
	}

	// TODO: Add more comprehensive diffing for tools, custom_tools, etc.

	return diffs
}

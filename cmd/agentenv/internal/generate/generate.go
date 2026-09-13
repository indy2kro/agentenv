// Package generate handles AGENTS.md and CLAUDE.md generation with marker blocks.
package generate

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/indy2kro/agentenv/cmd/agentenv/internal/config"
)

// MarkerBlock represents a managed section in AGENTS.md or CLAUDE.md.
type MarkerBlock struct {
	Start string
	End   string
}

// DefaultMarkers returns the default marker blocks.
func DefaultMarkers() MarkerBlock {
	return MarkerBlock{
		Start: "<!-- agentenv-managed-start -->",
		End:   "<!-- agentenv-managed-end -->",
	}
}

// AGENTSData contains the data needed to generate AGENTS.md content.
type AGENTSData struct {
	EnabledAgents []string
	EnabledTools  []string
	CustomTools   []config.CustomTool
	RTKEnabled    bool
}

// GenerateAGENTSMD generates AGENTS.md content with managed tool listings.
func GenerateAGENTSMD(data AGENTSData, markers MarkerBlock) string {
	var sb strings.Builder

	// Header
	sb.WriteString("# AI Coding Agent Instructions\n\n")
	sb.WriteString("This file provides instructions for AI coding agents operating in this repository.\n\n")

	// Agent instructions
	sb.WriteString("## Supported Agents\n\n")
	sb.WriteString(markers.Start + "\n")
	sb.WriteString("- " + strings.Join(data.EnabledAgents, "\n- ") + "\n")
	sb.WriteString(markers.End + "\n\n")

	// Tool listings
	sb.WriteString("## Available Tools\n\n")
	sb.WriteString("The following tools are available via agentenv and will be used for operations:\n\n")
	sb.WriteString(markers.Start + "\n")
	
	// Group tools by category
	if len(data.EnabledTools) > 0 {
		sb.WriteString("### Search & Text Processing\n")
		for _, tool := range data.EnabledTools {
			if tool == "ripgrep" || tool == "fd" || tool == "jq" || tool == "yq" || tool == "ast-grep" {
				sb.WriteString(fmt.Sprintf("- **%s**: %s\n", tool, getToolDescription(tool)))
			}
		}
		
		sb.WriteString("\n### Code Navigation\n")
		for _, tool := range data.EnabledTools {
			if tool == "git-delta" || tool == "difftastic" || tool == "gh" {
				sb.WriteString(fmt.Sprintf("- **%s**: %s\n", tool, getToolDescription(tool)))
			}
		}
		
		sb.WriteString("\n### Utilities\n")
		for _, tool := range data.EnabledTools {
			if tool == "bat" || tool == "eza" || tool == "miller" || tool == "tokei" || tool == "hyperfine" || tool == "fzf" || tool == "just" || tool == "watchexec" || tool == "direnv" {
				sb.WriteString(fmt.Sprintf("- **%s**: %s\n", tool, getToolDescription(tool)))
			}
		}
		
		if data.RTKEnabled {
			sb.WriteString("\n### Token Optimization\n")
			sb.WriteString("- **rtk**: Command proxy that reduces token consumption by 60-90% on common dev commands\n")
		}
	}

	// Custom tools
	if len(data.CustomTools) > 0 {
		sb.WriteString("\n### Custom Tools\n")
		for _, ct := range data.CustomTools {
			sb.WriteString(fmt.Sprintf("- **%s**: %s\n", ct.Name, ct.Description))
		}
	}

	sb.WriteString(markers.End + "\n\n")

	// General instructions
	sb.WriteString("## General Instructions\n\n")
	sb.WriteString("- Prefer using the tools listed above for their respective tasks\n")
	sb.WriteString("- For file search, use `rg` (ripgrep) instead of `grep -r`\n")
	sb.WriteString("- For finding files, use `fd` instead of `find`\n")

	return sb.String()
}

// GenerateCLAUDEMD generates CLAUDE.md with a pointer to AGENTS.md.
func GenerateCLAUDEMD() string {
	return `# CLAUDE.md

Please see [AGENTS.md](./AGENTS.md) for AI agent instructions.
`
}

// getToolDescription returns a description for a known tool.
func getToolDescription(tool string) string {
	descriptions := map[string]string{
		"ripgrep":    "Fast text search (use instead of grep -r)",
		"fd":         "Fast, user-friendly file finder",
		"jq":         "Lightweight and flexible command-line JSON processor",
		"yq":         "YAML/TOML processor (jq for YAML)",
		"rtk":        "CLI proxy that reduces LLM token consumption",
		"ast-grep":   "Structural/AST-based code search and rewrite",
		"git-delta":  "Syntax-highlighted git diff pager",
		"difftastic": "Structural diff tool that understands syntax",
		"gh":         "GitHub CLI for repository operations",
		"bat":        "cat clone with syntax highlighting and git integration",
		"eza":        "Modern replacement for ls",
		"miller":     "CSV/TSV data processing",
		"tokei":      "Fast code statistics (LOC, etc.)",
		"hyperfine":  "Command-line benchmarking tool",
		"fzf":        "Fuzzy finder with non-interactive filter mode",
		"just":       "Command runner for project recipes",
		"watchexec":  "File watcher that runs commands on changes",
		"direnv":     "Environment variable manager",
	}
	
	if desc, ok := descriptions[tool]; ok {
		return desc
	}
	return "Available via agentenv"
}

// WriteFile writes content to a file, preserving existing content outside markers.
func WriteFile(path string, content string, markers MarkerBlock) error {
	// Check if file exists
	if _, err := os.Stat(path); err == nil {
		// File exists, need to preserve non-marker content
		return updateFileWithMarkers(path, content, markers)
	}

	// File doesn't exist, create it
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}

	return os.WriteFile(path, []byte(content), 0o644)
}

// updateFileWithMarkers updates a file, preserving content outside the marker blocks.
func updateFileWithMarkers(path string, newContent string, markers MarkerBlock) error {
	// Read existing file
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}

	content := string(data)

	// Find the start and end of the managed section
	startIdx := strings.Index(content, markers.Start)
	endIdx := strings.LastIndex(content, markers.End)

	if startIdx == -1 || endIdx == -1 {
		// Markers not found, append new content
		updated := content + "\n\n" + newContent
		return os.WriteFile(path, []byte(updated), 0o644)
	}

	// Preserve content before start marker and after end marker
	before := content[:startIdx]
	after := content[endIdx+len(markers.End):]

	// Build new content
	updated := before + markers.Start + "\n" + newContent + "\n" + markers.End + after

	return os.WriteFile(path, []byte(updated), 0o644)
}

// GenerateMiseTOML generates mise.toml content from config.
func GenerateMiseTOML(cfg *config.Config) string {
	var sb strings.Builder

	sb.WriteString("# mise.toml - Generated by agentenv\n")
	sb.WriteString("# Do not edit directly; edit agentenv.toml instead\n\n")

	sb.WriteString("[tools]\n")

	// Map of tool config fields to mise tool names
	toolMap := map[string]string{
		"ripgrep":    "ripgrep",
		"fd":         "fd",
		"jq":         "jq",
		"rtk":        "rtk",
		"ast_grep":   "ast-grep",
		"git_delta":  "delta",
		"gh":         "gh",
		"difftastic": "difftastic",
		"yq":         "yq",
		"bat":        "bat",
		"eza":        "eza",
		"miller":     "miller",
		"tokei":      "tokei",
		"hyperfine":  "hyperfine",
		"fzf":        "fzf",
		"just":       "just",
		"watchexec":  "watchexec",
		"direnv":     "direnv",
	}

	// Use reflection to iterate over ToolConfig fields
	// For now, we'll use a simple approach with explicit checks
	// In a real implementation, use reflection or code generation

	// This is a simplified version; the full implementation would iterate
	// over all enabled tools and write them to mise.toml

	return sb.String()
}

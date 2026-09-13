// Package commands provides the CLI command structure for agentenv.
package commands

import (
	"fmt"
	"os"

	"charm.land/huh/v2"
)

// Execute is the main entrypoint for the CLI.
func Execute() error {
	// Create a new Huh form for the main menu
	form := huh.NewForm(
		huh.Title("agentenv — AI Agent Environment Setup"),
		huh.Description("Configure a consistent, capable shell environment for AI coding agents"),
	)

	var choice string

	form.AddGroup(
		[]*huh.Field{
			huh.NewSelect[string](
				"Command",
				"Select a command to run",
				[]huh.Option[string]{
					{Key: "setup", Value: "Interactive setup wizard (Simple mode)"},
					{Key: "configure", Value: "Re-run configuration wizard (Advanced mode)"},
					{Key: "apply", Value: "Apply configuration (non-interactive)"},
					{Key: "status", Value: "Show current status"},
				},
			).Value(&choice),
		},
	)

	if err := form.Run(); err != nil {
		return fmt.Errorf("form failed: %w", err)
	}

	switch choice {
	case "setup":
		return runSetup()
	case "configure":
		return runConfigure()
	case "apply":
		return runApply()
	case "status":
		return runStatus()
	default:
		return fmt.Errorf("unknown command: %s", choice)
	}
}

func runSetup() error {
	fmt.Println("Running setup wizard...")
	// TODO: Implement Simple mode wizard
	// - Tier 0 shell check/fix on Windows
	// - Auto-detect installed agents
	// - Install Tier 1 (and Tier 2 unless declined)
	// - Wire hooks for detected agents
	return nil
}

func runConfigure() error {
	fmt.Println("Running configuration wizard...")
	// TODO: Implement Advanced mode
	// - Agent picker (checkbox list)
	// - Full Tier 1-3 tool picker
	// - Custom binaries
	// - Scope choice (project vs user)
	// - rtk enable/disable
	// - Review screen with diff
	return nil
}

func runApply() error {
	fmt.Println("Applying configuration...")
	// TODO: Implement non-interactive apply
	// - Read agentenv.toml
	// - Generate mise.toml
	// - Run mise install
	// - Generate AGENTS.md/CLAUDE.md marker blocks
	// - Generate per-agent hooks
	return nil
}

func runStatus() error {
	fmt.Println("Showing status...")
	// TODO: Implement status command
	// - Show installed tools
	// - Show configured agents
	// - Show drift between config and actual state
	return nil
}

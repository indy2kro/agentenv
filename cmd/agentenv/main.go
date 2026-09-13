// Package main is the entrypoint for the agentenv CLI.
package main

import (
	"fmt"
	"os"

	"github.com/indy2kro/agentenv/cmd/agentenv/internal/commands"
)

func main() {
	if err := commands.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

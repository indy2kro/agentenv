// Package shell handles Tier 0 shell detection and fix on Windows/macOS/Linux.
package shell

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// OS represents the current operating system.
type OS string

const (
	Windows OS = "windows"
	MacOS   OS = "darwin"
	Linux   OS = "linux"
)

// CurrentOS returns the current operating system.
func CurrentOS() OS {
	return OS(runtime.GOOS)
}

// GitBashInfo contains information about Git for Windows.
type GitBashInfo struct {
	BashPath   string
	BinPath    string
	UsrBinPath string
	IsInstalled bool
}

// DetectGitBash detects Git for Windows installation on Windows.
func DetectGitBash() (*GitBashInfo, error) {
	if CurrentOS() != Windows {
		return &GitBashInfo{IsInstalled: false}, nil
	}

	// Try common Git for Windows installation paths
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

// CheckGNUTools checks if GNU versions of coreutils are available on PATH.
func CheckGNUTools() (map[string]bool, error) {
	// Tools to check: grep, sed, awk, find, diff
	tools := []string{"grep", "sed", "awk", "find", "diff"}
	results := make(map[string]bool)

	for _, tool := range tools {
		path, err := exec.LookPath(tool)
		if err != nil {
			results[tool] = false
			continue
		}
		// On macOS, check if it's GNU or BSD
		if CurrentOS() == MacOS {
			results[tool] = isGNUTool(path)
		} else {
			// On Windows (Git Bash) and most Linux, assume GNU
			results[tool] = true
		}
	}

	return results, nil
}

// isGNUTool checks if a tool at the given path is GNU (not BSD).
func isGNUTool(path string) bool {
	// Run the tool with --version and check for GNU in the output
	cmd := exec.Command(path, "--version")
	output, err := cmd.Output()
	if err != nil {
		return false
	}

	outputStr := string(output)
	// GNU tools typically have "GNU" in their version string
	return strings.Contains(outputStr, "GNU")
}

// CheckGNUCoreutilsHomebrew checks if Homebrew GNU coreutils are installed on macOS.
func CheckGNUCoreutilsHomebrew() (bool, error) {
	if CurrentOS() != MacOS {
		return false, nil
	}

	// Check if Homebrew is installed
	if _, err := exec.LookPath("brew"); err != nil {
		return false, nil
	}

	// Check if gnubin is in PATH or if packages are installed
	gnuPackages := []string{"coreutils", "gnu-sed", "grep", "findutils", "gawk", "diffutils"}
	for _, pkg := range gnuPackages {
		cmd := exec.Command("brew", "list", pkg)
		if err := cmd.Run(); err == nil {
			return true, nil
		}
	}

	return false, nil
}

// FixWindowsShell ensures Git Bash is available and its bin directories are on PATH.
func FixWindowsShell() error {
	info, err := DetectGitBash()
	if err != nil {
		return err
	}

	if !info.IsInstalled {
		return fmt.Errorf("Git for Windows is not installed. Please install Git for Windows first")
	}

	// Check if Git Bash bin directories are on PATH
	path := os.Getenv("PATH")
	if !strings.Contains(path, info.BinPath) && !strings.Contains(path, info.UsrBinPath) {
		// Add to PATH
		newPath := info.BinPath + ";" + info.UsrBinPath + ";" + path
		// In a real implementation, we'd persist this to the system
		// For now, just return instructions
		return fmt.Errorf("Git Bash directories not on PATH. Please add %s and %s to your PATH", info.BinPath, info.UsrBinPath)
	}

	return nil
}

// FixMacOSShell ensures GNU coreutils are available on macOS.
func FixMacOSShell() error {
	if CurrentOS() != MacOS {
		return nil
	}

	// Check if GNU tools are available
	gnuAvailable, err := CheckGNUTools()
	if err != nil {
		return err
	}

	// Check if all tools are GNU
	allGNU := true
	for _, available := range gnuAvailable {
		if !available {
			allGNU = false
			break
		}
	}

	if allGNU {
		return nil
	}

	// Check if Homebrew GNU packages are installed
	if hasGNU, err := CheckGNUCoreutilsHomebrew(); err != nil {
		return err
	} else if hasGNU {
		// Add gnubin to PATH
		return fmt.Errorf("GNU coreutils are installed via Homebrew. Please ensure $(brew --prefix)/opt/*/libexec/gnubin is in your PATH")
	}

	// Recommend installing GNU coreutils
	return fmt.Errorf("BSD tools detected. Please run: brew install coreutils gnu-sed grep findutils gawk diffutils")
}

// CheckLinuxShell checks for GNU tools on Linux.
func CheckLinuxShell() error {
	if CurrentOS() != Linux {
		return nil
	}

	// Most Linux distros ship GNU tools, but some (Alpine) may not
	gnuAvailable, err := CheckGNUTools()
	if err != nil {
		return err
	}

	// Check if all tools are available and GNU
	for tool, available := range gnuAvailable {
		if !available {
			return fmt.Errorf("Tool %s not found or not GNU. Please install %s (e.g., apt install %s)", tool, tool, tool)
		}
	}

	return nil
}

// Tier0Check runs the Tier 0 shell detection and fix for the current OS.
func Tier0Check() error {
	os := CurrentOS()

	switch os {
	case Windows:
		return FixWindowsShell()
	case MacOS:
		return FixMacOSShell()
	case Linux:
		return CheckLinuxShell()
	default:
		return fmt.Errorf("unsupported OS: %s", os)
	}
}

// ConfigureAgentShell configures a specific agent's shell to use Git Bash.
func ConfigureAgentShell(agent string, bashPath string) error {
	// This would be implemented per-agent in the adapters
	// For now, return a generic message
	return fmt.Errorf("Shell configuration for %s not yet implemented", agent)
}

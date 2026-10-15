/**
 * Shell completion generation (`agentenv completion <shell>`), matching the
 * `mise completion <shell>` / `gh completion` precedent. The model is built by
 * introspecting the live Commander tree rather than a hand-maintained copy, so
 * a new command/flag shows up in the generated scripts automatically; a test
 * asserts the generated scripts cover every registered command and flag.
 */

import { Argument, Command } from 'commander';
import { AGENT_KEYS, TOOL_KEYS } from '../config/schema.js';

export const COMPLETION_SHELLS = ['bash', 'zsh', 'fish', 'powershell'] as const;
export type CompletionShell = (typeof COMPLETION_SHELLS)[number];

/** Flags every command accepts, whether or not Commander lists them locally. */
const HELP_FLAGS = ['-h', '--help', '-V', '--version'];

export interface CompletionCommandModel {
  name: string;
  aliases: string[];
  description: string;
  /** Command flags plus the program-level globals (always suggested). */
  flags: string[];
  /** Positional argument values worth suggesting (tool/agent keys for add/remove/uninstall). */
  positionals: string[];
}

export interface CompletionModel {
  program: string;
  globalFlags: string[];
  commands: CompletionCommandModel[];
  /** Fixed value sets for flags that take one (e.g. `--scope` → project, user). */
  flagValues: Record<string, string[]>;
}

/** Fixed flag values; kept next to the model so the scripts and tests share one source. */
const FLAG_VALUES: Record<string, string[]> = {
  '--scope': ['project', 'user'],
  '--shell-fix': ['auto', 'always', 'never'],
};

/** Positional values per command, drawn from the config's own key lists. */
const POSITIONAL_VALUES: Record<string, string[]> = {
  add: [...AGENT_KEYS, ...TOOL_KEYS],
  remove: [...AGENT_KEYS, ...TOOL_KEYS],
  uninstall: [...TOOL_KEYS],
};

function optionWords(options: Command['options']): string[] {
  const words: string[] = [];
  for (const option of options) {
    if (option.short) words.push(option.short);
    if (option.long) words.push(option.long);
  }
  return words;
}

function oneLine(description: string): string {
  return description.replace(/\s+/g, ' ').trim();
}

export function buildCompletionModel(root: Command): CompletionModel {
  const globalFlags = [...new Set([...optionWords(root.options), ...HELP_FLAGS])];
  const commands = root.commands.map((command) => ({
    name: command.name(),
    aliases: command.aliases(),
    description: oneLine(command.description()),
    flags: [...new Set([...optionWords(command.options), ...globalFlags])],
    positionals: POSITIONAL_VALUES[command.name()] ?? [],
  }));
  return { program: root.name(), globalFlags, commands, flagValues: FLAG_VALUES };
}

function commandWords(model: CompletionModel): string[] {
  return model.commands.flatMap((command) => [command.name, ...command.aliases]);
}

export function generateBash(model: CompletionModel): string {
  const cases = model.commands
    .flatMap((command) =>
      [command.name, ...command.aliases].map(
        (name) => `    ${name}) flags="${[...command.flags, ...command.positionals].join(' ')}" ;;`,
      ),
    )
    .join('\n');
  const valueCases = Object.entries(model.flagValues)
    .map(
      ([flag, values]) =>
        `    ${flag}) COMPREPLY=( $(compgen -W "${values.join(' ')}" -- "\${cur}") ); return 0 ;;`,
    )
    .join('\n');
  return `#!/usr/bin/env bash
# Bash completion for ${model.program}. Load with: source <(${model.program} completion bash)
_${model.program}_completions() {
  local cur prev cmd flags
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  cmd="\${COMP_WORDS[1]}"
  if [ "\${prev}" = "completion" ]; then
    COMPREPLY=( $(compgen -W "${COMPLETION_SHELLS.join(' ')}" -- "\${cur}") )
    return 0
  fi
  case "\${prev}" in
${valueCases}
  esac
  if [ "\${COMP_CWORD}" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "${commandWords(model).join(' ')} ${model.globalFlags.join(' ')}" -- "\${cur}") )
    return 0
  fi
  case "\${cmd}" in
${cases}
    *) flags="${model.globalFlags.join(' ')}" ;;
  esac
  COMPREPLY=( $(compgen -W "\${flags}" -- "\${cur}") )
  return 0
}
complete -F _${model.program}_completions ${model.program}
`;
}

function zshEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
}

export function generateZsh(model: CompletionModel): string {
  const commandEntries = model.commands
    .flatMap((command) =>
      [command.name, ...command.aliases].map(
        (name) => `    '${zshEscape(`${name}:${command.description}`)}'`,
      ),
    )
    .join('\n');
  const shellEntries = COMPLETION_SHELLS.map(
    (shell) => `    '${zshEscape(`${shell}:${shell}`)}'`,
  ).join('\n');
  const cases = model.commands
    .flatMap((command) =>
      [command.name, ...command.aliases].map(
        (name) => `    ${name}) flags=(${[...command.flags, ...command.positionals].join(' ')}) ;;`,
      ),
    )
    .join('\n');
  const valueCases = Object.entries(model.flagValues)
    .map(([flag, values]) => `    ${flag}) compadd -- ${values.join(' ')}; return ;;`)
    .join('\n');
  return `#compdef ${model.program}
# Zsh completion for ${model.program}. Load with: source <(${model.program} completion zsh)
_${model.program}() {
  local -a commands
  commands=(
${commandEntries}
  )
  if (( CURRENT == 2 )); then
    _describe -t commands '${model.program} command' commands
    return
  fi
  local -a shells
  shells=(
${shellEntries}
  )
  if [[ "\${words[2]}" = "completion" ]]; then
    _describe -t shells '${model.program} completion shell' shells
    return
  fi
  case "\${words[CURRENT-1]}" in
${valueCases}
  esac
  local -a flags
  case "\${words[2]}" in
${cases}
    *) flags=(${model.globalFlags.join(' ')}) ;;
  esac
  _describe -t options '${model.program} option' flags
}
_${model.program} "$@"
`;
}

function fishWordFlags(flags: string[]): string {
  const parts: string[] = [];
  for (const flag of flags) {
    if (flag.startsWith('--')) parts.push(`-l ${flag.slice(2)}`);
    else if (flag.startsWith('-')) parts.push(`-s ${flag.slice(1)}`);
  }
  return parts.join(' ');
}

function fishEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function generateFish(model: CompletionModel): string {
  const lines = [
    `# Fish completion for ${model.program}. Load with: ${model.program} completion fish | source`,
  ];
  lines.push(`complete -c ${model.program} -f`);
  for (const command of model.commands) {
    for (const name of [command.name, ...command.aliases]) {
      lines.push(
        `complete -c ${model.program} -n '__fish_use_subcommand' -a ${name} -d '${fishEscape(command.description)}'`,
      );
    }
  }
  lines.push(
    `complete -c ${model.program} -n '__fish_seen_subcommand_from completion' -a '${COMPLETION_SHELLS.join(' ')}'`,
  );
  for (const command of model.commands) {
    const seen = [command.name, ...command.aliases].join(' ');
    lines.push(
      `complete -c ${model.program} -n '__fish_seen_subcommand_from ${seen}' ${fishWordFlags(command.flags)}`,
    );
    if (command.positionals.length > 0) {
      lines.push(
        `complete -c ${model.program} -n '__fish_seen_subcommand_from ${seen}' -a '${command.positionals.join(' ')}'`,
      );
    }
  }
  for (const [flag, values] of Object.entries(model.flagValues)) {
    lines.push(`complete -c ${model.program} -l ${flag.slice(2)} -x -a '${values.join(' ')}'`);
  }
  return `${lines.join('\n')}\n`;
}

function psEscape(text: string): string {
  return text.replace(/'/g, "''");
}

export function generatePowerShell(model: CompletionModel): string {
  const commandNames = model.commands
    .flatMap((command) => [command.name, ...command.aliases])
    .map((name) => `'${name}'`)
    .join(', ');
  const shellNames = COMPLETION_SHELLS.map((shell) => `'${shell}'`).join(', ');
  const global = model.globalFlags.map((flag) => `'${flag}'`).join(', ');
  const cases = model.commands
    .flatMap((command) =>
      [command.name, ...command.aliases].map(
        (name) =>
          `    '${name}' = @(${[...command.flags, ...command.positionals].map((flag) => `'${flag}'`).join(', ')})`,
      ),
    )
    .join('\n');
  const flagValueEntries = Object.entries(model.flagValues)
    .map(([flag, values]) => `    '${flag}' = @(${values.map((value) => `'${value}'`).join(', ')})`)
    .join('\n');

  return `# PowerShell completion for ${model.program}. Load with: ${model.program} completion powershell | Out-String | Invoke-Expression
Register-ArgumentCompleter -Native -CommandName '${psEscape(model.program)}' -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)
  $commands = @(${commandNames})
  $shells = @(${shellNames})
  $globals = @(${global})
  $byCommand = @{
${cases}
  }
  $flagValues = @{
${flagValueEntries}
  }
  $elements = @($commandAst.CommandElements | ForEach-Object { $_.ToString() })
  $prevIndex = if ($wordToComplete) { $elements.Count - 2 } else { $elements.Count - 1 }
  $prev = if ($prevIndex -ge 0) { $elements[$prevIndex] } else { '' }
  $candidates = if ($flagValues.ContainsKey($prev)) {
    $flagValues[$prev]
  } elseif ($elements.Count -gt 1 -and $elements[1] -eq 'completion') {
    $shells + $globals
  } elseif ($elements.Count -gt 1 -and $byCommand.ContainsKey($elements[1])) {
    $byCommand[$elements[1]] + $globals
  } else {
    $commands + $globals
  }
  $candidates |
    Where-Object { $_ -like "$wordToComplete*" } |
    Sort-Object -Unique |
    ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
}
`;
}

export function generateCompletion(shell: CompletionShell, model: CompletionModel): string {
  switch (shell) {
    case 'bash':
      return generateBash(model);
    case 'zsh':
      return generateZsh(model);
    case 'fish':
      return generateFish(model);
    case 'powershell':
      return generatePowerShell(model);
  }
}

export const completionCommand = new Command('completion')
  .description('generate a shell completion script')
  .addArgument(
    new Argument('<shell>', `target shell (${COMPLETION_SHELLS.join(', ')})`).choices([
      ...COMPLETION_SHELLS,
    ]),
  )
  .action((shell: string, _options: unknown, command: Command) => {
    const root = command.parent ?? command;
    process.stdout.write(generateCompletion(shell as CompletionShell, buildCompletionModel(root)));
  });

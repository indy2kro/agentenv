import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { AGENT_COMMANDS, isAgentInstalled, resolveBinary } from '../adapters/detect.js';
import {
  isQuiet,
  LOGO,
  resolveResultLine,
  setQuietEnabled,
  shouldPrintBanner,
} from '../ui/output.js';
import type { ResultBoxContent } from '../ui/output.js';
import { theme } from '../ui/theme.js';
import {
  BINARY_MAP,
  getEnabledAgents,
  loadConfig,
  TOOL_KEYS,
  validateConfig,
} from '../config/schema.js';
import type { AgentKey } from '../config/schema.js';
import { findConfigPath, userConfigDir } from '../config/scopes.js';
import { bashExecutable, detectShell } from '../shell/detector.js';
import {
  getMiseVersion,
  getShimsDirValue,
  isMiseInstalled,
  miseGlobalConfigPath,
  miseInstallInstructions,
  shimsDir,
  shimsDirOnPath,
} from '../toolchain/mise.js';

export type DoctorStatus = 'ok' | 'warn' | 'fail';

export interface DoctorItem {
  status: DoctorStatus;
  label: string;
  detail: string;
}

export interface DoctorSection {
  title: string;
  items: DoctorItem[];
}

const STATUS_COLOR: Record<DoctorStatus, (text: string) => string> = {
  ok: theme.ok,
  warn: theme.warn,
  fail: theme.fail,
};

export interface DoctorJson {
  command: 'doctor';
  status: 'ok' | 'fail';
  exitCode: 0 | 1;
  sections: DoctorSection[];
}

export function doctorToJson(sections: DoctorSection[]): DoctorJson {
  const hasFail = sections.some((section) => section.items.some((item) => item.status === 'fail'));
  return {
    command: 'doctor',
    status: hasFail ? 'fail' : 'ok',
    exitCode: hasFail ? 1 : 0,
    sections,
  };
}

/**
 * Narrow the report to one section by 1-based index or title prefix.
 * Returns undefined when nothing matches (the caller reports the error).
 */
export function filterDoctorSections(
  sections: DoctorSection[],
  ref: string,
): DoctorSection[] | undefined {
  const index = Number(ref);
  if (Number.isInteger(index) && index >= 1 && index <= sections.length) {
    return [sections[index - 1]];
  }
  const matched = sections.filter((section) =>
    section.title.toLowerCase().startsWith(ref.toLowerCase()),
  );
  return matched.length > 0 ? matched : undefined;
}

export function renderDoctor(
  sections: DoctorSection[],
  options: { includeHeading?: boolean } = {},
): string {
  const lines: string[] = [];
  if (options.includeHeading !== false) {
    lines.push(`\n${theme.heading(LOGO)}\n`);
  }
  for (const section of sections) {
    lines.push(theme.bold(section.title));
    for (const item of section.items) {
      const glyph = item.status === 'ok' ? '[ok]  ' : item.status === 'warn' ? '[warn]' : '[fail]';
      lines.push(
        `  ${STATUS_COLOR[item.status](glyph)} ${item.label}${item.detail ? ` — ${item.detail}` : ''}`,
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}

function norm(p: string): string {
  return path.resolve(p).replace(/\\/g, '/').toLowerCase();
}

function gatherDoctor(): DoctorSection[] {
  const sections: DoctorSection[] = [];

  // System level
  const shell = detectShell();
  const system: DoctorItem[] = [
    { status: 'ok', label: 'OS', detail: `${process.platform} (${process.arch})` },
  ];
  system.push({ status: 'ok', label: 'Shell', detail: shell.currentShell });
  if (process.platform === 'win32') {
    if (shell.gitBashPath && fs.existsSync(bashExecutable(shell.gitBashPath))) {
      system.push({
        status: 'ok',
        label: 'Git Bash',
        detail: bashExecutable(shell.gitBashPath),
      });
    } else {
      system.push({
        status: 'fail',
        label: 'Git Bash',
        detail: 'not found — install Git for Windows so agents get a real POSIX shell',
      });
    }
  }
  sections.push({ title: 'System', items: system });

  // Mise + shims
  const miseItems: DoctorItem[] = [];
  if (isMiseInstalled()) {
    miseItems.push({ status: 'ok', label: 'mise', detail: getMiseVersion() });
  } else {
    miseItems.push({
      status: 'fail',
      label: 'mise',
      detail: 'not on PATH',
    });
    miseItems.push({
      status: 'fail',
      label: 'Install',
      detail: miseInstallInstructions().join(' '),
    });
    sections.push({ title: 'Mise', items: miseItems });
    return sections;
  }

  const globalConfigPath = miseGlobalConfigPath();
  let globalConfig: string | null = null;
  if (fs.existsSync(globalConfigPath)) globalConfig = fs.readFileSync(globalConfigPath, 'utf-8');
  const shimsValue = globalConfig === null ? null : getShimsDirValue(globalConfig);
  const expected = norm(shimsDir());
  if (shimsValue && norm(shimsValue) === expected) {
    miseItems.push({ status: 'ok', label: 'shims_dir', detail: shimsDir() });
  } else {
    miseItems.push({
      status: 'fail',
      label: 'shims_dir',
      detail: `not set to ${shimsDir()} in ${globalConfigPath} — run \`agentenv apply\``,
    });
  }
  miseItems.push({
    status: shimsDirOnPath() ? 'ok' : 'warn',
    label: 'shims on PATH',
    detail: shimsDirOnPath()
      ? shimsDir()
      : `${shimsDir()} is not on PATH — add it so the shims resolve`,
  });
  sections.push({ title: 'Mise', items: miseItems });

  // Config
  const configPath = findConfigPath();
  if (!configPath) {
    sections.push({
      title: 'Config',
      items: [
        {
          status: 'warn',
          label: 'agentenv.toml',
          detail: 'not found — run `agentenv setup` to create one',
        },
      ],
    });
    return sections;
  }

  const scope =
    norm(configPath) === norm(path.join(userConfigDir(), 'agentenv.toml')) ? 'user' : 'project';
  const configItems: DoctorItem[] = [
    { status: 'ok', label: 'file', detail: `${configPath} (${scope} scope)` },
  ];

  let config;
  try {
    config = loadConfig(configPath);
  } catch (error) {
    configItems.push({
      status: 'fail',
      label: 'validity',
      detail: error instanceof Error ? error.message : String(error),
    });
    sections.push({ title: 'Config', items: configItems });
    return sections;
  }
  const report = validateConfig(config);
  if (report.errors.length > 0) {
    configItems.push({ status: 'fail', label: 'validity', detail: report.errors.join('; ') });
  } else {
    configItems.push({ status: 'ok', label: 'validity', detail: 'no errors' });
  }
  for (const warning of report.warnings) {
    configItems.push({ status: 'warn', label: 'warning', detail: warning });
  }
  sections.push({ title: 'Config', items: configItems });

  // Tools
  const tools = config.tools ?? {};
  const enabledTools = TOOL_KEYS.filter((key) => tools[key] === true);
  const toolItems: DoctorItem[] = [];
  for (const key of enabledTools) {
    const binary = BINARY_MAP[key];
    const found = resolveBinary(binary) !== null;
    toolItems.push({
      status: found ? 'ok' : 'fail',
      label: `${binary} (${key})`,
      detail: found ? '' : 'not on PATH — run `mise install` in this project',
    });
  }
  sections.push({
    title: `Tools (${enabledTools.length} configured)`,
    items:
      toolItems.length > 0
        ? toolItems
        : [{ status: 'warn', label: 'none', detail: 'no tools enabled' }],
  });

  // Agents
  const agents = getEnabledAgents(config);
  const agentItems: DoctorItem[] = [];
  for (const agent of agents) {
    const installed = isAgentInstalled(agent as AgentKey);
    agentItems.push({
      status: installed ? 'ok' : 'warn',
      label: `${agent} (${AGENT_COMMANDS[agent as AgentKey][0]})`,
      detail: installed ? '' : 'CLI not found on PATH — install it or disable the agent in config',
    });
  }
  sections.push({
    title: `Agents (${agents.length} enabled)`,
    items:
      agentItems.length > 0
        ? agentItems
        : [{ status: 'warn', label: 'none', detail: 'no agents enabled' }],
  });

  return sections;
}

function doctorSummary(payload: DoctorJson): ResultBoxContent {
  let failCount = 0;
  let warnCount = 0;
  for (const section of payload.sections) {
    for (const item of section.items) {
      if (item.status === 'fail') failCount += 1;
      else if (item.status === 'warn') warnCount += 1;
    }
  }
  if (failCount > 0) {
    return {
      severity: 'fail',
      headline: `${failCount} problem${failCount === 1 ? '' : 's'} found`,
      summary: 'fix the issues above, or run `agentenv apply` to reconfigure',
    };
  }
  if (warnCount > 0) {
    return {
      severity: 'warn',
      headline: 'Environment looks OK',
      summary: `${warnCount} warning${warnCount === 1 ? '' : 's'} — check the notes above`,
    };
  }
  return { severity: 'ok', headline: 'Environment healthy' };
}

export const doctorCommand = new Command()
  .name('doctor')
  .description('Diagnose the machine: mise, shims, config, tools and agents (read-only)')
  .option('--json', 'emit a machine-readable JSON document on stdout')
  .option(
    '--section <index|name>',
    'only run one report section (1-based section index or title prefix)',
  )
  .action((options: { json?: boolean; section?: string }) => {
    const json = options.json === true;
    if (json) setQuietEnabled(true);

    const gathered = gatherDoctor();
    const sections =
      options.section === undefined ? gathered : filterDoctorSections(gathered, options.section);
    if (sections === undefined) {
      console.error(
        theme.fail(
          `No doctor section matched "${options.section}". Sections: ${gathered.map((section, index) => `${index + 1}: ${section.title}`).join(', ')}`,
        ),
      );
      process.exitCode = 1;
      return;
    }
    const payload = doctorToJson(sections);

    if (json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      const output = renderDoctor(sections, {
        includeHeading: shouldPrintBanner(process.stdout.isTTY === true, isQuiet()),
      });
      console.log(output.startsWith('\n') ? output.slice(1) : output);
      console.log(resolveResultLine(doctorSummary(payload)));
    }

    if (payload.exitCode === 1) process.exitCode = 1;
  });

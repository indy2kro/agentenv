#!/usr/bin/env node
/**
 * Stub `rtk init` for test/CI: mirrors the files written by real `rtk init`
 * (verified against rtk 0.42.4 and 0.49.0, see docs/research/rtk-init-delegation.md).
 * Invoked by agentenv through AGENTENV_RTK_BIN so the full CLI pipeline can run
 * deterministically without installing rtk.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const args = process.argv.slice(2); // e.g. ['init', '--codex']
const flags = args.slice(1).join(' ');
const cwd = process.cwd();
const home = process.env.HOME || process.env.USERPROFILE || '';

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

switch (flags) {
  case '--codex': {
    fs.writeFileSync(
      path.join(cwd, 'RTK.md'),
      '# RTK (Codex CLI)\n\nAlways prefix shell commands with `rtk`.\n',
    );
    break;
  }
  case '--copilot': {
    fs.mkdirSync(path.join(cwd, '.github', 'hooks'), { recursive: true });
    fs.writeFileSync(path.join(cwd, '.github', 'copilot-instructions.md'), '# Copilot instructions\n');
    writeJson(path.join(cwd, '.github', 'hooks', 'rtk-rewrite.json'), {
      version: 1,
      hooks: {
        PreToolUse: [{ type: 'command', command: 'rtk hook copilot', cwd: '.', timeout: 5 }],
      },
    });
    break;
  }
  case '-g --opencode': {
    const dir = path.join(home, '.config', 'opencode', 'plugins');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'rtk.ts'), '// rtk opencode plugin\nexport const plugin = {};\n');
    break;
  }
  case '-g --gemini': {
    fs.writeFileSync(path.join(cwd, 'RTK.md'), '# RTK stub (Gemini CLI)\n');
    break;
  }
  case '-g --agent cursor': {
    fs.writeFileSync(path.join(cwd, 'RTK.md'), '# RTK stub (Cursor)\n');
    break;
  }
  case '-g --agent windsurf': {
    fs.writeFileSync(path.join(cwd, 'RTK.md'), '# RTK stub (Windsurf)\n');
    break;
  }
  case '--agent cline': {
    fs.writeFileSync(path.join(cwd, 'RTK.md'), '# RTK stub (Cline CLI)\n');
    break;
  }
  case '-g --agent vibe': {
    fs.writeFileSync(path.join(cwd, 'RTK.md'), '# RTK stub (Mistral Vibe)\n');
    break;
  }
  default: {
    console.error(`rtk-stub: unexpected args: ${args.join(' ')}`);
    process.exit(1);
  }
}

process.stdout.write(`rtk init ${flags} succeeded\n`);

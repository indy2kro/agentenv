import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  baseDirForConfig,
  configFilePath,
  findConfigPath,
  findConfigPathInScope,
  parseScopeFlag,
  resolveScopeDir,
  userConfigDir,
} from './scopes.js';

describe('scope resolution', () => {
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;
  const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;

  after(() => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = originalUserProfile;
    if (originalXdgConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
  });

  it('project scope resolves to the current working directory', () => {
    assert.equal(resolveScopeDir('project'), process.cwd());
    assert.equal(resolveScopeDir(undefined), process.cwd());
  });

  it('user scope resolves to ~/.config/agentenv', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-scopes-'));
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    delete process.env.XDG_CONFIG_HOME;

    const expected = path.join(home, '.config', 'agentenv');
    assert.equal(userConfigDir(), expected);
    assert.equal(resolveScopeDir('user'), expected);
  });

  it('honors an absolute XDG_CONFIG_HOME for the user scope', () => {
    const xdg = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-xdg-'));
    process.env.XDG_CONFIG_HOME = xdg;

    const expected = path.join(xdg, 'agentenv');
    assert.equal(userConfigDir(), expected);
    assert.equal(resolveScopeDir('user'), expected);
    assert.equal(configFilePath('user'), path.join(expected, 'agentenv.toml'));
  });

  it('ignores a relative XDG_CONFIG_HOME (spec), falling back to ~/.config', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-scopes-'));
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    process.env.XDG_CONFIG_HOME = 'relative/not-absolute';

    assert.equal(userConfigDir(), path.join(home, '.config', 'agentenv'));
  });

  it('configFilePath appends agentenv.toml', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-scopes-'));
    process.env.HOME = home;
    process.env.USERPROFILE = home;

    assert.equal(configFilePath('user'), path.join(home, '.config', 'agentenv', 'agentenv.toml'));
    assert.equal(configFilePath('project'), path.join(process.cwd(), 'agentenv.toml'));
  });

  it('parseScopeFlag normalizes valid --scope values and flags absent ones', () => {
    assert.deepEqual(parseScopeFlag(undefined), {});
    assert.deepEqual(parseScopeFlag('project'), { scope: 'project' });
    assert.deepEqual(parseScopeFlag('user'), { scope: 'user' });
  });

  it('parseScopeFlag rejects invalid --scope values with an error', () => {
    const result = parseScopeFlag('usre');
    assert.equal(result.scope, undefined);
    assert.match(result.error ?? '', /invalid --scope "usre"/);
    assert.match(result.error ?? '', /expected "project" or "user"/);
  });

  it('findConfigPath prefers the project config, then the user config', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-scopes-'));
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-scopes-cwd-'));
    process.env.HOME = home;
    process.env.USERPROFILE = home;

    assert.equal(findConfigPath(cwd), undefined);

    const userFile = path.join(home, '.config', 'agentenv', 'agentenv.toml');
    fs.mkdirSync(path.dirname(userFile), { recursive: true });
    fs.writeFileSync(userFile, '');
    assert.equal(findConfigPath(cwd), userFile);

    const projectFile = path.join(cwd, 'agentenv.toml');
    fs.writeFileSync(projectFile, '');
    assert.equal(findConfigPath(cwd), projectFile);
  });

  it('findConfigPath searches parent directories, like git looks for .git', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-scopes-'));
    process.env.HOME = home;
    process.env.USERPROFILE = home;

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-scopes-root-'));
    const nested = path.join(root, 'src', 'commands');
    fs.mkdirSync(nested, { recursive: true });

    // No config anywhere in the chain up to `root`'s ancestors that matter for this test.
    assert.equal(findConfigPath(nested), undefined);

    const projectFile = path.join(root, 'agentenv.toml');
    fs.writeFileSync(projectFile, '');
    assert.equal(
      findConfigPath(nested),
      projectFile,
      'running from repo/src/commands should find repo/agentenv.toml',
    );
  });

  it('findConfigPath prefers the nearest ancestor project config over the user config', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-scopes-'));
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    const userFile = path.join(home, '.config', 'agentenv', 'agentenv.toml');
    fs.mkdirSync(path.dirname(userFile), { recursive: true });
    fs.writeFileSync(userFile, '');

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-scopes-root-'));
    const nested = path.join(root, 'deeply', 'nested');
    fs.mkdirSync(nested, { recursive: true });
    const projectFile = path.join(root, 'agentenv.toml');
    fs.writeFileSync(projectFile, '');

    assert.equal(findConfigPath(nested), projectFile);
  });
});

describe('baseDirForConfig', () => {
  it('uses the directory of an ancestor-level project config, not cwd', () => {
    const cfg = path.join(os.tmpdir(), 'repo', 'agentenv.toml');
    assert.equal(baseDirForConfig(cfg, 'project'), path.dirname(path.resolve(cfg)));
  });

  it('uses the user config dir for user scope', () => {
    assert.equal(baseDirForConfig('/anywhere/agentenv.toml', 'user'), userConfigDir());
  });
});

describe('findConfigPathInScope', () => {
  const makeEnv = () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-scope-home-'));
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-scope-project-'));
    fs.mkdirSync(path.join(home, 'agentenv'), { recursive: true });
    fs.writeFileSync(path.join(home, 'agentenv', 'agentenv.toml'), 'scope = "user"\n');
    fs.writeFileSync(path.join(project, 'agentenv.toml'), 'scope = "project"\n');
    return { xdg: home, project };
  };
  const withXdg = <T>(xdg: string, run: () => T): T => {
    const prior = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = xdg;
    try {
      return run();
    } finally {
      if (prior === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = prior;
    }
  };

  it('returns the requested scope even when the other one is nearer', () => {
    const { xdg, project } = makeEnv();
    withXdg(xdg, () => {
      assert.equal(
        findConfigPathInScope('user', project),
        path.join(xdg, 'agentenv', 'agentenv.toml'),
      );
      assert.equal(findConfigPathInScope('project', project), path.join(project, 'agentenv.toml'));
    });
  });

  it('is undefined (not a fallback to the other scope) when that scope has no config', () => {
    const { xdg } = makeEnv();
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-scope-bare-'));
    withXdg(xdg, () => {
      assert.equal(findConfigPathInScope('project', bare), undefined);
    });
    withXdg(path.join(xdg, 'nowhere'), () => {
      assert.equal(findConfigPathInScope('user', bare), undefined);
    });
  });

  it('falls back to nearest-config resolution when no scope is given', () => {
    const { xdg, project } = makeEnv();
    withXdg(xdg, () => {
      assert.equal(findConfigPathInScope(undefined, project), findConfigPath(project));
    });
  });
});

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  configFilePath,
  findConfigPath,
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
});

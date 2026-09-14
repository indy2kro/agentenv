import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { configFilePath, findConfigPath, resolveScopeDir, userConfigDir } from './scopes.js';

describe('scope resolution', () => {
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;

  after(() => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = originalUserProfile;
  });

  it('project scope resolves to the current working directory', () => {
    assert.equal(resolveScopeDir('project'), process.cwd());
    assert.equal(resolveScopeDir(undefined), process.cwd());
  });

  it('user scope resolves to ~/.config/agentenv', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-scopes-'));
    process.env.HOME = home;
    process.env.USERPROFILE = home;

    const expected = path.join(home, '.config', 'agentenv');
    assert.equal(userConfigDir(), expected);
    assert.equal(resolveScopeDir('user'), expected);
  });

  it('configFilePath appends agentenv.toml', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-scopes-'));
    process.env.HOME = home;
    process.env.USERPROFILE = home;

    assert.equal(configFilePath('user'), path.join(home, '.config', 'agentenv', 'agentenv.toml'));
    assert.equal(configFilePath('project'), path.join(process.cwd(), 'agentenv.toml'));
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

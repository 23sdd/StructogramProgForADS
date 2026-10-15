import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, chmod, readFile, rm } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInstaller } from '../scripts/create-installer.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'structogram installer test '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const payloads = path.join(root, 'payloads'), bin = path.join(root, 'tools');
  await mkdir(payloads); await mkdir(bin);
  const executable = path.join(root, 'package', 'Structogram ADS.app', 'Contents', 'MacOS', 'Structogram ADS');
  await mkdir(path.dirname(executable), { recursive: true });
  await writeFile(executable, '#!/bin/bash\nprintf "app started\\n" >> "$TEST_SMOKE_LOG"\n');
  await chmod(executable, 0o755);
  for (const arch of ['arm64', 'x64']) execFileSync('zip', ['-q', '-r', path.join(payloads, `Structogram-ADS-1.2.0-${arch}.zip`), 'Structogram ADS.app'], { cwd: path.join(root, 'package') });
  const tools = {
    uname: '#!/bin/bash\nif [ "$1" = -s ]; then echo Darwin; else echo "${TEST_MACHINE:-arm64}"; fi\n',
    sysctl: '#!/bin/bash\necho "${TEST_ROSETTA_ARM:-0}"\n',
    codesign: '#!/bin/bash\nexit 0\n',
    ditto: '#!/bin/bash\nunzip -q "$3" -d "$4"\n',
    open: '#!/bin/bash\nprintf "%s\\n" "$1" >> "$TEST_OPEN_LOG"\n',
    pgrep: '#!/bin/bash\nexit 1\n',
    curl: '#!/bin/bash\necho "unexpected network access" >&2\nexit 42\n'
  };
  for (const [name, source] of Object.entries(tools)) { await writeFile(path.join(bin, name), source); await chmod(path.join(bin, name), 0o755); }
  const { destination } = await createInstaller({ releaseDirectory: payloads, outputDirectory: path.join(root, 'installer'), repository: '23sdd/StructogramProgForADS', releaseTag: 'v1.2.0-test', version: '1.2.0' });
  const env = { ...process.env, PATH: bin + path.delimiter + process.env.PATH, STRUCTOGRAM_INSTALL_ROOT: path.join(root, 'My Applications'), STRUCTOGRAM_PAYLOAD_CACHE: payloads, TEST_OPEN_LOG: path.join(root, 'opened'), TEST_SMOKE_LOG: path.join(root, 'smoke') };
  const run = (args = [], overrides = {}) => spawnSync('bash', [destination, ...args], { env: { ...env, ...overrides }, encoding: 'utf8' });
  return { root, payloads, env, run, app: path.join(env.STRUCTOGRAM_INSTALL_ROOT, 'Structogram ADS.app'), receipt: path.join(env.STRUCTOGRAM_INSTALL_ROOT, '.structogram-installation') };
}

test('the installer works in a path with spaces and launches; the next run needs no payload or network', async t => {
  const f = await fixture(t);
  const first = f.run(); assert.equal(first.status, 0, first.stderr);
  assert.equal((await readFile(f.env.TEST_OPEN_LOG, 'utf8')).trim(), f.app);
  assert.match(await readFile(f.receipt, 'utf8'), /v1.2.0-test arm64/);
  await rm(f.payloads, { recursive: true });
  const again = f.run(['--verify-only']); assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /No download/);
});

test('checksum failure cannot replace a previous application or launch an unverified payload', async t => {
  const f = await fixture(t);
  await mkdir(f.app, { recursive: true });
  await writeFile(path.join(f.app, 'keep.txt'), 'previous version');
  await writeFile(path.join(f.payloads, 'Structogram-ADS-1.2.0-arm64.zip'), 'tampered archive');
  const result = f.run(); assert.notEqual(result.status, 0);
  assert.match(result.stderr, /checksum does not match/);
  assert.equal(await readFile(path.join(f.app, 'keep.txt'), 'utf8'), 'previous version');
  await assert.rejects(readFile(f.env.TEST_OPEN_LOG));
});

test('Intel and Rosetta processor detection choose the matching verified application', async t => {
  const f = await fixture(t);
  const intel = f.run(['--verify-only'], { TEST_MACHINE: 'x86_64' });
  assert.equal(intel.status, 0, intel.stderr); assert.match(await readFile(f.receipt, 'utf8'), / x64 /);
  const rosetta = f.run(['--verify-only'], { TEST_MACHINE: 'x86_64', TEST_ROSETTA_ARM: '1' });
  assert.equal(rosetta.status, 0, rosetta.stderr); assert.match(await readFile(f.receipt, 'utf8'), / arm64 /);
});

test('the installer can launch the installed executable for its macOS smoke check', async t => {
  const f = await fixture(t);
  const result = f.run(['--smoke-test']); assert.equal(result.status, 0, result.stderr);
  assert.equal((await readFile(f.env.TEST_SMOKE_LOG, 'utf8')).trim(), 'app started');
});

test('installer metadata cannot inject shell syntax', async () => {
  await assert.rejects(createInstaller({ repository: 'bad;code/repo', releaseTag: 'v1', version: '1.2.0' }), /Invalid installer metadata/);
});

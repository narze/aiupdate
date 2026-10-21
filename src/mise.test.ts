import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { run } from './cli.js';

const directories: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function fixture(options: {
  tool?: string;
  owner?: string;
  shim?: boolean;
  shadowed?: boolean;
  unavailable?: boolean;
  missing?: boolean;
  upgradeFails?: boolean;
} = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'aiupdate-mise-'));
  const tool = options.tool ?? 'opencode';
  directories.push(dir);
  const bin = join(dir, 'bin');
  const installBin = join(dir, 'installs', tool, 'latest', 'node_modules', '.bin');
  await Promise.all([mkdir(bin), mkdir(installBin, { recursive: true })]);
  const log = join(dir, 'calls.jsonl');
  await writeFile(log, '');
  const installed = join(installBin, tool);
  const toolScript = `#!${process.execPath}
const fs = require('fs');
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify([${JSON.stringify(tool)}, process.argv.slice(2)]) + '\\n');
if (process.argv[2] === '--version') console.log('1.0.0');
`;
  await writeFile(installed, toolScript, { mode: 0o755 });
  const mise = join(bin, 'mise');
  await writeFile(mise, `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
if (args[0] === 'which') {
  if (${Boolean(options.unavailable)}) process.exit(1);
  console.log(args.includes('--plugin') ? ${JSON.stringify(options.owner ?? 'opencode')} : ${JSON.stringify(installed)});
} else if (args[0] === 'upgrade') {
  fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(['mise', args]) + '\\n');
  if (${Boolean(options.upgradeFails)}) { console.error('mise upgrade failed'); process.exit(1); }
} else if (args[0] === 'exec') {
  fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(['mise', args]) + '\\n');
  console.log(fs.readFileSync(${JSON.stringify(log)}, 'utf8').includes('upgrade') ? '1.1.0' : '1.0.0');
} else { process.exit(1); }
`, { mode: 0o755 });
  if (options.shadowed) {
    await writeFile(join(bin, tool), toolScript, { mode: 0o755 });
  } else {
    await symlink(options.shim ? mise : installed, join(bin, tool));
  }
  if (options.missing) await rm(mise);
  // Only fake executables and the system `which` are visible; no real tools run.
  vi.stubEnv('PATH', `${bin}:/usr/bin:/bin`);
  return async (): Promise<[string, string[]][]> =>
    (await readFile(log, 'utf8')).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

describe('mise installations', () => {
  it.each(['opencode', 'npm:opencode-ai'])('upgrades the owning mise package %s', async (owner) => {
    const calls = await fixture({ owner });
    expect(await run(['opencode'])).toBe(true);
    const commands = await calls();
    expect(commands).toContainEqual(['mise', ['upgrade', owner, '--yes']]);
    expect(commands).not.toContainEqual(['opencode', ['upgrade']]);
    // Read the new installation through mise rather than a stale PATH entry.
    expect(commands.filter(([cmd, args]) => cmd === 'mise' && args[0] === 'exec')).toHaveLength(2);
  });

  it('recognizes mise shims', async () => {
    const calls = await fixture({ shim: true });
    expect(await run(['opencode'], undefined, undefined, async () => null)).toBe(true);
    expect(await calls()).toContainEqual(['mise', ['upgrade', 'opencode', '--yes']]);
  });

  it('skips a Grok mise shim with no active version', async () => {
    const calls = await fixture({ tool: 'grok', owner: 'grok', shim: true, unavailable: true });
    const executor = vi.fn();
    const versioner = vi.fn();
    const logger = vi.fn();

    expect(await run(['grok'], executor, undefined, versioner, logger)).toBe(true);
    expect(executor).not.toHaveBeenCalled();
    expect(versioner).not.toHaveBeenCalled();
    expect(logger).not.toHaveBeenCalled();
    expect(await calls()).toEqual([]);
  });

  it('upgrades Codex through its npm backend instead of codex update', async () => {
    const calls = await fixture({ tool: 'codex', owner: 'npm:@openai/codex' });
    expect(await run(['codex'])).toBe(true);
    expect(await calls()).toContainEqual(['mise', ['upgrade', 'npm:@openai/codex', '--yes']]);
    expect(await calls()).not.toContainEqual(['codex', ['update']]);
  });

  it('uses the native updater when another installation shadows mise', async () => {
    const calls = await fixture({ shadowed: true });
    expect(await run(['opencode'])).toBe(true);
    expect(await calls()).toContainEqual(['opencode', ['upgrade']]);
    expect((await calls()).some(([cmd]) => cmd === 'mise')).toBe(false);
  });

  it.each(['node', 'bun', 'deno'])('does not upgrade the %s runtime for a global package', async (owner) => {
    const calls = await fixture({ owner });
    expect(await run(['opencode'])).toBe(true);
    expect(await calls()).toContainEqual(['opencode', ['upgrade']]);
  });

  it('uses the native updater when mise detection is unavailable', async () => {
    const calls = await fixture({ unavailable: true });
    expect(await run(['opencode'])).toBe(true);
    expect(await calls()).toContainEqual(['opencode', ['upgrade']]);
  });

  it('uses the native updater when mise is not installed', async () => {
    const calls = await fixture({ missing: true });
    expect(await run(['opencode'])).toBe(true);
    expect(await calls()).toContainEqual(['opencode', ['upgrade']]);
  });

  it('reports mise upgrade failures without trying a different updater', async () => {
    const calls = await fixture({ upgradeFails: true });
    const errors: string[] = [];
    expect(await run(['opencode'], undefined, undefined, undefined, (msg) => errors.push(msg))).toBe(false);
    expect(errors.join('\n')).toContain('opencode: mise upgrade failed');
    expect(await calls()).not.toContainEqual(['opencode', ['upgrade']]);
  });
});

import { mkdtemp, writeFile, chmod, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { selectTools, run as runCLI, formatTitle, formatSkillsTitle, parseUpdatedSkills, getVersion, AI_TOOLS, SKILLS_TASK } from './cli.js';

// Existing orchestration tests are independent of the machine's installations.
const run = (...args: Parameters<typeof runCLI>) => {
  args[5] = async (tool) => tool;
  return runCLI(...args);
};

const allInstalled: (cmd: string) => Promise<boolean> = async () => true;
const noneInstalled: (cmd: string) => Promise<boolean> = async () => false;
const onlyInstalled =
  (...names: string[]) =>
  async (cmd: string) =>
    names.includes(cmd);

describe('formatTitle', () => {
  it('shows version bump', () => {
    expect(formatTitle('claude', '1.0.0', '1.0.1')).toBe('claude  1.0.0 → 1.0.1');
  });

  it('shows up to date when version unchanged', () => {
    expect(formatTitle('claude', '1.0.0', '1.0.0')).toBe('claude  up to date (1.0.0)');
  });

  it('shows up to date with before version when after is null', () => {
    expect(formatTitle('claude', '1.0.0', null)).toBe('claude  up to date (1.0.0)');
  });

  it('returns plain name when before is null (not versioned)', () => {
    expect(formatTitle('skills', null, null)).toBe('skills');
  });
});

describe('parseUpdatedSkills', () => {
  it('extracts updated skill names and strips ANSI codes', () => {
    const output = [
      '\u001b[1mGlobal Skills\u001b[0m',
      '  \u001b[38;5;145m✓\u001b[0m Updated find-skills',
      '  \u001b[38;5;145m✓\u001b[0m Updated brainstorming',
      '  \u001b[2m✗ Failed to update broken\u001b[0m',
      '\u001b[38;5;145m✓ Updated 2 skill(s)\u001b[0m',
    ].join('\n');
    expect(parseUpdatedSkills(output)).toEqual(['find-skills', 'brainstorming']);
  });

  it('returns an empty list when nothing was updated', () => {
    expect(parseUpdatedSkills('✓ All global skills are up to date')).toEqual([]);
  });
});

describe('formatSkillsTitle', () => {
  it('returns plain name when nothing was updated', () => {
    expect(formatSkillsTitle([])).toBe('skills');
  });

  it('lists every skill when there are five or fewer', () => {
    expect(formatSkillsTitle(['a', 'b'])).toBe('skills  /a, /b updated');
  });

  it('summarizes the rest after five skills', () => {
    expect(formatSkillsTitle(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'])).toBe(
      'skills  /a, /b, /c, /d, /e, and 5 other skills updated',
    );
  });

  it('uses singular for one other skill', () => {
    expect(formatSkillsTitle(['a', 'b', 'c', 'd', 'e', 'f'])).toBe(
      'skills  /a, /b, /c, /d, /e, and 1 other skill updated',
    );
  });
});

describe('getVersion', () => {
  it('extracts versions from stderr', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aiupdate-'));
    const command = join(dir, 'version-stderr');

    try {
      await writeFile(command, "#!/usr/bin/env node\nprocess.stderr.write('fake 9.8.7\\n');\n");
      await chmod(command, 0o755);

      await expect(getVersion(command)).resolves.toBe('9.8.7');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('selectTools', () => {
  it('returns all AI tools + skills when no args', () => {
    const { selectedAITools, includeSkills } = selectTools([]);
    expect(selectedAITools).toEqual(AI_TOOLS);
    expect(includeSkills).toBe(true);
  });

  it('returns only claude without skills when targeting claude', () => {
    const { selectedAITools, includeSkills } = selectTools(['claude']);
    expect(selectedAITools).toHaveLength(1);
    expect(selectedAITools[0].name).toBe('claude');
    expect(includeSkills).toBe(false);
  });

  it('returns multiple tools without skills', () => {
    const { selectedAITools, includeSkills } = selectTools(['claude', 'codex']);
    expect(selectedAITools.map((t) => t.name)).toEqual(['claude', 'codex']);
    expect(includeSkills).toBe(false);
  });

  it('returns no AI tools + skills when targeting skills only', () => {
    const { selectedAITools, includeSkills } = selectTools(['skills']);
    expect(selectedAITools).toHaveLength(0);
    expect(includeSkills).toBe(true);
  });

  it('returns claude + skills when targeting both', () => {
    const { selectedAITools, includeSkills } = selectTools(['claude', 'skills']);
    expect(selectedAITools.map((t) => t.name)).toEqual(['claude']);
    expect(includeSkills).toBe(true);
  });
});

describe('run', () => {
  it('executes all AI tools + skills when no args', async () => {
    const calls: [string, string[]][] = [];
    const executor = async (cmd: string, args: string[]) => { calls.push([cmd, args]); };

    await run([], executor, allInstalled, async () => null);

    for (const tool of AI_TOOLS) {
      expect(calls).toContainEqual([tool.command, tool.args]);
    }
    expect(calls).toContainEqual([SKILLS_TASK.command, SKILLS_TASK.args]);
  });

  it('executes only claude update when targeting claude', async () => {
    const calls: [string, string[]][] = [];
    const executor = async (cmd: string, args: string[]) => { calls.push([cmd, args]); };

    await run(['claude'], executor, allInstalled);

    expect(calls).toContainEqual(['claude', ['update']]);
    expect(calls).not.toContainEqual([SKILLS_TASK.command, SKILLS_TASK.args]);
    expect(calls).toHaveLength(1);
  });

  it('executes only skills when targeting skills', async () => {
    const calls: [string, string[]][] = [];
    const executor = async (cmd: string, args: string[]) => { calls.push([cmd, args]); };

    await run(['skills'], executor, allInstalled);

    expect(calls).toEqual([[SKILLS_TASK.command, SKILLS_TASK.args]]);
  });

  it('executes claude + skills when targeting both', async () => {
    const calls: [string, string[]][] = [];
    const executor = async (cmd: string, args: string[]) => { calls.push([cmd, args]); };

    await run(['claude', 'skills'], executor, allInstalled);

    expect(calls).toContainEqual(['claude', ['update']]);
    expect(calls).toContainEqual([SKILLS_TASK.command, SKILLS_TASK.args]);
    expect(calls).toHaveLength(2);
  });

  it('skips tools that are not installed', async () => {
    const calls: [string, string[]][] = [];
    const executor = async (cmd: string, args: string[]) => { calls.push([cmd, args]); };

    await run([], executor, onlyInstalled('claude'));

    expect(calls).toContainEqual(['claude', ['update']]);
    expect(calls).not.toContainEqual(['codex', expect.any(Array)]);
    expect(calls).not.toContainEqual([SKILLS_TASK.command, SKILLS_TASK.args]);
  });

  it('skips skills when skills is not installed', async () => {
    const calls: [string, string[]][] = [];
    const executor = async (cmd: string, args: string[]) => { calls.push([cmd, args]); };

    await run(['skills'], executor, noneInstalled);

    expect(calls).toHaveLength(0);
  });

  it('returns true when all commands succeed', async () => {
    const executor = async () => {};
    const success = await run(['claude'], executor, allInstalled);
    expect(success).toBe(true);
  });

  it('returns false when a command fails', async () => {
    const executor = async () => { throw new Error('update failed'); };
    const success = await run(['claude'], executor, allInstalled);
    expect(success).toBe(false);
  });

  it('runs remaining tools even if one fails', async () => {
    const calls: [string, string[]][] = [];
    const executor = async (cmd: string, args: string[]) => {
      calls.push([cmd, args]);
      if (cmd === 'claude') throw new Error('failed');
    };

    await run(['claude', 'codex'], executor, allInstalled);

    expect(calls).toContainEqual(['claude', ['update']]);
    expect(calls).toContainEqual(['codex', ['update']]);
  });

  it('calls versioner before and after execution for versioned tools', async () => {
    const versionCalls: string[] = [];
    let callCount = 0;
    const versioner = async (cmd: string) => {
      versionCalls.push(cmd);
      return callCount++ === 0 ? '1.0.0' : '1.0.1';
    };

    await run(['claude'], async () => {}, allInstalled, versioner);

    expect(versionCalls).toEqual(['claude', 'claude']);
  });

  it('does not call versioner for non-versioned tools (skills)', async () => {
    const versionCalls: string[] = [];
    const versioner = async (cmd: string) => { versionCalls.push(cmd); return null; };

    await run(['skills'], async () => {}, allInstalled, versioner);

    expect(versionCalls).toHaveLength(0);
  });

  it('runs nothing when no tools are installed and no skills', async () => {
    const calls: [string, string[]][] = [];
    const executor = async (cmd: string, args: string[]) => { calls.push([cmd, args]); };

    await run(['claude'], executor, noneInstalled);

    expect(calls).toHaveLength(0);
  });

  it('logs a summary naming every failed tool', async () => {
    const logs: string[] = [];
    const executor = async (cmd: string) => {
      if (cmd === 'claude') throw new Error('[unauthenticated] Error');
    };

    await run(['claude', 'codex'], executor, allInstalled, undefined, (msg) => logs.push(msg));

    expect(logs.join('\n')).toContain('claude: Error: [unauthenticated] Error');
  });

  it('does not log a summary when everything succeeds', async () => {
    const logs: string[] = [];
    const executor = async () => {};

    await run(['claude'], executor, allInstalled, undefined, (msg) => logs.push(msg));

    expect(logs).toHaveLength(0);
  });
});

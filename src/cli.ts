#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { realpathSync } from 'fs';
import { Listr } from 'listr2';
import { execa, ExecaError } from 'execa';

interface Tool {
  name: string;
  command: string;
  args: string[];
  versioned?: boolean;
}

export type Executor = (command: string, args: string[]) => Promise<void>;
export type Checker = (command: string) => Promise<boolean>;
export type Versioner = (command: string) => Promise<string | null>;

export const AI_TOOLS: Tool[] = [
  { name: 'claude', command: 'claude', args: ['update'], versioned: true },
  { name: 'codex', command: 'codex', args: ['update'], versioned: true },
  { name: 'opencode', command: 'opencode', args: ['upgrade'], versioned: true },
  { name: 'cursor-agent', command: 'cursor-agent', args: ['update'], versioned: true },
  { name: 'copilot', command: 'copilot', args: ['update'], versioned: true },
];

export const SKILLS_TASK: Tool = {
  name: 'skills',
  command: 'npx',
  args: ['--yes', 'skills', 'update', '-g', '-p', '-y'],
};

async function defaultChecker(command: string): Promise<boolean> {
  try {
    await execa('which', [command]);
    return true;
  } catch {
    return false;
  }
}

async function getVersion(command: string): Promise<string | null> {
  try {
    const { stdout } = await execa(command, ['--version']);
    const match = stdout.match(/\d+\.\d+\.\d+/);
    return match ? match[0] : null;
  } catch {
    return null;
  }
}

export function formatTitle(name: string, before: string | null, after: string | null): string {
  if (!before) return name;
  return after && after !== before
    ? `${name}  ${before} → ${after}`
    : `${name}  up to date (${after ?? before})`;
}

export function selectTools(targetArgs: string[]): { selectedAITools: Tool[]; includeSkills: boolean } {
  const skillsOnly = targetArgs.length === 1 && targetArgs[0] === 'skills';
  const includeSkills = targetArgs.length === 0 || targetArgs.includes('skills');
  const aiToolTargets = targetArgs.filter((a) => a !== 'skills');
  const selectedAITools = skillsOnly
    ? []
    : aiToolTargets.length > 0
      ? AI_TOOLS.filter((t) => aiToolTargets.includes(t.name))
      : AI_TOOLS;
  return { selectedAITools, includeSkills };
}

export async function run(
  targetArgs: string[],
  executor: Executor = async (cmd, args) => { await execa(cmd, args); },
  checker: Checker = defaultChecker,
  versioner: Versioner = getVersion,
): Promise<boolean> {
  const { selectedAITools, includeSkills } = selectTools(targetArgs);

  const checks = await Promise.all(
    selectedAITools.map(async (t) => ({ tool: t, installed: await checker(t.command) })),
  );
  const availableTools = checks.filter((c) => c.installed).map((c) => c.tool);
  const allTools = includeSkills ? [...availableTools, SKILLS_TASK] : availableTools;

  let hasFailures = false;

  const runner = new Listr(
    allTools.map((tool) => ({
      title: tool.name,
      task: async (_, task) => {
        const before = tool.versioned ? await versioner(tool.command) : null;
        try {
          await executor(tool.command, tool.args);
        } catch (err) {
          hasFailures = true;
          const e = err as ExecaError;
          throw new Error(e.stderr || e.shortMessage || String(e));
        }
        if (before) {
          const after = await versioner(tool.command);
          task.title = formatTitle(tool.name, before, after);
        }
      },
    })),
    { concurrent: true, exitOnError: false },
  );

  await runner.run().catch(() => {});
  return !hasFailures;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const success = await run(process.argv.slice(2));
  if (!success) process.exit(1);
}

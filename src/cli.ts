#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { realpathSync } from 'fs';
import { sep } from 'path';
import { Listr } from 'listr2';
import { execa, ExecaError } from 'execa';

interface Tool {
  name: string;
  command: string;
  args: string[];
  versioned?: boolean;
}

export type Installation = { via: 'native' } | { via: 'mise'; tool: string };

export type Executor = (command: string, args: string[]) => Promise<void>;
export type Checker = (command: string) => Promise<Installation | null>;
export type Versioner = (command: string, args?: string[]) => Promise<string | null>;
export type Logger = (message: string) => void;

export const AI_TOOLS: Tool[] = [
  { name: 'claude', command: 'claude', args: ['update'], versioned: true },
  { name: 'codex', command: 'codex', args: ['update'], versioned: true },
  { name: 'opencode', command: 'opencode', args: ['upgrade'], versioned: true },
  { name: 'cursor-agent', command: 'cursor-agent', args: ['update'], versioned: true },
  { name: 'copilot', command: 'copilot', args: ['update'], versioned: true },
  { name: 'pi', command: 'pi', args: ['update', 'pi'], versioned: true },
  { name: 'agy', command: 'agy', args: ['update'], versioned: true },
];

export const SKILLS_TASK: Tool = {
  name: 'skills',
  command: 'npx',
  args: ['--yes', 'skills', 'update', '-g', '-p', '-y'],
};

interface MiseInstall {
  install_path?: string;
  installed?: boolean;
}

let miseContext: Promise<{ misePath: string; installs: Record<string, MiseInstall[]> } | null> | undefined;

function getMiseContext() {
  miseContext ??= (async () => {
    try {
      const { stdout: misePath } = await execa('which', ['mise']);
      const { stdout } = await execa('mise', ['ls', '--installed', '--json']);
      return { misePath: realpathSync(misePath.trim()), installs: JSON.parse(stdout) };
    } catch {
      return null;
    }
  })();
  return miseContext;
}

// Returns the mise tool name (e.g. `npm:@anthropic-ai/claude-code`) that provides
// the `command` found on PATH, or null if it isn't managed by mise.
export async function findMiseTool(command: string, commandPath: string): Promise<string | null> {
  const ctx = await getMiseContext();
  if (!ctx) return null;
  try {
    const { stdout } = await execa('mise', ['which', command]);
    const miseBin = realpathSync(stdout.trim());
    const resolved = realpathSync(commandPath);
    // PATH resolves either to a mise shim (a link to the mise binary) or,
    // with `mise activate`, directly into the install dir.
    if (resolved !== ctx.misePath && resolved !== miseBin) return null;
    for (const [tool, installs] of Object.entries(ctx.installs)) {
      for (const install of installs) {
        if (!install.installed || !install.install_path) continue;
        const installPath = realpathSync(install.install_path);
        if (miseBin.startsWith(installPath + sep)) return tool;
      }
    }
  } catch {
    // not a mise bin
  }
  return null;
}

async function defaultChecker(command: string): Promise<Installation | null> {
  let commandPath: string;
  try {
    commandPath = (await execa('which', [command])).stdout.trim();
  } catch {
    return null;
  }
  const tool = await findMiseTool(command, commandPath);
  return tool ? { via: 'mise', tool } : { via: 'native' };
}

export async function getVersion(command: string, args: string[] = ['--version']): Promise<string | null> {
  try {
    const { stdout, stderr } = await execa(command, args);
    const match = `${stdout}\n${stderr}`.match(/\d+\.\d+\.\d+/);
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

interface UpdatePlan {
  tool: Tool;
  label: string;
  update: [string, string[]];
  version: [string, string[]?];
}

export function planUpdate(tool: Tool, installation: Installation): UpdatePlan {
  // Skills run through npx, which may itself come from mise-managed node.
  if (installation.via === 'mise' && tool !== SKILLS_TASK) {
    return {
      tool,
      label: `${tool.name} (mise)`,
      update: ['mise', ['upgrade', installation.tool]],
      // Run through `mise exec` so the freshly upgraded version is picked up
      // even when PATH still points at the old install dir (`mise activate`).
      version: ['mise', ['exec', installation.tool, '--', tool.command, '--version']],
    };
  }
  return { tool, label: tool.name, update: [tool.command, tool.args], version: [tool.command] };
}

export async function run(
  targetArgs: string[],
  executor: Executor = async (cmd, args) => { await execa(cmd, args); },
  checker: Checker = defaultChecker,
  versioner: Versioner = getVersion,
  logger: Logger = (message) => console.error(message),
): Promise<boolean> {
  const { selectedAITools, includeSkills } = selectTools(targetArgs);

  const toolsToCheck = includeSkills ? [...selectedAITools, SKILLS_TASK] : selectedAITools;
  const checks = await Promise.all(
    toolsToCheck.map(async (t) => ({ tool: t, installation: await checker(t.command) })),
  );
  const plans = checks
    .filter((c) => c.installation)
    .map(({ tool, installation }) => planUpdate(tool, installation!));

  const failures: { name: string; message: string }[] = [];

  const runner = new Listr(
    plans.map(({ tool, label, update, version }) => ({
      title: label,
      task: async (_, task) => {
        const before = tool.versioned ? await versioner(...version) : null;
        try {
          await executor(...update);
        } catch (err) {
          const e = err as ExecaError;
          const message = e.stderr || e.shortMessage || String(e);
          failures.push({ name: tool.name, message });
          throw new Error(message);
        }
        if (before) {
          const after = await versioner(...version);
          task.title = formatTitle(label, before, after);
        }
      },
    })),
    { concurrent: true, exitOnError: false },
  );

  await runner.run().catch(() => {});

  if (failures.length > 0) {
    logger('');
    logger(`Errors (${failures.length}):`);
    for (const failure of failures) {
      logger(`  - ${failure.name}: ${failure.message}`);
    }
  }

  return failures.length === 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const success = await run(process.argv.slice(2));
  if (!success) process.exit(1);
}

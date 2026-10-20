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
export type Versioner = (command: string, args?: string[]) => Promise<string | null>;
export type Logger = (message: string) => void;
interface UpdateCommand {
  command: string;
  args: string[];
  versionArgs?: string[];
}
export type UpdateResolver = (tool: Tool) => Promise<UpdateCommand>;

export const AI_TOOLS: Tool[] = [
  { name: 'claude', command: 'claude', args: ['update'], versioned: true },
  { name: 'codex', command: 'codex', args: ['update'], versioned: true },
  { name: 'opencode', command: 'opencode', args: ['upgrade'], versioned: true },
  { name: 'cursor-agent', command: 'cursor-agent', args: ['update'], versioned: true },
  { name: 'copilot', command: 'copilot', args: ['update'], versioned: true },
  { name: 'pi', command: 'pi', args: ['update', 'pi'], versioned: true },
  { name: 'agy', command: 'agy', args: ['update'], versioned: true },
  { name: 'grok', command: 'grok', args: ['update'], versioned: true },
  { name: 'omnigent', command: 'omnigent', args: ['upgrade'], versioned: true },
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

export async function getVersion(command: string, args: string[] = ['--version']): Promise<string | null> {
  try {
    const { stdout, stderr } = await execa(command, args);
    const match = `${stdout}\n${stderr}`.match(/\d+\.\d+\.\d+/);
    return match ? match[0] : null;
  } catch {
    return null;
  }
}

async function resolveUpdate(tool: Tool): Promise<UpdateCommand> {
  if (!tool.versioned) return tool;

  try {
    const [binary, managedBinary, owner] = await Promise.all([
      execa('which', [tool.command]),
      execa('mise', ['which', tool.command]),
      execa('mise', ['which', tool.command, '--plugin']),
    ]);
    const packageName = owner.stdout.trim();
    // Global npm packages can live inside mise's Node installation. Updating
    // that runtime would not update the CLI package itself.
    if (!packageName || ['node', 'bun', 'deno'].includes(packageName.replace(/^.*:/, ''))) return tool;

    const actualPath = realpathSync(binary.stdout.trim());
    if (actualPath !== realpathSync(managedBinary.stdout.trim())) {
      // Mise shims are symlinks to the mise executable itself.
      const mise = await execa('which', ['mise']);
      if (actualPath !== realpathSync(mise.stdout.trim())) return tool;
    }

    return {
      command: 'mise',
      args: ['upgrade', packageName, '--yes'],
      // Upgrade can remove the old installation still present in our PATH.
      versionArgs: ['exec', packageName, '--', tool.command, '--version'],
    };
  } catch {
    // Mise is optional; unavailable or unmanaged tools use their own updater.
    return tool;
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
  logger: Logger = (message) => console.error(message),
  updateResolver: UpdateResolver = resolveUpdate,
): Promise<boolean> {
  const { selectedAITools, includeSkills } = selectTools(targetArgs);

  const toolsToCheck = includeSkills ? [...selectedAITools, SKILLS_TASK] : selectedAITools;
  const checks = await Promise.all(
    toolsToCheck.map(async (t) => ({ tool: t, installed: await checker(t.command) })),
  );
  const allTools = checks.filter((c) => c.installed).map((c) => c.tool);

  const failures: { name: string; message: string }[] = [];

  const runner = new Listr(
    allTools.map((tool) => ({
      title: tool.name,
      task: async (_, task) => {
        const update = await updateResolver(tool);
        const versionCommand = update.versionArgs ? update.command : tool.command;
        const before = tool.versioned ? await versioner(versionCommand, update.versionArgs) : null;
        try {
          await executor(update.command, update.args);
        } catch (err) {
          const e = err as ExecaError;
          const message = String(e.stderr || e.shortMessage || e);
          failures.push({ name: tool.name, message });
          throw new Error(message);
        }
        if (before) {
          const after = await versioner(versionCommand, update.versionArgs);
          task.title = formatTitle(tool.name, before, after);
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

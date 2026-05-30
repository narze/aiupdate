#!/usr/bin/env node
import { Listr } from 'listr2';
import { execa, ExecaError } from 'execa';

interface Tool {
  name: string;
  command: string;
  args: string[];
  versioned?: boolean;
}

const AI_TOOLS: Tool[] = [
  { name: 'claude', command: 'claude', args: ['update'], versioned: true },
  { name: 'codex', command: 'codex', args: ['update'], versioned: true },
  { name: 'opencode', command: 'opencode', args: ['upgrade'], versioned: true },
  { name: 'cursor-agent', command: 'cursor-agent', args: ['update'], versioned: true },
  { name: 'copilot', command: 'copilot', args: ['update'], versioned: true },
];

const SKILLS_TASK: Tool = {
  name: 'skills',
  command: 'npx',
  args: ['--yes', 'skills', 'update', '-g', '-p', '-y'],
};

async function isInstalled(command: string): Promise<boolean> {
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

const targetArgs = process.argv.slice(2);
const selectedAITools =
  targetArgs.length > 0 ? AI_TOOLS.filter((t) => targetArgs.includes(t.name)) : AI_TOOLS;

const checks = await Promise.all(
  selectedAITools.map(async (t) => ({ tool: t, installed: await isInstalled(t.command) })),
);
const availableTools = checks.filter((c) => c.installed).map((c) => c.tool);
const allTools = [...availableTools, SKILLS_TASK];

let hasFailures = false;

const runner = new Listr(
  allTools.map((tool) => ({
    title: tool.name,
    task: async (_, task) => {
      const before = tool.versioned ? await getVersion(tool.command) : null;
      try {
        await execa(tool.command, tool.args);
      } catch (err) {
        hasFailures = true;
        const e = err as ExecaError;
        throw new Error(e.stderr || e.shortMessage || String(e));
      }
      if (before) {
        const after = await getVersion(tool.command);
        task.title =
          after && after !== before
            ? `${tool.name}  ${before} → ${after}`
            : `${tool.name}  up to date (${after ?? before})`;
      }
    },
  })),
  { concurrent: true, exitOnError: false },
);

await runner.run().catch(() => {});

if (hasFailures) {
  process.exit(1);
}

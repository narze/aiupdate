#!/usr/bin/env node
import { Listr } from 'listr2';
import { execa, ExecaError } from 'execa';

interface Tool {
  name: string;
  command: string;
  args: string[];
}

const AI_TOOLS: Tool[] = [
  { name: 'claude', command: 'claude', args: ['update'] },
  { name: 'codex', command: 'codex', args: ['update'] },
  { name: 'opencode', command: 'opencode', args: ['upgrade'] },
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
    task: async () => {
      try {
        await execa(tool.command, tool.args);
      } catch (err) {
        hasFailures = true;
        const e = err as ExecaError;
        throw new Error(e.stderr || e.shortMessage || String(e));
      }
    },
  })),
  { concurrent: true, exitOnError: false },
);

await runner.run().catch(() => {});

if (hasFailures) {
  process.exit(1);
}

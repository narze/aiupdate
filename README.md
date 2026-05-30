# aiup

Update all your AI agent CLIs and skills concurrently.

## Install

```bash
npm install -g aiup
# or
pnpm add -g aiup
```

## Usage

```bash
aiup             # update everything
aiup claude      # update one tool
aiup claude codex opencode  # update specific tools
```

Each tool runs concurrently. After updating, aiup shows the version change (or "up to date") for each tool.

## What it updates

| Tool | Update command |
|------|---------------|
| [Claude Code](https://claude.ai/code) | `claude update` |
| [OpenAI Codex](https://github.com/openai/codex) | `codex update` |
| [OpenCode](https://opencode.ai) | `opencode upgrade` |
| [Cursor Agent](https://cursor.com) | `cursor-agent update` |
| [GitHub Copilot CLI](https://githubnext.com/projects/copilot-cli) | `copilot update` |
| [skills](https://github.com/anthropics/skills) | `npx skills update -g -p -y` |

Tools not installed on your machine are silently skipped.

## Contributing

To add a new tool, open `src/cli.ts` and add one line to `AI_TOOLS`:

```typescript
{ name: 'mytool', command: 'mytool', args: ['update'], versioned: true },
```

Then build and test:

```bash
pnpm run build
aiup mytool
```

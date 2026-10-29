# Multi-Agent Code Review System

An automated pull-request reviewer built with the Claude Agent SDK. An orchestrator fetches a PR through the GitHub MCP server, dispatches three specialized subagents, and aggregates their findings into a Zod-validated report written as JSON, Markdown and HTML.

## Architecture

```
                  CodeReviewOrchestrator
        (fetches PR, spawns subagents, aggregates)
                           |
       +-------------------+-------------------+
       v                   v                   v
code-quality-analyzer  test-coverage-analyzer  refactoring-suggester
 security, performance  untested paths,        extract function,
 maintainability        suggested tests        modernization, patterns
       \                   |                   /
        +------ ReviewReport (Zod-validated) -+
                           |
               report.json / .md / .html
```

- **MCP servers:** GitHub (`@modelcontextprotocol/server-github`) for PR data and file contents, and ESLint (`@eslint/mcp`) for linting. Both are configured in `src/config/mcp.config.ts`.
- **Subagents:** each is an `AgentDefinition` with `model: 'inherit'`, a focused description, and only the tools it needs (including `Skill`). No agent can write files or run shell commands.
- **Claude Skills:** `.claude/skills/javascript-best-practices` is invoked by all three agents. The code-quality agent also uses `security-analysis` when that skill is present.
- **Structured output:** the orchestrator passes a JSON Schema generated from the Zod schema (`zod-to-json-schema`, `$refStrategy: 'root'`) as `outputFormat`, then validates the result with `safeParse`.
- **Scoring:** the summary is recomputed in code from the findings (`src/utils/scoring.ts`). Overall score = code quality 85% + refactoring health 15%. Test coverage (estimate, untested paths, high-priority tests) is reported separately and does not lower the score.
- **Reliability:** each review is wrapped in `withRateLimit`, `withRetry` (exponential backoff with jitter) and `withTimeout` (`Promise.race`). If a subagent fails, its section is left empty and noted in the recommendations instead of failing the whole report.

## Requirements

- Node.js 20 or newer (22 recommended)
- An Anthropic API key (or AWS Bedrock credentials)
- A GitHub personal access token (recommended; scopes `repo` and `read:org`)

## Setup

### Vocareum workspace

Your workspace already provides `ANTHROPIC_API_KEY` and `ANTHROPIC_BASE_URL`. Do not add them to `.env`.

```bash
cd /voc/work/cd14715-claude-code-classroom
npm install
cd project/starter
cp .env.example .env
```

```
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929
PROJECT_ROOT=/voc/work/cd14715-claude-code-classroom/project/starter
GITHUB_TOKEN=ghp_your-token
LOG_LEVEL=info
```

### Local machine

```bash
git clone https://github.com/udacity/cd14715-claude-code-classroom.git
cd cd14715-claude-code-classroom
npm install
cd project/starter
cp .env.example .env      # PowerShell: Copy-Item .env.example .env
```

```
ANTHROPIC_API_KEY=your-key
# ANTHROPIC_BASE_URL=...   only when using the Vocareum gateway
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929
PROJECT_ROOT=/absolute/path/to/project/starter   # forward slashes on Windows
GITHUB_TOKEN=ghp_your-token
LOG_LEVEL=info
```

`PROJECT_ROOT` must be the folder containing `.claude/skills/`. `.env` is git-ignored; never commit secrets.

## Usage

```bash
npm run dev -- <owner> <repo> <pr-number>

# Example
npm run dev -- udacity cd14715-simple-todo-app 2
```

Reports are written to `reports/<owner>_<repo>_<pr>.json`, `.md` and `.html`. A review takes several minutes and uses API credits. Set `LOG_LEVEL=debug` to log MCP connection status and every tool call (also written to `logs/combined.log`).

Production build:

```bash
npm run build
npm start <owner> <repo> <pr-number>
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev -- <owner> <repo> <pr>` | Run a review |
| `npm run build` | Compile TypeScript |
| `npm run lint` | Type-check only |
| `npm test` | Unit tests: schemas, scoring, retry, timeout, rate limiter |
| `npx tsx scripts/rescore.ts` | Recompute summaries and regenerate the sample reports from the saved JSON (no API calls) |

An integration test against the real API is skipped unless `RUN_INTEGRATION=1` is set.

## Project structure

```
src/
  main.ts            CLI: argument and environment validation, report writing
  orchestrator.ts    CodeReviewOrchestrator
  agents/            three subagent definitions
  prompts/           orchestrator and subagent prompts
  config/            MCP server configuration
  types/             Zod schemas and JSON Schemas
  utils/             logger, error-handler, rate-limiter, scoring, report generators
tests/               vitest suites
scripts/             helper scripts
reports/             generated sample reports
.claude/skills/      Claude Skills
```

## Sample reports

`reports/` contains reviews of `udacity/cd14715-simple-todo-app` in all three formats:

| PR | Description | Score |
|---|---|---|
| #1 | Clean code fixture (merged) | 86 |
| #2 | Search functionality (SQL injection) | 32 |
| #3 | Premium subscription features (payment handling) | 8 |

## Limitations

- Findings are AI-generated; verify line numbers and severities before acting on them. File contents reach the agents without line numbers, so reported lines can drift by a few.
- At most 8 source files per PR are reviewed.
- Only the PR's head-branch content is analyzed.

## Troubleshooting

| Problem | Fix |
|---|---|
| `No authentication configured` | Set `ANTHROPIC_API_KEY` (or AWS credentials) |
| `No .claude/skills folder found` | Fix `PROJECT_ROOT` in `.env` |
| `0 files reviewed` | The PR may contain only docs; try one with source changes |
| MCP server not connected | Check that `npx` works and `GITHUB_TOKEN` is set |
| `npm` blocked in PowerShell | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
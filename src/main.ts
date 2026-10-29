import 'dotenv/config'; // MUST stay first: loads .env before other modules read process.env
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CodeReviewOrchestrator } from './orchestrator.js';
import { ReportGenerator, formatError, isReviewError } from './utils/index.js';
import { withFullFindings } from './utils/report-details.js';

function fail(message: string, hints: string[] = []): never {
  console.error(`Error: ${message}`);
  for (const hint of hints) console.error(`  ${hint}`);
  process.exit(1);
}

/**
 * Main entry point for the Claude Multi-Agent Code Review System
 * Usage: npm run dev -- <owner> <repo> <pr-number>
 */
async function main(): Promise<void> {
  // --- Command-line arguments ---
  const [owner, repo, prStr] = process.argv.slice(2);

  if (!owner || !repo || !prStr) {
    fail('Missing arguments.', [
      'Usage: npm run dev -- <owner> <repo> <pr-number>',
      'Example: npm run dev -- udacity cd14715-simple-todo-app 1'
    ]);
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
    fail('Owner and repo may only contain letters, numbers, ".", "_" and "-".');
  }
  if (!/^\d+$/.test(prStr) || parseInt(prStr, 10) <= 0) {
    fail(`PR number must be a positive integer (got "${prStr}").`);
  }
  const prNumber = parseInt(prStr, 10);

  // --- Authentication: Anthropic API OR AWS Bedrock ---
  const hasAnthropicApi = !!process.env.ANTHROPIC_API_KEY;
  const hasAwsCredentials = !!(
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
  );

  if (!hasAnthropicApi && !hasAwsCredentials) {
    fail('No authentication configured. Set one of:', [
      '- ANTHROPIC_API_KEY (Anthropic API), or',
      '- AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY + AWS_REGION (AWS Bedrock)'
    ]);
  }
  if (hasAnthropicApi) {
    console.log('Using Anthropic API authentication');
  } else {
    if (!process.env.AWS_REGION) {
      fail('AWS_REGION is required when using AWS Bedrock.', ['Example: AWS_REGION=us-east-1']);
    }
    process.env.CLAUDE_CODE_USE_BEDROCK = '1';
    console.log('Using AWS Bedrock authentication');
  }

  // --- Model ---
  if (!process.env.ANTHROPIC_MODEL) {
    fail('ANTHROPIC_MODEL is not set.', [
      'Anthropic API: ANTHROPIC_MODEL=claude-sonnet-4-5-20250929',
      'AWS Bedrock:   ANTHROPIC_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0'
    ]);
  }

  // --- Project root (needed so Claude Skills load) ---
  const projectRoot = process.env.PROJECT_ROOT;
  if (!projectRoot) {
    fail('PROJECT_ROOT is not set.', [
      'Set it to the absolute path of project/starter (the folder containing .claude/skills).'
    ]);
  }
  try {
    await access(path.join(projectRoot, '.claude', 'skills'));
  } catch {
    fail(`No .claude/skills folder found under PROJECT_ROOT (${projectRoot}).`, [
      'Check PROJECT_ROOT in your .env file.'
    ]);
  }

  if (!process.env.GITHUB_TOKEN) {
    console.warn('Warning: GITHUB_TOKEN is not set. GitHub rate limits may apply.');
  }

  // --- Run the review ---
  try {
    console.log(`Reviewing ${owner}/${repo}#${prNumber} (this can take several minutes)...`);

    const orchestrator = new CodeReviewOrchestrator();
    const report = await orchestrator.reviewPullRequest(owner, repo, prNumber);

    const generator = new ReportGenerator();
    const reportsDir = path.join(projectRoot, 'reports');
    await mkdir(reportsDir, { recursive: true });

    const base = path.join(reportsDir, `${owner}_${repo}_${prNumber}`);
    await writeFile(`${base}.json`, generator.generateJSONReport(report), 'utf8');
    await writeFile(
      `${base}.md`,
      withFullFindings(generator.generateMarkdownReport(report), report),
      'utf8'
    );
    await writeFile(`${base}.html`, generator.generateHTMLReport(report), 'utf8');

    console.log('\nReview complete.');
    console.log(`  Overall score:        ${report.summary.overallScore}/100`);
    console.log(`  Files reviewed:       ${report.summary.totalFiles}`);
    console.log(`  Critical issues:      ${report.summary.criticalIssues}`);
    console.log(`  High-priority tests:  ${report.summary.highPriorityTests}`);
    console.log(`  Refactorings:         ${report.summary.refactoringOpportunities}`);
    console.log('Reports saved:');
    console.log(`  ${base}.json`);
    console.log(`  ${base}.md`);
    console.log(`  ${base}.html`);
  } catch (error) {
    console.error(`\nReview failed: ${formatError(error)}`);
    if (isReviewError(error)) {
      console.error('Tip: set LOG_LEVEL=debug and check logs/combined.log for details.');
    }
    if (process.env.LOG_LEVEL === 'debug' && error instanceof Error) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
import { query } from '@anthropic-ai/claude-agent-sdk';
import { mcpServersConfig } from './config/mcp.config.js';
import { codeQualityAnalyzer, testCoverageAnalyzer, refactoringSuggester } from './agents/index.js';
import { buildOrchestratorPrompt } from './prompts/index.js';
import { computeSummary } from './utils/scoring.js';
import {
  ReviewReportSchema,
  ReviewReportJSONSchema,
  type ReviewReport
} from './types/report-types.js';
import {
  logger,
  logReviewStart,
  logReviewComplete,
  logReviewError
} from './utils/logger.js';
import {
  ReviewError,
  ErrorCodes,
  withRetry,
  withTimeout,
  formatError
} from './utils/error-handler.js';
import {
  RateLimiter,
  withRateLimit,
  type RateLimiterConfig
} from './utils/rate-limiter.js';

const SUBAGENT_NAMES = [
  'code-quality-analyzer',
  'test-coverage-analyzer',
  'refactoring-suggester'
];

/**
 * Orchestrator configuration options
 */
export interface OrchestratorOptions {
  /** Model to use (defaults to ANTHROPIC_MODEL) */
  model?: string;
  /** Max agent turns (default 60) */
  maxTurns?: number;
  /** Timeout for one full review attempt in ms (default 15 minutes) */
  timeoutMs?: number;
  /** Attempts for the whole review (default 2) */
  maxRetries?: number;
  /** Rate limit overrides */
  rateLimits?: Partial<RateLimiterConfig>;
}

/**
 * Main Code Review Orchestrator
 * Coordinates subagents to analyze pull requests and generate comprehensive reports
 */
export class CodeReviewOrchestrator {
  private readonly model: string;
  private readonly projectRoot: string;
  private readonly maxTurns: number;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly rateLimiter: RateLimiter;

  constructor(options: OrchestratorOptions = {}) {
    const model = options.model ?? process.env.ANTHROPIC_MODEL;
    if (!model) {
      throw new ReviewError(
        'ANTHROPIC_MODEL environment variable is required',
        ErrorCodes.INVALID_CONFIG
      );
    }
    const projectRoot = process.env.PROJECT_ROOT;
    if (!projectRoot) {
      throw new ReviewError(
        'PROJECT_ROOT environment variable is required (absolute path containing .claude/skills)',
        ErrorCodes.INVALID_CONFIG
      );
    }

    this.model = model;
    this.projectRoot = projectRoot;
    this.maxTurns = options.maxTurns ?? 60;
    this.timeoutMs = options.timeoutMs ?? 15 * 60 * 1000;
    this.maxRetries = options.maxRetries ?? 2;
    this.rateLimiter = new RateLimiter(options.rateLimits);
  }

  /**
   * Review a pull request using parallel subagent analysis
   */
  async reviewPullRequest(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<ReviewReport> {
    const startedAt = Date.now();
    logReviewStart(owner, repo, prNumber);

    try {
      const rawReport = await withRateLimit(
        this.rateLimiter,
        () =>
          withRetry(
            () =>
              withTimeout(
                () => this.runReview(owner, repo, prNumber),
                this.timeoutMs,
                `Review of ${owner}/${repo}#${prNumber} timed out after ${this.timeoutMs}ms`
              ),
            this.maxRetries,
            2000
          ),
        50000
      );

      const report = this.buildFinalReport(rawReport, owner, repo, prNumber, startedAt);
      logReviewComplete(owner, repo, prNumber, report.summary.overallScore, report.metadata.duration);
      return report;
    } catch (error) {
      logReviewError(
        owner,
        repo,
        prNumber,
        error instanceof Error ? error : new Error(formatError(error))
      );
      throw error;
    }
  }

  /**
   * One attempt: run the orchestrator agent and validate its structured output
   */
  private async runReview(owner: string, repo: string, prNumber: number): Promise<ReviewReport> {
    const invoked = new Set<string>();
    let structured: unknown;

    const stream = query({
      prompt: buildOrchestratorPrompt(owner, repo, prNumber),
      options: {
        model: this.model,
        cwd: this.projectRoot,
        // Required so .claude/skills is loaded for the Skill tool
        settingSources: ['project'],
        mcpServers: mcpServersConfig,
        agents: {
          'code-quality-analyzer': codeQualityAnalyzer,
          'test-coverage-analyzer': testCoverageAnalyzer,
          'refactoring-suggester': refactoringSuggester
        },
        allowedTools: [
          'Task',
          'Skill',
          'Read',
          'Grep',
          'Glob',
          'mcp__github__*',
          'mcp__eslint__*'
        ],
        permissionMode: 'acceptEdits',
        maxTurns: this.maxTurns,
        outputFormat: { type: 'json_schema', schema: ReviewReportJSONSchema },
        stderr: (data: string) => logger.debug('Agent stderr', { data: data.trim() })
      }
    });

    for await (const message of stream) {
      this.trackSubagents(message, invoked);

      if (message.type === 'result') {
        if (message.subtype !== 'success') {
          throw new ReviewError(
            `Agent run ended without a result (${message.subtype})`,
            ErrorCodes.AGENT_FAILED,
            { subtype: message.subtype }
          );
        }
        const result = message as unknown as { structured_output?: unknown; result?: unknown };
        structured = result.structured_output;

        // Fallback: some runs return the JSON as plain text
        if (structured === undefined && typeof result.result === 'string') {
          try {
            structured = JSON.parse(result.result);
          } catch {
            // handled below
          }
        }
      }
    }

    if (structured === undefined) {
      throw new ReviewError(
        'Agent finished without structured output',
        ErrorCodes.STRUCTURED_OUTPUT_FAILED
      );
    }

    const parsed = ReviewReportSchema.safeParse(structured);
    if (!parsed.success) {
      throw new ReviewError(
        `Report failed schema validation: ${parsed.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`,
        ErrorCodes.VALIDATION_FAILED
      );
    }

    const missing = SUBAGENT_NAMES.filter((name) => !invoked.has(name));
    if (missing.length > 0) {
      logger.warn('Some subagents were never invoked', { missing });
    }

    return parsed.data;
  }

    /**
   * Log MCP connection status and every tool call; record Task (subagent) invocations
   */
  private trackSubagents(message: unknown, invoked: Set<string>): void {
    const msg = message as {
      type?: string;
      subtype?: string;
      mcp_servers?: Array<{ name: string; status: string }>;
      message?: { content?: unknown };
    };

    if (msg.type === 'system' && msg.subtype === 'init') {
      logger.info('MCP servers', { servers: msg.mcp_servers });
      return;
    }
    if (msg.type !== 'assistant') return;

    const content = msg.message?.content;
    if (!Array.isArray(content)) return;

    for (const block of content as Array<{
      type?: string;
      name?: string;
      input?: { subagent_type?: string };
    }>) {
      if (block.type !== 'tool_use') continue;
      logger.debug('Tool call', { tool: block.name });
      if (block.name === 'Task') {
        const agent = block.input?.subagent_type ?? 'unknown';
        invoked.add(agent);
        logger.info('Subagent invoked', { agent });
      }
    }
  }
  /**
   * Recompute the summary from the aggregated findings so the numbers are
   * consistent, and stamp trusted metadata onto the model's report.
   */
  private buildFinalReport(
    report: ReviewReport,
    owner: string,
    repo: string,
    prNumber: number,
    startedAt: number
  ): ReviewReport {
    return {
      ...report,
      pullRequest: { owner, repo, number: prNumber },
      summary: computeSummary(report.fileReviews),
      metadata: {
        analyzedAt: new Date().toISOString(),
        duration: Date.now() - startedAt,
        agentVersions: {
          orchestrator: this.model,
          'code-quality-analyzer': '1.0.0',
          'test-coverage-analyzer': '1.0.0',
          'refactoring-suggester': '1.0.0'
        }
      }
    };
  }
}
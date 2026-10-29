import 'dotenv/config';
import { computeSummary } from '../src/utils/scoring';
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  CodeQualityResultSchema,
  TestCoverageResultSchema,
  RefactoringSuggestionSchema,
  CodeQualityResultJSONSchema,
  TestCoverageResultJSONSchema,
  RefactoringSuggestionJSONSchema
} from '../src/types/analysis-results';
import { ReviewReportSchema, ReviewReportJSONSchema } from '../src/types/report-types';
import { ReviewError, ErrorCodes, withRetry, withTimeout } from '../src/utils/error-handler';
import { RateLimiter } from '../src/utils/rate-limiter';

const validQuality = {
  file: 'src/search.ts',
  issues: [
    {
      line: 12,
      severity: 'high' as const,
      category: 'security' as const,
      description: 'User input is rendered with innerHTML',
      suggestion: 'Use textContent instead'
    }
  ],
  overallScore: 80,
  summary: 'One high severity issue'
};

const validCoverage = {
  file: 'src/search.ts',
  hasTests: false,
  testFiles: [],
  untestedPaths: [
    {
      type: 'function' as const,
      location: 'searchTodos (line 5)',
      priority: 'high' as const,
      reasoning: 'Core feature',
      suggestedTest: "it('returns [] when nothing matches') expect(searchTodos(todos,'zzz')).toEqual([])"
    }
  ],
  coverageEstimate: 0,
  summary: 'No tests found'
};

const validRefactoring = {
  file: 'src/search.ts',
  suggestions: [
    {
      type: 'modernize' as const,
      location: 'searchTodos (line 5)',
      impact: 'medium' as const,
      description: 'Use filter and optional chaining',
      before: 'for (var i = 0; ...)',
      after: 'todos.filter(...)',
      benefits: 'Shorter and clearer'
    }
  ],
  summary: 'Small modernization'
};

const validReport = {
  pullRequest: { owner: 'udacity', repo: 'cd14715-simple-todo-app', number: 2 },
  fileReviews: [
    {
      file: 'src/search.ts',
      codeQuality: validQuality,
      testCoverage: validCoverage,
      refactorings: validRefactoring
    }
  ],
  summary: {
    totalFiles: 1,
    overallScore: 60,
    criticalIssues: 0,
    highPriorityTests: 1,
    refactoringOpportunities: 1
  },
  recommendations: [
    {
      priority: 'high' as const,
      category: 'security',
      description: 'Fix innerHTML usage',
      files: ['src/search.ts']
    }
  ],
  metadata: {
    analyzedAt: '2026-01-01T00:00:00.000Z',
    duration: 1000,
    agentVersions: { 'code-quality-analyzer': '1.0.0' }
  }
};

describe('Analysis schemas: valid data', () => {
  it('accepts a valid CodeQualityResult', () => {
    expect(() => CodeQualityResultSchema.parse(validQuality)).not.toThrow();
  });
  it('accepts a valid TestCoverageResult', () => {
    expect(() => TestCoverageResultSchema.parse(validCoverage)).not.toThrow();
  });
  it('accepts a valid RefactoringSuggestion', () => {
    expect(() => RefactoringSuggestionSchema.parse(validRefactoring)).not.toThrow();
  });
  it('accepts a valid ReviewReport', () => {
    expect(() => ReviewReportSchema.parse(validReport)).not.toThrow();
  });
});

describe('Analysis schemas: invalid data', () => {
  it('rejects an unknown severity', () => {
    const bad = { ...validQuality, issues: [{ ...validQuality.issues[0], severity: 'urgent' }] };
    expect(() => CodeQualityResultSchema.parse(bad)).toThrow();
  });
  it('rejects an unknown category', () => {
    const bad = { ...validQuality, issues: [{ ...validQuality.issues[0], category: 'vibes' }] };
    expect(() => CodeQualityResultSchema.parse(bad)).toThrow();
  });
  it('rejects a string line number', () => {
    const bad = { ...validQuality, issues: [{ ...validQuality.issues[0], line: 'twelve' }] };
    expect(() => CodeQualityResultSchema.parse(bad)).toThrow();
  });
  it('rejects a missing summary', () => {
    const { summary: _omit, ...bad } = validQuality;
    expect(() => CodeQualityResultSchema.parse(bad)).toThrow();
  });
  it('rejects hasTests that is not a boolean', () => {
    expect(() => TestCoverageResultSchema.parse({ ...validCoverage, hasTests: 'no' })).toThrow();
  });
  it('rejects an invalid refactoring impact', () => {
    const bad = {
      ...validRefactoring,
      suggestions: [{ ...validRefactoring.suggestions[0], impact: 'huge' }]
    };
    expect(() => RefactoringSuggestionSchema.parse(bad)).toThrow();
  });
  it('rejects a report with missing metadata', () => {
    const { metadata: _omit, ...bad } = validReport;
    expect(() => ReviewReportSchema.parse(bad)).toThrow();
  });
});

describe('Analysis schemas: edge cases', () => {
  it('accepts empty arrays', () => {
    expect(() => CodeQualityResultSchema.parse({ ...validQuality, issues: [] })).not.toThrow();
    expect(() =>
      TestCoverageResultSchema.parse({ ...validCoverage, untestedPaths: [], testFiles: [] })
    ).not.toThrow();
    expect(() =>
      RefactoringSuggestionSchema.parse({ ...validRefactoring, suggestions: [] })
    ).not.toThrow();
    expect(() =>
      ReviewReportSchema.parse({ ...validReport, fileReviews: [], recommendations: [] })
    ).not.toThrow();
  });
  it('accepts score boundaries 0 and 100', () => {
    expect(() => CodeQualityResultSchema.parse({ ...validQuality, overallScore: 0 })).not.toThrow();
    expect(() => CodeQualityResultSchema.parse({ ...validQuality, overallScore: 100 })).not.toThrow();
    expect(() => TestCoverageResultSchema.parse({ ...validCoverage, coverageEstimate: 100 })).not.toThrow();
  });
  it('rejects scores outside 0-100', () => {
    expect(() => CodeQualityResultSchema.parse({ ...validQuality, overallScore: 101 })).toThrow();
    expect(() => CodeQualityResultSchema.parse({ ...validQuality, overallScore: -1 })).toThrow();
    expect(() => TestCoverageResultSchema.parse({ ...validCoverage, coverageEstimate: 101 })).toThrow();
  });
  it('accepts every severity level', () => {
    for (const severity of ['critical', 'high', 'medium', 'low', 'info'] as const) {
      const data = { ...validQuality, issues: [{ ...validQuality.issues[0], severity }] };
      expect(() => CodeQualityResultSchema.parse(data)).not.toThrow();
    }
  });
});

describe('JSON schema export', () => {
  type Json = { type?: string; required?: string[]; properties?: Record<string, unknown> };

  it('exports ReviewReport as an object schema with required properties', () => {
    const schema = ReviewReportJSONSchema as Json;
    expect(schema.type).toBe('object');
    expect(schema.required).toEqual(
      expect.arrayContaining(['pullRequest', 'fileReviews', 'summary', 'recommendations', 'metadata'])
    );
    expect(Object.keys(schema.properties ?? {})).toContain('fileReviews');
  });
  it('exports the three analysis schemas with their required fields', () => {
    expect((CodeQualityResultJSONSchema as Json).required).toEqual(
      expect.arrayContaining(['file', 'issues', 'overallScore', 'summary'])
    );
    expect((TestCoverageResultJSONSchema as Json).required).toEqual(
      expect.arrayContaining(['file', 'hasTests', 'untestedPaths', 'coverageEstimate'])
    );
    expect((RefactoringSuggestionJSONSchema as Json).required).toEqual(
      expect.arrayContaining(['file', 'suggestions', 'summary'])
    );
  });
  it('produces serializable JSON', () => {
    expect(() => JSON.parse(JSON.stringify(ReviewReportJSONSchema))).not.toThrow();
  });
});

describe('withRetry', () => {
  it('returns the result once the function succeeds', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error('flaky');
        return 'ok';
      },
      3,
      1
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });
  it('throws RETRY_EXHAUSTED after all attempts fail', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error('always');
        },
        2,
        1
      )
    ).rejects.toMatchObject({ code: ErrorCodes.RETRY_EXHAUSTED });
    expect(calls).toBe(2);
  });
});

describe('withTimeout', () => {
  it('returns the result when fast enough', async () => {
    await expect(withTimeout(async () => 'fast', 500)).resolves.toBe('fast');
  });
  it('throws AGENT_TIMEOUT when too slow', async () => {
    const slow = () => new Promise<string>((resolve) => setTimeout(() => resolve('late'), 200));
    const promise = withTimeout(slow, 20, 'too slow');
    await expect(promise).rejects.toBeInstanceOf(ReviewError);
    await expect(promise).rejects.toMatchObject({ code: ErrorCodes.AGENT_TIMEOUT });
  });
});

describe('RateLimiter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('enforces the requests-per-minute limit over a sliding window', async () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter({
      maxRequestsPerMinute: 2,
      maxTokensPerMinute: 100000,
      maxConcurrent: 10
    });
    await limiter.acquire(100);
    await limiter.acquire(100);
    expect(limiter.canProceed(100)).toBe(false);

    vi.advanceTimersByTime(61000); // records fall out of the 60s window
    expect(limiter.canProceed(100)).toBe(true);
  });

  it('enforces the tokens-per-minute limit', async () => {
    const limiter = new RateLimiter({
      maxRequestsPerMinute: 100,
      maxTokensPerMinute: 500,
      maxConcurrent: 10
    });
    await limiter.acquire(400);
    expect(limiter.canProceed(200)).toBe(false);
    expect(limiter.canProceed(100)).toBe(true);
  });

  it('queues requests beyond maxConcurrent until release()', async () => {
    const limiter = new RateLimiter({
      maxRequestsPerMinute: 100,
      maxTokensPerMinute: 100000,
      maxConcurrent: 1
    });
    await limiter.acquire(10);

    let secondAcquired = false;
    const second = limiter.acquire(10).then(() => {
      secondAcquired = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(secondAcquired).toBe(false);

    limiter.release();
    await second;
    expect(secondAcquired).toBe(true);
  });

  it('reports status', async () => {
    const limiter = new RateLimiter({ maxRequestsPerMinute: 10, maxTokensPerMinute: 1000, maxConcurrent: 5 });
    await limiter.acquire(100);
    const status = limiter.getStatus();
    expect(status.activeRequests).toBe(1);
    expect(status.requestsInWindow).toBe(1);
    expect(status.availableTokens).toBe(900);
  });
});

// Integration test: calls the real API and GitHub. Skipped unless RUN_INTEGRATION is set.
// PowerShell:  $env:RUN_INTEGRATION="1"; npm test
describe.skipIf(!process.env.RUN_INTEGRATION)('integration: real PR review', () => {
  it(
    'analyzes octocat/Hello-World PR #1 into a valid ReviewReport',
    async () => {
      const { CodeReviewOrchestrator } = await import('../src/orchestrator.js');
      const report = await new CodeReviewOrchestrator().reviewPullRequest('octocat', 'Hello-World', 1);
      expect(() => ReviewReportSchema.parse(report)).not.toThrow();
      expect(report.summary.overallScore).toBeGreaterThanOrEqual(0);
      expect(report.summary.overallScore).toBeLessThanOrEqual(100);
    },
    15 * 60 * 1000
  );
});
describe('computeSummary', () => {
  it('scores a clean file from code quality and refactoring health, ignoring coverage', () => {
    const clean = {
      ...validReport.fileReviews[0]!,
      codeQuality: { ...validQuality, issues: [], overallScore: 90 },
      testCoverage: { ...validCoverage, untestedPaths: [], coverageEstimate: 0 },
      refactorings: { ...validRefactoring, suggestions: [] }
    };
    const summary = computeSummary([clean]);
    expect(summary.overallScore).toBe(Math.round(90 * 0.85 + 100 * 0.15)); // 91
    expect(summary.criticalIssues).toBe(0);
    expect(summary.totalFiles).toBe(1);
  });

  it('counts critical issues and high-priority tests', () => {
    const review = {
      ...validReport.fileReviews[0]!,
      codeQuality: {
        ...validQuality,
        issues: [{ ...validQuality.issues[0]!, severity: 'critical' as const }]
      }
    };
    const summary = computeSummary([review]);
    expect(summary.criticalIssues).toBe(1);
    expect(summary.highPriorityTests).toBe(1);
  });

  it('returns a zero score for an empty review list', () => {
    expect(computeSummary([]).overallScore).toBe(0);
  });
});
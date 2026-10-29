import type { ReviewReport } from '../types/report-types.js';

/**
 * Overall score weights. Test coverage is reported separately
 * (coverageEstimate, untestedPaths, highPriorityTests) and does not lower
 * the headline score, so a clean file without tests is not scored as poor code.
 */
export const SCORE_WEIGHTS = { codeQuality: 0.85, refactoring: 0.15 } as const;

const average = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;

export function computeSummary(
  reviews: ReviewReport['fileReviews']
): ReviewReport['summary'] {
  const criticalIssues = reviews.reduce(
    (sum, r) => sum + r.codeQuality.issues.filter((i) => i.severity === 'critical').length,
    0
  );
  const highPriorityTests = reviews.reduce(
    (sum, r) =>
      sum +
      r.testCoverage.untestedPaths.filter(
        (p) => p.priority === 'critical' || p.priority === 'high'
      ).length,
    0
  );
  const refactoringOpportunities = reviews.reduce(
    (sum, r) => sum + r.refactorings.suggestions.length,
    0
  );

  // Refactoring health: 100 minus a penalty per suggestion, weighted by impact
  const refactorScores = reviews.map((r) => {
    const penalty = r.refactorings.suggestions.reduce(
      (sum, s) => sum + (s.impact === 'high' ? 10 : s.impact === 'medium' ? 5 : 2),
      0
    );
    return Math.max(0, 100 - penalty);
  });

  const overallScore = Math.round(
    average(reviews.map((r) => r.codeQuality.overallScore)) * SCORE_WEIGHTS.codeQuality +
      average(refactorScores) * SCORE_WEIGHTS.refactoring
  );

  return {
    totalFiles: reviews.length,
    overallScore,
    criticalIssues,
    highPriorityTests,
    refactoringOpportunities
  };
}
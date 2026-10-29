import type { ReviewReport } from '../types/report-types';

const esc = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const DETAILS_CSS = `
    .file-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin: 24px 0; }
    .file-card h3 { margin-top: 0; font-family: monospace; color: #2c3e50; }
    .file-card h4 { margin: 20px 0 8px; color: #34495e; }
    .scores { color: #6c757d; font-size: 0.9em; margin-bottom: 8px; }
    table.details { width: 100%; border-collapse: collapse; font-size: 0.9em; }
    table.details th, table.details td { text-align: left; padding: 8px; border-bottom: 1px solid #e9ecef; vertical-align: top; }
    table.details th { background: #f1f3f5; }
    .sev { display: inline-block; padding: 2px 8px; border-radius: 10px; color: white; font-size: 0.8em; font-weight: bold; text-transform: uppercase; }
    .sev-critical { background: #e74c3c; } .sev-high { background: #f39c12; }
    .sev-medium { background: #3498db; } .sev-low { background: #27ae60; } .sev-info { background: #95a5a6; }
    pre.code { background: #272822; color: #f8f8f2; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 0.85em; white-space: pre-wrap; }
    .label { font-weight: bold; margin: 8px 0 4px; }
    .muted { color: #6c757d; }
`;

export function renderFileDetailsHTML(report: ReviewReport): string {
  if (report.fileReviews.length === 0) {
    return '<h2>File Details</h2><p class="muted">No files were reviewed.</p>';
  }

  const sections = report.fileReviews.map((review) => {
    const { codeQuality, testCoverage, refactorings } = review;

    const issueRows = codeQuality.issues
      .map(
        (issue) => `
        <tr>
          <td>${issue.line}</td>
          <td><span class="sev sev-${issue.severity}">${issue.severity}</span></td>
          <td>${esc(issue.category)}</td>
          <td>${esc(issue.description)}</td>
          <td>${esc(issue.suggestion)}</td>
        </tr>`
      )
      .join('');

    const testRows = testCoverage.untestedPaths
      .map(
        (path) => `
        <tr>
          <td><span class="sev sev-${path.priority}">${path.priority}</span></td>
          <td>${esc(path.type)}</td>
          <td>${esc(path.location)}</td>
          <td>${esc(path.reasoning)}</td>
          <td>${esc(path.suggestedTest)}</td>
        </tr>`
      )
      .join('');

    const refactorBlocks = refactorings.suggestions
      .map(
        (s) => `
        <div>
          <p><span class="sev sev-${s.impact}">${s.impact}</span> <strong>${esc(s.type)}</strong> at ${esc(s.location)}</p>
          <p>${esc(s.description)}</p>
          <div class="label">Before</div><pre class="code">${esc(s.before)}</pre>
          <div class="label">After</div><pre class="code">${esc(s.after)}</pre>
          <p class="muted">Benefits: ${esc(s.benefits)}</p>
        </div>`
      )
      .join('');

    return `
    <div class="file-card">
      <h3>${esc(review.file)}</h3>
      <div class="scores">Quality score: ${codeQuality.overallScore}/100 &bull; Estimated coverage: ${testCoverage.coverageEstimate}% &bull; Tests found: ${testCoverage.hasTests ? esc(testCoverage.testFiles.join(', ') || 'yes') : 'none'}</div>

      <h4>Code Quality Issues (${codeQuality.issues.length})</h4>
      <p>${esc(codeQuality.summary)}</p>
      ${
        issueRows
          ? `<div style="overflow-x:auto"><table class="details"><tr><th>Line</th><th>Severity</th><th>Category</th><th>Description</th><th>Suggestion</th></tr>${issueRows}</table></div>`
          : '<p class="muted">No issues found.</p>'
      }

      <h4>Test Coverage Gaps (${testCoverage.untestedPaths.length})</h4>
      <p>${esc(testCoverage.summary)}</p>
      ${
        testRows
          ? `<div style="overflow-x:auto"><table class="details"><tr><th>Priority</th><th>Type</th><th>Location</th><th>Reasoning</th><th>Suggested test</th></tr>${testRows}</table></div>`
          : '<p class="muted">No untested paths identified.</p>'
      }

      <h4>Refactoring Suggestions (${refactorings.suggestions.length})</h4>
      <p>${esc(refactorings.summary)}</p>
      ${refactorBlocks || '<p class="muted">No refactorings suggested.</p>'}
    </div>`;
  });

  return `<h2>File Details</h2>${sections.join('')}`;
}
const mdCell = (value: string): string => value.replace(/\r?\n/g, ' ').trim();

export function renderFileDetailsMarkdown(report: ReviewReport): string {
  if (report.fileReviews.length === 0) {
    return '\n## Full Findings\n\nNo files were reviewed.\n';
  }

  const out: string[] = ['\n## Full Findings\n'];

  for (const review of report.fileReviews) {
    const { codeQuality, testCoverage, refactorings } = review;

    out.push(`### \`${review.file}\`\n`);
    out.push(
      `Quality score: **${codeQuality.overallScore}/100** | ` +
        `Estimated coverage: **${testCoverage.coverageEstimate}%** | ` +
        `Tests found: ${testCoverage.hasTests ? testCoverage.testFiles.join(', ') || 'yes' : 'none'}\n`
    );

    out.push(`#### Code Quality Issues (${codeQuality.issues.length})\n`);
    out.push(`${codeQuality.summary}\n`);
    if (codeQuality.issues.length === 0) {
      out.push('_No issues found._\n');
    } else {
      for (const issue of codeQuality.issues) {
        out.push(
          `- **[${issue.severity.toUpperCase()}]** \`${review.file}:${issue.line}\` (${issue.category}): ${mdCell(issue.description)}\n` +
            `  - Fix: ${mdCell(issue.suggestion)}`
        );
      }
      out.push('');
    }

    out.push(`#### Test Coverage Gaps (${testCoverage.untestedPaths.length})\n`);
    out.push(`${testCoverage.summary}\n`);
    if (testCoverage.untestedPaths.length === 0) {
      out.push('_No untested paths identified._\n');
    } else {
      for (const p of testCoverage.untestedPaths) {
        out.push(
          `- **[${p.priority.toUpperCase()}]** ${p.type} at ${mdCell(p.location)}: ${mdCell(p.reasoning)}\n` +
            `  - Suggested test: ${mdCell(p.suggestedTest)}`
        );
      }
      out.push('');
    }

    out.push(`#### Refactoring Suggestions (${refactorings.suggestions.length})\n`);
    out.push(`${refactorings.summary}\n`);
    if (refactorings.suggestions.length === 0) {
      out.push('_No refactorings suggested._\n');
    } else {
      for (const s of refactorings.suggestions) {
        out.push(`**${s.type}** at ${mdCell(s.location)} (impact: ${s.impact})\n`);
        out.push(`${s.description}\n`);
        out.push('Before:\n\n~~~\n' + s.before + '\n~~~\n');
        out.push('After:\n\n~~~\n' + s.after + '\n~~~\n');
        out.push(`Benefits: ${mdCell(s.benefits)}\n`);
      }
    }
  }

  return out.join('\n');
}

/**
 * Insert the full findings before the generator's closing "---" footer.
 */
export function withFullFindings(baseMarkdown: string, report: ReviewReport): string {
  // Drop the starter generator's truncated per-file section; the full version replaces it
  const trimmed = baseMarkdown.replace(
    /\n## [^\n]*File Details[^\n]*\n[\s\S]*?(?=\n---)/,
    ''
  );
  const details = renderFileDetailsMarkdown(report);
  const idx = trimmed.lastIndexOf('\n---');
  return idx === -1
    ? trimmed + details
    : trimmed.slice(0, idx) + details + trimmed.slice(idx);
}
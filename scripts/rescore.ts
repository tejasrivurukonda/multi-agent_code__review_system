import fs from 'node:fs';
import { ReportGenerator } from '../src/utils/report-generator.ts';
import { withFullFindings } from '../src/utils/report-details.ts';
import { computeSummary } from '../src/utils/scoring.ts';

const generator = new ReportGenerator();

for (const n of [1, 2, 3]) {
  const base = `reports/udacity_cd14715-simple-todo-app_${n}`;
  const report = JSON.parse(fs.readFileSync(`${base}.json`, 'utf8'));

  const before = report.summary.overallScore;
  report.summary = computeSummary(report.fileReviews);

  fs.writeFileSync(`${base}.json`, generator.generateJSONReport(report), 'utf8');
  fs.writeFileSync(
    `${base}.md`,
    withFullFindings(generator.generateMarkdownReport(report), report),
    'utf8'
  );
  fs.writeFileSync(`${base}.html`, generator.generateHTMLReport(report), 'utf8');

  console.log(`PR #${n}: overall ${before} -> ${report.summary.overallScore}`);
}
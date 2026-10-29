import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { TEST_COVERAGE_ANALYZER_PROMPT } from '../prompts/index.js';

export const testCoverageAnalyzer: AgentDefinition = {
  description:
    'Test coverage specialist. Use for each changed source file to find untested functions, ' +
    'branches and edge cases by comparing the code with existing tests, estimate coverage, and ' +
    'suggest specific test cases with assertions. Returns a TestCoverageResult JSON object.',
  prompt: TEST_COVERAGE_ANALYZER_PROMPT,
  tools: ['Read', 'Grep', 'Glob', 'Skill', 'mcp__github__get_file_contents'],
  model: 'inherit'
};
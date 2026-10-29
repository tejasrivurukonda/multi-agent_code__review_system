import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { CODE_QUALITY_ANALYZER_PROMPT } from '../prompts/index.js';

export const codeQualityAnalyzer: AgentDefinition = {
  description:
    'Expert code reviewer. Use for each changed source file to find security vulnerabilities, ' +
    'performance problems and maintainability issues, with line numbers and severity levels. ' +
    'Returns a CodeQualityResult JSON object.',
  prompt: CODE_QUALITY_ANALYZER_PROMPT,
  tools: [
    'Read',
    'Grep',
    'Glob',
    'Skill',
    'mcp__github__get_file_contents',
    'mcp__eslint__lint-files'
  ],
  model: 'inherit'
};
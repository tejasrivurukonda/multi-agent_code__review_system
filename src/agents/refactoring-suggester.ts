import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { REFACTORING_SUGGESTER_PROMPT } from '../prompts/index.js';

export const refactoringSuggester: AgentDefinition = {
  description:
    'Refactoring specialist. Use for each changed source file to find extract-function candidates, ' +
    'modernization opportunities, design-pattern improvements and dead or duplicated code, with ' +
    'before/after code. Returns a RefactoringSuggestion JSON object.',
  prompt: REFACTORING_SUGGESTER_PROMPT,
  tools: ['Read', 'Grep', 'Glob', 'Skill', 'mcp__github__get_file_contents'],
  model: 'inherit'
};
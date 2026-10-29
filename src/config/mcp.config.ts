/**
 * Model Context Protocol (MCP) server configurations
 *
 * 1. GitHub - PR/repo operations (@modelcontextprotocol/server-github)
 * 2. ESLint - linting and style analysis (@eslint/mcp)
 *
 * On Windows, Node cannot spawn "npx" directly (it is a .cmd shim), so we
 * go through "cmd /c". On Linux/macOS (including Vocareum) it is plain "npx".
 */

const isWindows = process.platform === 'win32';

function npx(args: string[]): { command: string; args: string[] } {
  return isWindows
    ? { command: 'cmd', args: ['/c', 'npx', ...args] }
    : { command: 'npx', args };
}

export const mcpServersConfig = {
  github: {
    type: 'stdio' as const,
    ...npx(['-y', '@modelcontextprotocol/server-github']),
    // The server expects GITHUB_PERSONAL_ACCESS_TOKEN; we map our GITHUB_TOKEN to it.
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_TOKEN || '' }
  },

  eslint: {
    type: 'stdio' as const,
    ...npx(['-y', '@eslint/mcp@latest']),
    env: {}
  }
};
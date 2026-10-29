/**
 * Custom error class for review operations
 */
export class ReviewError extends Error {
  constructor(
    message: string,
    public code: string,
    public metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ReviewError';
    Error.captureStackTrace(this, ReviewError);
  }
}

/**
 * Error codes for the review system
 */
export const ErrorCodes = {
  // Configuration errors
  MISSING_API_KEY: 'MISSING_API_KEY',
  MISSING_GITHUB_TOKEN: 'MISSING_GITHUB_TOKEN',
  INVALID_CONFIG: 'INVALID_CONFIG',

  // GitHub errors
  PR_NOT_FOUND: 'PR_NOT_FOUND',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  GITHUB_API_ERROR: 'GITHUB_API_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',

  // Agent errors
  AGENT_TIMEOUT: 'AGENT_TIMEOUT',
  AGENT_FAILED: 'AGENT_FAILED',
  STRUCTURED_OUTPUT_FAILED: 'STRUCTURED_OUTPUT_FAILED',

  // General errors
  RETRY_EXHAUSTED: 'RETRY_EXHAUSTED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

/**
 * Retry utility with exponential backoff and jitter.
 *
 * Runs fn up to maxRetries times. After each failure (except the last) it
 * waits delayMs * 2^(attempt - 1) plus 0-100ms of random jitter, so many
 * clients retrying at once don't all hit the server at the same moment.
 *
 * @param fn - Async function to retry
 * @param maxRetries - Maximum number of attempts (default: 3)
 * @param delayMs - Base delay in milliseconds (default: 1000)
 * @throws ReviewError with RETRY_EXHAUSTED code if all attempts fail
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        const backoff = delayMs * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 100;
        await new Promise<void>((resolve) => setTimeout(resolve, backoff + jitter));
      }
    }
  }

  throw new ReviewError(
    `Operation failed after ${maxRetries} attempts: ${formatError(lastError)}`,
    ErrorCodes.RETRY_EXHAUSTED,
    { attempts: maxRetries, lastError: formatError(lastError) }
  );
}

/**
 * Wrap an async function with a timeout.
 *
 * Races fn() against a timer; whichever settles first wins. The timer is
 * always cleared so it can't keep the process alive.
 *
 * @param fn - Async function to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param errorMessage - Custom error message
 * @throws ReviewError with AGENT_TIMEOUT code if the timeout is reached
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  errorMessage: string = 'Operation timed out'
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new ReviewError(errorMessage, ErrorCodes.AGENT_TIMEOUT, { timeoutMs })),
      timeoutMs
    );
  });

  try {
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Check if an error is a ReviewError
 */
export function isReviewError(error: unknown): error is ReviewError {
  return error instanceof ReviewError;
}

/**
 * Format error for logging/display
 */
export function formatError(error: unknown): string {
  if (isReviewError(error)) {
    return `[${error.code}] ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
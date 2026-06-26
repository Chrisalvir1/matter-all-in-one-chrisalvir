/**
 * log-buffer.ts
 * Intercepts stdout and stderr in the Node process to keep a circular buffer
 * of the last N log lines, clean of ANSI escape color codes.
 */

const MAX_LOG_LINES = 1000;
const logBuffer: string[] = [];

// Regular expression to strip ANSI color codes
// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

function appendToBuffer(chunk: any) {
  const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cleanLine = line.replace(ANSI_REGEX, '');

    // Skip empty trailing lines from splits unless they are meaningful
    if (i === lines.length - 1 && cleanLine === '') continue;

    logBuffer.push(cleanLine);
  }

  // Enforce circular buffer limit
  while (logBuffer.length > MAX_LOG_LINES) {
    logBuffer.shift();
  }
}

// Start intercepting
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const originalStderrWrite = process.stderr.write.bind(process.stderr);

process.stdout.write = function(chunk: any, encoding?: any, callback?: any): boolean {
  appendToBuffer(chunk);
  return originalStdoutWrite(chunk, encoding, callback);
} as any;

process.stderr.write = function(chunk: any, encoding?: any, callback?: any): boolean {
  appendToBuffer(chunk);
  return originalStderrWrite(chunk, encoding, callback);
} as any;

/**
 * Returns the currently buffered log lines.
 */
export function getLogs(): string[] {
  return [...logBuffer];
}

/**
 * Clears the in-memory log buffer.
 */
export function clearLogs(): void {
  logBuffer.length = 0;
}

/**
 * Lightweight central logger. No persistence, no external sinks.
 *
 * Goals:
 *   - Single import surface so we can later swap the implementation
 *     (e.g. add Sentry, batched DB sink) without touching call sites.
 *   - Namespaced log lines that are easy to grep in DevTools.
 *   - Cheap no-op when disabled (debug level off in production builds).
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const ENABLED: Record<Level, boolean> = {
  debug: import.meta.env.DEV,
  info: true,
  warn: true,
  error: true,
};

function emit(level: Level, scope: string, msg: string, data?: unknown): void {
  if (!ENABLED[level]) return;
  const tag = `[${scope}]`;
  const fn = level === 'debug' ? console.debug
    : level === 'info' ? console.info
    : level === 'warn' ? console.warn
    : console.error;
  if (data !== undefined) fn(tag, msg, data);
  else fn(tag, msg);
}

export interface Logger {
  debug: (msg: string, data?: unknown) => void;
  info: (msg: string, data?: unknown) => void;
  warn: (msg: string, data?: unknown) => void;
  error: (msg: string, data?: unknown) => void;
  child: (subScope: string) => Logger;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (m, d) => emit('debug', scope, m, d),
    info: (m, d) => emit('info', scope, m, d),
    warn: (m, d) => emit('warn', scope, m, d),
    error: (m, d) => emit('error', scope, m, d),
    child: (sub) => createLogger(`${scope}:${sub}`),
  };
}

export const logger = createLogger('app');
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) ?? 'info'

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel]
}

function format(level: LogLevel, message: string, meta?: unknown): string {
  const ts = new Date().toISOString()
  const base = `[${ts}] ${level.toUpperCase().padEnd(5)} ${message}`
  return meta !== undefined ? `${base} ${JSON.stringify(meta)}` : base
}

export const logger = {
  debug: (msg: string, meta?: unknown) => {
    if (shouldLog('debug')) console.debug(format('debug', msg, meta))
  },
  info: (msg: string, meta?: unknown) => {
    if (shouldLog('info')) console.info(format('info', msg, meta))
  },
  warn: (msg: string, meta?: unknown) => {
    if (shouldLog('warn')) console.warn(format('warn', msg, meta))
  },
  error: (msg: string, meta?: unknown) => {
    if (shouldLog('error')) console.error(format('error', msg, meta))
  },
}

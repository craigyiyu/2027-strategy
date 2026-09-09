/**
 * Structured logger (SEC-09): never accepts answers, emails or report bodies.
 * Callers pass category + allow-listed metadata only.
 */
type Level = 'info' | 'warn' | 'error';

export interface LogFields {
  [k: string]: string | number | boolean | null | undefined;
}

function write(level: Level, category: string, msg: string, fields?: LogFields) {
  const rec = {
    ts: new Date().toISOString(),
    level,
    category,
    msg,
    ...fields,
  };
  const line = JSON.stringify(rec);
  if (level === 'error') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

export const logger = {
  info: (category: string, msg: string, fields?: LogFields) => write('info', category, msg, fields),
  warn: (category: string, msg: string, fields?: LogFields) => write('warn', category, msg, fields),
  error: (category: string, msg: string, fields?: LogFields) => write('error', category, msg, fields),
};

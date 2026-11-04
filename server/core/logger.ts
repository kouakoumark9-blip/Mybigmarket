/**
 * Journal structuré (une ligne JSON par événement), lisible dans les logs Vercel.
 * Les champs sensibles connus sont masqués avant écriture.
 */
type Level = "debug" | "info" | "warn" | "error";

const SENSITIVE = /pass(word)?|secret|token|authorization|cookie|totp|api[-_]?key|card|cvv|iban/i;
const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function minimumLevel(): number {
  const configured = (process.env.LOG_LEVEL || (process.env.NODE_ENV === "test" ? "error" : "info")) as Level;
  return LEVELS[configured] ?? LEVELS.info;
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) out[key] = SENSITIVE.test(key) ? "[masqué]" : redact(inner, depth + 1);
  return out;
}

function write(level: Level, message: string, context?: Record<string, unknown>) {
  if (LEVELS[level] < minimumLevel()) return;
  const line = JSON.stringify({ level, time: new Date().toISOString(), message, ...(context ? (redact(context) as Record<string, unknown>) : {}) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => write("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) => write("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => write("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => write("error", message, context),
};

export function errorContext(error: unknown): Record<string, unknown> {
  if (error instanceof Error) return { errorName: error.name, errorMessage: error.message, stack: error.stack?.split("\n").slice(0, 6).join("\n") };
  return { error: String(error) };
}

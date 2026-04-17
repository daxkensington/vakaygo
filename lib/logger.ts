import * as Sentry from "@sentry/nextjs";

type LogContext = Record<string, unknown>;

const isProd = process.env.NODE_ENV === "production";

function fmt(level: string, msg: string, ctx?: LogContext): string {
  const ts = new Date().toISOString();
  const ctxStr = ctx ? ` ${JSON.stringify(ctx)}` : "";
  return `[${ts}] ${level} ${msg}${ctxStr}`;
}

export const logger = {
  debug(msg: string, ctx?: LogContext): void {
    if (!isProd) console.debug(fmt("DEBUG", msg, ctx));
  },
  info(msg: string, ctx?: LogContext): void {
    if (!isProd) console.info(fmt("INFO", msg, ctx));
  },
  warn(msg: string, ctx?: LogContext): void {
    if (isProd) {
      Sentry.captureMessage(msg, { level: "warning", extra: ctx });
    } else {
      console.warn(fmt("WARN", msg, ctx));
    }
  },
  error(msg: string, error?: unknown, ctx?: LogContext): void {
    if (isProd) {
      if (error instanceof Error) {
        Sentry.captureException(error, { extra: { msg, ...ctx } });
      } else {
        Sentry.captureMessage(msg, {
          level: "error",
          extra: { error, ...ctx },
        });
      }
    } else {
      console.error(fmt("ERROR", msg, ctx), error);
    }
  },
};

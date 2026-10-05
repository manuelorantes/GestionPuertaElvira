export type LogLevel = 'debug' | 'info' | 'notice' | 'warning' | 'error';

/** Logs estructurados en JSON (una línea por evento), con el id de petición cuando lo hay. */
export class Logger {
  constructor(private readonly context: Record<string, unknown> = {}) {}

  child(context: Record<string, unknown>): Logger {
    return new Logger({ ...this.context, ...context });
  }

  log(level: LogLevel, message: string, context: Record<string, unknown> = {}): void {
    const line = JSON.stringify({
      time: new Date().toISOString(),
      level,
      message,
      ...this.context,
      ...context,
    });
    if (level === 'error' || level === 'warning') console.error(line);
    else console.log(line);
  }

  info(message: string, context: Record<string, unknown> = {}): void {
    this.log('info', message, context);
  }

  error(message: string, context: Record<string, unknown> = {}): void {
    this.log('error', message, context);
  }
}

/** En tests no se quiere ruido en la salida. */
export class SilentLogger extends Logger {
  override log(): void {}
}

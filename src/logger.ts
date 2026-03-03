/**
 * Centralized Logging System for CozoDB Memory
 * 
 * Supports different log levels and can be configured via environment variables
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4
}

class Logger {
  private level: LogLevel;
  private prefix: string;

  constructor(prefix: string = '[CozoDB]') {
    this.prefix = prefix;
    // Read from environment variable, default to INFO
    const envLevel = process.env.LOG_LEVEL?.toUpperCase();
    this.level = LogLevel[envLevel as keyof typeof LogLevel] ?? LogLevel.INFO;
  }

  setLevel(level: LogLevel) {
    this.level = level;
  }

  error(component: string, message: string, ...args: any[]) {
    if (this.level >= LogLevel.ERROR) {
      console.error(`${this.prefix}[${component}] ERROR:`, message, ...args);
    }
  }

  warn(component: string, message: string, ...args: any[]) {
    if (this.level >= LogLevel.WARN) {
      console.warn(`${this.prefix}[${component}] WARN:`, message, ...args);
    }
  }

  info(component: string, message: string, ...args: any[]) {
    if (this.level >= LogLevel.INFO) {
      console.error(`${this.prefix}[${component}] INFO:`, message, ...args);
    }
  }

  debug(component: string, message: string, ...args: any[]) {
    if (this.level >= LogLevel.DEBUG) {
      console.error(`${this.prefix}[${component}] DEBUG:`, message, ...args);
    }
  }

  trace(component: string, message: string, ...args: any[]) {
    if (this.level >= LogLevel.TRACE) {
      console.error(`${this.prefix}[${component}] TRACE:`, message, ...args);
    }
  }
}

// Singleton instance
export const logger = new Logger();

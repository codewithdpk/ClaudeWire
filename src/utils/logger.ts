import { pino, Logger as PinoLogger } from 'pino';
import { config } from '../config/index.js';

const transport = config.logging.pretty
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    }
  : undefined;

export const logger = pino({
  level: config.logging.level,
  transport,
});

export function createChildLogger(context: Record<string, unknown>) {
  return logger.child(context);
}

export type Logger = PinoLogger;

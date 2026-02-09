import { Redis } from 'ioredis';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { StorageError } from '../utils/errors.js';

const log = logger.child({ component: 'redis' });

let redisClient: Redis | null = null;

export async function getRedisClient(): Promise<Redis> {
  if (redisClient) return redisClient;

  redisClient = new Redis(config.redis.url, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  redisClient.on('error', (err: Error) => {
    log.error({ err }, 'Redis connection error');
  });

  redisClient.on('connect', () => {
    log.info('Connected to Redis');
  });

  redisClient.on('reconnecting', () => {
    log.warn('Reconnecting to Redis');
  });

  await redisClient.connect();
  return redisClient;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    log.info('Redis connection closed');
  }
}

export class RedisSessionStore {
  constructor(private redis: InstanceType<typeof Redis>) {}

  private sessionKey(sessionId: string): string {
    return `session:${sessionId}`;
  }

  private userSessionKey(userId: string): string {
    return `session:user:${userId}`;
  }

  async setSession<T extends object>(
    sessionId: string,
    userId: string,
    data: T,
    ttlSeconds?: number
  ): Promise<void> {
    try {
      const serialized = JSON.stringify(data);
      const pipeline = this.redis.pipeline();

      if (ttlSeconds) {
        pipeline.setex(this.sessionKey(sessionId), ttlSeconds, serialized);
        pipeline.setex(this.userSessionKey(userId), ttlSeconds, sessionId);
      } else {
        pipeline.set(this.sessionKey(sessionId), serialized);
        pipeline.set(this.userSessionKey(userId), sessionId);
      }

      await pipeline.exec();
    } catch (err) {
      throw new StorageError('setSession', err as Error);
    }
  }

  async getSession<T>(sessionId: string): Promise<T | null> {
    try {
      const data = await this.redis.get(this.sessionKey(sessionId));
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (err) {
      throw new StorageError('getSession', err as Error);
    }
  }

  async getSessionIdForUser(userId: string): Promise<string | null> {
    try {
      return await this.redis.get(this.userSessionKey(userId));
    } catch (err) {
      throw new StorageError('getSessionIdForUser', err as Error);
    }
  }

  async deleteSession(sessionId: string, userId: string): Promise<void> {
    try {
      await this.redis.pipeline()
        .del(this.sessionKey(sessionId))
        .del(this.userSessionKey(userId))
        .exec();
    } catch (err) {
      throw new StorageError('deleteSession', err as Error);
    }
  }

  async updateSessionActivity(sessionId: string, ttlSeconds?: number): Promise<void> {
    try {
      if (ttlSeconds) {
        await this.redis.expire(this.sessionKey(sessionId), ttlSeconds);
      }
    } catch (err) {
      throw new StorageError('updateSessionActivity', err as Error);
    }
  }

  async getAllSessionIds(): Promise<string[]> {
    try {
      const keys = await this.redis.keys('session:user:*');
      const sessionIds: string[] = [];
      for (const key of keys) {
        const sessionId = await this.redis.get(key);
        if (sessionId) sessionIds.push(sessionId);
      }
      return sessionIds;
    } catch (err) {
      throw new StorageError('getAllSessionIds', err as Error);
    }
  }
}

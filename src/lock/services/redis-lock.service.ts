import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { LockService } from '../../common/interfaces/lock-service.interface';
import { LOCK_CONSTANTS } from '../../common/constants/lock.constants';


@Injectable()
export class RedisLockService extends LockService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisLockService.name);
  private redis: Redis;

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async onModuleInit() {
    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = this.configService.get<number>('REDIS_PORT', 6379);
    const password = this.configService.get<string>('REDIS_PASSWORD');

    this.redis = new Redis({
      host,
      port,
      password,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    this.redis.on('connect', () => {
      this.logger.log('Redis connected');
    });

    this.redis.on('error', (error) => {
      this.logger.error('Redis connection error', error);
    });
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  /**
   * 락 획득 시도
   */
  async acquire(key: string, value: string, ttl: number): Promise<boolean> {
    try {
      const fullKey = this.getFullKey(key);
      const result = await this.redis.set(fullKey, value, 'EX', ttl, 'NX');

      if (result === 'OK') {
        this.logger.debug(`Lock acquired: ${fullKey} by ${value}`);
        return true;
      }

      this.logger.debug(`Lock acquisition failed: ${fullKey} is already locked`);
      return false;
    } catch (error) {
      this.logger.error(`Failed to acquire lock: ${key}`, error);
      throw error;
    }
  }

  /**
   * 락 해제
   * Lua 스크립트를 사용하여 원자적으로 소유자 확인 후 해제
   */
  async release(key: string, value: string): Promise<boolean> {
    try {
      const fullKey = this.getFullKey(key);
      
      const luaScript = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      const result = await this.redis.eval(luaScript, 1, fullKey, value);

      if (result === 1) {
        this.logger.debug(`Lock released: ${fullKey} by ${value}`);
        return true;
      }

      this.logger.warn(`Lock release failed: ${fullKey} - ownership mismatch`);
      return false;
    } catch (error) {
      this.logger.error(`Failed to release lock: ${key}`, error);
      throw error;
    }
  }

  /**
   * 락 소유자 확인
   */
  async getOwner(key: string): Promise<string | null> {
    try {
      const fullKey = this.getFullKey(key);
      const value = await this.redis.get(fullKey);
      return value;
    } catch (error) {
      this.logger.error(`Failed to get lock owner: ${key}`, error);
      return null;
    }
  }

  /**
   * 락 존재 여부 확인
   */
  async exists(key: string): Promise<boolean> {
    try {
      const fullKey = this.getFullKey(key);
      const result = await this.redis.exists(fullKey);
      return result === 1;
    } catch (error) {
      this.logger.error(`Failed to check lock existence: ${key}`, error);
      return false;
    }
  }

  /**
   * 락 TTL 연장
   * 소유자 확인 후 TTL 연장
   */
  async extend(key: string, ttl: number): Promise<boolean> {
    try {
      const fullKey = this.getFullKey(key);

      const luaScript = `
        if redis.call("get", KEYS[1]) then
          return redis.call("expire", KEYS[1], ARGV[1])
        else
          return 0
        end
      `;

      const result = await this.redis.eval(luaScript, 1, fullKey, ttl);

      if (result === 1) {
        this.logger.debug(`Lock extended: ${fullKey} for ${ttl}s`);
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(`Failed to extend lock: ${key}`, error);
      return false;
    }
  }

  /**
   * 전체 락 키 생성
   */
  private getFullKey(key: string): string {
    return `${LOCK_CONSTANTS.LOCK_KEY_PREFIX}:${key}`;
  }

  /**
   * Redis 클라이언트 직접 접근 (테스트용)
   */
  getRedisClient(): Redis {
    return this.redis;
  }
}


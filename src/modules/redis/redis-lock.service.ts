import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';
import * as crypto from 'crypto';

export interface LockOptions {
  ttl?: number; // Time to live in milliseconds (default: 10000ms = 10s)
  retryCount?: number; // Number of retry attempts (default: 3)
  retryDelay?: number; // Delay between retries in milliseconds (default: 100ms)
}

@Injectable()
export class RedisLockService {
  private readonly logger = new Logger(RedisLockService.name);
  private readonly DEFAULT_TTL = 10000; // 10초
  private readonly DEFAULT_RETRY_COUNT = 3;
  private readonly DEFAULT_RETRY_DELAY = 100; // 100ms

  constructor(private readonly redisService: RedisService) {}

  /**
   * 분산 락을 획득합니다.
   * @param key 락 키
   * @param options 락 옵션
   * @returns 락 식별자 (unlock 시 필요)
   */
  async acquireLock(key: string, options: LockOptions = {}): Promise<string | null> {
    const {
      ttl = this.DEFAULT_TTL,
      retryCount = this.DEFAULT_RETRY_COUNT,
      retryDelay = this.DEFAULT_RETRY_DELAY,
    } = options;

    const lockKey = `lock:${key}`;
    const lockValue = this.generateLockValue();
    const redis = this.redisService.getClient();

    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        // SET NX (Not eXists) 를 사용하여 atomic하게 락 획득
        // PX (milliseconds)를 사용하여 TTL 설정
        const result = await redis.set(lockKey, lockValue, 'PX', ttl, 'NX');

        if (result === 'OK') {
          this.logger.debug(`Lock acquired for key: ${key}, value: ${lockValue}`);
          return lockValue;
        }

        // 락 획득 실패 시 재시도
        if (attempt < retryCount) {
          this.logger.debug(`Lock acquisition failed for key: ${key}, retrying... (${attempt + 1}/${retryCount})`);
          await this.sleep(retryDelay);
        }
      } catch (error) {
        this.logger.error(`Error acquiring lock for key: ${key}`, error.stack);
        throw error;
      }
    }

    this.logger.warn(`Failed to acquire lock for key: ${key} after ${retryCount} retries`);
    return null;
  }

  /**
   * 분산 락을 해제합니다.
   * Lua 스크립트를 사용하여 atomic하게 락 해제
   * @param key 락 키
   * @param lockValue 락 식별자
   */
  async releaseLock(key: string, lockValue: string): Promise<boolean> {
    const lockKey = `lock:${key}`;
    const redis = this.redisService.getClient();

    // Lua 스크립트를 사용하여 lockValue가 일치할 때만 삭제
    // 이는 다른 프로세스가 획득한 락을 실수로 해제하는 것을 방지
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    try {
      const result = await redis.eval(script, 1, lockKey, lockValue);
      
      if (result === 1) {
        this.logger.debug(`Lock released for key: ${key}`);
        return true;
      } else {
        this.logger.warn(`Lock release failed for key: ${key} - lock not found or value mismatch`);
        return false;
      }
    } catch (error) {
      this.logger.error(`Error releasing lock for key: ${key}`, error.stack);
      throw error;
    }
  }

  /**
   * 락으로 보호된 코드를 실행합니다.
   * 자동으로 락 획득 및 해제를 처리합니다.
   * @param key 락 키
   * @param callback 실행할 함수
   * @param options 락 옵션
   */
  async executeWithLock<T>(
    key: string,
    callback: () => Promise<T>,
    options: LockOptions = {},
  ): Promise<T> {
    const lockValue = await this.acquireLock(key, options);

    if (!lockValue) {
      throw new Error(`Failed to acquire lock for key: ${key}`);
    }

    try {
      return await callback();
    } finally {
      await this.releaseLock(key, lockValue);
    }
  }

  /**
   * 고유한 락 값을 생성합니다.
   */
  private generateLockValue(): string {
    return `${Date.now()}-${crypto.randomBytes(16).toString('hex')}`;
  }

  /**
   * 지정된 시간만큼 대기합니다.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

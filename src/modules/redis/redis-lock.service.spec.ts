import { Test, TestingModule } from '@nestjs/testing';
import { RedisLockService } from './redis-lock.service';
import { RedisService } from './redis.service';
import Redis from 'ioredis';

describe('RedisLockService', () => {
  let service: RedisLockService;
  let redisService: RedisService;
  let redisClient: Redis;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisLockService,
        {
          provide: RedisService,
          useValue: {
            getClient: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<RedisLockService>(RedisLockService);
    redisService = module.get<RedisService>(RedisService);
    
    redisClient = {
      set: jest.fn(),
      eval: jest.fn(),
    } as any;

    jest.spyOn(redisService, 'getClient').mockReturnValue(redisClient);
  });

  describe('acquireLock', () => {
    it('should acquire lock successfully', async () => {
      jest.spyOn(redisClient, 'set').mockResolvedValue('OK' as any);

      const lockValue = await service.acquireLock('test-key');

      expect(lockValue).toBeDefined();
      expect(typeof lockValue).toBe('string');
      expect(redisClient.set).toHaveBeenCalledWith(
        'lock:test-key',
        expect.any(String),
        'PX',
        10000,
        'NX',
      );
    });

    it('should return null if lock cannot be acquired', async () => {
      jest.spyOn(redisClient, 'set').mockResolvedValue(null);

      const lockValue = await service.acquireLock('test-key', { retryCount: 0 });

      expect(lockValue).toBeNull();
    });

    it('should retry acquiring lock', async () => {
      jest
        .spyOn(redisClient, 'set')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('OK' as any);

      const lockValue = await service.acquireLock('test-key', {
        retryCount: 1,
        retryDelay: 10,
      });

      expect(lockValue).toBeDefined();
      expect(redisClient.set).toHaveBeenCalledTimes(2);
    });

    it('should use custom TTL', async () => {
      jest.spyOn(redisClient, 'set').mockResolvedValue('OK' as any);

      await service.acquireLock('test-key', { ttl: 5000 });

      expect(redisClient.set).toHaveBeenCalledWith(
        'lock:test-key',
        expect.any(String),
        'PX',
        5000,
        'NX',
      );
    });
  });

  describe('releaseLock', () => {
    it('should release lock successfully', async () => {
      jest.spyOn(redisClient, 'eval').mockResolvedValue(1);

      const result = await service.releaseLock('test-key', 'test-value');

      expect(result).toBe(true);
      expect(redisClient.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        'lock:test-key',
        'test-value',
      );
    });

    it('should return false if lock not found', async () => {
      jest.spyOn(redisClient, 'eval').mockResolvedValue(0);

      const result = await service.releaseLock('test-key', 'test-value');

      expect(result).toBe(false);
    });

    it('should throw error on redis failure', async () => {
      jest.spyOn(redisClient, 'eval').mockRejectedValue(new Error('Redis error'));

      await expect(service.releaseLock('test-key', 'test-value')).rejects.toThrow(
        'Redis error',
      );
    });
  });

  describe('executeWithLock', () => {
    it('should execute callback with lock', async () => {
      jest.spyOn(redisClient, 'set').mockResolvedValue('OK' as any);
      jest.spyOn(redisClient, 'eval').mockResolvedValue(1);

      const callback = jest.fn().mockResolvedValue('result');

      const result = await service.executeWithLock('test-key', callback);

      expect(result).toBe('result');
      expect(callback).toHaveBeenCalled();
      expect(redisClient.set).toHaveBeenCalled();
      expect(redisClient.eval).toHaveBeenCalled();
    });

    it('should release lock even if callback throws error', async () => {
      jest.spyOn(redisClient, 'set').mockResolvedValue('OK' as any);
      jest.spyOn(redisClient, 'eval').mockResolvedValue(1);

      const callback = jest.fn().mockRejectedValue(new Error('Callback error'));

      await expect(service.executeWithLock('test-key', callback)).rejects.toThrow(
        'Callback error',
      );

      expect(redisClient.eval).toHaveBeenCalled();
    });

    it('should throw error if lock cannot be acquired', async () => {
      jest.spyOn(redisClient, 'set').mockResolvedValue(null);

      const callback = jest.fn();

      await expect(
        service.executeWithLock('test-key', callback, { retryCount: 0 }),
      ).rejects.toThrow('Failed to acquire lock');

      expect(callback).not.toHaveBeenCalled();
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisLockService } from './redis-lock.service';
import Redis from 'ioredis';

describe('RedisLockService', () => {
  let service: RedisLockService;
  let mockRedis: jest.Mocked<Redis>;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const config: Record<string, any> = {
        REDIS_HOST: 'localhost',
        REDIS_PORT: 6379,
        REDIS_PASSWORD: undefined,
      };
      return config[key] || defaultValue;
    }),
  };

  beforeEach(async () => {
    mockRedis = {
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
      eval: jest.fn(),
      quit: jest.fn(),
      on: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisLockService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<RedisLockService>(RedisLockService);
    (service as any).redis = mockRedis;
  });

  describe('acquire', () => {
    it('should successfully acquire a lock', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const result = await service.acquire('test-key', 'test-value', 300);

      expect(result).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'seat:lock:test-key',
        'test-value',
        'EX',
        300,
        'NX',
      );
    });

    it('should return false if lock already exists', async () => {
      mockRedis.set.mockResolvedValue(null);

      const result = await service.acquire('test-key', 'test-value', 300);

      expect(result).toBe(false);
    });
  });

  describe('release', () => {
    it('should successfully release a lock', async () => {
      mockRedis.eval.mockResolvedValue(1);

      const result = await service.release('test-key', 'test-value');

      expect(result).toBe(true);
      expect(mockRedis.eval).toHaveBeenCalled();
    });

    it('should return false if ownership mismatch', async () => {
      mockRedis.eval.mockResolvedValue(0);

      const result = await service.release('test-key', 'test-value');

      expect(result).toBe(false);
    });
  });

  describe('getOwner', () => {
    it('should return lock owner', async () => {
      mockRedis.get.mockResolvedValue('test-value');

      const result = await service.getOwner('test-key');

      expect(result).toBe('test-value');
      expect(mockRedis.get).toHaveBeenCalledWith('seat:lock:test-key');
    });

    it('should return null if lock does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.getOwner('test-key');

      expect(result).toBeNull();
    });
  });
});


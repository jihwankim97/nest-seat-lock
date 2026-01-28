import { Test, TestingModule } from '@nestjs/testing';
import { SeatReservationService } from './seat-reservation.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LockService } from '../../common/interfaces/lock-service.interface';
import { NotFoundException } from '@nestjs/common';
import {
  SeatAlreadyLockedException,
  SeatNotAvailableException,
} from '../../common/exceptions/seat-lock.exception';

describe('SeatReservationService', () => {
  let service: SeatReservationService;
  let prisma: PrismaService;
  let lockService: LockService;

  const mockPrismaService = {
    performance: {
      findUnique: jest.fn(),
    },
    seat: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    seatLock: {
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockLockService = {
    acquire: jest.fn(),
    release: jest.fn(),
    getOwner: jest.fn(),
    exists: jest.fn(),
    extend: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeatReservationService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: LockService,
          useValue: mockLockService,
        },
      ],
    }).compile();

    service = module.get<SeatReservationService>(SeatReservationService);
    prisma = module.get<PrismaService>(PrismaService);
    lockService = module.get<LockService>(LockService);

    jest.clearAllMocks();
  });

  describe('lockSeat', () => {
    const performanceId = 1;
    const seatId = 1;
    const userId = 'user-123';

    it('should successfully lock a seat', async () => {
      const mockSeat = {
        id: seatId,
        performanceId,
        seatNumber: 'A-1',
        status: 'AVAILABLE',
        performance: { id: performanceId },
      };

      mockPrismaService.seat.findUnique.mockResolvedValue(mockSeat);
      mockLockService.acquire.mockResolvedValue(true);
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return callback({
          seat: { update: jest.fn().mockResolvedValue({}) },
          seatLock: { create: jest.fn().mockResolvedValue({}) },
        });
      });

      const result = await service.lockSeat(performanceId, seatId, userId);

      expect(result.success).toBe(true);
      expect(result.seatId).toBe(seatId);
      expect(mockLockService.acquire).toHaveBeenCalledWith(
        `${performanceId}:${seatId}`,
        userId,
        300,
      );
    });

    it('should throw NotFoundException if seat does not exist', async () => {
      mockPrismaService.seat.findUnique.mockResolvedValue(null);

      await expect(
        service.lockSeat(performanceId, seatId, userId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw SeatNotAvailableException if seat is not available', async () => {
      const mockSeat = {
        id: seatId,
        performanceId,
        status: 'LOCKED',
        performance: { id: performanceId },
      };

      mockPrismaService.seat.findUnique.mockResolvedValue(mockSeat);

      await expect(
        service.lockSeat(performanceId, seatId, userId),
      ).rejects.toThrow(SeatNotAvailableException);
    });

    it('should throw SeatAlreadyLockedException if lock acquisition fails', async () => {
      const mockSeat = {
        id: seatId,
        performanceId,
        status: 'AVAILABLE',
        performance: { id: performanceId },
      };

      mockPrismaService.seat.findUnique.mockResolvedValue(mockSeat);
      mockLockService.acquire.mockResolvedValue(false);
      mockLockService.getOwner.mockResolvedValue('other-user');

      await expect(
        service.lockSeat(performanceId, seatId, userId),
      ).rejects.toThrow(SeatAlreadyLockedException);
    });
  });
});


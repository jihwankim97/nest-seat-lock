import {
  Injectable,
  Logger,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LockService } from '../../common/interfaces/lock-service.interface';
import { LOCK_CONSTANTS } from '../../common/constants/lock.constants';
import {
  SeatAlreadyLockedException,
  SeatLockNotFoundException,
  SeatLockOwnershipException,
  SeatNotAvailableException,
} from '../../common/exceptions/seat-lock.exception';
import {
  SeatsResponseDto,
  LockSeatResponseDto,
  PurchaseSeatResponseDto,
  SeatStatusDto,
} from '../dto/seat-response.dto';

@Injectable()
export class SeatReservationService {
  private readonly logger = new Logger(SeatReservationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LockService)
    private readonly lockService: LockService,
  ) {}

  /**
   * 공연의 모든 좌석 조회
   */
  async getSeats(performanceId: number): Promise<SeatsResponseDto> {
    const performance = await this.prisma.performance.findUnique({
      where: { id: performanceId },
      include: {
        seats: {
          orderBy: { seatNumber: 'asc' },
        },
      },
    });

    if (!performance) {
      throw new NotFoundException(`Performance ${performanceId} not found`);
    }

    const seats = performance.seats;
    const availableSeats = seats.filter((s) => s.status === 'AVAILABLE').length;
    const lockedSeats = seats.filter((s) => s.status === 'LOCKED').length;
    const soldSeats = seats.filter((s) => s.status === 'SOLD').length;

    return {
      performanceId,
      availableSeats,
      lockedSeats,
      soldSeats,
      seats: seats.map((seat) => ({
        id: seat.id,
        seatNumber: seat.seatNumber,
        status: seat.status as SeatStatusDto,
      })),
    };
  }

  /**
   * 좌석 점유 (Locking)
   * 
   * 1. 좌석 존재 및 상태 확인
   * 2. Redis 분산 락 획득 시도
   * 3. DB 상태 업데이트
   * 4. SeatLock 레코드 생성
   */
  async lockSeat(
    performanceId: number,
    seatId: number,
    userId: string,
  ): Promise<LockSeatResponseDto> {

    const seat = await this.prisma.seat.findUnique({
      where: { id: seatId },
      include: { performance: true },
    });

    if (!seat) {
      throw new NotFoundException(`Seat ${seatId} not found`);
    }

    if (seat.performanceId !== performanceId) {
      throw new NotFoundException(
        `Seat ${seatId} does not belong to performance ${performanceId}`,
      );
    }

    if (seat.status !== 'AVAILABLE') {
      throw new SeatNotAvailableException(seatId);
    }

    const lockKey = `${performanceId}:${seatId}`;
    const lockValue = userId;
    const ttl = LOCK_CONSTANTS.DEFAULT_LOCK_TTL;

    const lockAcquired = await this.lockService.acquire(
      lockKey,
      lockValue,
      ttl,
    );

    if (!lockAcquired) {
      const owner = await this.lockService.getOwner(lockKey);
      this.logger.warn(
        `Lock acquisition failed for seat ${seatId} by user ${userId}. Current owner: ${owner}`,
      );
      throw new SeatAlreadyLockedException(seatId);
    }

    try {
      const expiresAt = new Date(Date.now() + ttl * 1000);

      await this.prisma.$transaction(async (tx) => {

        await tx.seat.update({
          where: { id: seatId },
          data: { status: 'LOCKED' },
        });

        await tx.seatLock.create({
          data: {
            seatId,
            userId,
            expiresAt,
          },
        });
      });

      this.logger.log(
        `Seat ${seatId} locked by user ${userId} until ${expiresAt.toISOString()}`,
      );

      return {
        success: true,
        seatId,
        expiresAt,
        message: `좌석이 ${ttl}초간 예약되었습니다`,
      };
    } catch (error) {
      await this.lockService.release(lockKey, lockValue);
      this.logger.error(`Failed to lock seat ${seatId}`, error);
      throw error;
    }
  }

  /**
   * 좌석 결제 완료
   * 
   * 1. 락 소유권 확인
   * 2. 락 해제
   * 3. DB 상태 업데이트 (SOLD)
   */
  async purchaseSeat(
    performanceId: number,
    seatId: number,
    userId: string,
    paymentId: string,
  ): Promise<PurchaseSeatResponseDto> {
    const lockKey = `${performanceId}:${seatId}`;

    const lockOwner = await this.lockService.getOwner(lockKey);
    if (!lockOwner) {
      throw new SeatLockNotFoundException(seatId);
    }

    if (lockOwner !== userId) {
      throw new SeatLockOwnershipException(seatId);
    }

    const seat = await this.prisma.seat.findUnique({
      where: { id: seatId },
    });

    if (!seat) {
      throw new NotFoundException(`Seat ${seatId} not found`);
    }

    if (seat.status !== 'LOCKED') {
      throw new SeatNotAvailableException(seatId);
    }


    await this.prisma.$transaction(async (tx) => {

      await tx.seat.update({
        where: { id: seatId },
        data: { status: 'SOLD' },
      });

      await tx.seatLock.deleteMany({
        where: {
          seatId,
          userId,
        },
      });
    });

    const released = await this.lockService.release(lockKey, userId);
    if (!released) {
      this.logger.warn(
        `Failed to release lock for seat ${seatId}, but purchase completed`,
      );
    }

    this.logger.log(
      `Seat ${seatId} purchased by user ${userId} with payment ${paymentId}`,
    );

    return {
      success: true,
      seatId,
      status: SeatStatusDto.SOLD,
      paymentId,
    };
  }

  /**
   * 좌석 락 해제
   */
  async releaseSeatLock(
    performanceId: number,
    seatId: number,
    userId: string,
  ): Promise<void> {
    const lockKey = `${performanceId}:${seatId}`;

    const lockOwner = await this.lockService.getOwner(lockKey);
    if (!lockOwner) {
      throw new SeatLockNotFoundException(seatId);
    }

    if (lockOwner !== userId) {
      throw new SeatLockOwnershipException(seatId);
    }


    await this.prisma.$transaction(async (tx) => {
      await tx.seat.update({
        where: { id: seatId },
        data: { status: 'AVAILABLE' },
      });

      await tx.seatLock.deleteMany({
        where: {
          seatId,
          userId,
        },
      });
    });

    await this.lockService.release(lockKey, userId);

    this.logger.log(`Seat ${seatId} lock released by user ${userId}`);
  }
}


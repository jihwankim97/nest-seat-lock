import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { LockService } from '../../common/interfaces/lock-service.interface';
import { Inject } from '@nestjs/common';

/**
 * 좌석 락 정리 스케줄러
 * 
 * 만료된 락을 주기적으로 정리하여 데이터 정합성 보장
 * - Redis TTL 만료된 락 확인
 * - DB에서 만료된 SeatLock 레코드 정리
 * - 좌석 상태를 AVAILABLE로 복구
 */
@Injectable()
export class SeatLockCleanupScheduler {
  private readonly logger = new Logger(SeatLockCleanupScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LockService)
    private readonly lockService: LockService,
  ) {}

  /**
   * 매 1분마다 실행
   * 만료된 락을 정리
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleExpiredLocks() {
    this.logger.debug('Starting expired lock cleanup...');

    try {
      const now = new Date();

      // DB에서 만료된 SeatLock 찾기
      const expiredLocks = await this.prisma.seatLock.findMany({
        where: {
          expiresAt: {
            lte: now,
          },
        },
        include: {
          seat: true,
        },
      });

      if (expiredLocks.length === 0) {
        this.logger.debug('No expired locks found');
        return;
      }

      this.logger.log(`Found ${expiredLocks.length} expired locks`);

      // 각 만료된 락 처리
      for (const lock of expiredLocks) {
        try {
          const lockKey = `${lock.seat.performanceId}:${lock.seatId}`;


          const redisOwner = await this.lockService.getOwner(lockKey);

          await this.prisma.$transaction(async (tx) => {
            const seat = await tx.seat.findUnique({
              where: { id: lock.seatId },
            });

            // LOCKED 상태인 경우에만 AVAILABLE로 복구
            if (seat && seat.status === 'LOCKED') {
              await tx.seat.update({
                where: { id: lock.seatId },
                data: { status: 'AVAILABLE' },
              });

              this.logger.debug(
                `Restored seat ${lock.seatId} to AVAILABLE status`,
              );
            }

            // SeatLock 레코드 삭제
            await tx.seatLock.delete({
              where: { id: lock.id },
            });
          });

          // Redis 락도 해제 (존재하는 경우)
          if (redisOwner) {
            await this.lockService.release(lockKey, lock.userId);
            this.logger.debug(`Released Redis lock for seat ${lock.seatId}`);
          }
        } catch (error) {
          this.logger.error(
            `Failed to cleanup lock ${lock.id} for seat ${lock.seatId}`,
            error,
          );
        }
      }

      this.logger.log(
        `Successfully cleaned up ${expiredLocks.length} expired locks`,
      );
    } catch (error) {
      this.logger.error('Error during lock cleanup', error);
    }
  }
}


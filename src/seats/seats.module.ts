import { Module } from '@nestjs/common';
import { SeatsController } from './controllers/seats.controller';
import { SeatReservationService } from './services/seat-reservation.service';
import { SeatLockCleanupScheduler } from './schedulers/seat-lock-cleanup.scheduler';
import { LockModule } from '../lock/lock.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, LockModule],
  controllers: [SeatsController],
  providers: [SeatReservationService, SeatLockCleanupScheduler],
})
export class SeatsModule {}


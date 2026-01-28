import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisLockService } from './services/redis-lock.service';
import { LockService } from '../common/interfaces/lock-service.interface';


@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: LockService,
      useClass: RedisLockService,
    },
  ],
  exports: [LockService],
})
export class LockModule {}


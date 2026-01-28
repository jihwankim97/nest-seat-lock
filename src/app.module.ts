import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from './modules/redis/redis.module';
import { SeatModule } from './modules/seat/seat.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT, 10) || 5432,
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_DATABASE || 'ticketing',
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      // WARNING: synchronize should only be enabled in development
      // In production, use migrations to manage schema changes
      // Ensure NODE_ENV is properly set to prevent accidental schema sync
      synchronize: process.env.NODE_ENV !== 'production',
      logging: process.env.NODE_ENV === 'development',
    }),
    RedisModule,
    SeatModule,
  ],
})
export class AppModule {}

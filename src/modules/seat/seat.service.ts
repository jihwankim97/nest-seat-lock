import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Seat, SeatStatus } from '../../entities/seat.entity';
import { Reservation, ReservationStatus } from '../../entities/reservation.entity';
import { RedisLockService } from '../redis/redis-lock.service';
import { CreateSeatDto } from './dto/create-seat.dto';
import { ReserveSeatDto } from './dto/reserve-seat.dto';

@Injectable()
export class SeatService {
  private readonly logger = new Logger(SeatService.name);
  private readonly RESERVATION_EXPIRY_MINUTES = 10; // 예약 만료 시간 (10분)

  constructor(
    @InjectRepository(Seat)
    private readonly seatRepository: Repository<Seat>,
    @InjectRepository(Reservation)
    private readonly reservationRepository: Repository<Reservation>,
    private readonly lockService: RedisLockService,
  ) {}

  /**
   * 새로운 좌석을 생성합니다.
   */
  async createSeat(createSeatDto: CreateSeatDto): Promise<Seat> {
    const existingSeat = await this.seatRepository.findOne({
      where: { seatNumber: createSeatDto.seatNumber },
    });

    if (existingSeat) {
      throw new ConflictException(`Seat ${createSeatDto.seatNumber} already exists`);
    }

    const seat = this.seatRepository.create({
      seatNumber: createSeatDto.seatNumber,
      price: createSeatDto.price,
      status: SeatStatus.AVAILABLE,
    });

    return await this.seatRepository.save(seat);
  }

  /**
   * 모든 좌석을 조회합니다.
   */
  async findAllSeats(): Promise<Seat[]> {
    return await this.seatRepository.find({
      order: { seatNumber: 'ASC' },
    });
  }

  /**
   * 특정 좌석을 조회합니다.
   */
  async findSeatByNumber(seatNumber: string): Promise<Seat> {
    const seat = await this.seatRepository.findOne({
      where: { seatNumber },
    });

    if (!seat) {
      throw new NotFoundException(`Seat ${seatNumber} not found`);
    }

    return seat;
  }

  /**
   * 좌석을 예약합니다.
   * Redis 분산 락을 사용하여 동시성 문제를 해결합니다.
   */
  async reserveSeat(reserveSeatDto: ReserveSeatDto): Promise<Reservation> {
    const { userId, seatNumber } = reserveSeatDto;
    const lockKey = `seat:${seatNumber}`;

    this.logger.log(`Attempting to reserve seat ${seatNumber} for user ${userId}`);

    // 분산 락을 사용하여 동시성 제어
    return await this.lockService.executeWithLock(
      lockKey,
      async () => {
        // 1. 좌석 조회
        const seat = await this.seatRepository.findOne({
          where: { seatNumber },
        });

        if (!seat) {
          throw new NotFoundException(`Seat ${seatNumber} not found`);
        }

        // 2. 좌석 상태 확인
        if (seat.status !== SeatStatus.AVAILABLE) {
          throw new ConflictException(
            `Seat ${seatNumber} is not available. Current status: ${seat.status}`,
          );
        }

        // 3. 활성 예약 확인 (이중 예약 방지)
        const existingReservation = await this.reservationRepository.findOne({
          where: {
            seatId: seat.id,
            status: ReservationStatus.CONFIRMED,
          },
        });

        if (existingReservation) {
          throw new ConflictException(`Seat ${seatNumber} is already reserved`);
        }

        // 4. 좌석 상태 변경
        seat.status = SeatStatus.RESERVED;
        await this.seatRepository.save(seat);

        // 5. 예약 생성
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + this.RESERVATION_EXPIRY_MINUTES);

        const reservation = this.reservationRepository.create({
          userId,
          seatId: seat.id,
          status: ReservationStatus.CONFIRMED,
          expiresAt,
        });

        const savedReservation = await this.reservationRepository.save(reservation);

        this.logger.log(
          `Seat ${seatNumber} successfully reserved for user ${userId}. Reservation ID: ${savedReservation.id}`,
        );

        return savedReservation;
      },
      {
        ttl: 5000, // 5초 TTL
        retryCount: 5, // 5번 재시도
        retryDelay: 200, // 200ms 대기
      },
    );
  }

  /**
   * 예약을 취소합니다.
   */
  async cancelReservation(reservationId: number): Promise<void> {
    const reservation = await this.reservationRepository.findOne({
      where: { id: reservationId },
      relations: ['seat'],
    });

    if (!reservation) {
      throw new NotFoundException(`Reservation ${reservationId} not found`);
    }

    const lockKey = `seat:${reservation.seat.seatNumber}`;

    await this.lockService.executeWithLock(lockKey, async () => {
      // 예약 상태 변경
      reservation.status = ReservationStatus.CANCELLED;
      await this.reservationRepository.save(reservation);

      // 좌석 상태 변경
      reservation.seat.status = SeatStatus.AVAILABLE;
      await this.seatRepository.save(reservation.seat);

      this.logger.log(`Reservation ${reservationId} cancelled successfully`);
    });
  }

  /**
   * 사용자의 예약 목록을 조회합니다.
   */
  async getUserReservations(userId: string): Promise<Reservation[]> {
    return await this.reservationRepository.find({
      where: { userId },
      relations: ['seat'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 만료된 예약을 정리합니다.
   */
  async cleanupExpiredReservations(): Promise<number> {
    const expiredReservations = await this.reservationRepository
      .createQueryBuilder('reservation')
      .leftJoinAndSelect('reservation.seat', 'seat')
      .where('reservation.status = :status', { status: ReservationStatus.CONFIRMED })
      .andWhere('reservation.expiresAt < :now', { now: new Date() })
      .getMany();

    let count = 0;
    for (const reservation of expiredReservations) {
      const lockKey = `seat:${reservation.seat.seatNumber}`;
      
      await this.lockService.executeWithLock(lockKey, async () => {
        reservation.status = ReservationStatus.EXPIRED;
        await this.reservationRepository.save(reservation);

        reservation.seat.status = SeatStatus.AVAILABLE;
        await this.seatRepository.save(reservation.seat);
        
        count++;
      });
    }

    if (count > 0) {
      this.logger.log(`Cleaned up ${count} expired reservations`);
    }

    return count;
  }
}

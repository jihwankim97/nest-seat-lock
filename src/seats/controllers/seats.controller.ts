import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SeatReservationService } from '../services/seat-reservation.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import {
  LockSeatDto,
  PurchaseSeatDto,
} from '../dto';

/**
 * 좌석 예약 컨트롤러
 */
@Controller('api/performances/:performanceId/seats')
@UseGuards(AuthGuard)
export class SeatsController {
  constructor(
    private readonly seatReservationService: SeatReservationService,
  ) {}

  /**
   * 좌석 조회
   */
  @Get()
  async getSeats(@Param('performanceId', ParseIntPipe) performanceId: number) {
    return this.seatReservationService.getSeats(performanceId);
  }

  /**
   * 좌석 점유
   */
  @Post(':seatId/lock')
  @HttpCode(HttpStatus.OK)
  async lockSeat(
    @Param('performanceId', ParseIntPipe) performanceId: number,
    @Param('seatId', ParseIntPipe) seatId: number,
    @Body() lockSeatDto: LockSeatDto,
  ) {
    return this.seatReservationService.lockSeat(
      performanceId,
      seatId,
      lockSeatDto.userId,
    );
  }

  /**
   * 좌석 결제 완료
   */
  @Post(':seatId/purchase')
  @HttpCode(HttpStatus.OK)
  async purchaseSeat(
    @Param('performanceId', ParseIntPipe) performanceId: number,
    @Param('seatId', ParseIntPipe) seatId: number,
    @Body() purchaseSeatDto: PurchaseSeatDto,
  ) {
    return this.seatReservationService.purchaseSeat(
      performanceId,
      seatId,
      purchaseSeatDto.userId,
      purchaseSeatDto.paymentId,
    );
  }

  /**
   * 좌석 락 해제
   */
  @Delete(':seatId/lock')
  @HttpCode(HttpStatus.NO_CONTENT)
  async releaseSeatLock(
    @Param('performanceId', ParseIntPipe) performanceId: number,
    @Param('seatId', ParseIntPipe) seatId: number,
    @Body() lockSeatDto: LockSeatDto,
  ) {
    await this.seatReservationService.releaseSeatLock(
      performanceId,
      seatId,
      lockSeatDto.userId,
    );
  }
}


import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SeatService } from './seat.service';
import { CreateSeatDto } from './dto/create-seat.dto';
import { ReserveSeatDto } from './dto/reserve-seat.dto';

@Controller('seats')
export class SeatController {
  constructor(private readonly seatService: SeatService) {}

  /**
   * 새로운 좌석 생성
   * POST /seats
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createSeat(@Body() createSeatDto: CreateSeatDto) {
    return await this.seatService.createSeat(createSeatDto);
  }

  /**
   * 모든 좌석 조회
   * GET /seats
   */
  @Get()
  async getAllSeats() {
    return await this.seatService.findAllSeats();
  }

  /**
   * 특정 좌석 조회
   * GET /seats/:seatNumber
   */
  @Get(':seatNumber')
  async getSeat(@Param('seatNumber') seatNumber: string) {
    return await this.seatService.findSeatByNumber(seatNumber);
  }

  /**
   * 좌석 예약 (분산 락 적용)
   * POST /seats/reserve
   */
  @Post('reserve')
  @HttpCode(HttpStatus.CREATED)
  async reserveSeat(@Body() reserveSeatDto: ReserveSeatDto) {
    return await this.seatService.reserveSeat(reserveSeatDto);
  }

  /**
   * 예약 취소
   * DELETE /seats/reservations/:id
   */
  @Delete('reservations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancelReservation(@Param('id') id: string) {
    await this.seatService.cancelReservation(parseInt(id, 10));
  }

  /**
   * 사용자 예약 목록 조회
   * GET /seats/reservations/user/:userId
   */
  @Get('reservations/user/:userId')
  async getUserReservations(@Param('userId') userId: string) {
    return await this.seatService.getUserReservations(userId);
  }

  /**
   * 만료된 예약 정리
   * POST /seats/cleanup
   */
  @Post('cleanup')
  async cleanupExpiredReservations() {
    const count = await this.seatService.cleanupExpiredReservations();
    return { message: `Cleaned up ${count} expired reservations` };
  }
}

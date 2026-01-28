export enum SeatStatusDto {
  AVAILABLE = 'AVAILABLE',
  LOCKED = 'LOCKED',
  SOLD = 'SOLD',
}

export class SeatDto {
  id: number;
  seatNumber: string;
  status: SeatStatusDto;
}

export class SeatsResponseDto {
  performanceId: number;
  availableSeats: number;
  lockedSeats: number;
  soldSeats: number;
  seats: SeatDto[];
}

export class LockSeatResponseDto {
  success: boolean;
  seatId: number;
  expiresAt: Date;
  message: string;
}

export class PurchaseSeatResponseDto {
  success: boolean;
  seatId: number;
  status: SeatStatusDto;
  paymentId: string;
}


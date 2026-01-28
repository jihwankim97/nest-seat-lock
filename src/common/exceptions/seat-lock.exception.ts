import { HttpException, HttpStatus } from '@nestjs/common';


export class SeatLockException extends HttpException {
  constructor(message: string, status: HttpStatus = HttpStatus.CONFLICT) {
    super(message, status);
  }
}

export class SeatAlreadyLockedException extends SeatLockException {
  constructor(seatId: number) {
    super(`Seat ${seatId} is already locked by another user`, HttpStatus.CONFLICT);
  }
}

export class SeatLockNotFoundException extends SeatLockException {
  constructor(seatId: number) {
    super(`Seat ${seatId} lock not found`, HttpStatus.NOT_FOUND);
  }
}

export class SeatLockOwnershipException extends SeatLockException {
  constructor(seatId: number) {
    super(`You do not own the lock for seat ${seatId}`, HttpStatus.FORBIDDEN);
  }
}

export class SeatNotAvailableException extends SeatLockException {
  constructor(seatId: number) {
    super(`Seat ${seatId} is not available`, HttpStatus.BAD_REQUEST);
  }
}


import { IsNotEmpty, IsString, IsInt, Min } from 'class-validator';

export class LockSeatDto {
  @IsNotEmpty()
  @IsString()
  userId: string;
}

export class LockSeatParamsDto {
  @IsInt()
  @Min(1)
  performanceId: number;

  @IsInt()
  @Min(1)
  seatId: number;
}


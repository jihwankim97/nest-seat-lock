import { IsNotEmpty, IsString, IsInt, Min } from 'class-validator';

export class PurchaseSeatDto {
  @IsNotEmpty()
  @IsString()
  userId: string;

  @IsNotEmpty()
  @IsString()
  paymentId: string;
}

export class PurchaseSeatParamsDto {
  @IsInt()
  @Min(1)
  performanceId: number;

  @IsInt()
  @Min(1)
  seatId: number;
}


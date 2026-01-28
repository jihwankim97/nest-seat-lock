import { IsString, IsNotEmpty } from 'class-validator';

export class ReserveSeatDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  seatNumber: string;
}

import { IsString, IsNotEmpty, IsNumber, Min } from 'class-validator';

export class CreateSeatDto {
  @IsString()
  @IsNotEmpty()
  seatNumber: string;

  @IsNumber()
  @Min(0)
  price: number;
}

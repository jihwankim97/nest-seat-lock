import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello() {
    return {
      message: 'Seat Reservation API',
      version: '1.0.0',
      endpoints: {
        seats: '/api/performances/:performanceId/seats',
      },
    };
  }
}

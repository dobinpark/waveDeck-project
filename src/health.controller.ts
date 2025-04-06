import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';

@Controller('health') // Controller path prefix will be added by global prefix
export class HealthController {
  @Get()
  @HttpCode(HttpStatus.OK)
  check() {
    // Basic health check endpoint, can be expanded later (e.g., check DB connection)
    return { status: 'ok' };
  }
} 
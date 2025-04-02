import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller() // <-- @Controller() 데코레이터 확인 (경로 prefix 없음)
export class AppController {
    constructor(private readonly appService: AppService) { }

    @Get() // <-- @Get() 데코레이터 확인 (루트 경로)
    getHello(): string {
        return this.appService.getHello();
    }
}

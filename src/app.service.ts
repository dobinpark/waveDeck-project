import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
    getHello(): string {
        return 'Hello World!'; // <-- "Hello World!" 문자열 반환 확인
    }
}

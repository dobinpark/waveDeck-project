import { BadRequestException } from '@nestjs/common';

// 파일 시스템 에러
export class FileSystemException extends BadRequestException {
    constructor(message: string) {
        super(`파일 시스템 오류: ${message}`);
    }
}

// 데이터베이스 에러
export class DatabaseException extends BadRequestException {
    constructor(message: string) {
        super(`데이터베이스 오류: ${message}`);
    }
}

// 알 수 없는 업로드 에러
export class UnknownUploadException extends BadRequestException {
    constructor(message: string) {
        super(`알 수 없는 업로드 오류: ${message}`);
    }
}

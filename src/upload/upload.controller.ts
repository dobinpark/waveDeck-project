import { Controller, Post, Delete, Body, Param, UploadedFile, UseInterceptors, ParseFilePipe, MaxFileSizeValidator, FileTypeValidator, ParseIntPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { UploadFileDto } from './dto/upload-file.dto';
import { Multer } from 'multer';

/**
 * 파일 업로드 및 삭제 관련 API 엔드포인트를 처리하는 컨트롤러입니다.
 * 경로 접두사: /api/v1/upload
 */
@Controller('api/v1/upload')
export class UploadController {

    /**
     * UploadController 인스턴스를 생성합니다.
     * @param uploadService UploadService 주입
     */
    constructor(private readonly uploadService: UploadService) {
        console.log('UploadController 생성자 호출됨');
    }

    /**
     * POST /audio
     * 오디오 파일을 업로드합니다.
     * @param uploadFileDto 파일 메타데이터 (userId, fileName, fileSize 등)
     * @param file 업로드된 파일 객체 (Multer.File)
     * @returns 생성된 파일 정보 (fileId, filePreviewUrl 등)
     */
    @Post('audio')
    @HttpCode(HttpStatus.CREATED) // Set explicit status code for creation
    @UseInterceptors(FileInterceptor('file')) // 'file' 필드 이름으로 단일 파일 처리
    async uploadAudio(
        @Body() uploadFileDto: UploadFileDto,
        @UploadedFile(
            'file',
            // 파일 유효성 검사 파이프
            new ParseFilePipe({
                validators: [
                    // 최대 파일 크기 제한 (10MB)
                    new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 10 }),
                    // 허용되는 오디오 파일 형식 지정
                    new FileTypeValidator({ fileType: 'audio/wave|audio/mpeg|audio/mp3|audio/ogg' }),
                ],
                // 파일이 없어도 오류를 발생시키지 않으려면 fileIsRequired: false 추가
            }),
        ) file: Multer.File, // 타입 명시: Express.Multer.File
    ) {
        // console.log('uploadAudio 메소드 시작');
        // console.log('uploadFileDto:', uploadFileDto);
        // console.log('업로드된 파일 정보:', file);
        // console.log('MIME 타입:', file.mimetype);

        // 서비스 호출하여 파일 저장 및 DB 처리
        const result = await this.uploadService.uploadAudio(file, uploadFileDto);
        // console.log(result.data);
        // 응답 형식은 global ResponseInterceptor에서 표준화됩니다.
        return {
            data: result.data
        };
    }

    /**
     * DELETE /audio/:id
     * 특정 ID의 오디오 파일을 삭제합니다.
     * @param id 삭제할 파일의 ID (URL 경로 파라미터)
     * @param userId 파일을 소유한 사용자 ID (요청 본문)
     * @returns 삭제 성공 메시지
     */
    @Delete('audio/:id')
    @HttpCode(HttpStatus.OK) // Set explicit status code for successful deletion
    async deleteAudio(
        @Param('id', ParseIntPipe) id: number, // 경로 파라미터 ID를 정수로 변환
        // TODO: 실제 서비스에서는 @Body 대신 @Req() 또는 인증 컨텍스트에서 userId를 가져와야 함
        @Body('userId', ParseIntPipe) userId: number, // 요청 본문에서 userId 가져와 정수로 변환
    ) {
        // 서비스 호출하여 파일 삭제 처리
        return this.uploadService.deleteFile(id, userId);
    }
}

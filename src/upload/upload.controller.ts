import { Controller, Post, Delete, Body, Param, UploadedFile, UseInterceptors, ParseFilePipe, MaxFileSizeValidator, FileTypeValidator, ParseIntPipe, HttpCode, HttpStatus, BadRequestException, NotFoundException, InternalServerErrorException, Logger } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { UploadFileDto } from './dto/upload-file.dto';
import { Multer } from 'multer';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiParam, ApiResponse } from '@nestjs/swagger';
import { FileSystemException, DatabaseException } from './exceptions/upload-exceptions';

/**
 * 파일 업로드 및 삭제 관련 API 엔드포인트를 처리하는 컨트롤러
 * 경로 접두사: /api/v1/upload
 */
@ApiTags('Upload')
@Controller('api/v1/upload')
export class UploadController {
    private readonly logger = new Logger(UploadController.name);

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
    @UseInterceptors(FileInterceptor('file'))
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: '오디오 파일 업로드', description: '오디오 파일과 관련 메타데이터를 업로드합니다.' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        description: '오디오 파일 및 메타데이터',
        type: UploadFileDto,
    })
    @ApiResponse({ status: 201, description: '파일 업로드 성공', schema: { /* ... response schema ... */ } })
    @ApiResponse({ status: 400, description: '잘못된 요청 (파일 형식, 크기, 유효성 오류)' })
    @ApiResponse({ status: 500, description: '서버 내부 오류 (파일 시스템, DB 오류)' })
    async uploadAudio(
        @UploadedFile(
            new ParseFilePipe({
                validators: [
                    // 파일 크기 제한 (예: 10MB)
                    new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
                    // 파일 형식 제한 (예: audio/*)
                    new FileTypeValidator({ fileType: 'audio' }),
                ],
            }),
        )
        file: Multer.File,
        @Body() uploadFileDto: UploadFileDto,
    ) {
        this.logger.log(`POST /audio - 파일 업로드 요청: ${file.originalname}, userId: ${uploadFileDto.userId}`);
        try {
            const result = await this.uploadService.uploadAudio(file, uploadFileDto);
            this.logger.log(`POST /audio - 파일 업로드 성공: ${file.originalname}, fileId: ${result.data.fileId}`);
        return result;
        } catch (error) {
            this.logger.error(`POST /audio - 파일 업로드 실패: ${file.originalname}`, error.stack);
            if (error instanceof BadRequestException || error instanceof NotFoundException || error instanceof FileSystemException || error instanceof DatabaseException) {
                throw error;
            } else {
                throw new InternalServerErrorException('알 수 없는 오류로 업로드에 실패했습니다.');
            }
        }
    }

    /**
     * DELETE /audio/:id
     * 특정 ID의 오디오 파일을 삭제합니다.
     * @param id 삭제할 파일의 ID (URL 경로 파라미터)
     * @param userId 파일을 소유한 사용자 ID (요청 본문)
     * @returns 삭제 성공 메시지
     */
    @Delete('audio/:id')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: '업로드된 오디오 파일 삭제', description: '파일 시스템 및 데이터베이스에서 오디오 파일을 삭제합니다.' })
    @ApiParam({ name: 'id', required: true, description: '삭제할 파일의 ID', type: Number })
    @ApiBody({ schema: { properties: { userId: { type: 'number' } } }, description: '파일 소유자 확인을 위한 사용자 ID' })
    @ApiResponse({ status: 200, description: '파일 삭제 성공' })
    @ApiResponse({ status: 404, description: '파일을 찾을 수 없음' })
    @ApiResponse({ status: 500, description: '서버 내부 오류' })
    async deleteAudio(
        @Param('id', ParseIntPipe) id: number,
        @Body('userId', ParseIntPipe) userId: number,
    ) {
        this.logger.log(`DELETE /audio/${id} - 파일 삭제 요청: userId=${userId}`);
        try {
            await this.uploadService.deleteFile(id, userId);
            this.logger.log(`DELETE /audio/${id} - 파일 삭제 성공`);
            return { message: '파일이 성공적으로 삭제되었습니다.' };
        } catch (error) {
            this.logger.error(`DELETE /audio/${id} - 파일 삭제 실패`, error.stack);
            if (error instanceof NotFoundException || error instanceof DatabaseException || error instanceof FileSystemException) {
                throw error;
            } else {
                throw new InternalServerErrorException('알 수 없는 오류로 삭제에 실패했습니다.');
            }
        }
    }
}

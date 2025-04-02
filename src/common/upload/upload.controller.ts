import { Controller, Post, Delete, UseInterceptors, UploadedFile, ParseFilePipe, MaxFileSizeValidator, FileTypeValidator, Body, Param, UseGuards } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { UploadFileDto } from './dto/upload-file.dto';
import { Multer } from 'multer';
@Controller('api/v1/common/upload')
export class UploadController {

    constructor(private readonly uploadService: UploadService) { }


    // 오디오 파일 업로드
    @Post('audio')
    @UseInterceptors(FileInterceptor('file'))
    async uploadAudio(
        @UploadedFile(
            new ParseFilePipe({
                validators: [
                    new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 10 }), // 10MB 제한
                    new FileTypeValidator({ fileType: /audio\/(mpeg|wav|ogg)/ }), // 허용 파일 타입 설정
                ],
            }),
        ) file: Multer.File,
        @Body() uploadFileDto: UploadFileDto,
    ) {
        return this.uploadService.uploadAudio(file, uploadFileDto);
    }


    // 오디오 파일 삭제
    @Delete('audio/:fileId')
    async deleteAudio(
        @Param('fileId') fileId: number,
        @Body('userId') userId: number,
    ) {
        return this.uploadService.deleteFile(fileId, userId);
    }
}

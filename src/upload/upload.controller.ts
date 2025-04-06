import { Controller, Post, Delete, Body, Param, UploadedFile, UseInterceptors, ParseFilePipe, MaxFileSizeValidator, FileTypeValidator } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { UploadFileDto } from './dto/upload-file.dto';
import { Multer } from 'multer';

@Controller('api/v1/upload')
export class UploadController {

    constructor(private readonly uploadService: UploadService) {
        console.log('UploadController 생성자 호출됨');
    }


    // 오디오 파일 업로드
    @Post('audio')
    @UseInterceptors(FileInterceptor('file'))
    async uploadAudio(
        @Body() uploadFileDto: UploadFileDto,
        @UploadedFile(
            'file',
            new ParseFilePipe({
                validators: [
                    new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 10 }),
                    new FileTypeValidator({ fileType: 'audio/wave|audio/mpeg|audio/mp3|audio/ogg' }),
                ],
            }),
        ) file: Multer.File,
    ) {
        console.log('uploadAudio 메소드 시작');
        console.log('uploadFileDto:', uploadFileDto);
        console.log('업로드된 파일 정보:', file);
        console.log('MIME 타입:', file.mimetype);

        // UploadService를 통해 파일 저장 및 DB 엔티티 생성
        const result = await this.uploadService.uploadAudio(file, uploadFileDto);
        console.log(result.data);
        return {
            data: result.data
        };
    }


    // 오디오 파일 삭제
    @Delete('audio/:id')
    async deleteAudio(
        @Param('id') id: number,
        @Body('userId') userId: number,
    ) {
        return this.uploadService.deleteFile(id, userId);
    }
}

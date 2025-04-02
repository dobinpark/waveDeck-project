import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Upload } from './entities/upload.entity';
import { UploadFileDto } from './dto/upload-file.dto';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Multer } from 'multer';

@Injectable()
export class UploadService {

    constructor(
        @InjectRepository(Upload)
        private uploadRepository: Repository<Upload>,
    ) { }

    private fileIdCounter = 1;


    // 오디오 파일 업로드
    async uploadAudio(file: Multer.File, uploadFileDto: UploadFileDto) {
        const { userId, fileName, fileSize, duration } = uploadFileDto;
        const fileId = await this.getNextFileId();
        const fileExtension = path.extname(file.originalname);
        const newFilename = `${fileId}${fileExtension}`;
        const uploadPath = path.join(__dirname, '..', '..', 'uploads', 'audio', String(userId));
        const filePath = path.join(uploadPath, newFilename);

        try {
            // uploads 폴더 및 사용자 ID 폴더가 없으면 생성
            await fs.mkdir(uploadPath, { recursive: true });
            await fs.writeFile(filePath, file.buffer);

            // 데이터베이스에 파일 정보 저장
            const upload = this.uploadRepository.create({
                userId,
                fileName,
                fileSize,
                duration,
                filePath,
                filePreviewUrl: `https://example.com/preview/${fileId}`,
            });
            await this.uploadRepository.save(upload);

            return {
                data: {
                    fileId: upload.id,
                    filePreviewUrl: upload.filePreviewUrl,
                    uploadTime: upload.createdAt.toISOString(),
                },
            };
        } catch (error) {
            // 에러 발생 시 파일 삭제
            await this.deleteFileFromFs(filePath);
            throw new Error('파일 업로드에 실패했습니다.');
        }
    }


    // 파일 삭제
    async deleteFile(fileId: number, userId: number) {
        const upload = await this.uploadRepository.findOne({
            where: { id: fileId, userId },
        });

        if (!upload) {
            throw new NotFoundException('파일을 찾을 수 없습니다.');
        }

        try {
            // 파일 삭제
            await this.deleteFileFromFs(upload.filePath);

            // 데이터베이스에서 레코드 삭제
            await this.uploadRepository.remove(upload);

            return { message: '파일이 성공적으로 삭제되었습니다.' };
        } catch (error) {
            throw new Error('파일 삭제에 실패했습니다.');
        }
    }

    private async deleteFileFromFs(filePath: string) {
        try {
            await fs.unlink(filePath);
        } catch (error) {
            console.error('파일 삭제 실패:', error);
        }
    }

    private async getNextFileId(): Promise<number> {
        const lastUpload = await this.uploadRepository.findOne({
            order: { id: 'DESC' },
        });
        return lastUpload ? lastUpload.id + 1 : 1;
    }
}

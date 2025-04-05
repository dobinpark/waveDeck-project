import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Upload } from './entities/upload.entity';
import { UploadFileDto } from './dto/upload-file.dto';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Multer } from 'multer';
import { FileSystemException, DatabaseException, UnknownUploadException } from './exceptions/upload-exceptions';

@Injectable()
export class UploadService {

    constructor(
        @InjectRepository(Upload)
        private uploadRepository: Repository<Upload>,
    ) { }

    private fileIdCounter = 1;


    // 오디오 파일 업로드
    async uploadAudio(file: Multer.File, uploadFileDto: UploadFileDto) {
        const { userId, fileName, fileSize, duration, type } = uploadFileDto;
        const fileId = await this.getNextFileId();
        const fileExtension = path.extname(file.originalname);
        const newFilename = `${fileId}${fileExtension}`;
        const uploadPath = path.join(process.cwd(), 'waveDeck-uploads', 'audio', String(userId));
        const filePath = path.join(uploadPath, newFilename);

        try {
            // uploads 폴더 및 사용자 ID 폴더가 없으면 생성
            await fs.mkdir(uploadPath, { recursive: true });
            await fs.writeFile(filePath, file.buffer);

            // 데이터베이스에 파일 정보 저장
            const upload = this.uploadRepository.create({
                userId,
                type,
                fileName,
                fileSize,
                duration,
                filePath: filePath,
                filePreviewUrl: `/waveDeck-uploads/audio/${userId}/${newFilename}`,
            });
            await this.uploadRepository.save(upload);

            return {
                data: {
                    fileId: upload.id,
                    filePreviewUrl: upload.filePreviewUrl,
                    uploadTime: upload.uploadTime.toISOString(),
                },
            };
        } catch (error) {
            console.error('파일 업로드 실패:', error); // 기본 로그 기록
            if (error instanceof Error && error.message.includes('EEXIST')) {
                throw new FileSystemException(`디렉토리 생성 실패: ${error.message}`);
            } else if (error instanceof Error && error.message.includes('EACCES')) {
                throw new FileSystemException(`파일 쓰기 실패 (권한 오류): ${filePath} - ${error.message}`);
            } else if (error instanceof Error && error.message.includes('SQLITE_ERROR')) {
                throw new DatabaseException(`데이터베이스 오류: ${error.message}`);
            } else if (error instanceof FileSystemException || error instanceof DatabaseException) {
                throw error;
            } else {
                throw new UnknownUploadException(`알 수 없는 업로드 오류: ${error.message || 'Unknown error'}`);
            }
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
            await this.deleteFileFromFs(upload.filePreviewUrl);

            // 데이터베이스에서 레코드 삭제
            await this.uploadRepository.remove(upload);

            return { message: '파일이 성공적으로 삭제되었습니다.' };
        } catch (error) {
            throw new Error('파일 삭제에 실패했습니다.');
        }
    }


    // 파일 삭제
    private async deleteFileFromFs(filePath: string) {
        try {
            await fs.unlink(filePath);
        } catch (error) {
            console.error('파일 삭제 실패:', error);
        }
    }


    // 파일 ID 증가
    private async getNextFileId(): Promise<number> {
        const lastUpload = await this.uploadRepository.findOne({
            where: {},
            order: { id: 'DESC' },
        });
        return lastUpload ? lastUpload.id + 1 : 1;
    }


    // 파일 업로드
    async uploadFile(uploadFileDto: UploadFileDto, file: Multer.File): Promise<Upload> {
        // 1. 파일 저장 (예시: 로컬 파일 시스템에 저장)
        // 실제 구현에서는 클라우드 스토리지 (AWS S3, Google Cloud Storage 등) 에 저장하는 것이 일반적입니다.
        const filePreviewUrl = await this.saveFileToLocal(file); // saveFileToLocal 메소드는 예시

        // 2. DB에 파일 정보 저장
        const upload = new Upload(); // Upload 엔티티 생성 (실제 엔티티 속성에 맞게 수정)
        upload.userId = parseInt(uploadFileDto.userId.toString()); // userId DTO에서 가져오기
        upload.type = uploadFileDto.type;
        upload.fileName = uploadFileDto.fileName;
        upload.fileSize = parseInt(uploadFileDto.fileSize.toString()); // fileSize DTO에서 가져오기
        upload.duration = parseInt(uploadFileDto.duration?.toString() ?? '0'); // duration DTO에서 가져오기, undefined일 경우 0으로 처리
        upload.filePreviewUrl = filePreviewUrl; // 저장된 파일 URL
        upload.uploadTime = new Date(); // 업로드 시간

        const savedUpload = await this.uploadRepository.save(upload); // DB에 저장

        return savedUpload; // 저장된 Upload 엔티티 반환
    }


    // 파일 저장
    private async saveFileToLocal(file: Multer.File): Promise<string> {
        // 파일 저장 경로 (public/uploads 디렉토리)
        const uploadPath = path.join(__dirname, '..', '..', '..', 'public', 'uploads'); // 프로젝트 루트의 public/uploads
        await fs.mkdir(uploadPath, { recursive: true }); // 디렉토리 생성 (없는 경우)
        const filePath = path.join(uploadPath, file.originalname); // 파일 경로 (파일명은 원본 파일명 사용)

        await fs.writeFile(filePath, file.buffer); // 파일 저장

        // 정적 파일 서버 URL 생성 (http://localhost:3000/uploads/파일명)
        const fileUrl = `/uploads/${file.originalname}`; // 정적 파일 서버 경로 (public 디렉토리 기준)

        return fileUrl; // 정적 파일 서버 URL 반환
    }
}

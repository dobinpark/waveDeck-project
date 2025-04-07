import { Injectable, NotFoundException, BadRequestException, Logger, ConflictException, ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Upload } from './entities/upload.entity';
import { UploadFileDto } from './dto/upload-file.dto';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Multer } from 'multer';
import { FileSystemException, DatabaseException, UnknownUploadException } from './exceptions/upload-exceptions';
import { ConfigService } from '@nestjs/config';

/**
 * 파일 업로드 및 삭제 관련 비즈니스 로직을 처리하는 서비스입니다.
 * - 파일 시스템에 파일 저장/삭제
 * - 데이터베이스에 파일 메타데이터 기록/삭제
 */
@Injectable()
export class UploadService {
    private readonly logger = new Logger(UploadService.name);
    private readonly uploadBasePath = 'waveDeck-uploads';
    private readonly audioFolderPath = 'audio';
    private readonly baseUrl: string;

    /**
     * UploadService 인스턴스를 생성합니다.
     * @param uploadRepository Upload 엔티티 Repository 주입
     * @param configService ConfigService 주입
     */
    constructor(
        @InjectRepository(Upload)
        private uploadRepository: Repository<Upload>,
        private configService: ConfigService,
    ) {
        this.baseUrl = this.configService.get<string>('BASE_URL') || 'http://localhost:3000';
        this.ensureBaseDirectoryExists(); // 기본 업로드 디렉토리 존재 확인 및 생성
    }

    /**
     * 기본 업로드 디렉토리가 존재하는지 확인하고 없으면 생성합니다.
     */
    private async ensureBaseDirectoryExists(): Promise<void> {
        try {
            await fs.access(this.uploadBasePath);
        } catch (error) {
            if (error.code === 'ENOENT') {
                this.logger.log(`기본 업로드 디렉토리(${this.uploadBasePath})가 없어 생성합니다.`);
                await fs.mkdir(this.uploadBasePath, { recursive: true });
            } else {
                this.logger.error(`기본 업로드 디렉토리 접근 오류: ${error.message}`, error.stack);
                throw error; // 예상치 못한 오류는 다시 던짐
            }
        }
    }

    /**
     * 사용자별 오디오 파일 업로드 디렉토리를 생성하거나 확인합니다.
     * @param userId 사용자 ID
     * @returns 사용자별 오디오 파일 저장 경로
     */
    private async ensureUserAudioDirectory(userId: number): Promise<string> {
        const userAudioPath = path.join(this.uploadBasePath, this.audioFolderPath, String(userId));
        try {
            await fs.access(userAudioPath);
        } catch (error) {
            if (error.code === 'ENOENT') {
                this.logger.log(`사용자 오디오 디렉토리(${userAudioPath})가 없어 생성합니다.`);
                await fs.mkdir(userAudioPath, { recursive: true });
            } else {
                this.logger.error(`사용자 오디오 디렉토리 접근 오류: ${error.message}`, error.stack);
                throw error; // 예상치 못한 오류는 다시 던짐
            }
        }
        return userAudioPath;
    }

    /**
     * 오디오 파일을 업로드하고 관련 정보를 데이터베이스에 저장합니다.
     * 1. 고유 파일 ID 생성 (DB auto-increment 사용)
     * 2. 파일 저장 경로 설정 (`waveDeck-uploads/audio/{userId}/{fileId}.{ext}`)
     * 3. 파일 시스템에 디렉토리 생성 및 파일 쓰기
     * 4. 데이터베이스에 Upload 레코드 생성 및 저장
     * @param file 업로드된 파일 객체 (Multer.File)
     * @param uploadFileDto 파일 메타데이터 DTO
     * @returns 저장된 파일 정보 (fileId, filePreviewUrl, uploadTime)
     * @throws FileSystemException 디렉토리 생성 또는 파일 쓰기 실패 시
     * @throws DatabaseException 데이터베이스 저장 실패 시
     * @throws UnknownUploadException 기타 알 수 없는 오류 발생 시
     */
    async uploadAudio(file: Multer.File, uploadFileDto: UploadFileDto): Promise<{ data: { fileId: number; filePreviewUrl: string; uploadTime: string; } }> {
        const { userId, fileName, fileSize, duration, type } = uploadFileDto;
        
        // 파일 확장자 및 새 파일명 준비 (ID는 DB 저장 후 얻는 것이 더 안전)
        const fileExtension = path.extname(file.originalname);
        // 임시 파일명 또는 UUID 사용 고려 가능. 여기서는 DB 저장 후 얻은 ID를 사용한다고 가정하고 경로만 준비.
        const uploadPath = path.join(process.cwd(), 'waveDeck-uploads', 'audio', String(userId));
        
        // DB에 엔티티 미리 생성 (ID 없이)
        const upload = this.uploadRepository.create({
            userId,
            type,
            fileName,
            fileSize,
            duration,
            filePath: 'temp', // 임시 값, 나중에 업데이트
            filePreviewUrl: 'temp', // 임시 값, 나중에 업데이트
        });

        try {
             // 1. DB에 먼저 저장하여 ID 확보
            const savedUpload = await this.uploadRepository.save(upload);
            const fileId = savedUpload.id;
            this.logger.log(`초기 업로드 레코드 저장됨. ID: ${fileId}`);

            // 2. 확보된 ID로 최종 파일 경로 및 URL 설정
            const newFilename = `${fileId}${fileExtension}`;
            const finalFilePath = path.join(uploadPath, newFilename);
            const finalFilePreviewUrl = `/waveDeck-uploads/audio/${userId}/${newFilename}`;

            // 3. 파일 시스템 작업 (디렉토리 생성 및 파일 쓰기)
            await fs.mkdir(uploadPath, { recursive: true });
            await fs.writeFile(finalFilePath, file.buffer);
            this.logger.log(`파일 시스템에 저장됨: ${finalFilePath}`);

            // 4. 파일 경로 및 URL로 DB 레코드 업데이트
            savedUpload.filePath = finalFilePath;
            savedUpload.filePreviewUrl = finalFilePreviewUrl;
            await this.uploadRepository.save(savedUpload); // 레코드 업데이트
            this.logger.log(`업로드 레코드 ${fileId} 최종 경로로 업데이트됨.`);

            // 5. 결과 반환
            return {
                data: {
                    fileId: savedUpload.id,
                    filePreviewUrl: savedUpload.filePreviewUrl,
                    uploadTime: savedUpload.uploadTime.toISOString(), // uploadTime은 DB에서 자동 생성됨
                },
            };
        } catch (error) {
            this.logger.error('파일 업로드 처리 중 오류 발생:', error.stack);
            // 오류 코드 존재 여부 확인
            if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
                throw new FileSystemException(`디렉토리 생성 실패: ${error.message}`);
            } else if (error instanceof Error && 'code' in error && error.code === 'EACCES') {
                throw new FileSystemException(`파일 쓰기/디렉토리 생성 실패 (권한 오류): ${error.message}`);
            } else if (error instanceof Error && (error.message.includes('SQL') || error.message.includes('database'))) {
                throw new DatabaseException(`데이터베이스 오류: ${error.message}`);
            } else if (error instanceof FileSystemException || error instanceof DatabaseException) {
                throw error;
            } else {
                throw new UnknownUploadException(`알 수 없는 업로드 오류: ${error.message || '알 수 없는 오류'}`);
            }
        }
    }

    /**
     * 특정 파일을 파일 시스템과 데이터베이스에서 삭제합니다.
     * 1. 데이터베이스에서 Upload 레코드 조회
     * 2. 파일 시스템에서 해당 파일 삭제 시도 (실패 시 로깅만 함)
     * 3. 데이터베이스에서 Upload 레코드 삭제 시도 (실패 시 예외 발생)
     * @param fileId 삭제할 파일의 DB ID (Upload.id)
     * @param userId 작업을 요청한 사용자 ID
     * @returns 성공 메시지 (파일 시스템 삭제 오류 시 경고 포함)
     * @throws NotFoundException 해당 ID와 사용자 ID로 파일을 찾을 수 없는 경우
     * @throws DatabaseException 데이터베이스 레코드 삭제 실패 시
     * @throws UnknownUploadException 기타 알 수 없는 오류 발생 시
     */
    async deleteFile(fileId: number, userId: number): Promise<{ message: string }> {
        const upload = await this.uploadRepository.findOne({
            where: { id: fileId, userId },
        });

        if (!upload) {
            this.logger.warn(`삭제 시도: 존재하지 않는 업로드 파일: fileId=${fileId}, userId=${userId}`);
            throw new NotFoundException(`파일을 찾을 수 없습니다 (ID: ${fileId})`);
        }

        let fileDeleted = false;
        let dbRecordRemoved = false;

        // 1. 파일 시스템에서 파일 삭제 시도
        try {
            // 실제 저장된 파일 경로를 사용하여 삭제
            await this.deleteFileFromFs(upload.filePath);
            fileDeleted = true;
            this.logger.log(`파일 시스템에서 파일 삭제 성공: ${upload.filePath}`);
        } catch (fsError) {
            // 오류 로깅 후 DB 레코드 삭제 계속 시도
            this.logger.error(`파일 시스템에서 파일 삭제 실패: ${upload.filePath}`, fsError.stack);
            // 중요: 파일 삭제가 반드시 성공해야 한다면 여기서 FileSystemException 발생시킬 수 있음
            // throw new FileSystemException(`파일 시스템에서 파일을 삭제하지 못했습니다: ${fsError.message}`);
        }

        // 2. 데이터베이스에서 레코드 삭제 시도
        try {
            await this.uploadRepository.remove(upload);
            dbRecordRemoved = true;
            this.logger.log(`데이터베이스에서 업로드 레코드 삭제 성공: id=${fileId}`);
        } catch (dbError) {
            this.logger.error(`데이터베이스에서 업로드 레코드 삭제 실패: id=${fileId}`, dbError.stack);
            // 파일은 삭제되었으나 DB 레코드 삭제 실패 시 문제 발생 가능성 있음.
            // DatabaseException 발생.
            throw new DatabaseException(`데이터베이스에서 파일 기록을 삭제하지 못했습니다: ${dbError.message}`);
        }

        // 주요 작업(예: DB 삭제) 성공 여부에 따라 최종 결과 결정
        if (dbRecordRemoved) {
             return { message: '파일이 성공적으로 삭제되었습니다.' + (!fileDeleted ? ' (파일 시스템에서 파일 삭제 중 오류 발생)' : '') };
        } else {
             // 이론상 DB catch 블록에서 예외가 발생하므로 이 경우는 도달하지 않음
             this.logger.error(`DB 레코드 삭제가 조용히 실패함 (upload id=${fileId}). 이 상황은 발생하면 안 됩니다.`);
             throw new UnknownUploadException('알 수 없는 오류로 파일 삭제에 실패했습니다.');
        }
    }

    /**
     * 지정된 경로의 파일을 파일 시스템에서 삭제합니다. (private helper)
     * @param filePath 삭제할 파일의 전체 경로
     * @throws FileSystemException 파일 삭제 실패 시
     */
    private async deleteFileFromFs(filePath: string): Promise<void> {
        try {
            await fs.unlink(filePath);
        } catch (error) {
            // 상세 오류 로깅 후, 호출자가 처리하도록 다시 던짐
            this.logger.error(`fs.unlink 실패: 경로=${filePath}`, error.stack);
            // 특정 FileSystemException 발생 (메시지만 포함)
            throw new FileSystemException(`파일 시스템 삭제 오류 (${filePath}): ${error.message}`);
        }
    }

    /**
     * 다음 파일 ID를 생성합니다. (현재는 사용되지 않음 - DB auto-increment 사용 권장)
     * @deprecated DB의 auto-increment 기능을 사용하는 것이 더 안전합니다.
     * @returns 다음 파일 ID
     */
    private async getNextFileId(): Promise<number> {
        const lastUpload = await this.uploadRepository.findOne({
            where: {},
            order: { id: 'DESC' },
        });
        return lastUpload ? lastUpload.id + 1 : 1;
    }

    // 아래 메서드들은 이전/대체 구현으로 보이며 사용되지 않을 수 있음
    /*
    async uploadFile(uploadFileDto: UploadFileDto, file: Multer.File): Promise<Upload> {
        // ... implementation ...
    }
    private async saveFileToLocal(file: Multer.File): Promise<string> {
        // ... implementation ...
    }
    */
}

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs/promises';
import * as path from 'path';
import { UploadService } from './upload.service';
import { Upload } from './entities/upload.entity';
import { UploadFileDto } from './dto/upload-file.dto';
import { NotFoundException, InternalServerErrorException, ConflictException, ForbiddenException } from '@nestjs/common';
import { FileSystemException, DatabaseException } from './exceptions/upload-exceptions';
import { Multer } from 'multer';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Express } from 'express';

// Mock fs/promises module
jest.mock('fs/promises', () => ({
    mkdir: jest.fn(),
    writeFile: jest.fn(),
    unlink: jest.fn(),
}));

// Define a specific mock type for the repository methods we use
type SpecificMockRepository<T extends Record<string, any>> = Pick<Repository<T>, 'findOne' | 'create' | 'save' | 'delete' | 'remove'> & {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
    remove: jest.Mock;
};

const createMockRepository = <T extends Record<string, any> = any>(): SpecificMockRepository<T> => ({
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    remove: jest.fn(),
});

describe('UploadService', () => {
    let service: UploadService;
    let uploadRepository: SpecificMockRepository<Upload>;
    let fsMock: jest.Mocked<typeof fs>; // Type for mocked fs
    let loggerSpy: jest.SpyInstance; // Spy for logger methods
    let configService: ConfigService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                UploadService,
                {
                    provide: getRepositoryToken(Upload),
                    useValue: createMockRepository<Upload>(),
                },
                {
                    provide: ConfigService,
                    useValue: { // ConfigService Mock (주석 번역)
                        get: jest.fn((key: string) => {
                            if (key === 'BASE_URL') return 'http://test.com';
                            return null;
                        }),
                    },
                },
                // Provide Logger if needed, or rely on default instance
                // Logger, // Add Logger if you want to inject/spy on it explicitly
            ],
        }).compile();

        service = module.get<UploadService>(UploadService);
        uploadRepository = module.get<SpecificMockRepository<Upload>>(
            getRepositoryToken(Upload),
        );
        // Get the mocked fs module
        fsMock = fs as jest.Mocked<typeof fs>;

        // Spy on logger methods used in the service
        loggerSpy = jest.spyOn(service['logger'] as any, 'error').mockImplementation(); // Spy on error
        jest.spyOn(service['logger'] as any, 'log').mockImplementation(); // Spy on log (optional)
        jest.spyOn(service['logger'] as any, 'warn').mockImplementation(); // Spy on warn (optional)

        // Reset mocks before each test
        jest.clearAllMocks();

        // ensureBaseDirectoryExists Mock (생성자에서 호출됨) (주석 번역)
        jest.spyOn(service as any, 'ensureBaseDirectoryExists').mockResolvedValue(undefined);
    });

    afterEach(() => {
        loggerSpy.mockRestore(); // Restore logger spy after each test
    });

    it('정의되어야 함', () => { // 'should be defined' 번역
        expect(service).toBeDefined();
    });

    describe('uploadAudio', () => {
        const mockFile: Multer.File = {
            fieldname: 'file',
            originalname: 'test_audio.wav',
            encoding: '7bit',
            mimetype: 'audio/wav',
            size: 1024 * 500, // 500KB
            buffer: Buffer.from('test buffer content'), // 테스트용 버퍼 내용 (주석 번역)
            // stream, destination, filename, path 등은 필요시 추가 (주석 번역)
        } as Multer.File;

        const mockDto: UploadFileDto = {
            userId: 1,
            fileName: 'test_audio.wav',
            fileSize: 1024 * 500,
            duration: 30000,
            type: 'audio',
        };

        const mockUploadEntity = { id: 1, ...mockDto, filePath: null, filePreviewUrl: null, uploadTime: null } as unknown as Upload;
        const mockSavedEntity = { ...mockUploadEntity, id: 1, uploadTime: new Date() } as Upload;
        const expectedUserAudioPath = path.join('waveDeck-uploads', 'audio', String(mockDto.userId));
        const expectedFilePath = path.join(expectedUserAudioPath, `${mockSavedEntity.id}.wav`);
        const expectedRelativePath = path.join('audio', String(mockDto.userId), `${mockSavedEntity.id}.wav`).replace(/\\/g, '/');

        beforeEach(() => {
            // ensureUserAudioDirectory Mock 설정 (주석 번역)
            jest.spyOn(service as any, 'ensureUserAudioDirectory').mockResolvedValue(expectedUserAudioPath);
        });

        it('오디오 파일을 성공적으로 업로드하고 DB에 저장해야 함', async () => { // 'should upload audio file and save to DB successfully' 번역
            uploadRepository.create.mockReturnValue(mockUploadEntity); // 임시 엔티티 생성 Mock (주석 번역)
            uploadRepository.save
                .mockResolvedValueOnce(mockSavedEntity) // 첫 번째 저장 (ID 확보) Mock (주석 번역)
                .mockResolvedValueOnce({ // 두 번째 저장 (경로 업데이트) Mock (주석 번역)
                    ...mockSavedEntity,
                    filePath: expectedRelativePath,
                    filePreviewUrl: `http://test.com/${expectedRelativePath}`,
                });
            (fs.writeFile as jest.Mock).mockResolvedValue(undefined); // 파일 쓰기 성공 Mock (주석 번역)

            const result = await service.uploadAudio(mockFile, mockDto);

            expect(service['ensureUserAudioDirectory']).toHaveBeenCalledWith(mockDto.userId);
            expect(uploadRepository.create).toHaveBeenCalledWith(expect.objectContaining({ userId: mockDto.userId, fileName: mockFile.originalname }));
            expect(uploadRepository.save).toHaveBeenCalledTimes(2);
            expect(fs.writeFile).toHaveBeenCalledWith(expectedFilePath, mockFile.buffer);
            expect(result).toMatchObject({
                id: mockSavedEntity.id,
                filePath: expectedRelativePath,
                filePreviewUrl: `http://test.com/${expectedRelativePath}`,
            });
        });

        it('DB 임시 저장 실패 시 InternalServerErrorException을 던져야 함', async () => { // 'should throw InternalServerErrorException if initial DB save fails' 번역
            uploadRepository.create.mockReturnValue(mockUploadEntity);
            uploadRepository.save.mockRejectedValueOnce(new Error('DB 오류')); // 첫 번째 저장 실패 Mock (주석 번역)

            await expect(service.uploadAudio(mockFile, mockDto)).rejects.toThrow(InternalServerErrorException);
            expect(fs.writeFile).not.toHaveBeenCalled(); // 파일 쓰기 시도 안 함 (주석 번역)
        });

        it('파일 시스템 쓰기 실패 시 관련 예외를 던지고 임시 DB 레코드를 삭제해야 함', async () => { // 'should throw relevant exception and delete temp DB record if file write fails' 번역
            const fileWriteError = new Error('파일 쓰기 오류');
            (fileWriteError as any).code = 'EACCES'; // 접근 거부 오류 시뮬레이션 (주석 번역)
            uploadRepository.create.mockReturnValue(mockUploadEntity);
            uploadRepository.save.mockResolvedValueOnce(mockSavedEntity); // 첫 번째 저장 성공 (주석 번역)
            (fs.writeFile as jest.Mock).mockRejectedValue(fileWriteError); // 파일 쓰기 실패 Mock (주석 번역)
            uploadRepository.delete.mockResolvedValue({}); // 임시 레코드 삭제 성공 Mock (주석 번역)

            await expect(service.uploadAudio(mockFile, mockDto)).rejects.toThrow(ForbiddenException); // EACCES -> ForbiddenException (주석 번역)
            expect(uploadRepository.delete).toHaveBeenCalledWith(mockSavedEntity.id); // 임시 레코드 삭제 확인 (주석 번역)
        });

        it('최종 DB 업데이트 실패 시 InternalServerErrorException을 던지고 저장된 파일을 삭제해야 함', async () => { // 'should throw InternalServerErrorException and delete saved file if final DB update fails' 번역
            uploadRepository.create.mockReturnValue(mockUploadEntity);
            uploadRepository.save.mockResolvedValueOnce(mockSavedEntity); // 첫 번째 저장 성공 (주석 번역)
            (fs.writeFile as jest.Mock).mockResolvedValue(undefined); // 파일 쓰기 성공 (주석 번역)
            uploadRepository.save.mockRejectedValueOnce(new Error('DB 업데이트 오류')); // 두 번째 저장(업데이트) 실패 Mock (주석 번역)
            (fs.unlink as jest.Mock).mockResolvedValue(undefined); // 파일 삭제 성공 Mock (주석 번역)

            await expect(service.uploadAudio(mockFile, mockDto)).rejects.toThrow(InternalServerErrorException);
            expect(fs.unlink).toHaveBeenCalledWith(expectedFilePath); // 파일 삭제 확인 (주석 번역)
        });

    });

    describe('deleteFile', () => {
        const fileId = 1;
        const userId = 1;
        const mockUpload: Upload = {
            id: fileId,
            userId: userId,
            filePath: 'audio/1/1.wav',
            // ... 기타 필요한 필드들 ...
        } as Upload;
        const expectedFilePath = path.join('waveDeck-uploads', mockUpload.filePath);

        it('파일과 DB 레코드를 성공적으로 삭제해야 함', async () => { // 'should delete file and DB record successfully' 번역
            uploadRepository.findOne.mockResolvedValue(mockUpload);
            (fs.unlink as jest.Mock).mockResolvedValue(undefined); // 파일 시스템 삭제 성공 Mock (주석 번역)
            uploadRepository.delete.mockResolvedValue({ affected: 1 }); // DB 삭제 성공 Mock (주석 번역)

            await service.deleteFile(fileId, userId);

            expect(uploadRepository.findOne).toHaveBeenCalledWith({ where: { id: fileId, userId: userId } });
            expect(fs.unlink).toHaveBeenCalledWith(expectedFilePath);
            expect(uploadRepository.delete).toHaveBeenCalledWith(fileId);
        });

        it('파일을 찾을 수 없으면 NotFoundException을 던져야 함', async () => { // 'should throw NotFoundException if file not found' 번역
            uploadRepository.findOne.mockResolvedValue(null);

            await expect(service.deleteFile(fileId, userId)).rejects.toThrow(NotFoundException);
            expect(fs.unlink).not.toHaveBeenCalled();
            expect(uploadRepository.delete).not.toHaveBeenCalled();
        });

        it('파일 시스템 삭제 실패 시에도 DB 레코드 삭제를 시도해야 함', async () => { // 'should attempt to delete DB record even if file system deletion fails' 번역
            const fsError = new Error('FS 오류');
            uploadRepository.findOne.mockResolvedValue(mockUpload);
            (fs.unlink as jest.Mock).mockRejectedValue(fsError); // 파일 시스템 삭제 실패 Mock (주석 번역)
            uploadRepository.delete.mockResolvedValue({ affected: 1 }); // DB 삭제는 성공 (주석 번역)

            // 서비스는 성공으로 간주하거나, 경고와 함께 성공 메시지를 반환할 수 있음 (현재 구현 기준) (주석 번역)
            const result = await service.deleteFile(fileId, userId);

            expect(fs.unlink).toHaveBeenCalledWith(expectedFilePath);
            expect(uploadRepository.delete).toHaveBeenCalledWith(fileId);
            expect(result.message).toContain('파일 시스템에서 파일 삭제 중 오류 발생'); // 경고 메시지 확인 (주석 번역)
        });

        it('DB 레코드 삭제 실패 시 InternalServerErrorException을 던져야 함', async () => { // 'should throw InternalServerErrorException if DB record deletion fails' 번역
            const dbError = new Error('DB 삭제 오류');
            uploadRepository.findOne.mockResolvedValue(mockUpload);
            (fs.unlink as jest.Mock).mockResolvedValue(undefined); // 파일 시스템 삭제는 성공 (주석 번역)
            uploadRepository.delete.mockRejectedValue(dbError); // DB 삭제 실패 Mock (주석 번역)

            await expect(service.deleteFile(fileId, userId)).rejects.toThrow(InternalServerErrorException);
        });

    });

    // deleteFileFromFs 테스트는 필요시 추가 가능 (private 메서드) (주석 번역)
}); 
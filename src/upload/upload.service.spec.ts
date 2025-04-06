import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs/promises'; // Import fs promises
import * as path from 'path'; // Import path
import { UploadService } from './upload.service';
import { Upload } from './entities/upload.entity';
import { UploadFileDto } from './dto/upload-file.dto';
import { NotFoundException } from '@nestjs/common';
import { FileSystemException, DatabaseException } from './exceptions/upload-exceptions';
import { Multer } from 'multer';
import { Logger } from '@nestjs/common'; // Import Logger

// Mock fs/promises module
jest.mock('fs/promises', () => ({
    mkdir: jest.fn(),
    writeFile: jest.fn(),
    unlink: jest.fn(),
}));

// Define a specific mock type for the repository methods we use
type SpecificMockRepository<T extends Record<string, any>> = Pick<Repository<T>, 'findOne' | 'create' | 'save' | 'remove' | 'count'> & {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
    count: jest.Mock;
};

const createMockRepository = <T extends Record<string, any> = any>(): SpecificMockRepository<T> => ({
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    count: jest.fn(),
});

describe('UploadService', () => {
    let service: UploadService;
    let uploadRepository: SpecificMockRepository<Upload>;
    let fsMock: jest.Mocked<typeof fs>; // Type for mocked fs
    let loggerSpy: jest.SpyInstance; // Spy for logger methods

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                UploadService,
                {
                    provide: getRepositoryToken(Upload),
                    useValue: createMockRepository<Upload>(),
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
    });

    afterEach(() => {
        loggerSpy.mockRestore(); // Restore logger spy after each test
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('uploadAudio', () => {
        const mockFile: Multer.File = {
            fieldname: 'file', originalname: 'test.wav', encoding: '7bit', mimetype: 'audio/wave', size: 1024,
            stream: null as any, destination: '', filename: '', path: '', buffer: Buffer.from('test data')
        };
        const mockDto: UploadFileDto = {
            userId: 1, fileName: 'test.wav', fileSize: 1024, type: 'upload', duration: 5000
        };
        const mockUploadEntity = { id: 1 } as Upload;
        const expectedPath = path.join(process.cwd(), 'waveDeck-uploads', 'audio', String(mockDto.userId));
        const expectedFilename = `1.wav`; // Assumes getNextFileId returns 1
        const expectedFilepath = path.join(expectedPath, expectedFilename);

        beforeEach(() => {
             // Mock getNextFileId (private method access) to return a predictable ID
            jest.spyOn(service as any, 'getNextFileId').mockResolvedValue(1);
            uploadRepository.create.mockReturnValue(mockUploadEntity); // Mock create
            uploadRepository.save.mockResolvedValue({ ...mockUploadEntity, id: 1, filePreviewUrl: `/waveDeck-uploads/audio/1/${expectedFilename}`, uploadTime: new Date() }); // Mock save
        });

        it('should upload file, save entity, and return details', async () => {
            fsMock.mkdir.mockResolvedValue(undefined); // Mock mkdir success
            fsMock.writeFile.mockResolvedValue(undefined); // Mock writeFile success

            const result = await service.uploadAudio(mockFile, mockDto);

            expect(fsMock.mkdir).toHaveBeenCalledWith(expectedPath, { recursive: true });
            expect(fsMock.writeFile).toHaveBeenCalledWith(expectedFilepath, mockFile.buffer);
            expect(uploadRepository.create).toHaveBeenCalledWith(expect.objectContaining({
                userId: mockDto.userId,
                type: mockDto.type,
                fileName: mockDto.fileName,
                filePath: expectedFilepath,
                filePreviewUrl: `/waveDeck-uploads/audio/1/${expectedFilename}`,
            }));
            expect(uploadRepository.save).toHaveBeenCalledWith(mockUploadEntity);
            expect(result.data.fileId).toBe(1);
            expect(result.data.filePreviewUrl).toBe(`/waveDeck-uploads/audio/1/${expectedFilename}`);
        });

        it('should throw FileSystemException if mkdir fails', async () => {
            const mkdirError = new Error('EEXIST: file already exists');
            fsMock.mkdir.mockRejectedValue(mkdirError);

            await expect(service.uploadAudio(mockFile, mockDto)).rejects.toThrow(FileSystemException);
        });

        it('should throw FileSystemException if writeFile fails', async () => {
            const writeFileError = new Error('EACCES: permission denied');
            fsMock.mkdir.mockResolvedValue(undefined);
            fsMock.writeFile.mockRejectedValue(writeFileError);

            await expect(service.uploadAudio(mockFile, mockDto)).rejects.toThrow(FileSystemException);
        });

        it('should throw DatabaseException if saving entity fails', async () => {
            const dbError = new Error('SQLITE_ERROR: unable to open database file');
            fsMock.mkdir.mockResolvedValue(undefined);
            fsMock.writeFile.mockResolvedValue(undefined);
            uploadRepository.save.mockRejectedValue(dbError);

            await expect(service.uploadAudio(mockFile, mockDto)).rejects.toThrow(DatabaseException);
        });
    });

    describe('deleteFile', () => {
        const fileId = 1;
        const userId = 1;
        const mockUploadToDelete: Upload = {
            id: fileId, userId: userId, filePath: 'path/to/delete.wav', filePreviewUrl: '/uploads/1/delete.wav'
        } as Upload;

        it('should delete file from FS and DB record successfully', async () => {
            uploadRepository.findOne.mockResolvedValue(mockUploadToDelete);
            fsMock.unlink.mockResolvedValue(undefined); // Mock unlink success
            uploadRepository.remove.mockResolvedValue(mockUploadToDelete);

            const result = await service.deleteFile(fileId, userId);

            expect(uploadRepository.findOne).toHaveBeenCalledWith({ where: { id: fileId, userId: userId } });
            expect(fsMock.unlink).toHaveBeenCalledWith(mockUploadToDelete.filePath);
            expect(uploadRepository.remove).toHaveBeenCalledWith(mockUploadToDelete);
            expect(result.message).toBe('파일이 성공적으로 삭제되었습니다.');
            expect(loggerSpy).not.toHaveBeenCalled(); // No errors logged
        });

        it('should throw NotFoundException if file entity not found', async () => {
            uploadRepository.findOne.mockResolvedValue(null);

            await expect(service.deleteFile(fileId, userId)).rejects.toThrow(NotFoundException);
            expect(fsMock.unlink).not.toHaveBeenCalled();
            expect(uploadRepository.remove).not.toHaveBeenCalled();
        });

        // Updated test for fs.unlink failure
        it('should log error, remove DB record, and return success message with warning if fs.unlink fails', async () => {
            const unlinkError = new FileSystemException('unlink failed'); // Use the specific exception
            uploadRepository.findOne.mockResolvedValue(mockUploadToDelete);
            // Mock the private deleteFileFromFs to throw the specific error
            const deleteFsSpy = jest.spyOn(service as any, 'deleteFileFromFs').mockRejectedValue(unlinkError);
            uploadRepository.remove.mockResolvedValue(mockUploadToDelete); // DB remove should still succeed

            const result = await service.deleteFile(fileId, userId);

            expect(uploadRepository.findOne).toHaveBeenCalledWith({ where: { id: fileId, userId: userId } });
            expect(deleteFsSpy).toHaveBeenCalledWith(mockUploadToDelete.filePath);
            expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to delete file from filesystem'), expect.any(String)); // Check error log
            expect(uploadRepository.remove).toHaveBeenCalledWith(mockUploadToDelete); // DB remove is called
            // Check the specific warning message is included
            expect(result.message).toBe('파일이 성공적으로 삭제되었습니다. (파일 시스템에서 파일 삭제 중 오류 발생)');

            deleteFsSpy.mockRestore();
        });

        // Updated test for DB remove failure
        it('should throw DatabaseException if DB remove fails (after successful or failed unlink)', async () => {
            const dbError = new Error('DB remove error');
            uploadRepository.findOne.mockResolvedValue(mockUploadToDelete);
            fsMock.unlink.mockResolvedValue(undefined); // Assume unlink succeeds for this case
            uploadRepository.remove.mockRejectedValue(dbError);

            await expect(service.deleteFile(fileId, userId)).rejects.toThrow(DatabaseException);
            expect(fsMock.unlink).toHaveBeenCalledWith(mockUploadToDelete.filePath);
            expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to remove upload record from DB'), expect.any(String)); // Check error log
        });
    });
}); 
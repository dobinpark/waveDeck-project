import { Test, TestingModule } from '@nestjs/testing';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { UploadFileDto } from './dto/upload-file.dto';
import { HttpStatus, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { Multer } from 'multer';
import { FileSystemException, DatabaseException } from './exceptions/upload-exceptions';

const mockUploadService = {
	uploadAudio: jest.fn(),
	deleteFile: jest.fn(),
};

describe('UploadController', () => {
	let controller: UploadController;
	let service: UploadService;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			controllers: [UploadController],
			providers: [
				{
					provide: UploadService,
					useValue: mockUploadService,
				},
			],
		}).compile();

		controller = module.get<UploadController>(UploadController);
		service = module.get<UploadService>(UploadService);
		jest.clearAllMocks();
	});

	it('정의되어야 함', () => {
		expect(controller).toBeDefined();
	});

	describe('uploadAudio', () => {
		const mockFile: Multer.File = {
			fieldname: 'file',
			originalname: 'test.mp3',
			mimetype: 'audio/mpeg',
			size: 1024,
			buffer: Buffer.from('mock file content'),
		} as Multer.File;
		const mockDto: UploadFileDto = { userId: 1, fileName: 'test.mp3', fileSize: 1024, type: 'upload' };
		const mockResult = { data: { fileId: 1, filePreviewUrl: '/path/1.mp3', uploadTime: new Date().toISOString() } };

		it('파일 업로드를 성공적으로 처리하고 결과를 반환해야 함', async () => {
			mockUploadService.uploadAudio.mockResolvedValue(mockResult);

			const response = await controller.uploadAudio(mockFile, mockDto);

			expect(service.uploadAudio).toHaveBeenCalledWith(mockFile, mockDto);
			expect(response).toEqual(mockResult);
		});

		it('서비스에서 발생한 특정 예외(BadRequest, NotFound)를 다시 던져야 함', async () => {
			const badRequestError = new BadRequestException('유효성 오류');
			mockUploadService.uploadAudio.mockRejectedValueOnce(badRequestError);

			await expect(controller.uploadAudio(mockFile, mockDto)).rejects.toThrow(BadRequestException);
		});

		it('서비스에서 발생한 커스텀 예외(FileSystem, Database)를 다시 던져야 함', async () => {
			const fsError = new FileSystemException('파일 시스템 오류');
			mockUploadService.uploadAudio.mockRejectedValueOnce(fsError);

			await expect(controller.uploadAudio(mockFile, mockDto)).rejects.toThrow(FileSystemException);
		});

		it('알 수 없는 서비스 오류 발생 시 InternalServerErrorException을 던져야 함', async () => {
			const unknownError = new Error('알 수 없는 내부 오류');
			mockUploadService.uploadAudio.mockRejectedValue(unknownError);

			await expect(controller.uploadAudio(mockFile, mockDto)).rejects.toThrow(InternalServerErrorException);
		});
	});

	describe('deleteAudio', () => {
		const fileId = 1;
		const userId = 1;

		it('파일 삭제를 성공적으로 처리하고 성공 메시지를 반환해야 함', async () => {
			mockUploadService.deleteFile.mockResolvedValue({ message: '파일이 성공적으로 삭제되었습니다.' });

			const response = await controller.deleteAudio(fileId, userId);

			expect(service.deleteFile).toHaveBeenCalledWith(fileId, userId);
			expect(response).toEqual({ message: '파일이 성공적으로 삭제되었습니다.' });
		});

		it('서비스에서 발생한 NotFoundException을 다시 던져야 함', async () => {
			const notFoundError = new NotFoundException('파일 없음');
			mockUploadService.deleteFile.mockRejectedValue(notFoundError);

			await expect(controller.deleteAudio(fileId, userId)).rejects.toThrow(NotFoundException);
		});

		it('서비스에서 발생한 커스텀 예외(Database, FileSystem)를 다시 던져야 함', async () => {
			const dbError = new DatabaseException('DB 오류');
			mockUploadService.deleteFile.mockRejectedValueOnce(dbError);

			await expect(controller.deleteAudio(fileId, userId)).rejects.toThrow(DatabaseException);
		});

		it('알 수 없는 서비스 오류 발생 시 InternalServerErrorException을 던져야 함', async () => {
			const unknownError = new Error('알 수 없는 삭제 오류');
			mockUploadService.deleteFile.mockRejectedValue(unknownError);

			await expect(controller.deleteAudio(fileId, userId)).rejects.toThrow(InternalServerErrorException);
		});
	});
});

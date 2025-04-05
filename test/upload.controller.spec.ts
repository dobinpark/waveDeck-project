import { Test, TestingModule } from '@nestjs/testing';
import { UploadController } from '../src/upload/upload.controller';
import { UploadService } from '../src/upload/upload.service';
import { UploadFileDto } from '../src/upload/dto/upload-file.dto';
import { BadRequestException } from '@nestjs/common';
import { Multer } from 'multer';

describe('UploadController', () => {
	let controller: UploadController;
	let mockUploadService = {
		uploadAudio: jest.fn(), // uploadAudio 함수 Mocking
	};

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			controllers: [UploadController],
			providers: [
				{ provide: UploadService, useValue: mockUploadService } // UploadService Mocking
			],
		}).compile();

		controller = module.get<UploadController>(UploadController);
	});

	it('should upload file successfully', async () => {
		const mockFile = {
			originalname: 'test.wav',
			mimetype: 'audio/wav',
			size: 1024,
			buffer: Buffer.from('mock file content'), // buffer 추가
		} as Multer.File;
		const uploadFileDto: UploadFileDto = {
			userId: 1,
			type: 'upload',
			fileName: 'test.wav',
			fileSize: 1024,
		};
		const expectedResult = {
			data: {
				fileId: 'mockFileId',
				filePreviewUrl: '/preview/mockFileId',
				uploadTime: new Date().toISOString(),
			},
		};

		mockUploadService.uploadAudio.mockResolvedValue(expectedResult); // Mock Service에서 성공 결과 반환하도록 설정

		const result = await controller.uploadAudio(mockFile, uploadFileDto);
		expect(result).toEqual(expectedResult);
		expect(mockUploadService.uploadAudio).toHaveBeenCalledWith(mockFile, uploadFileDto); // Mock Service 함수 호출 확인
	});

	it('should handle file upload failure', async () => {
		const mockFile = {
			originalname: 'test.wav',
			mimetype: 'audio/wav',
			size: 1024,
			buffer: Buffer.from('mock file content'), // buffer 추가
		} as Multer.File;
		const uploadFileDto: UploadFileDto = {
			userId: 1,
			type: 'upload',
			fileName: 'test.wav',
			fileSize: 1024,
		};

		mockUploadService.uploadAudio.mockRejectedValue(new Error('업로드 실패')); // Mock Service에서 에러 발생시키도록 설정

		await expect(controller.uploadAudio(mockFile, uploadFileDto)).rejects.toThrowError('업로드 실패');
		expect(mockUploadService.uploadAudio).toHaveBeenCalledWith(mockFile, uploadFileDto); // Mock Service 함수 호출 확인
	});

	it('should handle invalid file type', async () => {
		const mockFile = {
			originalname: 'test.txt', // invalid file type
			mimetype: 'text/plain',
			size: 1024,
			buffer: Buffer.from('mock file content'),
		} as Multer.File;
		const uploadFileDto: UploadFileDto = {
			userId: 1,
			type: 'upload',
			fileName: 'test.txt',
			fileSize: 1024,
		};

		// ParseFilePipe에서 BadRequestException 발생 예상
		await expect(controller.uploadAudio(
			mockFile as any, // 타입 에러 무시 (실제 Multer.File 타입이 아님)
			uploadFileDto,
		)).rejects.toBeInstanceOf(BadRequestException);
		expect(mockUploadService.uploadAudio).not.toHaveBeenCalled(); // Service 함수는 호출되지 않아야 함
	});
});

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InferenceService } from './inference.service';
import { Inference, JobStatus } from './entities/inference.entity';
import { Upload } from '../upload/entities/upload.entity';
import { InferenceRequestDto } from './dto/inference-request.dto';
import { NotFoundException, InternalServerErrorException } from '@nestjs/common';

// Mock TypeORM Repository
// Define a more specific mock type for the methods we use
type SpecificMockRepository<T extends Record<string, any>> = Pick<Repository<T>, 'findOne' | 'create' | 'save'> & {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
};

const createMockRepository = <T extends Record<string, any> = any>(): SpecificMockRepository<T> => ({
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
});

describe('InferenceService', () => {
    let service: InferenceService;
    let inferenceRepository: SpecificMockRepository<Inference>;
    let uploadRepository: SpecificMockRepository<Upload>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                InferenceService,
                {
                    provide: getRepositoryToken(Inference),
                    useValue: createMockRepository<Inference>(),
                },
                {
                    provide: getRepositoryToken(Upload),
                    useValue: createMockRepository<Upload>(),
                },
            ],
        }).compile();

        service = module.get<InferenceService>(InferenceService);
        inferenceRepository = module.get<SpecificMockRepository<Inference>>(
            getRepositoryToken(Inference),
        );
        uploadRepository = module.get<SpecificMockRepository<Upload>>(
            getRepositoryToken(Upload),
        );
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('requestTransformation', () => {
        const dto: InferenceRequestDto = { userId: 1, fileId: 1, voiceId: 72, pitch: 0 };
        const mockUpload: Upload = {
            id: 1,
            userId: 1,
            type: 'audio',
            fileName: 'test.wav',
            fileSize: 1024,
            duration: 10,
            filePreviewUrl: '/uploads/1/test.wav',
            filePath: 'path/to/test.wav',
            uploadTime: new Date(),
        };
        const mockJob = { id: 1, status: JobStatus.PENDING };

        it('should create and return a new inference job', async () => {
            uploadRepository.findOne.mockResolvedValue(mockUpload);
            inferenceRepository.create.mockReturnValue(mockJob);
            inferenceRepository.save.mockResolvedValue({ ...mockJob, id: 123 });

            jest.spyOn(service as any, 'simulateAiProcessingWithRetry').mockImplementation(() => { });

            const result = await service.requestTransformation(dto);

            expect(uploadRepository.findOne).toHaveBeenCalledWith({ where: { id: dto.fileId, userId: dto.userId } });
            expect(inferenceRepository.create).toHaveBeenCalledWith(expect.objectContaining({
                userId: dto.userId,
                upload: mockUpload,
                status: JobStatus.PENDING,
                voiceId: dto.voiceId,
                pitch: dto.pitch,
                originalPath: mockUpload.filePath,
            }));
            expect(inferenceRepository.save).toHaveBeenCalledWith(mockJob);
            expect((service as any).simulateAiProcessingWithRetry).toHaveBeenCalledWith(123);
            expect(result).toEqual({
                jobId: 123,
                previewUrl: 'https://example.com/preview/123',
            });
        });

        it('should throw NotFoundException if upload not found', async () => {
            uploadRepository.findOne.mockResolvedValue(null);
            await expect(service.requestTransformation(dto)).rejects.toThrow(NotFoundException);
        });

        it('should throw InternalServerErrorException on save failure', async () => {
            uploadRepository.findOne.mockResolvedValue(mockUpload);
            inferenceRepository.create.mockReturnValue(mockJob);
            inferenceRepository.save.mockRejectedValue(new Error('DB error'));
            await expect(service.requestTransformation(dto)).rejects.toThrow(InternalServerErrorException);
        });
    });

    // TODO: Add tests for simulateAiProcessingWithRetry method
    // This requires more complex setup to test retries, success/failure paths, status updates etc.
    describe('simulateAiProcessingWithRetry', () => {
        // Example test case structure (needs more implementation)
        it('should eventually complete successfully after a retry', async () => {
            // Mock findOne to return a pending job initially
            // Mock save for status updates
            // Mock Math.random for controlling success/failure
            // Use jest.useFakeTimers() and jest.advanceTimersByTime() for delays
            // Assert final status is COMPLETED
        });

        it('should eventually fail after max retries', async () => {
            // Mock findOne to return a pending job
            // Mock save for status updates
            // Mock Math.random to always fail
            // Use jest.useFakeTimers() and jest.advanceTimersByTime()
            // Assert final status is FAILED after MAX_RETRIES attempts
        });
    });

}); 
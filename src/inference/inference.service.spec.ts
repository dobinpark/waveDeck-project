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

    // Tests for the private simulateAiProcessingWithRetry method
    describe('simulateAiProcessingWithRetry', () => {
        const jobId = 1;
        let mockPendingJob: Inference;

        beforeEach(() => {
            // Reset mocks and timers for each test
            jest.clearAllMocks();
            jest.useRealTimers(); // Use real timers by default, enable fake timers in specific tests

            // Basic pending job mock for reuse
            mockPendingJob = {
                id: jobId,
                userId: 1,
                upload: { id: 1 } as Upload, // Simplified mock upload
                status: JobStatus.PENDING,
                voiceId: 72,
                pitch: 0,
                originalPath: 'path/to/original',
                createdAt: new Date(),
                updatedAt: new Date(),
                convertedPath: undefined,
                convertedFileSize: undefined,
                jobQueueId: `inference-${jobId}`, // Assign a mock queue ID
                // @ts-ignore - Ignoring potential type mismatch for nullable errorMessage
                errorMessage: null,
                processingStartedAt: null,
                processingFinishedAt: null,
            };
        });

        it('should complete successfully on the first attempt', async () => {
            jest.useFakeTimers();
            const ir = inferenceRepository!;
            ir.findOne.mockResolvedValue(mockPendingJob);
            ir.save.mockResolvedValueOnce({ ...mockPendingJob, status: JobStatus.PROCESSING }) // First save (PROCESSING)
                .mockResolvedValueOnce({ ...mockPendingJob, status: JobStatus.COMPLETED }); // Second save (COMPLETED)

            // Mock Math.random to simulate success (e.g., return value < 0.7)
            jest.spyOn(Math, 'random').mockReturnValue(0.5);

            // Access private method for testing
            await (service as any).simulateAiProcessingWithRetry(jobId);

            // Advance timers past the simulated delay
            await jest.advanceTimersByTimeAsync(6000); // Advance by max possible delay (5000 + 1000)

            expect(ir.findOne).toHaveBeenCalledTimes(1);
            expect(ir.save).toHaveBeenCalledTimes(2); // PROCESSING and COMPLETED status updates
            expect(ir.save).toHaveBeenNthCalledWith(1, expect.objectContaining({ status: JobStatus.PROCESSING }));
            expect(ir.save).toHaveBeenNthCalledWith(2, expect.objectContaining({ status: JobStatus.COMPLETED }));

            jest.spyOn(Math, 'random').mockRestore(); // Restore Math.random
            jest.useRealTimers();
        });

        it('should complete successfully after one retry', async () => {
            jest.useFakeTimers();
            const ir = inferenceRepository!;
            ir.findOne.mockResolvedValue(mockPendingJob);
            ir.save.mockResolvedValue({} as Inference); // Generic mock for save

            // Mock Math.random: fail first (>= 0.7), succeed second (< 0.8)
            jest.spyOn(Math, 'random').mockReturnValueOnce(0.9).mockReturnValueOnce(0.5);

            await (service as any).simulateAiProcessingWithRetry(jobId);

            // Attempt 1: Advance past processing delay + retry delay
            await jest.advanceTimersByTimeAsync(6000 + 1000);
            expect(ir.save).toHaveBeenCalledWith(expect.objectContaining({ status: JobStatus.PROCESSING })); // First PROCESSING save

            // Attempt 2: Advance past processing delay
            await jest.advanceTimersByTimeAsync(6000);
            expect(ir.save).toHaveBeenCalledWith(expect.objectContaining({ status: JobStatus.PROCESSING })); // Second PROCESSING save
            expect(ir.save).toHaveBeenCalledWith(expect.objectContaining({ status: JobStatus.COMPLETED })); // Final COMPLETED save
            expect(ir.save).toHaveBeenCalledTimes(3); // PROCESSING, PROCESSING, COMPLETED

            jest.spyOn(Math, 'random').mockRestore();
            jest.useRealTimers();
        });

        it('should fail after max retries', async () => {
            jest.useFakeTimers();
            const ir = inferenceRepository!;
            ir.findOne.mockResolvedValue(mockPendingJob);
            ir.save.mockResolvedValue({} as Inference);

            // Mock Math.random to always fail
            jest.spyOn(Math, 'random').mockReturnValue(0.9);

            await (service as any).simulateAiProcessingWithRetry(jobId);

            // Advance timers for all retries + delays
            const maxRetries = (service as any).MAX_RETRIES; // Access private constant
            const retryDelay = (service as any).RETRY_DELAY_MS;
            const maxProcessingDelay = 6000;
            for (let i = 0; i < maxRetries; i++) {
                await jest.advanceTimersByTimeAsync(maxProcessingDelay + retryDelay);
            }

            expect(ir.save).toHaveBeenCalledTimes(maxRetries + 1); // PROCESSING x maxRetries + FAILED x 1
            // Check the final save was for FAILED status
            expect(ir.save).toHaveBeenLastCalledWith(expect.objectContaining({ status: JobStatus.FAILED }));

            jest.spyOn(Math, 'random').mockRestore();
            jest.useRealTimers();
        });

        it('should skip processing if job status is already PROCESSING', async () => {
            const ir = inferenceRepository!;
            const mockProcessingJob = { ...mockPendingJob, status: JobStatus.PROCESSING };
            ir.findOne.mockResolvedValue(mockProcessingJob);

            await (service as any).simulateAiProcessingWithRetry(jobId);

            expect(ir.findOne).toHaveBeenCalledTimes(1);
            expect(ir.save).not.toHaveBeenCalled(); // Should not attempt to save status again
        });

        it('should skip processing if job status is already COMPLETED', async () => {
            const ir = inferenceRepository!;
            const mockCompletedJob = { ...mockPendingJob, status: JobStatus.COMPLETED };
            ir.findOne.mockResolvedValue(mockCompletedJob);

            await (service as any).simulateAiProcessingWithRetry(jobId);

            expect(ir.findOne).toHaveBeenCalledTimes(1);
            expect(ir.save).not.toHaveBeenCalled();
        });

        it('should handle DB error during status update and eventually fail', async () => {
            jest.useFakeTimers();
            const ir = inferenceRepository!;
            ir.findOne.mockResolvedValue(mockPendingJob);
            // Simulate save failing on the first attempt (PROCESSING update)
            ir.save.mockRejectedValueOnce(new Error('DB write error'));

            await (service as any).simulateAiProcessingWithRetry(jobId);

            const maxRetries = (service as any).MAX_RETRIES;
            const retryDelay = (service as any).RETRY_DELAY_MS;
            // Advance timers for all retries + delays (assuming failure on each attempt due to error)
            for (let i = 0; i < maxRetries; i++) {
                await jest.advanceTimersByTimeAsync(retryDelay + 100); // Advance past retry delay
            }

            // Check that findOne was called multiple times (for retries)
            expect(ir.findOne).toHaveBeenCalledTimes(maxRetries); // Called before each retry attempt
            // Check the final save attempt was to set status to FAILED
            // Note: Depending on error handling, save might be called less or differently
            // Here, we expect the final attempt to mark as FAILED in DB after max retries due to error
            expect(ir.save).toHaveBeenLastCalledWith(expect.objectContaining({ status: JobStatus.FAILED }));

            jest.useRealTimers();
        });

    });
}); 
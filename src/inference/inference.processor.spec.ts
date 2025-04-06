import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Logger } from '@nestjs/common';
import { Job, JobsOptions } from 'bullmq';
import { InferenceProcessor } from './inference.processor';
import { Inference, JobStatus } from './entities/inference.entity';
import { Upload } from '../upload/entities/upload.entity'; // Needed for mock inference object

// Define a specific mock type for the repository methods used
type SpecificMockRepository<T extends Record<string, any>> = Pick<Repository<T>, 'findOne' | 'save'> & {
    findOne: jest.Mock;
    save: jest.Mock;
};

const createMockRepository = <T extends Record<string, any> = any>(): SpecificMockRepository<T> => ({
    findOne: jest.fn(),
    save: jest.fn(),
});

// Mock BullMQ Job object with opts
const createMockJob = (
    data: any,
    attemptsMade: number = 0,
    opts: Partial<JobsOptions> = {}
): Partial<Job> => {
    return {
        id: `test-job-id-${Date.now()}`,
        name: 'process-inference',
        data: data,
        attemptsMade: attemptsMade,
        opts: {
            attempts: 3,
            // @ts-ignore - Ignoring timeout type issue
            timeout: 10000,
             ...opts
        },
        getState: jest.fn().mockResolvedValue('waiting'),
        updateData: jest.fn().mockResolvedValue(undefined),
    };
};

describe('InferenceProcessor', () => {
    let processor: InferenceProcessor;
    let inferenceRepository: SpecificMockRepository<Inference>;
    let loggerSpy: jest.SpyInstance;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                InferenceProcessor,
                {
                    provide: getRepositoryToken(Inference),
                    useValue: createMockRepository<Inference>(),
                },
                // Logger, // Provide if needed, often default works
            ],
        }).compile();

        processor = module.get<InferenceProcessor>(InferenceProcessor);
        inferenceRepository = module.get<SpecificMockRepository<Inference>>(
            getRepositoryToken(Inference),
        );

        // Spy on logger
        loggerSpy = jest.spyOn((processor as any).logger, 'log').mockImplementation();
        jest.spyOn((processor as any).logger, 'error').mockImplementation();
        jest.spyOn((processor as any).logger, 'warn').mockImplementation();

        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(processor).toBeDefined();
    });

    describe('processInference', () => {
        const inferenceId = 1;
        const mockJobData = { inferenceId };
        const mockJob = createMockJob(mockJobData);
        let mockInferenceEntity: Inference;

        beforeEach(() => {
            // @ts-ignore - Ignoring potential type mismatch for nullable fields like convertedPath
            mockInferenceEntity = {
                id: inferenceId,
                userId: 1,
                upload: { id: 1, fileName: 'test.wav' } as Upload,
                status: JobStatus.QUEUED,
                originalPath: 'waveDeck-uploads/audio/1/test.wav',
                jobQueueId: mockJob.id,
                voiceId: 72,
                pitch: 0,
                convertedPath: null,
                convertedFileSize: null,
                errorMessage: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                processingStartedAt: null,
                processingFinishedAt: null,
            } as Inference;
            jest.spyOn(Math, 'random').mockRestore();
            inferenceRepository.findOne.mockResolvedValue(mockInferenceEntity);
            inferenceRepository.save.mockImplementation(entity => Promise.resolve(entity as Inference));
        });

        it('should process job successfully', async () => {
            jest.spyOn(Math, 'random').mockReturnValue(0.5);
            await processor.processInference(mockJob as Job<{ inferenceId: number }>);

            expect(inferenceRepository.findOne).toHaveBeenCalledWith({ where: { id: inferenceId } });
            expect(inferenceRepository.save).toHaveBeenCalledTimes(2);
            expect(inferenceRepository.save).toHaveBeenNthCalledWith(1, expect.objectContaining({ status: JobStatus.PROCESSING, processingStartedAt: expect.any(Date) }));
            expect(inferenceRepository.save).toHaveBeenNthCalledWith(2, expect.objectContaining({
                status: JobStatus.COMPLETED,
                convertedPath: expect.stringContaining('converted_test.wav'),
                convertedFileSize: expect.any(Number),
                processingFinishedAt: expect.any(Date),
                errorMessage: null,
            }));
            expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('completed successfully'));
        });

        it('should throw error and mark as FAILED if AI simulation fails', async () => {
            jest.spyOn(Math, 'random').mockReturnValue(0.05);
            await expect(processor.processInference(mockJob as Job<{ inferenceId: number }>)).rejects.toThrow('Simulated AI failure');

            expect(inferenceRepository.findOne).toHaveBeenCalledTimes(1);
            expect(inferenceRepository.save).toHaveBeenCalledTimes(2);
            expect(inferenceRepository.save).toHaveBeenNthCalledWith(1, expect.objectContaining({ status: JobStatus.PROCESSING, processingStartedAt: expect.any(Date) }));
            expect(inferenceRepository.save).toHaveBeenNthCalledWith(2, expect.objectContaining({
                status: JobStatus.FAILED,
                errorMessage: 'Simulated AI failure',
                processingFinishedAt: expect.any(Date),
            }));
        });

        it('should not throw error and skip processing if Inference entity not found', async () => {
            inferenceRepository.findOne.mockResolvedValue(null);
            await processor.processInference(mockJob as Job<{ inferenceId: number }>);

            expect(inferenceRepository.findOne).toHaveBeenCalledWith({ where: { id: inferenceId } });
            expect(inferenceRepository.save).not.toHaveBeenCalled();
            expect(loggerSpy).not.toHaveBeenCalledWith(expect.stringContaining('Processing job'));
        });

        it('should throw error if DB save fails during PROCESSING update', async () => {
            const dbError = new Error('DB save failed during PROCESSING update');
            inferenceRepository.save.mockRejectedValueOnce(dbError);
            await expect(processor.processInference(mockJob as Job<{ inferenceId: number }>)).rejects.toThrow(dbError);

            expect(inferenceRepository.findOne).toHaveBeenCalledTimes(1);
            expect(inferenceRepository.save).toHaveBeenCalledTimes(1);
            expect(inferenceRepository.save).toHaveBeenCalledWith(expect.objectContaining({ status: JobStatus.PROCESSING }));
        });

        // TODO: Add tests for retries
        // TODO: Add tests for DB save failures during COMPLETED/FAILED updates
    });
});

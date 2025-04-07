import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Logger } from '@nestjs/common';
import { Job, JobsOptions } from 'bullmq';
import { InferenceProcessor } from './inference.processor';
import { Inference, JobStatus } from './entities/inference.entity';
import { Upload } from '../upload/entities/upload.entity';

// 사용되는 리포지토리 메서드에 대한 구체적인 Mock 타입 정의
type SpecificMockRepository<T extends Record<string, any>> = Pick<Repository<T>, 'findOne' | 'save'> & {
    findOne: jest.Mock;
    save: jest.Mock;
};

const createMockRepository = <T extends Record<string, any> = any>(): SpecificMockRepository<T> => ({
    findOne: jest.fn(),
    save: jest.fn(),
});

// opts를 포함한 BullMQ Job 객체 Mock 생성
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
            // @ts-ignore - timeout 속성이 존재하지 않음
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
            ],
        }).compile();

        processor = module.get<InferenceProcessor>(InferenceProcessor);
        inferenceRepository = module.get<SpecificMockRepository<Inference>>(
            getRepositoryToken(Inference),
        );

        loggerSpy = jest.spyOn((processor as any).logger, 'log').mockImplementation();
        jest.spyOn((processor as any).logger, 'error').mockImplementation();
        jest.spyOn((processor as any).logger, 'warn').mockImplementation();

        jest.clearAllMocks();
    });

    it('정의되어야 함', () => {
        expect(processor).toBeDefined();
    });

    describe('processInference', () => {
        const inferenceId = 1;
        const mockJobData = { inferenceId };
        const mockJob = createMockJob(mockJobData);
        let mockInferenceEntity: Inference;

        beforeEach(() => {
            // @ts-ignore - nullable 필드(예: convertedPath)의 잠재적 타입 불일치 무시
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
            jest.spyOn(Math, 'random').mockRestore(); // 각 테스트 전에 random 복원
            inferenceRepository.findOne.mockResolvedValue(mockInferenceEntity);
            inferenceRepository.save.mockImplementation(entity => Promise.resolve(entity as Inference)); // 저장된 엔티티를 반환하도록 save Mock
        });

        it('작업을 성공적으로 처리해야 함', async () => {
            jest.spyOn(Math, 'random').mockReturnValue(0.5); // 성공 보장 (실패는 > 0.1)
            await processor.processInference(mockJob as Job<{ inferenceId: number }>);

            expect(inferenceRepository.findOne).toHaveBeenCalledWith({ where: { id: inferenceId } });
            expect(inferenceRepository.save).toHaveBeenCalledTimes(2); // PROCESSING 및 COMPLETED
            expect(inferenceRepository.save).toHaveBeenNthCalledWith(1, expect.objectContaining({ status: JobStatus.PROCESSING, processingStartedAt: expect.any(Date) }));
            expect(inferenceRepository.save).toHaveBeenNthCalledWith(2, expect.objectContaining({
                status: JobStatus.COMPLETED,
                convertedPath: expect.stringContaining('converted_test.wav'),
                convertedFileSize: expect.any(Number),
                processingFinishedAt: expect.any(Date),
                errorMessage: null,
            }));
            expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('작업 완료'));
        });

        it('AI 시뮬레이션 실패 시 에러를 던지고 FAILED로 마크해야 함', async () => {
            jest.spyOn(Math, 'random').mockReturnValue(0.05); // 실패 보장 ( < 0.1 )
            await expect(processor.processInference(mockJob as Job<{ inferenceId: number }>)).rejects.toThrow('Simulated AI failure');

            expect(inferenceRepository.findOne).toHaveBeenCalledTimes(1); // 시작 시 한 번만 호출됨
            expect(inferenceRepository.save).toHaveBeenCalledTimes(2); // PROCESSING 및 FAILED
            expect(inferenceRepository.save).toHaveBeenNthCalledWith(1, expect.objectContaining({ status: JobStatus.PROCESSING, processingStartedAt: expect.any(Date) }));
            expect(inferenceRepository.save).toHaveBeenNthCalledWith(2, expect.objectContaining({
                status: JobStatus.FAILED,
                errorMessage: 'Simulated AI failure',
                processingFinishedAt: expect.any(Date),
            }));
        });

        it('Inference 엔티티를 찾을 수 없을 경우 에러 없이 처리를 건너뛰어야 함', async () => {
            inferenceRepository.findOne.mockResolvedValue(null);
            await processor.processInference(mockJob as Job<{ inferenceId: number }>);

            expect(inferenceRepository.findOne).toHaveBeenCalledWith({ where: { id: inferenceId } });
            expect(inferenceRepository.save).not.toHaveBeenCalled();
            expect(loggerSpy).not.toHaveBeenCalledWith(expect.stringContaining('작업 처리 중'));
        });

        it('PROCESSING 업데이트 중 DB 저장 실패 시 에러를 던져야 함', async () => {
            const dbError = new Error('DB save failed during PROCESSING update');
            inferenceRepository.save.mockRejectedValueOnce(dbError);
            await expect(processor.processInference(mockJob as Job<{ inferenceId: number }>)).rejects.toThrow(dbError);

            expect(inferenceRepository.findOne).toHaveBeenCalledTimes(1);
            expect(inferenceRepository.save).toHaveBeenCalledTimes(1);
            expect(inferenceRepository.save).toHaveBeenCalledWith(expect.objectContaining({ status: JobStatus.PROCESSING }));
        });

        // TODO: 재시도 테스트 추가
        // TODO: COMPLETED/FAILED 업데이트 중 DB 저장 실패 테스트 추가
    });
});

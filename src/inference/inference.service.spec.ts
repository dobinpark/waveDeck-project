import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InferenceService } from './inference.service';
import { Inference, JobStatus } from './entities/inference.entity';
import { Upload } from '../upload/entities/upload.entity';
import { InferenceRequestDto } from './dto/inference-request.dto';
import { NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

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

// BullMQ 큐 Mock
const mockInferenceQueue = {
    add: jest.fn(),
    getJob: jest.fn(),
    // 필요 시 다른 큐 메서드 Mock 추가
};

describe('InferenceService', () => {
    let service: InferenceService;
    let inferenceRepository: SpecificMockRepository<Inference>;
    let uploadRepository: SpecificMockRepository<Upload>;
    let inferenceQueue: Queue;

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
                {
                    provide: getQueueToken('inference-queue'),
                    useValue: mockInferenceQueue,
                },
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn((key: string) => {
                            if (key === 'BASE_URL') return 'http://test-base-url';
                            return null;
                        }),
                    },
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
        inferenceQueue = module.get<Queue>(getQueueToken('inference-queue'));

        // 각 테스트 전에 Mock 초기화
        jest.clearAllMocks();
    });

    it('정의되어야 함', () => {
        expect(service).toBeDefined();
    });

    describe('requestTransformation', () => {
        const dto: InferenceRequestDto = { userId: 1, fileId: 1, voiceId: 72, pitch: 0 };
        const mockUpload: Upload = {
            id: 1,
            userId: 1,
            fileName: 'test.wav',
            fileSize: 1024,
            duration: 10,
            filePath: 'path/to/test.wav',
            uploadTime: new Date(),
        } as Upload;

        const mockSavedDbJob = { id: 123, status: JobStatus.PENDING, jobQueueId: null, userId: 1, upload: mockUpload };
        const mockQueueJob = { id: 'inference-123' };

        it('새로운 추론 작업을 생성하고 반환해야 함', async () => {
            uploadRepository.findOne.mockResolvedValue(mockUpload);
            inferenceRepository.create.mockReturnValue(mockSavedDbJob as any);
            inferenceRepository.save.mockResolvedValueOnce(mockSavedDbJob);
            inferenceRepository.save.mockResolvedValueOnce({ ...mockSavedDbJob, status: JobStatus.QUEUED, jobQueueId: mockQueueJob.id });
            mockInferenceQueue.add.mockResolvedValue(mockQueueJob);

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
            expect(inferenceRepository.save).toHaveBeenCalledTimes(2);
            expect(mockInferenceQueue.add).toHaveBeenCalledWith(
                'process-inference',
                { inferenceId: mockSavedDbJob.id },
                expect.objectContaining({ jobId: `inference-${mockSavedDbJob.id}` })
            );
            expect(result).toEqual({
                jobId: mockSavedDbJob.id,
                jobQueueId: mockQueueJob.id,
                statusCheckUrl: `/api/v1/inference/status/${mockSavedDbJob.id}`,
            });
        });

        it('업로드를 찾을 수 없으면 NotFoundException을 던져야 함', async () => {
            uploadRepository.findOne.mockResolvedValue(null);
            await expect(service.requestTransformation(dto)).rejects.toThrow(NotFoundException);
        });

        it('첫 번째 저장 실패 시 InternalServerErrorException을 던져야 함', async () => {
            uploadRepository.findOne.mockResolvedValue(mockUpload);
            inferenceRepository.create.mockReturnValue(mockSavedDbJob as any);
            inferenceRepository.save.mockRejectedValueOnce(new Error('DB 오류'));
            await expect(service.requestTransformation(dto)).rejects.toThrow(InternalServerErrorException);
            expect(mockInferenceQueue.add).not.toHaveBeenCalled();
        });

        it('큐 추가 실패 시 InternalServerErrorException을 던져야 함', async () => {
            uploadRepository.findOne.mockResolvedValue(mockUpload);
            inferenceRepository.create.mockReturnValue(mockSavedDbJob as any);
            inferenceRepository.save.mockResolvedValueOnce(mockSavedDbJob);
            mockInferenceQueue.add.mockRejectedValue(new Error('큐 오류'));
            await expect(service.requestTransformation(dto)).rejects.toThrow(InternalServerErrorException);
        });
    });

    describe('getJobStatus', () => {
        const jobId = 1;
        const userId = 1;
        const mockJobQueueId = `inference-${jobId}`;
        let mockInference: Inference;

        beforeEach(() => {
            // 각 테스트 전 Mock 데이터 초기화
            // @ts-ignore 제거 또는 필요 시 다른 필드에 남김
            mockInference = {
                id: jobId,
                userId: userId,
                jobQueueId: mockJobQueueId,
                status: JobStatus.QUEUED,
                createdAt: new Date('2024-01-01T10:00:00Z'),
                updatedAt: new Date('2024-01-01T10:05:00Z'),
                upload: { id: 1 } as Upload,
                originalPath: 'path/original.wav',
                convertedPath: null,
                errorMessage: null,
                processingStartedAt: null,
                processingFinishedAt: null,
                voiceId: 72,
                pitch: 0,
                convertedFileSize: null,
            } as Inference;
        });

        it('완료된 작업 상태와 결과 URL을 반환해야 함', async () => {
            mockInference.status = JobStatus.COMPLETED;
            mockInference.convertedPath = 'audio/1/converted_1.wav';
            mockInference.convertedFileSize = 12345;
            inferenceRepository.findOne.mockResolvedValue(mockInference);
            mockInferenceQueue.getJob.mockResolvedValue({
                id: mockJobQueueId,
                getState: jest.fn().mockResolvedValue('completed'),
            });

            const result = await service.getJobStatus(jobId, userId);

            expect(inferenceRepository.findOne).toHaveBeenCalledWith({ where: { id: jobId, userId: userId }, relations: ['upload'] });
            expect(mockInferenceQueue.getJob).toHaveBeenCalledWith(mockJobQueueId);
            expect(result).toMatchObject({
                inferenceDbId: jobId,
                jobQueueId: mockJobQueueId,
                status: JobStatus.COMPLETED,
                result: {
                    inferenceId: jobId,
                    previewUrl: `http://test-base-url/audio/1/converted_1.wav`,
                    convertedPath: mockInference.convertedPath,
                    convertedFileSize: mockInference.convertedFileSize,
                },
                errorMessage: null,
            });
            expect(inferenceRepository.save).not.toHaveBeenCalled();
        });

        it('처리 중인 작업 상태를 반환해야 함 (큐 active 기준)', async () => {
            mockInference.status = JobStatus.QUEUED;
            inferenceRepository.findOne.mockResolvedValue(mockInference);
            mockInferenceQueue.getJob.mockResolvedValue({
                id: mockJobQueueId,
                getState: jest.fn().mockResolvedValue('active'),
            });

            const result = await service.getJobStatus(jobId, userId);

            expect(result.status).toBe(JobStatus.PROCESSING);
            expect(result.result).toBeUndefined();
            expect(inferenceRepository.save).toHaveBeenCalledWith(expect.objectContaining({ status: JobStatus.PROCESSING }));
        });

        it('실패한 작업 상태와 오류 메시지를 반환해야 함 (큐 failed 기준)', async () => {
            mockInference.status = JobStatus.PROCESSING;
            inferenceRepository.findOne.mockResolvedValue(mockInference);
            mockInferenceQueue.getJob.mockResolvedValue({
                id: mockJobQueueId,
                getState: jest.fn().mockResolvedValue('failed'),
                failedReason: 'Queue processing error',
            });

            const result = await service.getJobStatus(jobId, userId);

            expect(result.status).toBe(JobStatus.FAILED);
            expect(result.errorMessage).toBe('Queue processing error');
            expect(inferenceRepository.save).toHaveBeenCalledWith(expect.objectContaining({ status: JobStatus.FAILED, errorMessage: 'Queue processing error' }));
        });

        it('DB에만 있고 큐에 없는 작업의 상태를 반환해야 함', async () => {
            mockInference.status = JobStatus.FAILED;
            // @ts-ignore - jobQueueId 타입 오류 무시 (null 할당 허용)
            mockInference.jobQueueId = null;
            inferenceRepository.findOne.mockResolvedValue(mockInference);

            const result = await service.getJobStatus(jobId, userId);

            expect(mockInferenceQueue.getJob).not.toHaveBeenCalled();
            expect(result.status).toBe(JobStatus.FAILED);
            expect(inferenceRepository.save).not.toHaveBeenCalled();
        });

        it('작업을 찾을 수 없으면 NotFoundException을 던져야 함', async () => {
            inferenceRepository.findOne.mockResolvedValue(null);
            await expect(service.getJobStatus(jobId, userId)).rejects.toThrow(NotFoundException);
        });
    });
}); 
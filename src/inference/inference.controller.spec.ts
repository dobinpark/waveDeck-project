import { Test, TestingModule } from '@nestjs/testing';
import { InferenceController } from './inference.controller';
import { InferenceService } from './inference.service';
import { InferenceRequestDto } from './dto/inference-request.dto';
import { HttpStatus } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Inference } from './entities/inference.entity';
import { Upload } from '../upload/entities/upload.entity';
import { JobStatusResponseDto } from './dto/job-status-response.dto';
import { JobStatus } from './entities/inference.entity';

const mockInferenceService = {
    requestTransformation: jest.fn(),
    getJobStatus: jest.fn(),
};

const mockInferenceRepository = {};
const mockUploadRepository = {};

describe('InferenceController', () => {
    let controller: InferenceController;
    let service: InferenceService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [InferenceController],
            providers: [
                {
                    provide: InferenceService,
                    useValue: mockInferenceService,
                },
                //{
                //  provide: getRepositoryToken(Inference),
                //  useValue: mockInferenceRepository,
                //},
                //{
                //  provide: getRepositoryToken(Upload),
                //  useValue: mockUploadRepository,
                //},
            ],
        }).compile();

        controller = module.get<InferenceController>(InferenceController);
        service = module.get<InferenceService>(InferenceService);
        jest.clearAllMocks();
    });

    it('정의되어야 함', () => {
        expect(controller).toBeDefined();
    });

    describe('requestTransformation', () => {
        it('요청을 수락하고 작업 상세 정보를 반환해야 함', async () => {
            const dto: InferenceRequestDto = {
                userId: 1,
                fileId: 10,
                voiceId: 72,
                pitch: 0,
            };
            const expectedServiceResult = { jobId: 123, jobQueueId: 'queue-123', statusCheckUrl: '/api/v1/inference/status/123' };
            const expectedControllerResponse = {
                data: expectedServiceResult,
                message: 'Inference 작업이 수락되어 큐에 등록되었습니다.'
            };

            mockInferenceService.requestTransformation.mockResolvedValue(expectedServiceResult);

            const response = await controller.requestTransformation(dto);

            expect(service.requestTransformation).toHaveBeenCalledWith({ ...dto, userId: dto.userId || 1 });
            expect(response).toEqual(expectedControllerResponse);
        });

        it('서비스에서 발생한 오류를 처리해야 함', async () => {
            const dto: InferenceRequestDto = { userId: 1, fileId: 10, voiceId: 72, pitch: 0 };
            const errorMessage = 'Service 오류';

            mockInferenceService.requestTransformation.mockRejectedValue(new Error(errorMessage));

            await expect(controller.requestTransformation(dto)).rejects.toThrow(errorMessage);
        });
    });

    describe('getJobStatus', () => {
        it('작업 상태를 성공적으로 조회하고 반환해야 함', async () => {
            const jobId = 1;
            const userId = 1;
            const mockStatusResponse: JobStatusResponseDto = {
                jobQueueId: `inference-${jobId}`,
                inferenceDbId: jobId,
                status: JobStatus.COMPLETED,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            mockInferenceService.getJobStatus.mockResolvedValue(mockStatusResponse);

            const response = await controller.getJobStatus(jobId);

            expect(service.getJobStatus).toHaveBeenCalledWith(jobId);
            expect(response).toEqual({
                data: mockStatusResponse,
                message: `작업 ${jobId}의 상태를 성공적으로 조회했습니다.`,
            });
        });

        it('서비스에서 작업 상태 조회 오류를 처리해야 함', async () => {
            const jobId = 1;
            const errorMessage = '상태 조회 오류';
            mockInferenceService.getJobStatus.mockRejectedValue(new Error(errorMessage));

            await expect(controller.getJobStatus(jobId)).rejects.toThrow(errorMessage);
        });
    });
}); 
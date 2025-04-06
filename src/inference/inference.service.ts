import { Injectable, NotFoundException, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { Inference, JobStatus } from './entities/inference.entity';
import { Upload } from '../upload/entities/upload.entity';
import { InferenceRequestDto } from './dto/inference-request.dto';
import { JobStatusResponseDto } from './dto/job-status-response.dto';
import { ConfigService } from '@nestjs/config';

/**
 * AI 음성 변환(추론) 관련 비즈니스 로직을 처리하는 서비스입니다.
 * - 추론 요청 접수 및 큐에 작업 등록
 * - 작업 상태 조회
 */
@Injectable()
export class InferenceService {
    private readonly logger = new Logger(InferenceService.name);
    private readonly baseUrl: string;

    constructor(
        @InjectRepository(Inference)
        private inferenceRepository: Repository<Inference>,
        @InjectRepository(Upload)
        private uploadRepository: Repository<Upload>,
        @InjectQueue('inference-queue') private inferenceQueue: Queue,
        private configService: ConfigService, // ConfigService 주입
    ) {
        this.baseUrl = this.configService.get<string>('BASE_URL') || 'http://localhost:3000'; // 환경 변수에서 BASE_URL 가져오기
    }

    /**
     * 새로운 AI 변환 요청을 처리합니다.
     * 1. 요청된 파일 정보(Upload) 조회
     * 2. 데이터베이스에 새로운 Inference 작업 레코드 생성 (상태: PENDING)
     * 3. BullMQ 큐('inference-queue')에 'process-inference' 작업 추가
     * 4. DB 작업 상태를 QUEUED로 업데이트하고 jobQueueId 저장
     * 5. 생성된 DB 작업 ID, 큐 작업 ID, 상태 조회 URL 반환
     * @param dto InferenceRequestDto - 사용자 ID, 파일 ID, 음성 ID 등 요청 정보
     * @returns 생성된 작업 정보 (DB ID, 큐 ID, 상태 조회 URL)
     * @throws NotFoundException - 요청된 파일 ID가 존재하지 않는 경우
     * @throws InternalServerErrorException - DB 저장 또는 큐 추가 실패 시
     */
    async requestTransformation(dto: InferenceRequestDto): Promise<{ jobId: number; jobQueueId: string; statusCheckUrl: string }> {
        this.logger.log(`Received transformation request: ${JSON.stringify(dto)}`);

        // 1. 원본 파일 조회
        const upload = await this.uploadRepository.findOne({ where: { id: dto.fileId, userId: dto.userId } });
        if (!upload) {
            this.logger.warn(`Upload not found for fileId: ${dto.fileId}, userId: ${dto.userId}`);
            throw new NotFoundException(`File with ID ${dto.fileId} not found or does not belong to user ${dto.userId}`);
        }
        this.logger.log(`Found upload record: ${JSON.stringify(upload)}`);

        // 2. DB에 Inference 작업 생성
        const newDbJob = this.inferenceRepository.create({
            userId: dto.userId,
            upload: upload,
            status: JobStatus.PENDING,
            voiceId: dto.voiceId,
            pitch: dto.pitch,
            originalPath: upload.filePath,
        });

        try {
            const savedDbJob = await this.inferenceRepository.save(newDbJob);
            this.logger.log(`Created new inference DB job with ID: ${savedDbJob.id}`);

            // 3. BullMQ 큐에 작업 추가
            const queueJob = await this.inferenceQueue.add(
                'process-inference', // 처리할 작업 이름
                { inferenceId: savedDbJob.id }, // 프로세서에 전달할 데이터
                {
                    jobId: `inference-${savedDbJob.id}`, // 예측 가능한 Job ID 설정
                    attempts: 3, // 최대 3번 시도
                    // @ts-ignore - timeout is a valid option, maybe type definition issue
                    timeout: 10000, // 각 시도당 타임아웃 10초 (10000ms)
                    backoff: { // 재시도 시 지연 설정 (선택적)
                        type: 'exponential',
                        delay: 1000, // 초기 지연 1초
                    },
                    removeOnComplete: true, // 성공 시 큐에서 자동 제거
                    removeOnFail: false, // 실패 시 큐에 유지 (수동 확인/재처리용)
                }
            );
            this.logger.log(`Added job to inference-queue with Queue Job ID: ${queueJob.id!}`);

            // 4. DB 상태 QUEUED로 업데이트하고 jobQueueId 저장
            savedDbJob.jobQueueId = queueJob.id!; // BullMQ Job ID 저장
            savedDbJob.status = JobStatus.QUEUED;
            await this.inferenceRepository.save(savedDbJob);

            // 5. 결과 반환
            const statusCheckUrl = `/api/v1/inference/status/${savedDbJob.id}`;
            return {
                jobId: savedDbJob.id,
                jobQueueId: queueJob.id!,
                statusCheckUrl: statusCheckUrl,
            };
        } catch (error) {
            this.logger.error(`Failed to save inference job or add to queue: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to initiate inference job');
        }
    }

    /**
     * 특정 사용자의 Inference 작업 상태를 조회하여 상세 정보 DTO로 반환합니다.
     * DB 정보와 BullMQ 큐의 실제 상태를 조합합니다.
     * @param jobId 조회할 작업의 DB ID (Inference.id)
     * @param userId 작업을 요청한 사용자 ID
     * @returns JobStatusResponseDto 형식의 작업 상태 정보
     * @throws NotFoundException - 해당 ID와 사용자 ID로 작업을 찾을 수 없는 경우
     */
    async getJobStatus(jobId: number, userId: number): Promise<JobStatusResponseDto> {
        this.logger.log(`Fetching job status for jobId=${jobId}, userId=${userId}`);

        // 1. DB에서 Inference 정보 조회
        const inference = await this.inferenceRepository.findOne({
            where: { id: jobId, userId: userId },
            relations: ['upload'], // Upload 정보도 함께 로드 (previewUrl 생성에 필요)
        });

        if (!inference) {
            throw new NotFoundException(`Inference job with ID ${jobId} not found for user ${userId}`);
        }

        let queueJob: Job | null = null;
        if (inference.jobQueueId) {
            try {
                queueJob = await this.inferenceQueue.getJob(inference.jobQueueId);
            } catch (error) {
                this.logger.warn(`Could not retrieve job ${inference.jobQueueId} from queue: ${error.message}`);
                // 큐에서 작업을 찾을 수 없어도 DB 상태를 기반으로 응답할 수 있음
            }
        }

        // 2. DB 상태와 큐 상태를 조합하여 최종 상태 결정 및 DTO 생성
        const response = new JobStatusResponseDto();
        response.jobQueueId = inference.jobQueueId;
        response.inferenceDbId = inference.id;
        response.status = inference.status; // 기본적으로 DB 상태 사용
        response.createdAt = inference.createdAt.toISOString();
        response.updatedAt = inference.updatedAt.toISOString();
        response.errorMessage = inference.errorMessage;
        response.processingStartedAt = inference.processingStartedAt?.toISOString() || null;
        response.processingFinishedAt = inference.processingFinishedAt?.toISOString() || null;
        response.queuePosition = null; // 기본값 null

        if (queueJob) {
            const queueStatus = await queueJob.getState();
            this.logger.debug(`Job ${queueJob.id} status in queue: ${queueStatus}`);

            // DB 상태와 큐 상태 동기화 (예: DB는 QUEUED인데 큐는 active)
            if (queueStatus === 'active' && inference.status !== JobStatus.PROCESSING) {
                response.status = JobStatus.PROCESSING;
            } else if (queueStatus === 'completed' && inference.status !== JobStatus.COMPLETED) {
                response.status = JobStatus.COMPLETED;
            } else if (queueStatus === 'failed' && inference.status !== JobStatus.FAILED) {
                response.status = JobStatus.FAILED;
                response.errorMessage = queueJob.failedReason || inference.errorMessage || 'Unknown error';
            } else if (queueStatus === 'waiting' || queueStatus === 'delayed') {
                response.status = JobStatus.QUEUED;
                // 대기열 위치 추정 (정확하지 않을 수 있음)
                // const waitingCount = await this.inferenceQueue.getWaitingCount();
                // response.queuePosition = waitingCount > 0 ? waitingCount : null;
                // BullMQ v5+ 에서는 getWaitingCount() 만으로 특정 job의 위치 파악 어려움
            }

            // 큐 상태가 최종 상태일 경우 DB 업데이트 (선택적)
            if (response.status !== inference.status) {
                this.logger.log(`Updating DB status for job ${inference.id} from ${inference.status} to ${response.status}`);
                inference.status = response.status;
                if (response.status === JobStatus.FAILED) inference.errorMessage = response.errorMessage;
                await this.inferenceRepository.save(inference).catch(err => {
                    this.logger.error(`Failed to update DB status for job ${inference.id}: ${err.message}`);
                });
            }
        }

        // 3. 완료 상태일 경우 결과 및 미리보기 URL 추가
        if (response.status === JobStatus.COMPLETED && inference.convertedPath) {
            // Ensure forward slashes for URL
            const previewUrlPath = `/${inference.convertedPath.replace(/\\/g, '/')}`;
            response.result = {
                inferenceId: inference.id,
                previewUrl: `${this.baseUrl}${previewUrlPath}`,
                convertedPath: inference.convertedPath,
                convertedFileSize: inference.convertedFileSize,
            };
        }

        return response;
    }
}

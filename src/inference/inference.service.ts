import { Injectable, NotFoundException, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job, JobState } from 'bullmq';
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
        this.logger.log(`변환 요청 수신: ${JSON.stringify(dto)}`);

        // 1. 원본 파일 조회
        const upload = await this.uploadRepository.findOne({ where: { id: dto.fileId, userId: dto.userId } });
        if (!upload) {
            this.logger.warn(`업로드 파일을 찾을 수 없음: fileId: ${dto.fileId}, userId: ${dto.userId}`);
            throw new NotFoundException(`파일 ID ${dto.fileId}를 찾을 수 없거나 사용자 ${dto.userId}의 파일이 아닙니다.`);
        }
        this.logger.log(`업로드 레코드 확인: ${JSON.stringify(upload)}`);

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
            this.logger.log(`새로운 Inference DB 작업 생성됨. ID: ${savedDbJob.id}`);

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
            this.logger.log(`작업을 inference-queue에 추가함. 큐 작업 ID: ${queueJob.id!}`);

            // 4. DB 상태 QUEUED로 업데이트하고 jobQueueId 저장
            savedDbJob.jobQueueId = queueJob.id!; // BullMQ Job ID 저장
            savedDbJob.status = JobStatus.QUEUED;
            await this.inferenceRepository.save(savedDbJob);

            // 5. 결과 반환
            const statusCheckUrl = `/api/v1/inference/status/${savedDbJob.id}`; // 상태 조회 엔드포인트 URL
            return {
                jobId: savedDbJob.id,
                jobQueueId: queueJob.id!,
                statusCheckUrl: statusCheckUrl,
            };
        } catch (error) {
            this.logger.error(`Inference 작업 저장 또는 큐 추가 실패: ${error.message}`, error.stack);
            // TODO: DB 작업 생성 후 큐 추가 실패 시 롤백 로직 고려
            throw new InternalServerErrorException('Inference 작업 시작 실패');
        }
    }

    /**
     * 특정 사용자의 Inference 작업 상태를 조회하여 상세 정보 DTO로 반환합니다.
     * DB 정보와 BullMQ 큐의 실제 상태 및 대기열 정보를 조합합니다.
     * @param jobId 조회할 작업의 DB ID (Inference.id)
     * @param userId 작업을 요청한 사용자 ID
     * @returns JobStatusResponseDto 형식의 작업 상태 정보
     * @throws NotFoundException - 해당 ID와 사용자 ID로 작업을 찾을 수 없는 경우
     */
    async getJobStatus(jobId: number, userId: number): Promise<JobStatusResponseDto> {
        this.logger.log(`작업 상태 조회 요청: jobId=${jobId}, userId=${userId}`);

        // 1. DB에서 Inference 정보 조회
        const inference = await this.inferenceRepository.findOne({
            where: { id: jobId, userId: userId },
            relations: ['upload'],
        });

        if (!inference) {
            throw new NotFoundException(`Inference 작업 ID ${jobId}를 사용자 ${userId}에 대해 찾을 수 없습니다.`);
        }

        let queueJob: Job | null = null;
        let queueState: JobState | null = null;
        let waitingCount: number | null = null;

        if (inference.jobQueueId) {
            try {
                queueJob = await this.inferenceQueue.getJob(inference.jobQueueId);
                if (queueJob) {
                    const stateResult = await queueJob.getState(); // 임시 변수에 결과 저장
                    // 'unknown' 상태는 null로 처리, 그 외에는 JobState로 간주
                    queueState = stateResult !== 'unknown' ? stateResult : null; 
                    
                    if (queueState) { // queueState가 null이 아닐 때만 로그 및 추가 작업 수행
                        this.logger.debug(`큐 내 작업 상태: Job ID ${queueJob.id}, 상태: ${queueState}`);
                        // 작업이 대기 중일 때만 대기열 카운트 조회
                        if (queueState === 'waiting' || queueState === 'delayed') {
                            waitingCount = await this.inferenceQueue.getWaitingCount();
                        }
                    }
                }
            } catch (error) {
                this.logger.warn(`큐에서 작업 ${inference.jobQueueId} 조회 실패: ${error.message}`);
            }
        }

        // 2. DB 상태와 큐 상태를 조합하여 최종 상태 결정 및 DTO 생성
        const response = new JobStatusResponseDto();
        response.jobQueueId = inference.jobQueueId;
        response.inferenceDbId = inference.id;
        response.status = inference.status; // 기본 DB 상태
        response.queueState = queueState;   // getState()로 가져온 실제 큐 상태
        response.waitingCount = waitingCount; // 대기 중인 작업 수
        response.createdAt = inference.createdAt.toISOString();
        response.updatedAt = inference.updatedAt.toISOString();
        response.errorMessage = inference.errorMessage;
        response.processingStartedAt = inference.processingStartedAt?.toISOString() || null;
        response.processingFinishedAt = inference.processingFinishedAt?.toISOString() || null;

        if (queueState) {
            // DB 상태와 큐 상태 동기화 로직 (더 명확하게)
            let dbStatusNeedsUpdate = false;
            let updatedStatus = inference.status;
            let updatedErrorMessage: string | null = inference.errorMessage;

            if (queueState === 'active' && inference.status !== JobStatus.PROCESSING) {
                updatedStatus = JobStatus.PROCESSING;
                dbStatusNeedsUpdate = true;
            } else if (queueState === 'completed' && inference.status !== JobStatus.COMPLETED) {
                updatedStatus = JobStatus.COMPLETED;
                updatedErrorMessage = null; // 성공 시 에러 메시지 초기화
                dbStatusNeedsUpdate = true;
            } else if (queueState === 'failed' && inference.status !== JobStatus.FAILED) {
                updatedStatus = JobStatus.FAILED;
                updatedErrorMessage = queueJob?.failedReason ?? inference.errorMessage ?? '알 수 없는 오류';
                dbStatusNeedsUpdate = true;
            } else if ((queueState === 'waiting' || queueState === 'delayed') && 
                       (inference.status === JobStatus.PENDING || inference.status === JobStatus.FAILED || inference.status === JobStatus.PROCESSING)) {
                // PENDING, FAILED, PROCESSING 상태에서 다시 큐에 들어갈 경우 QUEUED로 업데이트
                updatedStatus = JobStatus.QUEUED;
                updatedErrorMessage = null; // 대기 상태이므로 에러 메시지 초기화
                dbStatusNeedsUpdate = true;
            }

            // 응답 상태는 큐 상태 기준으로 업데이트된 상태 반영
            response.status = updatedStatus;
            response.errorMessage = updatedErrorMessage;

            // DB 상태 업데이트 필요 시 저장
            if (dbStatusNeedsUpdate) {
                 this.logger.log(`DB 상태 업데이트: Job ID ${inference.id} (${inference.status} -> ${updatedStatus})`);
                 inference.status = updatedStatus;
                 inference.errorMessage = updatedErrorMessage;
                 // 비동기로 처리하여 응답 지연 방지 (오류는 로그로 남김)
                 this.inferenceRepository.save(inference).catch(err => {
                     this.logger.error(`DB 상태 업데이트 실패: Job ID ${inference.id}, 오류: ${err.message}`);
                 });
             }
        }

        // 3. 완료 상태일 경우 결과 및 미리보기 URL 추가
        if (response.status === JobStatus.COMPLETED && inference.convertedPath) {
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

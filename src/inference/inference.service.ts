import { Injectable, NotFoundException, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Inference, JobStatus } from './entities/inference.entity';
import { Upload } from '../upload/entities/upload.entity';
import { InferenceRequestDto } from './dto/inference-request.dto';

@Injectable()
export class InferenceService {
    private readonly logger = new Logger(InferenceService.name);
    private readonly MAX_RETRIES = 3;
    private readonly RETRY_DELAY_MS = 1000; // 1 second delay

    constructor(
        @InjectRepository(Inference)
        private inferenceRepository: Repository<Inference>,
        @InjectRepository(Upload)
        private uploadRepository: Repository<Upload>,
    ) { }


    // 변환 요청 처리
    async requestTransformation(dto: InferenceRequestDto): Promise<{ jobId: number; previewUrl: string }> {
        this.logger.log(`Received transformation request: ${JSON.stringify(dto)}`);

        const upload = await this.uploadRepository.findOne({ where: { id: dto.fileId, userId: dto.userId } });
        if (!upload) {
            this.logger.warn(`Upload not found for fileId: ${dto.fileId}, userId: ${dto.userId}`);
            throw new NotFoundException(`File with ID ${dto.fileId} not found or does not belong to user ${dto.userId}`);
        }
        this.logger.log(`Found upload record: ${JSON.stringify(upload)}`);

        const newJob = this.inferenceRepository.create({
            userId: dto.userId,
            upload: upload,
            status: JobStatus.PENDING,
            voiceId: dto.voiceId,
            pitch: dto.pitch,
            originalPath: upload.filePath,
        });

        try {
            const savedJob = await this.inferenceRepository.save(newJob);
            this.logger.log(`Created new inference job with ID: ${savedJob.id}`);

            this.simulateAiProcessingWithRetry(savedJob.id);

            const previewUrl = `https://example.com/preview/${savedJob.id}`;
            return {
                jobId: savedJob.id,
                previewUrl: previewUrl,
            };
        } catch (error) {
            this.logger.error(`Failed to save inference job: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to create inference job');
        }
    }


    // 재시도를 포함한 AI 처리 시뮬레이션
    private async simulateAiProcessingWithRetry(jobId: number): Promise<void> {
        this.logger.log(`Starting AI simulation with retry for job ID: ${jobId}`);
        let retries = 0;

        while (retries < this.MAX_RETRIES) {
            try {
                const job = await this.inferenceRepository.findOne({ where: { id: jobId } });
                if (!job) {
                    this.logger.error(`Job not found during simulation for ID: ${jobId}`);
                    return; // Job이 없으면 재시도 의미 없음
                }

                // 이미 처리 중이거나 완료/실패된 작업은 재시도하지 않음
                if ([JobStatus.PROCESSING, JobStatus.COMPLETED, JobStatus.FAILED].includes(job.status)) {
                     this.logger.log(`Job ${jobId} is already in status ${job.status}. Skipping simulation.`);
                     return;
                }

                job.status = JobStatus.PROCESSING;
                await this.inferenceRepository.save(job);
                this.logger.log(`Job ${jobId} status updated to PROCESSING (Attempt ${retries + 1})`);

                // 실제 AI 호출 시뮬레이션 (예: 네트워크 지연 + 처리 시간)
                const delay = Math.random() * 5000 + 1000; // 1~6초 지연
                await new Promise(resolve => setTimeout(resolve, delay));

                // AI 처리 성공/실패 시뮬레이션 (재시도할수록 성공 확률 약간 높임)
                const successRate = 0.7 + (retries * 0.1); // 70% ~ 90% 성공률
                const isSuccess = Math.random() < successRate;

                if (isSuccess) {
                    job.status = JobStatus.COMPLETED;
                    job.convertedPath = `/converted/mock_${job.upload.fileName}`;
                    job.convertedFileSize = Math.floor(Math.random() * 1000000) + 50000;
                    await this.inferenceRepository.save(job);
                    this.logger.log(`AI simulation completed successfully for job ID: ${jobId} on attempt ${retries + 1}`);
                    return; // 성공 시 종료
                } else {
                    // 실패 시 다음 재시도 준비
                    this.logger.warn(`AI simulation failed for job ID: ${jobId} on attempt ${retries + 1}`);
                    retries++;
                    if (retries < this.MAX_RETRIES) {
                        this.logger.log(`Retrying job ${jobId} in ${this.RETRY_DELAY_MS / 1000} seconds...`);
                        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS));
                    }
                }
            } catch (error) {
                 // DB 업데이트 실패 등 예기치 못한 오류 발생 시
                 this.logger.error(`Error during AI simulation attempt ${retries + 1} for job ${jobId}: ${error.message}`, error.stack);
                 retries++; // 오류 발생 시에도 재시도 횟수 증가
                 if (retries < this.MAX_RETRIES) {
                     await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS));
                 }
            }
        }

        // 최대 재시도 횟수 초과 시 최종 실패 처리
        if (retries === this.MAX_RETRIES) {
            this.logger.error(`AI simulation permanently failed for job ID: ${jobId} after ${this.MAX_RETRIES} attempts.`);
            const job = await this.inferenceRepository.findOne({ where: { id: jobId } });
            if (job && job.status !== JobStatus.COMPLETED) { // 이미 다른 경로로 성공 처리된 경우 제외
                job.status = JobStatus.FAILED;
                try {
                    await this.inferenceRepository.save(job);
                    this.logger.log(`Job ${jobId} final status updated to FAILED`);
                } catch (dbError) {
                    this.logger.error(`Failed to update final job status to FAILED for ID: ${jobId}: ${dbError.message}`, dbError.stack);
                }
            }
        }
    }
}

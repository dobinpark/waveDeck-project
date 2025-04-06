import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Logger } from '@nestjs/common';
import { Inference, JobStatus } from './entities/inference.entity';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * 'inference-queue' 큐의 작업을 처리하는 프로세서입니다.
 * NestJS 워커 호스트로 실행됩니다.
 */
@Processor('inference-queue')
export class InferenceProcessor {
    private readonly logger = new Logger(InferenceProcessor.name);

    constructor(
        @InjectRepository(Inference)
        private inferenceRepository: Repository<Inference>,
        // Inject other services if needed for AI processing (e.g., HttpService)
    ) {
        // super(); call removed
    }

    /**
     * 'process-inference' 이름의 작업을 처리합니다.
     * 이 메서드는 AI 모델 추론 과정을 시뮬레이션합니다.
     * @param job 처리할 작업 객체. job.data에 { inferenceId } 포함
     */
    async processInference(job: Job<{ inferenceId: number }>): Promise<void> {
        const { inferenceId } = job.data;
        this.logger.log(`Processing job ${job.id} (DB ID: ${inferenceId}), attempt ${job.attemptsMade + 1}/${job.opts.attempts || 1}`);

        const inference = await this.inferenceRepository.findOne({ where: { id: inferenceId } });
        if (!inference) {
            this.logger.error(`Inference record not found for ID: ${inferenceId}. Skipping job ${job.id}.`);
            // 더 이상 처리할 수 없으므로 오류를 발생시키지 않고 종료 (재시도 방지)
            return;
        }

        // 상태를 PROCESSING으로 업데이트 및 시작 시간 기록
        inference.status = JobStatus.PROCESSING;
        inference.processingStartedAt = new Date();
        await this.inferenceRepository.save(inference);

        try {
            // 1. 랜덤 지연 시간 시뮬레이션 (1~5초)
            const delay = Math.random() * 4000 + 1000; // 1000ms to 5000ms
            this.logger.log(`Simulating AI processing for job ${job.id} (DB ID: ${inferenceId}) with delay: ${delay.toFixed(0)}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));

            // 2. 랜덤 실패 시뮬레이션 (10% 확률)
            if (Math.random() < 0.1) { // 10% chance to fail
                this.logger.warn(`Simulating AI failure for job ${job.id} (DB ID: ${inferenceId})`);
                throw new Error('Simulated AI failure');
            }

            // 3. 성공 시나리오: 결과 파일 경로 및 크기 생성 (Mock)
            // 실제로는 AI 서버 응답을 받아 처리해야 함
            const originalFileName = path.basename(inference.originalPath);
            const convertedFileName = `converted_${originalFileName}`;
            const convertedPath = path.join(path.dirname(inference.originalPath), convertedFileName);
            const convertedFileSize = Math.floor(Math.random() * 500000) + 100000; // 100KB ~ 600KB

            // (Optional) 실제 파일 생성 시뮬레이션 (필요한 경우)
            // const dummyContent = Buffer.alloc(convertedFileSize);
            // await fs.writeFile(convertedPath, dummyContent);
            // this.logger.log(`Created dummy converted file: ${convertedPath}`);

            // 4. DB 업데이트 (성공)
            inference.status = JobStatus.COMPLETED;
            inference.convertedPath = convertedPath;
            inference.convertedFileSize = convertedFileSize;
            inference.processingFinishedAt = new Date();
            inference.errorMessage = ''; // 이전 오류 메시지 제거
            await this.inferenceRepository.save(inference);
            this.logger.log(`Job ${job.id} (DB ID: ${inferenceId}) completed successfully.`);

        } catch (error) {
            // 5. DB 업데이트 (실패)
            this.logger.error(`Job ${job.id} (DB ID: ${inferenceId}) failed: ${error.message}`);
            inference.status = JobStatus.FAILED;
            inference.errorMessage = error.message;
            inference.processingFinishedAt = new Date();
            await this.inferenceRepository.save(inference);

            // 에러를 다시 던져 BullMQ가 재시도 또는 실패 처리하도록 함
            throw error;
        }
    }

    // Remove event listener methods or comment them out
    /*
    @OnQueueFailed()
    onFailed(job: Job, err: Error) {
        this.logger.warn(`Job ${job.id} (Inference ID: ${job.data.inferenceId}) failed after ${job.attemptsMade} attempts: ${err.message}`, err.stack);
        // 실패 알림 등 추가 로직 구현 가능
    }
    */

    /*
    @OnQueueCompleted()
    onCompleted(job: Job, result: any) {
        this.logger.log(`Job ${job.id} (Inference ID: ${job.data.inferenceId}) completed successfully with result: ${JSON.stringify(result)}`);
        // 완료 후처리 로직 구현 가능 (예: 사용자 알림)
    }
    */

    // Optional: Add listeners for queue events (e.g., completed, failed)
    // @OnQueueActive()
    // onActive(job: Job) { ... }
}

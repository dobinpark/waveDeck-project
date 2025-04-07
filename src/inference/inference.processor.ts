import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Logger } from '@nestjs/common';
import { Inference, JobStatus } from './entities/inference.entity';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * 'inference-queue' 큐의 작업을 처리하는 프로세서
 * NestJS 워커 호스트로 실행됩니다.
 */
@Processor('inference-queue')
export class InferenceProcessor {
    private readonly logger = new Logger(InferenceProcessor.name);

    constructor(
        @InjectRepository(Inference)
        private inferenceRepository: Repository<Inference>,
    ) {
    }

    /**
     * 'process-inference' 이름의 작업을 처리합니다.
     * 이 메서드는 AI 모델 추론 과정을 시뮬레이션합니다.
     * @param job 처리할 작업 객체. job.data에 { inferenceId } 포함
     */
    async processInference(job: Job<{ inferenceId: number }>): Promise<void> {
        const { inferenceId } = job.data;
        this.logger.log(`작업 처리 중: Job ID ${job.id} (DB ID: ${inferenceId}), 시도 ${job.attemptsMade + 1}/${job.opts.attempts || 1}`);

        const inference = await this.inferenceRepository.findOne({ where: { id: inferenceId } });
        if (!inference) {
            this.logger.error(`Inference 레코드를 찾을 수 없음: ID ${inferenceId}. 작업 건너뜀: Job ID ${job.id}.`);
            return;
        }

        // 상태를 PROCESSING으로 업데이트 및 시작 시간 기록
        inference.status = JobStatus.PROCESSING;
        inference.processingStartedAt = new Date();
        await this.inferenceRepository.save(inference);

        try {
            // 1. 랜덤 지연 시간 시뮬레이션 (1~5초)
            const delay = Math.random() * 4000 + 1000; // 1000ms to 5000ms
            this.logger.log(`AI 처리 시뮬레이션 중: Job ID ${job.id} (DB ID: ${inferenceId}), 지연 시간: ${delay.toFixed(0)}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));

            // 2. 랜덤 실패 시뮬레이션 (10% 확률)
            if (Math.random() < 0.1) { // 10% chance to fail
                this.logger.warn(`AI 실패 시뮬레이션: Job ID ${job.id} (DB ID: ${inferenceId})`);
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
            // @ts-ignore - Ignoring potential type mismatch for nullable errorMessage
            inference.errorMessage = null; // 이전 오류 메시지 제거
            await this.inferenceRepository.save(inference);
            this.logger.log(`작업 완료: Job ID ${job.id} (DB ID: ${inferenceId})`);

        } catch (error) {
            // 5. DB 업데이트 (실패)
            this.logger.error(`작업 실패: Job ID ${job.id} (DB ID: ${inferenceId}), 오류: ${error.message}`);
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

import { ApiProperty } from '@nestjs/swagger';
import { JobStatus } from '../entities/inference.entity';
import { JobState } from 'bullmq';

class InferenceResultDto {

    // DB에 저장된 Inference 작업 ID
    @ApiProperty({ description: 'DB에 저장된 Inference 작업 ID' })
    inferenceId: number;

    // 변환된 파일 미리보기 URL
    @ApiProperty({ description: '변환된 파일 미리보기 URL', nullable: true })
    previewUrl?: string;

    // 변환된 파일 경로
    @ApiProperty({ description: '변환된 파일 경로', nullable: true })
    convertedPath?: string;

    // 변환된 파일 크기 (bytes)
    @ApiProperty({ description: '변환된 파일 크기 (bytes)', nullable: true })
    convertedFileSize?: number;
}

export class JobStatusResponseDto {

    @ApiProperty({ description: 'BullMQ Job ID', nullable: true })
    jobQueueId: string | null;

    @ApiProperty({ description: 'DB Inference ID' })
    inferenceDbId: number;

    @ApiProperty({ enum: JobStatus, description: '작업 상태 (DB 기준)' })
    status: JobStatus;

    @ApiProperty({ type: InferenceResultDto, description: '작업 결과 (완료 시)', nullable: true })
    result?: InferenceResultDto | null;

    @ApiProperty({ description: 'BullMQ 큐 상태 (큐에 있는 경우)', nullable: true, type: String })
    queueState?: JobState | null;

    @ApiProperty({ description: '현재 대기 중인 작업 수 (해당 작업이 대기 중일 때)', nullable: true })
    waitingCount?: number | null;

    @ApiProperty({ description: '작업 생성 시간 (ISO 8601)' })
    createdAt: string; // ISO 8601 형식

    @ApiProperty({ description: '마지막 업데이트 시간 (ISO 8601)' })
    updatedAt: string; // ISO 8601 형식

    @ApiProperty({ description: '실패 메시지 (실패 시)', nullable: true })
    errorMessage?: string | null;

    @ApiProperty({ description: '작업 처리 시작 시간 (ISO 8601)', nullable: true })
    processingStartedAt?: string | null;

    @ApiProperty({ description: '작업 처리 완료 시간 (ISO 8601)', nullable: true })
    processingFinishedAt?: string | null;
}

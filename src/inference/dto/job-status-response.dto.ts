import { ApiProperty } from '@nestjs/swagger';
import { JobStatus } from '../entities/inference.entity';

class InferenceResultDto {
    @ApiProperty({ description: 'DB에 저장된 Inference 작업 ID' })
    inferenceId: number;

    @ApiProperty({ description: '변환된 파일 미리보기 URL', nullable: true })
    previewUrl?: string;

    @ApiProperty({ description: '변환된 파일 경로', nullable: true })
    convertedPath?: string;

    @ApiProperty({ description: '변환된 파일 크기 (bytes)', nullable: true })
    convertedFileSize?: number;
}

export class JobStatusResponseDto {
    @ApiProperty({ description: 'BullMQ Job ID' })
    jobQueueId: string;

    @ApiProperty({ description: 'DB Inference ID' })
    inferenceDbId: number;

    @ApiProperty({ enum: JobStatus, description: '작업 상태' })
    status: JobStatus;

    @ApiProperty({ type: InferenceResultDto, description: '작업 결과 (완료 시)', nullable: true })
    result?: InferenceResultDto | null;

    @ApiProperty({ description: '대기열 내 위치 (알 수 없는 경우 null)', nullable: true })
    queuePosition?: number | null;

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
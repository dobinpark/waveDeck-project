import { Upload } from '../../upload/entities/upload.entity';
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, Index, JoinColumn } from 'typeorm';

export enum JobStatus {
    PENDING = 'pending',
    QUEUED = 'queued',
    PROCESSING = 'processing',
    COMPLETED = 'completed',
    FAILED = 'failed',
}

@Entity('inference')
export class Inference {

    // 변환 작업 고유 ID
    @PrimaryGeneratedColumn()
    id: number;

    // 변환 작업 소유자 ID
    @Index()
    @Column()
    userId: number;

    // 변환 작업 업로드 파일
    @Index()
    @ManyToOne(() => Upload, { 
        eager: true,
        onDelete: 'SET NULL',
        nullable: true
    })
    upload: Upload | null;

    // 변환 작업 상태
    @Column({
        type: 'enum',
        enum: JobStatus,
        default: JobStatus.PENDING,
    })
    status: JobStatus;

    // 변환 작업 음성 ID
    @Column()
    voiceId: number;

    // 변환 작업 피치
    @Column({ type: 'int', default: 0 })
    pitch: number;

    // 변환 작업 원본 경로
    @Column({ nullable: true })
    originalPath: string;

    // 변환 작업 변환 경로
    @Column({ nullable: true })
    convertedPath?: string;

    // 변환 작업 변환 파일 크기
    @Column({ type: 'bigint', nullable: true })
    convertedFileSize?: number;

    // 변환 작업 생성 시간
    @CreateDateColumn()
    createdAt: Date;

    // 변환 작업 수정 시간
    @UpdateDateColumn()
    updatedAt: Date;

    @Column({ nullable: true })
    jobQueueId: string; // BullMQ Job ID

    @Column({ type: 'text', nullable: true })
    errorMessage: string | null;

    // Optional: 작업 시작/종료 시간
    @Column({ type: 'timestamp', nullable: true })
    processingStartedAt: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    processingFinishedAt: Date | null;
}

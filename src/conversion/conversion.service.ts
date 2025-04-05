import { Injectable, NotFoundException, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversion, JobStatus } from './entities/conversion.entity';
import { Upload } from '../upload/entities/upload.entity';
import { ConversionRequestDto } from './dto/conversion-request.dto';

@Injectable()
export class ConversionService {
    private readonly logger = new Logger(ConversionService.name);

    constructor(
        @InjectRepository(Conversion)
        private conversionRepository: Repository<Conversion>,
        @InjectRepository(Upload)
        private uploadRepository: Repository<Upload>,
    ) { }


    // 변환 요청 처리
    async requestTransformation(dto: ConversionRequestDto): Promise<{ jobId: number; previewUrl: string }> {
        this.logger.log(`Received transformation request: ${JSON.stringify(dto)}`);

        const upload = await this.uploadRepository.findOne({ where: { id: dto.fileId, userId: dto.userId } });
        if (!upload) {
            this.logger.warn(`Upload not found for fileId: ${dto.fileId}, userId: ${dto.userId}`);
            throw new NotFoundException(`File with ID ${dto.fileId} not found or does not belong to user ${dto.userId}`);
        }
        this.logger.log(`Found upload record: ${JSON.stringify(upload)}`);

        const newJob = this.conversionRepository.create({
            userId: dto.userId,
            upload: upload,
            status: JobStatus.PENDING,
            voiceId: dto.voiceId,
            pitch: dto.pitch,
            originalPath: upload.filePath,
        });

        try {
            const savedJob = await this.conversionRepository.save(newJob);
            this.logger.log(`Created new conversion job with ID: ${savedJob.id}`);

            this.simulateAiProcessing(savedJob.id);

            const previewUrl = `https://example.com/preview/${savedJob.id}`;
            return {
                jobId: savedJob.id,
                previewUrl: previewUrl,
            };
        } catch (error) {
            this.logger.error(`Failed to save conversion job: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to create conversion job');
        }
    }


    // AI 처리 시뮬레이션
    private async simulateAiProcessing(jobId: number): Promise<void> {
        this.logger.log(`Starting AI simulation for job ID: ${jobId}`);
        const job = await this.conversionRepository.findOne({ where: { id: jobId } });

        if (!job) {
            this.logger.error(`Job not found during simulation for ID: ${jobId}`);
            return;
        }

        job.status = JobStatus.PROCESSING;
        await this.conversionRepository.save(job);
        this.logger.log(`Job ${jobId} status updated to PROCESSING`);

        const delay = Math.random() * 10000 + 5000;
        await new Promise(resolve => setTimeout(resolve, delay));

        const isSuccess = Math.random() > 0.2;

        if (isSuccess) {
            job.status = JobStatus.COMPLETED;
            job.convertedPath = `/converted/mock_${job.upload.fileName}`;
            job.convertedFileSize = Math.floor(Math.random() * 1000000) + 50000;
            this.logger.log(`AI simulation completed successfully for job ID: ${jobId}`);
        } else {
            job.status = JobStatus.FAILED;
            this.logger.warn(`AI simulation failed for job ID: ${jobId}`);
        }

        try {
            await this.conversionRepository.save(job);
            this.logger.log(`Job ${jobId} final status updated to ${job.status}`);
        } catch (error) {
            this.logger.error(`Failed to update job status after simulation for ID: ${jobId}: ${error.message}`, error.stack);
        }
    }
}

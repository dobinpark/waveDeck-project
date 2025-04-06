import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { InferenceController } from './inference.controller';
import { InferenceService } from './inference.service';
import { Inference } from './entities/inference.entity';
import { Upload } from '../upload/entities/upload.entity';
import { InferenceProcessor } from './inference.processor';

@Module({
    imports: [
        TypeOrmModule.forFeature([Inference, Upload]),
        BullModule.registerQueue({
            name: 'inference-queue',
            defaultJobOptions: {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 5000,
                },
                removeOnComplete: true,
                removeOnFail: false,
            },
        }),
    ],
    controllers: [InferenceController],
    providers: [InferenceService, InferenceProcessor],
})
export class InferenceModule { }

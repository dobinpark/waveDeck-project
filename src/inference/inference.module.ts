import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InferenceController } from './inference.controller';
import { InferenceService } from './inference.service';
import { Inference } from './entities/inference.entity';
import { Upload } from '../upload/entities/upload.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([Inference, Upload]),
    ],
    controllers: [InferenceController],
    providers: [InferenceService],
})
export class InferenceModule { }

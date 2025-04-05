import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { Upload } from './entities/upload.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Upload])],
    controllers: [UploadController],
    providers: [UploadService],
})
export class UploadModule { }

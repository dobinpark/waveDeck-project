import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UploadModule } from './upload/upload.module';
import { Upload } from './upload/entities/upload.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([Upload]),
        UploadModule,
    ],
})
export class CommonModule { }

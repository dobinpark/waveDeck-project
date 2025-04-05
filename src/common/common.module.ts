import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UploadModule } from '../upload/upload.module';
import { Upload } from '../upload/entities/upload.entity';
import { ConversionModule } from '../conversion/conversion.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Upload]),
        UploadModule,
        ConversionModule,
    ],
})
export class CommonModule { }

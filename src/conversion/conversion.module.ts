import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversionController } from './conversion.controller';
import { ConversionService } from './conversion.service';
import { Conversion } from './entities/conversion.entity';
import { Upload } from '../upload/entities/upload.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([Conversion, Upload]),
    ],
    controllers: [ConversionController],
    providers: [ConversionService],
})
export class ConversionModule { }

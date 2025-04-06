import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UploadModule } from '../upload/upload.module';
import { Upload } from '../upload/entities/upload.entity';
import { InferenceModule } from '../inference/inference.module';
import { validationSchema } from './config/validationSchema';
import { ConfigModule } from '@nestjs/config';
import { SeedService } from './seed/seed.service';

@Global()
@Module({
    imports: [
        TypeOrmModule.forFeature([Upload]),
        UploadModule,
        InferenceModule,
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: '.env',
            validationSchema,
        }),
    ],
    providers: [SeedService],
    exports: [SeedService],
})
export class CommonModule { }

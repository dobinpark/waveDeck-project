import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Upload } from '../../upload/entities/upload.entity';
// Import other entities you might want to seed

@Injectable()
export class SeedService implements OnModuleInit {
    private readonly logger = new Logger(SeedService.name);

    constructor(
        @InjectRepository(Upload)
        private readonly uploadRepository: Repository<Upload>,
        // Inject other repositories as needed
    ) {}

    async onModuleInit() {
        // Run seeding only in development environment
        if (process.env.NODE_ENV === 'development') {
            this.logger.log('Starting database seeding...');
            await this.seedUploads();
            // Call other seeding methods here
            this.logger.log('Database seeding finished.');
        }
    }

    private async seedUploads() {
        const count = await this.uploadRepository.count();
        if (count === 0) {
            this.logger.log('Seeding Uploads...');
            // Create sample upload data (adjust as needed)
            await this.uploadRepository.save([
                {
                    userId: 1,
                    type: 'audio',
                    fileName: 'sample1.wav',
                    fileSize: 102400,
                    duration: 30000,
                    filePreviewUrl: '/waveDeck-uploads/audio/1/sample1.wav',
                    filePath: 'path/to/sample1.wav',
                    // uploadTime is handled by @CreateDateColumn
                },
                {
                    userId: 2,
                    type: 'audio',
                    fileName: 'sample2.mp3',
                    fileSize: 204800,
                    duration: 60000,
                    filePreviewUrl: '/waveDeck-uploads/audio/2/sample2.mp3',
                    filePath: 'path/to/sample2.mp3',
                },
            ]);
            this.logger.log('Uploads seeded.');
        } else {
            this.logger.log('Uploads table is not empty, skipping seeding.');
        }
    }

    // Add other seed methods (e.g., seedInferences, seedUsers) if needed
} 
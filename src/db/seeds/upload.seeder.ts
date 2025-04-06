import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { DataSource } from 'typeorm';
import { Upload } from '../../upload/entities/upload.entity';

export class UploadSeeder implements Seeder {
    public async run(
        dataSource: DataSource,
        factoryManager: SeederFactoryManager
    ): Promise<any> {
        const repository = dataSource.getRepository(Upload);

        const uploadsData = [
            {
                userId: 1,
                fileName: 'sample_audio_1.wav',
                filePath: 'waveDeck-uploads/audio/1/1.wav', // Example path
                fileSize: 1024 * 512, // 512 KB
                mimeType: 'audio/wav',
                duration: 30500, // 30.5 seconds
            },
            {
                userId: 1,
                fileName: 'short_speech.mp3',
                filePath: 'waveDeck-uploads/audio/1/2.mp3', // Example path
                fileSize: 1024 * 256, // 256 KB
                mimeType: 'audio/mpeg',
                duration: 15200, // 15.2 seconds
            },
            {
                userId: 1, // Another user or same user
                fileName: 'long_podcast_segment.mp3',
                filePath: 'waveDeck-uploads/audio/1/3.mp3',
                fileSize: 1024 * 1024 * 2, // 2 MB
                mimeType: 'audio/mpeg',
                duration: 180000, // 3 minutes
            },
        ];

        // Check if data already exists to prevent duplicates
        for (const data of uploadsData) {
            const existing = await repository.findOne({ where: { filePath: data.filePath } });
            if (!existing) {
                const upload = repository.create(data);
                await repository.save(upload);
                console.log(`Seeded Upload: ${upload.fileName}`);
            } else {
                console.log(`Skipping existing Upload: ${data.fileName}`);
            }
        }
    }
} 
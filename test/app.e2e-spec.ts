import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Upload } from '../src/upload/entities/upload.entity';
import { Inference, JobStatus } from '../src/inference/entities/inference.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';

// Helper function for polling status
const pollJobStatus = async (
    app: INestApplication,
    statusUrl: string,
    userId: number,
    timeoutMs: number = 30000, // Default timeout 30s
    intervalMs: number = 1000, // Poll every 1s
): Promise<Inference> => {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
const response = await request(app.getHttpServer()).get(statusUrl).query({ userId });
        if (response.status !== HttpStatus.OK) {
            throw new Error(`Status check failed with status ${response.status}: ${JSON.stringify(response.body)}`);
        }
        const job = response.body.data as Inference;
        if (job.status === JobStatus.COMPLETED || job.status === JobStatus.FAILED) {
            return job;
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    throw new Error(`Job status polling timed out after ${timeoutMs}ms`);
};

describe('AppController (e2e)', () => {
    let app: INestApplication;
    let dataSource: DataSource;
    let uploadRepository: Repository<Upload>;
    let inferenceRepository: Repository<Inference>;
    const testUserId = 999; // Use a specific user ID for tests
    const testFilePath = path.join(__dirname, 'fixtures', 'test.wav');

    beforeAll(async () => {
        // Create dummy fixture file if it doesn't exist
        const fixtureDir = path.dirname(testFilePath);
        if (!fs.existsSync(fixtureDir)) {
            fs.mkdirSync(fixtureDir, { recursive: true });
        }
        if (!fs.existsSync(testFilePath)) {
            fs.writeFileSync(testFilePath, 'dummy wave data');
        }

        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        })
        // Override TypeORM options for testing (use test DB, synchronize)
        .overrideModule(TypeOrmModule)
        .useModule(TypeOrmModule.forRootAsync({
            useFactory: () => ({
                type: 'mysql',
                host: process.env.DB_HOST || 'localhost', // Use localhost for docker service
                port: parseInt(process.env.DB_PORT || '3306'),
                username: process.env.DB_USERNAME || 'nestjs_user',
                password: process.env.DB_PASSWORD || 'nestjs_password',
                database: process.env.DB_DATABASE_TEST || 'wavedeck_test', // Separate test DB
                entities: [Upload, Inference],
                synchronize: true, // Easier for E2E, drops and recreates schema (USE WITH CAUTION)
                logging: false, // Disable logging for cleaner test output
            }),
        }))
        .compile();

        app = moduleFixture.createNestApplication();
        // Apply the same global prefix and validation pipe as in main.ts
        app.setGlobalPrefix('api/v1');
        app.useGlobalPipes(new ValidationPipe({
             transform: true,
             whitelist: true,
             forbidNonWhitelisted: true,
             stopAtFirstError: true, // Match app config
        }));

        await app.init();

        // Get services for cleanup
        dataSource = moduleFixture.get<DataSource>(DataSource);
        uploadRepository = moduleFixture.get<Repository<Upload>>(getRepositoryToken(Upload));
        inferenceRepository = moduleFixture.get<Repository<Inference>>(getRepositoryToken(Inference));
    });

    // Clean database before each test
    beforeEach(async () => {
        await inferenceRepository.query(`SET FOREIGN_KEY_CHECKS = 0;`);
        await inferenceRepository.clear();
        await uploadRepository.clear();
        await inferenceRepository.query(`SET FOREIGN_KEY_CHECKS = 1;`);
    });

    afterAll(async () => {
        await dataSource.destroy(); // Close DB connection
        await app.close();
        // Clean up fixture file
        // if (fs.existsSync(testFilePath)) {
        //     fs.unlinkSync(testFilePath);
        // }
    });

    it('should run the full workflow: upload -> request inference -> check status -> delete', async () => {
        // 1. Upload file
        let fileId: number;
        let statusCheckUrl: string;

        const uploadResponse = await request(app.getHttpServer())
            .post('/api/v1/common/upload/audio')
            .attach('file', testFilePath)
            .field('userId', testUserId)
            .field('fileName', 'test.wav')
            .field('fileSize', 100)
            .field('type', 'upload');

        expect(uploadResponse.status).toBe(HttpStatus.CREATED);
        expect(uploadResponse.body.data.data.fileId).toBeDefined();
        expect(uploadResponse.body.data.data.filePreviewUrl).toBeDefined();
        fileId = uploadResponse.body.data.data.fileId;

        // 2. Request Inference
        const inferenceResponse = await request(app.getHttpServer())
            .post('/api/v1/inference/sts')
            .send({
                userId: testUserId,
                fileId: fileId,
                voiceId: 1,
                pitch: 0,
            });

        expect(inferenceResponse.status).toBe(HttpStatus.ACCEPTED);
        expect(inferenceResponse.body.data.jobId).toBeDefined();
        expect(inferenceResponse.body.data.jobQueueId).toBeDefined();
        expect(inferenceResponse.body.data.statusCheckUrl).toBeDefined();
        statusCheckUrl = inferenceResponse.body.data.statusCheckUrl;
        const dbJobId = inferenceResponse.body.data.jobId;

        // 3. Poll Job Status
        // Increase timeout if AI simulation takes longer
        const finalJobStatus = await pollJobStatus(app, statusCheckUrl, testUserId, 20000, 1000);

        expect(finalJobStatus.id).toBe(dbJobId);
        expect(finalJobStatus.status).toBe(JobStatus.COMPLETED); // Or FAILED if mock often fails
        expect(finalJobStatus.convertedPath).toBeDefined();

        // 4. Delete Uploaded File
        const deleteResponse = await request(app.getHttpServer())
            .delete(`/api/v1/common/upload/audio/${fileId}`)
            .send({ userId: testUserId }); // Send userId in body as per controller

        expect(deleteResponse.status).toBe(HttpStatus.OK);
        expect(deleteResponse.body.data.message).toContain('성공적으로 삭제');

        // 5. Verify deletion (optional: check DB or try fetching upload again)
        const getDeletedUpload = await request(app.getHttpServer())
            .get(`/api/v1/common/upload/audio/${fileId}`) // Assuming a GET endpoint exists (it doesn't)
            // A better check might be querying the repository directly if accessible
            // Or checking the inference job (SET NULL FK)

        const finalInference = await inferenceRepository.findOne({ where: { id: dbJobId } });
        expect(finalInference?.upload).toBeNull(); // Check if FK is set to null

    }, 35000); // Increase test timeout for polling

    it('POST /common/upload/audio - should fail with 400 if required fields are missing', () => {
        return request(app.getHttpServer())
            .post('/api/v1/common/upload/audio')
            .attach('file', testFilePath) // Attach file
            // Missing userId, fileName, fileSize, type
            .expect(HttpStatus.BAD_REQUEST);
    });

    it('POST /inference/sts - should fail with 404 if fileId does not exist', () => {
        return request(app.getHttpServer())
            .post('/api/v1/inference/sts')
            .send({ userId: testUserId, fileId: 99999, voiceId: 1 })
            .expect(HttpStatus.NOT_FOUND);
    });

    it('GET /inference/sts/:jobId - should fail with 404 if jobId does not exist', () => {
        return request(app.getHttpServer())
            .get('/api/v1/inference/sts/88888')
            .query({ userId: testUserId })
            .expect(HttpStatus.NOT_FOUND);
    });

    it('DELETE /common/upload/audio/:id - should fail with 404 if fileId does not exist', () => {
        return request(app.getHttpServer())
            .delete('/api/v1/common/upload/audio/77777')
            .send({ userId: testUserId })
            .expect(HttpStatus.NOT_FOUND);
    });
});

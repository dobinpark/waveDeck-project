import { Test, TestingModule } from '@nestjs/testing';
import { InferenceController } from './inference.controller';
import { InferenceService } from './inference.service';
import { InferenceRequestDto } from './dto/inference-request.dto';
import { HttpStatus } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Inference } from './entities/inference.entity';
import { Upload } from '../upload/entities/upload.entity';

// Mock InferenceService
const mockInferenceService = {
  requestTransformation: jest.fn(),
};

// Mock Repositories (if needed, though service is mocked here)
const mockInferenceRepository = {};
const mockUploadRepository = {};

describe('InferenceController', () => {
  let controller: InferenceController;
  let service: InferenceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InferenceController],
      providers: [
        {
          provide: InferenceService,
          useValue: mockInferenceService,
        },
        // If service methods directly use repositories, mock them here too
        //{
        //  provide: getRepositoryToken(Inference),
        //  useValue: mockInferenceRepository,
        //},
        //{
        //  provide: getRepositoryToken(Upload),
        //  useValue: mockUploadRepository,
        //},
      ],
    }).compile();

    controller = module.get<InferenceController>(InferenceController);
    service = module.get<InferenceService>(InferenceService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('requestStsTransformation', () => {
    it('should accept the request and return job details', async () => {
      const dto: InferenceRequestDto = {
        userId: 1,
        fileId: 10,
        voiceId: 72,
        pitch: 0,
      };
      const expectedResult = { jobId: 123, previewUrl: 'https://example.com/preview/123' };

      // Mock the service call
      mockInferenceService.requestTransformation.mockResolvedValue(expectedResult);

      // Call the controller method
      const response = await controller.requestStsTransformation(dto);

      // Assertions
      expect(service.requestTransformation).toHaveBeenCalledWith(dto);
      expect(response).toEqual({
        message: 'AI transformation request accepted.',
        data: expectedResult,
      });
      // Optionally check HttpStatus if @Res decorator was used (not needed with @HttpCode)
    });

    it('should handle errors from the service', async () => {
        const dto: InferenceRequestDto = { userId: 1, fileId: 10, voiceId: 72, pitch: 0 };
        const errorMessage = 'Service error';

        mockInferenceService.requestTransformation.mockRejectedValue(new Error(errorMessage));

        await expect(controller.requestStsTransformation(dto)).rejects.toThrow(errorMessage);
    });

    // Add more tests for validation failures (requires different setup or e2e tests)

  });
}); 
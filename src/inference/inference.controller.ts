import {
    Controller,
    Post,
    Body,
    Get,
    Param,
    ParseIntPipe,
    HttpCode,
    HttpStatus,
    UseGuards,
    Req,
    Logger,
} from '@nestjs/common';
import { InferenceService } from './inference.service';
import { InferenceRequestDto } from './dto/inference-request.dto';
import { JobStatusResponseDto } from './dto/job-status-response.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam } from '@nestjs/swagger';

/**
 * AI 음성 변환(Inference) 관련 API 엔드포인트를 처리하는 컨트롤러입니다.
 */
@ApiTags('Inference')
@Controller('api/v1/inference')
export class InferenceController {
    private readonly logger = new Logger(InferenceController.name);

    constructor(private readonly inferenceService: InferenceService) {}

    /**
     * AI 음성 변환을 요청합니다.
     * @param dto 변환 요청 정보 (파일 ID, 사용자 ID, 목소리 ID 등)
     * @param req Request 객체 (사용자 정보 포함 가정)
     * @returns 생성된 작업 정보 (DB ID, 큐 ID, 상태 조회 URL)
     */
    @Post()
    @HttpCode(HttpStatus.ACCEPTED) // Use 202 Accepted for async operations
    @ApiOperation({ summary: 'Request AI voice transformation', description: 'Submits a job to the inference queue.' })
    @ApiBody({ type: InferenceRequestDto })
    @ApiResponse({ status: 202, description: 'Job accepted for processing.', type: Object }) // Update response type if needed
    @ApiResponse({ status: 400, description: 'Bad Request (e.g., invalid input)' })
    @ApiResponse({ status: 404, description: 'Not Found (e.g., fileId not found)' })
    async requestTransformation(
        @Body() dto: InferenceRequestDto,
        // @Req() req: any, // Uncomment if using AuthGuard and req.user
    ) {
        this.logger.log(`POST /api/v1/inference - Request received: ${JSON.stringify(dto)}`);
        // TODO: Replace hardcoded userId with actual user ID from Auth context (e.g., req.user.id)
        const userId = dto.userId || 1; // Temporary placeholder
        const result = await this.inferenceService.requestTransformation({ ...dto, userId });
        this.logger.log(`POST /api/v1/inference - Job submitted: ${JSON.stringify(result)}`);
        return { data: result, message: 'Inference job accepted and queued.' };
    }

    /**
     * 특정 Inference 작업의 상태를 조회합니다.
     * @param jobId 조회할 작업의 DB ID
     * @param req Request 객체 (사용자 정보 포함 가정)
     * @returns 작업 상태 정보
     */
    @Get('status/:jobId') // Corrected path
    @ApiOperation({ summary: 'Get inference job status', description: 'Retrieves the status and result (if completed) of an inference job.' })
    @ApiParam({ name: 'jobId', description: 'The DB ID of the inference job', type: Number })
    @ApiResponse({ status: 200, description: 'Job status retrieved successfully.', type: JobStatusResponseDto })
    @ApiResponse({ status: 404, description: 'Job not found.' })
    async getJobStatus(
        @Param('jobId', ParseIntPipe) jobId: number,
        // @Req() req: any, // Uncomment if using AuthGuard and req.user
    ): Promise<{ data: JobStatusResponseDto; message: string }> { // Return type updated
        this.logger.log(`GET /api/v1/inference/status/${jobId} - Request received`);
        // TODO: Replace hardcoded userId with actual user ID from Auth context
        const userId = 1; // Temporary placeholder
        const jobStatus = await this.inferenceService.getJobStatus(jobId, userId);
        this.logger.log(`GET /api/v1/inference/status/${jobId} - Status retrieved: ${JSON.stringify(jobStatus)}`);
        return {
            data: jobStatus,
            message: `Status for job ${jobId} retrieved successfully.`,
        };
    }
}

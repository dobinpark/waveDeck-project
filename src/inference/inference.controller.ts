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
 * AI 음성 변환(Inference) 관련 API 엔드포인트를 처리하는 컨트롤러
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
    @HttpCode(HttpStatus.ACCEPTED) // 비동기 작업이므로 202 Accepted 사용
    @ApiOperation({ summary: 'AI 음성 변환 요청', description: '추론 큐에 작업을 제출합니다.' })
    @ApiBody({ type: InferenceRequestDto })
    @ApiResponse({ status: 202, description: '작업 처리 요청 수락됨.', type: Object })
    @ApiResponse({ status: 400, description: '잘못된 요청 (예: 유효하지 않은 입력)' })
    @ApiResponse({ status: 404, description: '찾을 수 없음 (예: fileId 없음)' })
    async requestTransformation(
        @Body() dto: InferenceRequestDto,
    ) {
        this.logger.log(`/api/v1/inference 요청 수신: ${JSON.stringify(dto)}`);
        const userId = dto.userId || 1;
        const result = await this.inferenceService.requestTransformation({ ...dto, userId });
        this.logger.log(`/api/v1/inference 작업 제출됨: ${JSON.stringify(result)}`);
        return { data: result, message: 'Inference 작업이 수락되어 큐에 등록되었습니다.' };
    }

    /**
     * 특정 Inference 작업의 상태를 조회합니다.
     * @param jobId 조회할 작업의 DB ID
     * @param req Request 객체 (사용자 정보 포함 가정)
     * @returns 작업 상태 정보
     */
    @Get('status/:jobId')
    @ApiOperation({ summary: 'Inference 작업 상태 조회', description: 'Inference 작업의 상태 및 결과(완료 시)를 조회합니다.' })
    @ApiParam({ name: 'jobId', description: 'Inference 작업의 DB ID', type: Number })
    @ApiResponse({ status: 200, description: '작업 상태 조회 성공.', type: JobStatusResponseDto })
    @ApiResponse({ status: 404, description: '작업을 찾을 수 없음.' })
    async getJobStatus(
        @Param('jobId', ParseIntPipe) jobId: number,
    ): Promise<{ data: JobStatusResponseDto; message: string }> {
        this.logger.log(`/api/v1/inference/status/${jobId} 요청 수신`);
        const userId = 1;
        const jobStatus = await this.inferenceService.getJobStatus(jobId, userId);
        this.logger.log(`/api/v1/inference/status/${jobId} 상태 조회 완료: ${JSON.stringify(jobStatus)}`);
        return {
            data: jobStatus,
            message: `작업 ${jobId}의 상태를 성공적으로 조회했습니다.`,
        };
    }
}

import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { InferenceService } from './inference.service';
import { InferenceRequestDto } from './dto/inference-request.dto';

@Controller('api/v1/inference')
export class InferenceController {
    constructor(private readonly inferenceService: InferenceService) { }

    @Post('sts')
    @HttpCode(HttpStatus.ACCEPTED)
    async requestStsTransformation(@Body() inferenceRequestDto: InferenceRequestDto) {
        const result = await this.inferenceService.requestTransformation(inferenceRequestDto);
        return {
            message: 'AI transformation request accepted.',
            data: result, // { jobId, previewUrl }
        };
    }
}

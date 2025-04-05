import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ConversionService } from './conversion.service';
import { ConversionRequestDto } from './dto/conversion-request.dto';

@Controller('api/v1/conversion')
export class ConversionController {
    constructor(private readonly conversionService: ConversionService) { }

    @Post('sts')
    @HttpCode(HttpStatus.ACCEPTED)
    async requestStsTransformation(@Body() conversionRequestDto: ConversionRequestDto) {
        const result = await this.conversionService.requestTransformation(conversionRequestDto);
        return {
            message: 'AI transformation request accepted.',
            data: result, // { jobId, previewUrl }
        };
    }
}

import { IsNotEmpty, IsNumber, IsOptional, Min } from 'class-validator';

export class ConversionRequestDto {
    @IsNotEmpty()
    @IsNumber()
    userId: number;

    @IsNotEmpty()
    @IsNumber()
    @Min(1)
    fileId: number;

    @IsNotEmpty()
    @IsNumber()
    voiceId: number;

    @IsOptional()
    @IsNumber()
    pitch?: number = 0;
}

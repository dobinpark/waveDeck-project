import { IsNotEmpty, IsNumber, IsOptional, Min } from 'class-validator';

export class InferenceRequestDto {

    // 사용자 ID
    @IsNotEmpty()
    @IsNumber()
    userId: number;

    // 파일 ID
    @IsNotEmpty()
    @IsNumber()
    @Min(1)
    fileId: number;

    // 음성 ID
    @IsNotEmpty()
    @IsNumber()
    voiceId: number;

    // 피치
    @IsOptional()
    @IsNumber()
    pitch?: number = 0;
}

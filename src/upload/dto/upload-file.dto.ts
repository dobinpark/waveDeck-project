import { IsNotEmpty, IsNumber, IsString, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class UploadFileDto {
    @IsNotEmpty()
    @IsNumber()
    @Type(() => Number)
    userId: number;

    @IsNotEmpty()
    @IsString()
    fileName: string;

    @IsNotEmpty()
    @IsNumber()
    @Type(() => Number)
    fileSize: number;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    duration?: number;

    @IsNotEmpty()
    @IsString()
    type: string; // "upload", "delete"
}

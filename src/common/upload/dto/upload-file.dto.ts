import { IsNumber, IsString, IsOptional } from 'class-validator';

export class UploadFileDto {
    
    @IsNumber()
    userId: number;

    @IsString()
    type: string; // "upload", "delete"

    @IsString()
    fileName: string;

    @IsNumber()
    fileSize: number;

    @IsOptional()
    @IsNumber()
    duration?: number;
}

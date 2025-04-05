import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('upload')
export class Upload {

    // 업로드 파일 고유 ID
    @PrimaryGeneratedColumn()
    id: number;

    // 업로드 파일 소유자 ID
    @Column()
    userId: number;

    // 업로드 파일 타입
    @Column()
    type: string;

    // 업로드 파일 이름
    @Column()
    fileName: string;

    // 업로드 파일 크기
    @Column()
    fileSize: number;

    // 업로드 파일 길이
    @Column()
    duration: number;

    // 업로드 파일 미리보기 URL
    @Column()
    filePreviewUrl: string;

    // 업로드 파일 경로
    @Column()
    filePath: string;

    // 업로드 파일 업로드 시간
    @CreateDateColumn()
    uploadTime: Date;
}

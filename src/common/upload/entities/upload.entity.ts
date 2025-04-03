import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class Upload {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    userId: number;

    @Column()
    type: string;

    @Column()
    fileName: string;

    @Column()
    fileSize: number;

    @Column()
    duration: number;

    @Column()
    filePreviewUrl: string; // 저장된 파일 URL

    @CreateDateColumn()
    uploadTime: Date; // 업로드 시간
}

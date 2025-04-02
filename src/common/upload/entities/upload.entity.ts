import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('uploads')
export class Upload {
    
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    userId: number;

    @Column()
    fileName: string;

    @Column()
    fileSize: number;

    @Column({ nullable: true })
    duration: number;

    @Column()
    filePath: string;

    @Column()
    filePreviewUrl: string;

    @Column({ default: true })
    isActive: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

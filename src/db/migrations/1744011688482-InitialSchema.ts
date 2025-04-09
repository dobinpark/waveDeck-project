import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1744011688482 implements MigrationInterface {
    name = 'InitialSchema1744011688482'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`upload\` (\`id\` int NOT NULL AUTO_INCREMENT, \`userId\` int NOT NULL, \`type\` varchar(255) NOT NULL, \`fileName\` varchar(255) NOT NULL, \`fileSize\` int NOT NULL, \`duration\` int NOT NULL, \`filePreviewUrl\` varchar(255) NOT NULL, \`filePath\` varchar(255) NOT NULL, \`uploadTime\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_0acad24db01762fb1d5b51a70c\` (\`userId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`inference\` (\`id\` int NOT NULL AUTO_INCREMENT, \`userId\` int NOT NULL, \`status\` enum ('pending', 'queued', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending', \`voiceId\` int NOT NULL, \`pitch\` int NOT NULL DEFAULT '0', \`originalPath\` varchar(255) NULL, \`convertedPath\` varchar(255) NULL, \`convertedFileSize\` bigint NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`jobQueueId\` varchar(255) NULL, \`errorMessage\` text NULL, \`processingStartedAt\` timestamp NULL, \`processingFinishedAt\` timestamp NULL, \`uploadId\` int NULL, INDEX \`IDX_a5bad6f91f02e8289949dab154\` (\`userId\`), INDEX \`IDX_2d04267e0cb077206185438d00\` (\`uploadId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`inference\` ADD CONSTRAINT \`FK_2d04267e0cb077206185438d002\` FOREIGN KEY (\`uploadId\`) REFERENCES \`upload\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`inference\` DROP FOREIGN KEY \`FK_2d04267e0cb077206185438d002\``);
        await queryRunner.query(`DROP INDEX \`IDX_2d04267e0cb077206185438d00\` ON \`inference\``);
        await queryRunner.query(`DROP INDEX \`IDX_a5bad6f91f02e8289949dab154\` ON \`inference\``);
        await queryRunner.query(`DROP TABLE \`inference\``);
        await queryRunner.query(`DROP INDEX \`IDX_0acad24db01762fb1d5b51a70c\` ON \`upload\``);
        await queryRunner.query(`DROP TABLE \`upload\``);
    }

}

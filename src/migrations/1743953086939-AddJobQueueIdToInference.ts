import { MigrationInterface, QueryRunner } from "typeorm";

export class AddJobQueueIdToInference1743953086939 implements MigrationInterface {
    name = 'AddJobQueueIdToInference1743953086939'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`inference\` ADD \`jobQueueId\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`inference\` ADD \`errorMessage\` text NULL`);
        await queryRunner.query(`ALTER TABLE \`inference\` ADD \`processingStartedAt\` timestamp NULL`);
        await queryRunner.query(`ALTER TABLE \`inference\` ADD \`processingFinishedAt\` timestamp NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`inference\` DROP COLUMN \`processingFinishedAt\``);
        await queryRunner.query(`ALTER TABLE \`inference\` DROP COLUMN \`processingStartedAt\``);
        await queryRunner.query(`ALTER TABLE \`inference\` DROP COLUMN \`errorMessage\``);
        await queryRunner.query(`ALTER TABLE \`inference\` DROP COLUMN \`jobQueueId\``);
    }

}

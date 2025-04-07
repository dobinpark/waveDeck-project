import { MigrationInterface, QueryRunner } from "typeorm";

export class SetNullOnDeleteInferenceUploadFk1743951089839 implements MigrationInterface {
    name = 'SetNullOnDeleteInferenceUploadFk1743951089839'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`inference\` DROP FOREIGN KEY \`FK_2d04267e0cb077206185438d002\``);
        await queryRunner.query(`ALTER TABLE \`inference\` CHANGE \`status\` \`status\` enum ('pending', 'queued', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending'`);
        await queryRunner.query(`ALTER TABLE \`inference\` ADD CONSTRAINT \`FK_2d04267e0cb077206185438d002\` FOREIGN KEY (\`uploadId\`) REFERENCES \`upload\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`inference\` DROP FOREIGN KEY \`FK_2d04267e0cb077206185438d002\``);
        await queryRunner.query(`ALTER TABLE \`inference\` CHANGE \`status\` \`status\` enum ('pending', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending'`);
        await queryRunner.query(`ALTER TABLE \`inference\` ADD CONSTRAINT \`FK_2d04267e0cb077206185438d002\` FOREIGN KEY (\`uploadId\`) REFERENCES \`upload\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}

import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialDatabaseSetup1743948520667 implements MigrationInterface {
    name = 'InitialDatabaseSetup1743948520667'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`inference\` (\`id\` int NOT NULL AUTO_INCREMENT, \`userId\` int NOT NULL, \`status\` enum ('pending', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending', \`voiceId\` int NOT NULL, \`pitch\` int NOT NULL DEFAULT '0', \`originalPath\` varchar(255) NULL, \`convertedPath\` varchar(255) NULL, \`convertedFileSize\` bigint NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`uploadId\` int NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`upload\` ADD \`filePath\` varchar(255) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`inference\` ADD CONSTRAINT \`FK_2d04267e0cb077206185438d002\` FOREIGN KEY (\`uploadId\`) REFERENCES \`upload\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`inference\` DROP FOREIGN KEY \`FK_2d04267e0cb077206185438d002\``);
        await queryRunner.query(`ALTER TABLE \`upload\` DROP COLUMN \`filePath\``);
        await queryRunner.query(`DROP TABLE \`inference\``);
    }

}

import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIndexesToUploadAndInference1743948869166 implements MigrationInterface {
    name = 'AddIndexesToUploadAndInference1743948869166'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE INDEX \`IDX_0acad24db01762fb1d5b51a70c\` ON \`upload\` (\`userId\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_a5bad6f91f02e8289949dab154\` ON \`inference\` (\`userId\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_2d04267e0cb077206185438d00\` ON \`inference\` (\`uploadId\`)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX \`IDX_2d04267e0cb077206185438d00\` ON \`inference\``);
        await queryRunner.query(`DROP INDEX \`IDX_a5bad6f91f02e8289949dab154\` ON \`inference\``);
        await queryRunner.query(`DROP INDEX \`IDX_0acad24db01762fb1d5b51a70c\` ON \`upload\``);
    }

}

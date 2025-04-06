import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';
import { Upload } from './src/upload/entities/upload.entity';
import { Inference } from './src/inference/entities/inference.entity';

// .env 파일 로드
config();

// process.env에서 직접 값을 읽어옴
// ConfigService는 NestJS 애플리케이션 컨텍스트 내에서 주입받아 사용해야 하므로 CLI 환경에서는 직접 사용하기 어려움
export const dataSourceOptions: DataSourceOptions = {
    type: 'mysql',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    entities: [Upload, Inference], // 엔티티 직접 임포트 또는 경로 지정
    // entities: [__dirname + '/src/**/*.entity{.ts,.js}'], // 경로 지정 방식 (컴파일 후 경로 고려 필요)
    migrations: [__dirname + '/src/migrations/*{.ts,.js}'], // 마이그레이션 파일 경로
    synchronize: false, // 마이그레이션을 사용하므로 false로 설정
    logging: true, // 개발 중에는 로그 활성화
};

const dataSource = new DataSource(dataSourceOptions);
export default dataSource; 
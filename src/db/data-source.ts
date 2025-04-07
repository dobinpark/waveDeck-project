import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import { SeederOptions } from 'typeorm-extension';
import { MainSeeder } from './seeds/main.seeder';

const entitiesPath = [__dirname + '/../../src/**/*.entity{.ts,.js}'];
const migrationsPath = [__dirname + '/migrations/*{.ts,.js}'];
const seedsPath = [__dirname + '/seeds/**/*{.ts,.js}'];

export const dataSourceOptions: DataSourceOptions & SeederOptions = {
    type: 'mysql',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3307', 10),
    username: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || 'testpassword',
    database: process.env.DB_DATABASE || 'wave_deck',
    synchronize: false,
    logging: process.env.NODE_ENV === 'development',
    entities: entitiesPath,
    migrations: migrationsPath,
    seeds: [MainSeeder],
};

const dataSource = new DataSource(dataSourceOptions);

export default dataSource;

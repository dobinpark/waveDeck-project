import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import { SeederOptions } from 'typeorm-extension';
import { MainSeeder } from './seeds/main.seeder';

const entitiesPath = process.env.NODE_ENV === 'test'
    ? [__dirname + '/../**/*.entity{.ts,.js}']
    : ['dist/**/*.entity{.js}'];

const migrationsPath = process.env.NODE_ENV === 'test'
    ? [__dirname + '/migrations/*{.ts,.js}']
    : ['dist/db/migrations/*{.js}'];

const seedsPath = process.env.NODE_ENV === 'test'
    ? [__dirname + '/seeds/**/*{.ts,.js}']
    : ['dist/db/seeds/**/*{.js}'];

export const dataSourceOptions: DataSourceOptions & SeederOptions = {
    type: 'mysql',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    username: process.env.DB_USERNAME || 'testuser',
    password: process.env.DB_PASSWORD || 'testpassword',
    database: process.env.DB_DATABASE || 'wave_deck',
    synchronize: false,
    logging: process.env.NODE_ENV === 'development',
    entities: entitiesPath,
    migrations: migrationsPath,
    seeds: seedsPath,
};

const dataSource = new DataSource(dataSourceOptions);

export default dataSource; 
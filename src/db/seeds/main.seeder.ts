import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { DataSource } from 'typeorm';
// Import other seeders if you create them
// import { UserSeeder } from './user.seeder';
import { UploadSeeder } from './upload.seeder';

export class MainSeeder implements Seeder {
    public async run(
        dataSource: DataSource,
        factoryManager: SeederFactoryManager
    ): Promise<any> {
        // Run other seeders here
        // await new UserSeeder().run(dataSource, factoryManager);
        await new UploadSeeder().run(dataSource, factoryManager);

        console.log('MainSeeder: Seeding complete!');
    }
} 
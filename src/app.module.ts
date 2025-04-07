import { Module, ValidationPipe, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { CommonModule } from './common/common.module';
import { UploadModule } from './upload/upload.module';
import { InferenceModule } from './inference/inference.module';
import { ErrorHandlerMiddleware } from './common/middleware/error-handler.middleware';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { HttpExceptionFilter } from './common/filter/http-exception.filter';
import { ResponseInterceptor } from './common/interceptor/response.interceptor';
import { BadRequestException } from '@nestjs/common';
import { validationSchema } from './common/config/validationSchema';
import { HealthController } from './health.controller';
import { Upload } from './upload/entities/upload.entity';
import { Inference } from './inference/entities/inference.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql' as const,
        host: configService.get<string>('DB_HOST'),
        port: configService.get<number>('DB_PORT'),
        username: configService.get<string>('DB_USERNAME'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_DATABASE'),
        entities: [
          Upload,
          Inference,
        ],
        migrations: [__dirname + '/../migrations/*{.ts,.js}'],
        synchronize: false,
        logging: true,
        migrationsRun: false,
      }),
      inject: [ConfigService],
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST'),
          port: configService.get<number>('REDIS_PORT'),
        },
      }),
      inject: [ConfigService],
    }),
    CommonModule,
    UploadModule,
    InferenceModule,
  ],
  controllers: [HealthController],
  providers: [
    ErrorHandlerMiddleware,
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        transform: true,
        whitelist: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
        exceptionFactory: (errors) => {
          const firstError = errors[0];
          const firstConstraintMessage = firstError && firstError.constraints 
            ? Object.values(firstError.constraints)[0] 
            : 'Validation failed';
          
          console.error('ValidationPipe Errors:', JSON.stringify(errors, null, 2));
          
          return new BadRequestException(firstConstraintMessage);
        },
        forbidNonWhitelisted: true,
        stopAtFirstError: true,
      }),
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes('*');
  }
}

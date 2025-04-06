import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { als } from './common/middleware/request-id.middleware';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: process.env.NODE_ENV === 'development' ? ['log', 'debug', 'error', 'verbose', 'warn'] : ['error', 'warn'],
    bufferLogs: true,
  });

  app.setGlobalPrefix('api/v1');

  app.enableShutdownHooks();

  // 요청 시작 시 로그 출력
  app.use((req, res, next) => {
    console.log('요청 들어옴:', req.method, req.url);
    next();
  });

  // 정적 파일 서빙 설정 (public 디렉토리)
  app.useStaticAssets(join(__dirname, '..', 'public'));

  // 정적 파일 서빙 설정 (waveDeck-uploads 디렉토리)
  app.useStaticAssets(join(__dirname, '..', 'waveDeck-uploads'));

  await app.listen(process.env.PORT ?? 3000);
  Logger.log(`🚀 Application is running on: http://localhost:${process.env.PORT ?? 3000}/api/v1`, 'Bootstrap');
}
bootstrap();

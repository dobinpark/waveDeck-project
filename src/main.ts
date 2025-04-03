import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

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
}
bootstrap();

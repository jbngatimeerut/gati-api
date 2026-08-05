import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: (process.env.WEB_ORIGIN || '*').split(','), credentials: true });
  app.useWebSocketAdapter(new WsAdapter(app));

  // serve member media that we've stored locally (owned by us, not Google Drive)
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/api/uploads/' });

  // baseline security headers
  app.use((_req: any, res: any, next: any) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.removeHeader('X-Powered-By');
    next();
  });

  await app.listen(process.env.PORT || 4000);
  console.log(`JITO API running on :${process.env.PORT || 4000}`);
}
bootstrap();

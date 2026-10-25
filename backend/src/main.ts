import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import * as express from 'express';
import * as path from 'path';

async function bootstrap() {
  const logger = new Logger('AccentForge-Production');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Enable Graceful Shutdown Hooks
  app.enableShutdownHooks();

  // Production CORS Configuration
  const corsOrigin = process.env.CORS_ORIGIN || '*';
  app.enableCors({
    origin: corsOrigin,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Security & Freshness Headers Middleware
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Serve Frontend Assets with zero-latency revalidation
  const frontendPath = path.resolve(__dirname, '../../frontend');
  app.use(express.static(frontendPath, {
    maxAge: 0,
    etag: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    }
  }));

  const port = parseInt(process.env.PORT || '3333', 10);
  const host = process.env.HOST || '0.0.0.0';

  await app.listen(port, host);
  logger.log(`🚀 AccentForge AI [Production Mode] online on http://${host}:${port}`);
}

bootstrap();

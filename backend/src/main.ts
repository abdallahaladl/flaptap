import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import * as express from 'express';
import * as path from 'path';
import { loadEnvironment } from './core/config/env';

loadEnvironment();

async function bootstrap() {
  const logger = new Logger('Flaptap-Production');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.enableShutdownHooks();

  // Trust upstream reverse proxies (Caddy, Cloudflare, Nginx, Fly.io, etc.)
  // Ensures accurate client IP tracking, secure cookie delivery, and HTTPS detection.
  const trustProxyEnv = process.env.TRUST_PROXY;
  if (trustProxyEnv === 'true' || trustProxyEnv === '1' || process.env.NODE_ENV === 'production') {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  const corsOrigin = process.env.CORS_ORIGIN || '*';
  app.enableCors({
    origin: corsOrigin,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // Frontend assets. HTML/JS/CSS revalidate on every load so a deployment is
  // picked up immediately without stale bundles.
  const frontendPath = path.resolve(__dirname, '../../frontend');
  app.use(express.static(frontendPath, {
    maxAge: 0,
    etag: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    },
  }));

  const port = parseInt(process.env.PORT || '3333', 10);
  const host = process.env.HOST || '0.0.0.0';

  await app.listen(port, host);
  logger.log(`🚀 Flaptap AI online on http://${host}:${port}`);
  logger.log(
    process.env.OPENCODE_GO_API_KEY
      ? `🧠 AI: OpenCode Go · ${process.env.OPENCODE_GO_MODEL || 'deepseek-v4.1-flash'}`
      : '⚠️  AI: OPENCODE_GO_API_KEY is not set. Translation and dialogue generation are disabled until it is added.',
  );

  const shutdown = async (signal: string) => {
    logger.log(`${signal} received: closing Flaptap cleanly...`);
    try {
      await app.close();
      logger.log('Flaptap shutdown complete.');
      process.exit(0);
    } catch (err) {
      logger.error('Error during shutdown', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap();

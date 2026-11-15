import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import * as express from 'express';
import * as path from 'path';
import * as os from 'os';
import * as zlib from 'zlib';
import { loadEnvironment } from './core/config/env';
import { resolveFrontendEntryFile } from './core/config/frontend-routes';

loadEnvironment();

function getLanIp(): string {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

function createCompressionMiddleware(): express.RequestHandler {
  return (req, res, next) => {
    if (req.method === 'HEAD' || req.headers.range || req.path.includes('stream')) {
      return next();
    }
    const accept = String(req.headers['accept-encoding'] || '').toLowerCase();
    const useBr = accept.includes('br') && typeof zlib.createBrotliCompress === 'function';
    const useGzip = !useBr && accept.includes('gzip');
    if (!useBr && !useGzip) {
      return next();
    }

    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);
    let decided = false;
    let comp: zlib.BrotliCompress | zlib.Gzip | null = null;
    let endCallback: (() => void) | undefined;

    const initCompressor = (): boolean => {
      if (decided) return Boolean(comp);
      decided = true;

      if (res.statusCode < 200 || res.statusCode >= 300 || res.statusCode === 204) {
        return false;
      }
      if (res.getHeader('Content-Encoding')) {
        return false;
      }
      const ct = String(res.getHeader('Content-Type') || '');
      if (
        !/^(text\/(html|css|plain|xml|csv)|application\/(javascript|json|manifest\+json)|image\/svg\+xml)/i.test(ct) ||
        /text\/event-stream/i.test(ct)
      ) {
        return false;
      }
      const contentLen = Number(res.getHeader('Content-Length') || 0);
      if (contentLen > 0 && contentLen < 860) {
        return false;
      }

      res.removeHeader('Content-Length');
      res.setHeader('Content-Encoding', useBr ? 'br' : 'gzip');
      const vary = String(res.getHeader('Vary') || '');
      if (!/accept-encoding/i.test(vary)) {
        res.setHeader('Vary', vary ? `${vary}, Accept-Encoding` : 'Accept-Encoding');
      }

      comp = useBr
        ? zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } })
        : zlib.createGzip({ level: 6 });

      comp.on('data', (c: Buffer) => {
        origWrite(c);
      });
      comp.on('drain', () => {
        res.emit('drain');
      });
      comp.on('end', () => {
        if (endCallback) {
          origEnd(endCallback);
        } else {
          origEnd();
        }
      });
      comp.on('error', () => {
        try {
          origEnd();
        } catch {}
      });
      res.once('close', () => {
        if (comp && !res.writableEnded) {
          try {
            comp.destroy();
          } catch {}
        }
      });
      return true;
    };

    res.write = ((chunk: any, encoding?: any, cb?: any): boolean => {
      if (!decided) {
        initCompressor();
      }
      if (comp) {
        return comp.write(chunk, encoding, cb);
      }
      return origWrite(chunk, encoding, cb);
    }) as any;

    res.end = ((chunk?: any, encoding?: any, cb?: any): any => {
      let actualChunk = chunk;
      let actualEnc = encoding;
      let actualCb = cb;
      if (typeof actualChunk === 'function') {
        actualCb = actualChunk;
        actualChunk = undefined;
        actualEnc = undefined;
      } else if (typeof actualEnc === 'function') {
        actualCb = actualEnc;
        actualEnc = undefined;
      }

      if (!decided) {
        const byteLen = actualChunk
          ? Buffer.isBuffer(actualChunk)
            ? actualChunk.length
            : Buffer.byteLength(String(actualChunk), actualEnc || 'utf8')
          : 0;
        if (!actualChunk || byteLen < 860) {
          decided = true;
          return origEnd(chunk, encoding, cb);
        }
        initCompressor();
      }

      if (comp) {
        endCallback = typeof actualCb === 'function' ? actualCb : undefined;
        if (actualChunk !== undefined) {
          comp.end(actualChunk, actualEnc);
        } else {
          comp.end();
        }
        return res;
      }
      return origEnd(chunk, encoding, cb);
    }) as any;

    next();
  };
}

async function bootstrap() {
  const logger = new Logger('Flaptap');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.enableShutdownHooks();

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', true);

  const corsOriginEnv = (process.env.CORS_ORIGIN || '').trim();
  const corsOrigin: boolean | string | string[] =
    !corsOriginEnv || corsOriginEnv === '*'
      ? true
      : corsOriginEnv.split(',').map((s) => s.trim()).filter(Boolean);

  app.enableCors({
    origin: corsOrigin,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-guest-token'],
  });

  app.use(createCompressionMiddleware());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  const port = parseInt(process.env.PORT || '3333', 10);

  app.use((_req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  const frontendPath = path.resolve(__dirname, '../../frontend');
  app.use(
    express.static(frontendPath, {
      maxAge: 0,
      etag: true,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('manifest.json') || filePath.endsWith('.webmanifest')) {
          res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
          res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
        } else if (filePath.endsWith('sw.js')) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.setHeader('Service-Worker-Allowed', '/');
          res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        } else if (filePath.endsWith('.png') || filePath.endsWith('.svg')) {
          res.setHeader('Cache-Control', 'public, max-age=86400');
        } else if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
          res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        } else if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        }
      },
    }),
  );

  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.startsWith('/api/')) {
      return next();
    }
    const entryFile = resolveFrontendEntryFile(req.path);
    if (!entryFile) {
      return next();
    }
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.sendFile(path.join(frontendPath, entryFile));
  });

  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host);
  logger.log(`🚀 Flaptap online: http://localhost:${port} (Same Wi-Fi LAN: http://${getLanIp()}:${port})`);
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

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import * as express from 'express';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn, ChildProcess } from 'child_process';
import { loadEnvironment } from './core/config/env';

loadEnvironment();

let currentHttpsOrigin = '';
let spawnedTunnelProc: ChildProcess | null = null;
let tunnelMonitorTimer: NodeJS.Timeout | null = null;

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

function findCloudflaredBinary(): string | null {
  const candidates = [
    path.join(os.homedir(), '.local/bin/cloudflared'),
    '/opt/homebrew/bin/cloudflared',
    '/usr/local/bin/cloudflared',
    '/usr/bin/cloudflared',
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        return p;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

async function isHttpsOriginReachable(origin: string): Promise<boolean> {
  if (!origin || !origin.startsWith('https://')) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${origin}/api/health`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

function readCandidateHttpsOrigin(rootDir: string): string {
  const urlFile = path.join(rootDir, 'data', 'PUBLIC_URL.txt');
  const logFile = path.join(rootDir, 'data', 'logs', 'tunnel.log');
  try {
    if (fs.existsSync(urlFile)) {
      const u = fs.readFileSync(urlFile, 'utf8').trim();
      if (u.startsWith('https://')) return u.replace(/\/+$/, '');
    }
  } catch {
    // ignore
  }
  try {
    if (fs.existsSync(logFile)) {
      const content = fs.readFileSync(logFile, 'utf8');
      const matches = content.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g);
      if (matches && matches.length > 0) {
        return matches[matches.length - 1];
      }
    }
  } catch {
    // ignore
  }
  return '';
}

async function ensureHttpsTunnel(port: number, rootDir: string, logger: Logger): Promise<void> {
  if (
    process.env.DISABLE_AUTO_TUNNEL === 'true' ||
    process.env.RENDER ||
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.FLY_APP_NAME
  ) {
    return;
  }

  const existingCandidate = readCandidateHttpsOrigin(rootDir);
  if (existingCandidate && (await isHttpsOriginReachable(existingCandidate))) {
    if (currentHttpsOrigin !== existingCandidate) {
      currentHttpsOrigin = existingCandidate;
      logger.log(`🔒 HTTPS PWA Origin active: ${currentHttpsOrigin}`);
    }
    return;
  }

  if (spawnedTunnelProc && !spawnedTunnelProc.killed) {
    return;
  }

  const bin = findCloudflaredBinary();
  if (!bin) {
    return;
  }

  const dataDir = path.join(rootDir, 'data');
  const logsDir = path.join(dataDir, 'logs');
  const urlFile = path.join(dataDir, 'PUBLIC_URL.txt');
  const logFile = path.join(logsDir, 'tunnel.log');
  fs.mkdirSync(logsDir, { recursive: true });

  logger.log('🌐 Starting embedded Cloudflare HTTPS tunnel for Android/Tablet PWA installation...');
  const proc = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.unref();
  spawnedTunnelProc = proc;

  const handleOutput = (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    try {
      fs.appendFileSync(logFile, text);
    } catch {
      // ignore
    }
    const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match && match[0]) {
      const detected = match[0].replace(/\/+$/, '');
      if (currentHttpsOrigin !== detected) {
        currentHttpsOrigin = detected;
        try {
          fs.writeFileSync(urlFile, `${detected}\n`, 'utf8');
        } catch {
          // ignore
        }
        logger.log(`🔒 HTTPS PWA Origin ready: ${currentHttpsOrigin} (LAN auto-upgrade enabled)`);
      }
    }
    if (text.includes('Unauthorized: Tunnel not found')) {
      currentHttpsOrigin = '';
      proc.kill('SIGTERM');
    }
  };

  proc.stdout?.on('data', handleOutput);
  proc.stderr?.on('data', handleOutput);
  proc.on('exit', () => {
    if (spawnedTunnelProc === proc) {
      spawnedTunnelProc = null;
    }
  });
}

function syncAdbReverse(port: number): void {
  const candidates = ['/usr/local/bin/adb', '/opt/homebrew/bin/adb', path.join(os.homedir(), 'Library/Android/sdk/platform-tools/adb')];
  for (const adbBin of candidates) {
    try {
      if (fs.existsSync(adbBin)) {
        const p = spawn(adbBin, ['reverse', `tcp:${port}`, `tcp:${port}`], { stdio: 'ignore' });
        p.unref();
        return;
      }
    } catch {
      // ignore
    }
  }
}

async function bootstrap() {
  const logger = new Logger('Flaptap-Production');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.enableShutdownHooks();

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', true);

  const corsOrigin = process.env.CORS_ORIGIN || '*';
  app.enableCors({
    origin: corsOrigin,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  const rootDir = path.resolve(__dirname, '../..');
  const port = parseInt(process.env.PORT || '3333', 10);

  // Expose live HTTPS origin for PWA upgrade & diagnostics
  expressApp.get('/api/pwa/origin', (_req: express.Request, res: express.Response) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({
      httpsOrigin: currentHttpsOrigin || null,
      lanIp: getLanIp(),
      port,
      secureInstallReady: Boolean(currentHttpsOrigin),
    });
  });

  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    // Automatic LAN HTTP -> Trusted HTTPS redirect so Android/Tablet Chrome
    // always runs in a Secure Context and enables native WebAPK installation.
    if (currentHttpsOrigin && (req.method === 'GET' || req.method === 'HEAD')) {
      const forwardedProto = ((req.headers['x-forwarded-proto'] as string) || '')
        .split(',')[0]
        .trim()
        .toLowerCase();
      const cfVisitor = ((req.headers['cf-visitor'] as string) || '').toLowerCase();
      const hostHeader = (req.headers.host || '').toLowerCase();
      const hostname = hostHeader.split(':')[0];
      const isHttps =
        req.secure ||
        forwardedProto === 'https' ||
        cfVisitor.includes('"https"') ||
        hostname.endsWith('.trycloudflare.com');
      const isLoopback =
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '[::1]' ||
        hostname === '::1';
      const isHtmlNav =
        req.path === '/' ||
        req.path === '/index.html' ||
        req.path === '/studio.html' ||
        (req.headers.accept || '').includes('text/html');

      if (!isHttps && !isLoopback && isHtmlNav && !req.query.lan) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        return res.redirect(302, `${currentHttpsOrigin}${req.originalUrl}`);
      }
    }

    next();
  });

  // Frontend assets. HTML/JS/CSS revalidate on every load so a deployment is
  // picked up immediately without stale bundles.
  const frontendPath = path.resolve(__dirname, '../../frontend');
  app.use(
    express.static(frontendPath, {
      maxAge: 0,
      etag: true,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('manifest.json') || filePath.endsWith('.webmanifest')) {
          res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        } else if (filePath.endsWith('sw.js')) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.setHeader('Service-Worker-Allowed', '/');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else if (filePath.endsWith('.png')) {
          res.setHeader('Content-Type', 'image/png');
          res.setHeader('Cache-Control', 'public, max-age=3600');
        } else if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      },
    }),
  );

  const host = process.env.HOST || '0.0.0.0';

  await app.listen(port, host);
  logger.log(`🚀 Flaptap AI online on http://${host}:${port} (LAN: http://${getLanIp()}:${port})`);
  logger.log(
    process.env.OPENCODE_GO_API_KEY
      ? `🧠 AI: OpenCode Go · ${process.env.OPENCODE_GO_MODEL || 'deepseek-v4.1-flash'}`
      : '⚠️  AI: OPENCODE_GO_API_KEY is not set. Translation and dialogue generation are disabled until it is added.',
  );

  syncAdbReverse(port);
  void ensureHttpsTunnel(port, rootDir, logger);
  tunnelMonitorTimer = setInterval(() => {
    syncAdbReverse(port);
    void ensureHttpsTunnel(port, rootDir, logger);
  }, 25000);

  const shutdown = async (signal: string) => {
    logger.log(`${signal} received: closing Flaptap cleanly...`);
    if (tunnelMonitorTimer) {
      clearInterval(tunnelMonitorTimer);
      tunnelMonitorTimer = null;
    }
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

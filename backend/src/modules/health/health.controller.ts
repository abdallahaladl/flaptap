import { Controller, Get, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { SqliteService } from '../../core/database/sqlite.service';

@Controller()
export class HealthController {
  private pythonVersionCache: string | null = null;

  constructor(private readonly sqlite: SqliteService) {}

  private checkPython(): { available: boolean; version: string } {
    if (this.pythonVersionCache) {
      return { available: true, version: this.pythonVersionCache };
    }
    try {
      const out = execFileSync('python3', ['--version'], {
        encoding: 'utf-8',
        timeout: 2000,
      }).trim();
      this.pythonVersionCache = out;
      return { available: true, version: out };
    } catch {
      return { available: false, version: 'unavailable' };
    }
  }

  private performHealthCheck() {
    let sqliteHealthy = false;
    let sqliteError: string | null = null;

    try {
      const row = this.sqlite.db.prepare('SELECT 1 as alive').get() as { alive?: number };
      sqliteHealthy = row?.alive === 1;
    } catch (err: any) {
      sqliteError = err?.message || String(err);
    }

    const python = this.checkPython();
    const isAiConfigured = Boolean(process.env.OPENCODE_GO_API_KEY);
    const isHealthy = sqliteHealthy;

    const memory = process.memoryUsage();
    let publicUrl: string | null = null;
    try {
      const urlFile = path.resolve(process.cwd(), 'data/PUBLIC_URL.txt');
      if (fs.existsSync(urlFile)) {
        publicUrl = fs.readFileSync(urlFile, 'utf-8').trim() || null;
      } else if (process.env.DOMAIN && process.env.DOMAIN !== 'flaptap.example.com') {
        publicUrl = `https://${process.env.DOMAIN.replace(/^https?:\/\//, '')}`;
      }
    } catch {}

    return {
      healthy: isHealthy,
      payload: {
        status: isHealthy ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime_seconds: Math.floor(process.uptime()),
        environment: process.env.NODE_ENV || 'production',
        public_url: publicUrl,
        checks: {
          database: {
            status: sqliteHealthy ? 'healthy' : 'unhealthy',
            engine: 'node:sqlite (WAL)',
            path: this.sqlite.dbPath,
            error: sqliteError,
          },
          python: {
            status: python.available ? 'available' : 'missing',
            version: python.version,
          },
          ai: {
            status: isAiConfigured ? 'configured' : 'key_missing',
            model: process.env.OPENCODE_GO_MODEL || 'deepseek-v4.1-flash',
            provider: 'OpenCode Go',
          },
        },
        memory: {
          rss_mb: Math.round((memory.rss / (1024 * 1024)) * 10) / 10,
          heap_used_mb: Math.round((memory.heapUsed / (1024 * 1024)) * 10) / 10,
        },
      },
    };
  }

  @Get('health')
  getHealth(@Res() res: Response) {
    const { healthy, payload } = this.performHealthCheck();
    return res.status(healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).json(payload);
  }

  @Get('api/health')
  getApiHealth(@Res() res: Response) {
    const { healthy, payload } = this.performHealthCheck();
    return res.status(healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).json(payload);
  }
}

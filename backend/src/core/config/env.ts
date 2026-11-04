import * as fs from 'fs';
import * as path from 'path';

/**
 * Minimal, dependency-free .env loader.
 *
 * NestJS bootstrap needs environment variables before the first request, and the
 * platform intentionally ships without @nestjs/config or dotenv. `backend/.env` is
 * read first, then the repository root `.env` (which wins on conflicts), and values
 * already present in the real process environment always win.
 */
let loaded = false;

function parseEnvFile(content: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
    const separator = normalized.indexOf('=');
    if (separator <= 0) continue;

    const key = normalized.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = normalized.slice(separator + 1).trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1);
      if (quote === '"') {
        value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t');
      }
    } else {
      // Strip trailing inline comments: KEY=value # note
      value = value.replace(/\s+#.*$/, '');
    }

    values[key] = value;
  }

  return values;
}

export function loadEnvironment(): void {
  if (loaded) return;
  loaded = true;

  const rootEnv = path.resolve(__dirname, '../../../../.env'); // repository root
  const backendEnv = path.resolve(__dirname, '../../../.env'); // backend/.env
  const explicitCandidates = [backendEnv, rootEnv];

  const candidates = [...explicitCandidates];
  if (!explicitCandidates.some((file) => fs.existsSync(file))) {
    candidates.push(path.resolve(process.cwd(), '.env'));
  }

  const merged: Record<string, string> = {};
  const visited = new Set<string>();

  for (const file of candidates) {
    if (visited.has(file)) continue;
    visited.add(file);

    try {
      if (!fs.existsSync(file)) continue;
      Object.assign(merged, parseEnvFile(fs.readFileSync(file, 'utf-8')));
    } catch {
      // A malformed or unreadable optional file must never block boot.
    }
  }

  for (const [key, value] of Object.entries(merged)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

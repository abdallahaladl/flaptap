import {
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { classifyMediaUrl } from './media-url';

export type TranscriptProviderKey = 'youtube' | 'external';

export interface ProviderPolicy {
  minSpacingMs: number;
  jitterMs: number;
  maxPer10Min: number;
  maxPerHour: number;
  cooldownStepsSec: number[];
}

export interface ProviderGuardStateEntry {
  recentCallsMs: number[];
  lastCallAtMs: number;
  cooldownUntilMs: number;
  consecutiveRateLimits: number;
  lastRateLimitAtMs: number;
}

export interface NegativeCacheEntry {
  code: string;
  message: string;
  expiresAtMs: number;
}

export interface PersistedGuardState {
  version: number;
  providers: Record<string, ProviderGuardStateEntry>;
  negativeCache: Record<string, NegativeCacheEntry>;
  recentTargets: Record<string, number>;
}

export interface GuardExecuteOptions<T> {
  provider: TranscriptProviderKey;
  targetKey: string;
  force?: boolean;
  isRateLimitError: (error: unknown) => boolean;
  classifyPermanentError?: (error: unknown) => { code: string; message: string } | null;
  run: () => Promise<T>;
}

export interface GuardProviderSnapshot {
  state: 'ready' | 'cooldown' | 'budget_exhausted';
  retryAfterSec: number;
  cooldownUntil: string | null;
  callsLast10m: number;
  maxPer10Min: number;
  callsLastHour: number;
  maxPerHour: number;
  consecutiveRateLimits: number;
}

export interface GuardStatusSnapshot {
  liveFetchEnabled: boolean;
  providers: Record<TranscriptProviderKey, GuardProviderSnapshot>;
}

export interface TranscriptProviderGuardOptions {
  stateFilePath?: string;
  nowFn?: () => number;
  sleepFn?: (ms: number) => Promise<void>;
  jitterFn?: (maxMs: number) => number;
  policies?: Partial<Record<TranscriptProviderKey, Partial<ProviderPolicy>>>;
  negativeCacheTtlMs?: number;
  forceCooldownMs?: number;
}

const TEN_MIN_MS = 10 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const DEFAULT_NEGATIVE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_FORCE_COOLDOWN_MS = 120 * 1000;
const MAX_RECENT_TARGETS = 500;

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

export function resolveProviderForUrl(url: string): TranscriptProviderKey {
  const media = classifyMediaUrl(url);
  if (media?.source === 'youtube') return 'youtube';
  return 'external';
}

export function formatRetryCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM > 0 ? `${h}h ${remM}m` : `${h}h`;
}

/**
 * Shared rate-limit guard for outbound transcript/subtitle providers.
 *
 * Enforces:
 *  - Environment kill-switch (`FLAPTAP_LIVE_TRANSCRIPTS=off` / `NODE_ENV=test`)
 *  - Single-flight in-process deduplication per (provider, targetKey)
 *  - Persisted negative cache for permanent failures (no_captions, video_unavailable)
 *  - Serialized per-provider FIFO queue with conservative spacing + jitter
 *  - Sliding-window budgets (10 min & 1 hour) checked BEFORE hitting the network
 *  - Persistent circuit breaker with exponential cooldown across restarts
 */
@Injectable()
export class TranscriptProviderGuard {
  private readonly logger = new Logger(TranscriptProviderGuard.name);
  private readonly stateFilePath: string;
  private readonly nowFn: () => number;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly jitterFn: (maxMs: number) => number;
  private readonly policies: Record<TranscriptProviderKey, ProviderPolicy>;
  private readonly negativeCacheTtlMs: number;
  private readonly forceCooldownMs: number;

  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly providerQueues = new Map<TranscriptProviderKey, Promise<unknown>>();
  private memoryState: PersistedGuardState | null = null;
  private diskWriteWarned = false;

  constructor(@Optional() options: TranscriptProviderGuardOptions = {}) {
    const customPath = (options.stateFilePath || process.env.FLAPTAP_GUARD_STATE_PATH || '').trim();
    this.stateFilePath = customPath
      ? path.resolve(customPath)
      : path.resolve(__dirname, '../../../../data/transcript-guard-state.json');

    this.nowFn = options.nowFn || (() => Date.now());
    this.sleepFn =
      options.sleepFn || ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.jitterFn =
      options.jitterFn || ((maxMs: number) => (maxMs > 0 ? Math.floor(Math.random() * maxMs) : 0));

    this.negativeCacheTtlMs = options.negativeCacheTtlMs ?? DEFAULT_NEGATIVE_CACHE_TTL_MS;
    this.forceCooldownMs = options.forceCooldownMs ?? DEFAULT_FORCE_COOLDOWN_MS;

    const ytDefaults: ProviderPolicy = {
      minSpacingMs: readPositiveIntEnv('FLAPTAP_YT_MIN_SPACING_MS', 5000),
      jitterMs: 1200,
      maxPer10Min: readPositiveIntEnv('FLAPTAP_YT_MAX_PER_10M', 8),
      maxPerHour: readPositiveIntEnv('FLAPTAP_YT_MAX_PER_HOUR', 24),
      cooldownStepsSec: [900, 2700, 7200],
    };
    const extDefaults: ProviderPolicy = {
      minSpacingMs: readPositiveIntEnv('FLAPTAP_EXT_MIN_SPACING_MS', 3000),
      jitterMs: 800,
      maxPer10Min: readPositiveIntEnv('FLAPTAP_EXT_MAX_PER_10M', 12),
      maxPerHour: readPositiveIntEnv('FLAPTAP_EXT_MAX_PER_HOUR', 40),
      cooldownStepsSec: [600, 1800, 3600],
    };

    this.policies = {
      youtube: { ...ytDefaults, ...(options.policies?.youtube || {}) },
      external: { ...extDefaults, ...(options.policies?.external || {}) },
    };
  }

  public isLiveFetchDisabled(): boolean {
    const flag = (process.env.FLAPTAP_LIVE_TRANSCRIPTS || '').trim().toLowerCase();
    if (flag === 'off' || flag === '0' || flag === 'false') return true;
    if (flag === 'on' || flag === '1' || flag === 'true') return false;
    return (process.env.NODE_ENV || '').trim().toLowerCase() === 'test';
  }

  public shouldSkipForceRefresh(provider: TranscriptProviderKey, targetKey: string): boolean {
    const cleanKey = String(targetKey || '').trim();
    if (!cleanKey) return false;
    const state = this.loadState();
    const lastFetchedAt = state.recentTargets[`${provider}:${cleanKey}`] || 0;
    return lastFetchedAt > 0 && this.nowFn() - lastFetchedAt < this.forceCooldownMs;
  }

  public async execute<T>(opts: GuardExecuteOptions<T>): Promise<T> {
    if (this.isLiveFetchDisabled()) {
      throw new ServiceUnavailableException({
        code: 'live_fetch_disabled',
        provider: opts.provider,
        retryAfterSec: 0,
        message:
          'Live transcript fetching is disabled by guard policy (FLAPTAP_LIVE_TRANSCRIPTS=off). Use cached lessons or import a transcript instead.',
      });
    }

    const flightKey = `${opts.provider}:${opts.targetKey || 'default'}`;
    const existingFlight = this.inFlight.get(flightKey) as Promise<T> | undefined;
    if (existingFlight) {
      return existingFlight;
    }

    if (!opts.force) {
      const state = this.loadState();
      const neg = state.negativeCache[flightKey];
      if (neg && neg.expiresAtMs > this.nowFn()) {
        throw this.toPermanentHttpException(neg.code, neg.message);
      }
    }

    const runPromise = this.enqueueProvider(opts.provider, async () => {
      const state = this.loadState();
      const policy = this.policies[opts.provider];
      const entry = this.getProviderEntry(state, opts.provider);
      let now = this.nowFn();

      if (entry.cooldownUntilMs > now) {
        const retryAfterSec = Math.max(1, Math.ceil((entry.cooldownUntilMs - now) / 1000));
        throw this.buildRateLimitException(opts.provider, retryAfterSec, entry.cooldownUntilMs);
      }

      entry.recentCallsMs = entry.recentCallsMs.filter((ts) => now - ts < ONE_HOUR_MS);
      const budgetBlockSec = this.computeBudgetBlockSec(entry.recentCallsMs, policy, now);
      if (budgetBlockSec > 0) {
        throw this.buildRateLimitException(
          opts.provider,
          budgetBlockSec,
          now + budgetBlockSec * 1000,
          true,
        );
      }

      const jitter = this.jitterFn(policy.jitterMs);
      const waitMs = entry.lastCallAtMs + policy.minSpacingMs + jitter - now;
      if (waitMs > 0) {
        await this.sleepFn(waitMs);
        now = this.nowFn();
      }

      entry.lastCallAtMs = now;
      entry.recentCallsMs.push(now);
      entry.recentCallsMs = entry.recentCallsMs.filter((ts) => now - ts < ONE_HOUR_MS);
      state.recentTargets[flightKey] = now;
      this.pruneStateMaps(state, now);
      this.saveState(state);

      try {
        const result = await opts.run();
        const postState = this.loadState();
        const postEntry = this.getProviderEntry(postState, opts.provider);
        postEntry.consecutiveRateLimits = 0;
        postEntry.cooldownUntilMs = 0;
        delete postState.negativeCache[flightKey];
        this.saveState(postState);
        return result;
      } catch (err) {
        if (opts.isRateLimitError(err)) {
          const trip = this.recordRateLimit(opts.provider);
          throw this.buildRateLimitException(
            opts.provider,
            trip.retryAfterSec,
            trip.cooldownUntilMs,
          );
        }
        const permanent = opts.classifyPermanentError?.(err);
        if (permanent) {
          const postState = this.loadState();
          postState.negativeCache[flightKey] = {
            code: permanent.code,
            message: permanent.message,
            expiresAtMs: this.nowFn() + this.negativeCacheTtlMs,
          };
          this.saveState(postState);
        }
        throw err;
      }
    });

    this.inFlight.set(flightKey, runPromise);
    try {
      return await runPromise;
    } finally {
      this.inFlight.delete(flightKey);
    }
  }

  public getStatusSnapshot(): GuardStatusSnapshot {
    const state = this.loadState();
    const now = this.nowFn();
    return {
      liveFetchEnabled: !this.isLiveFetchDisabled(),
      providers: {
        youtube: this.buildProviderSnapshot(state, 'youtube', now),
        external: this.buildProviderSnapshot(state, 'external', now),
      },
    };
  }

  private buildProviderSnapshot(
    state: PersistedGuardState,
    provider: TranscriptProviderKey,
    now: number,
  ): GuardProviderSnapshot {
    const policy = this.policies[provider];
    const entry = this.getProviderEntry(state, provider);
    const recent1h = entry.recentCallsMs.filter((ts) => now - ts < ONE_HOUR_MS);
    const recent10m = recent1h.filter((ts) => now - ts < TEN_MIN_MS);

    let snapshotState: GuardProviderSnapshot['state'] = 'ready';
    let retryAfterSec = 0;
    let cooldownUntil: string | null = null;

    if (entry.cooldownUntilMs > now) {
      snapshotState = 'cooldown';
      retryAfterSec = Math.max(1, Math.ceil((entry.cooldownUntilMs - now) / 1000));
      cooldownUntil = new Date(entry.cooldownUntilMs).toISOString();
    } else {
      const budgetSec = this.computeBudgetBlockSec(recent1h, policy, now);
      if (budgetSec > 0) {
        snapshotState = 'budget_exhausted';
        retryAfterSec = budgetSec;
        cooldownUntil = new Date(now + budgetSec * 1000).toISOString();
      }
    }

    return {
      state: snapshotState,
      retryAfterSec,
      cooldownUntil,
      callsLast10m: recent10m.length,
      maxPer10Min: policy.maxPer10Min,
      callsLastHour: recent1h.length,
      maxPerHour: policy.maxPerHour,
      consecutiveRateLimits: entry.consecutiveRateLimits,
    };
  }

  private enqueueProvider<T>(provider: TranscriptProviderKey, task: () => Promise<T>): Promise<T> {
    const prev = this.providerQueues.get(provider) || Promise.resolve();
    const next = prev.then(task, task);
    this.providerQueues.set(
      provider,
      next.catch(() => undefined),
    );
    return next;
  }

  private computeBudgetBlockSec(recentCallsMs: number[], policy: ProviderPolicy, now: number): number {
    const recent10m = recentCallsMs.filter((ts) => now - ts < TEN_MIN_MS).sort((a, b) => a - b);
    const recent1h = recentCallsMs.filter((ts) => now - ts < ONE_HOUR_MS).sort((a, b) => a - b);

    let waitMs = 0;
    if (recent10m.length >= policy.maxPer10Min) {
      const oldestBlocking = recent10m[recent10m.length - policy.maxPer10Min];
      waitMs = Math.max(waitMs, oldestBlocking + TEN_MIN_MS - now);
    }
    if (recent1h.length >= policy.maxPerHour) {
      const oldestBlocking = recent1h[recent1h.length - policy.maxPerHour];
      waitMs = Math.max(waitMs, oldestBlocking + ONE_HOUR_MS - now);
    }
    return waitMs > 0 ? Math.max(1, Math.ceil(waitMs / 1000)) : 0;
  }

  private recordRateLimit(provider: TranscriptProviderKey): {
    retryAfterSec: number;
    cooldownUntilMs: number;
  } {
    const state = this.loadState();
    const entry = this.getProviderEntry(state, provider);
    const policy = this.policies[provider];
    const now = this.nowFn();

    // Reset streak if previous rate limit was long ago (> 6h)
    if (entry.lastRateLimitAtMs && now - entry.lastRateLimitAtMs > 6 * ONE_HOUR_MS) {
      entry.consecutiveRateLimits = 0;
    }

    entry.consecutiveRateLimits = (entry.consecutiveRateLimits || 0) + 1;
    entry.lastRateLimitAtMs = now;
    const stepIdx = Math.min(entry.consecutiveRateLimits - 1, policy.cooldownStepsSec.length - 1);
    const retryAfterSec = policy.cooldownStepsSec[Math.max(0, stepIdx)];
    entry.cooldownUntilMs = now + retryAfterSec * 1000;
    this.saveState(state);

    this.logger.warn(
      `Circuit breaker OPEN for provider "${provider}" (${retryAfterSec}s cooldown, strike #${entry.consecutiveRateLimits}).`,
    );
    return { retryAfterSec, cooldownUntilMs: entry.cooldownUntilMs };
  }

  private buildRateLimitException(
    provider: TranscriptProviderKey,
    retryAfterSec: number,
    cooldownUntilMs: number,
    isBudget = false,
  ): ServiceUnavailableException {
    const label = provider === 'youtube' ? 'YouTube' : 'the media provider';
    const countdown = formatRetryCountdown(retryAfterSec);
    const message = isBudget
      ? `Paused for ${countdown} to keep ${label} transcript requests within a safe hourly budget. Cached lessons still open instantly.`
      : `${label} rate-limit guard is active. Live fetches are paused for ${countdown} to protect this network from IP blocks.`;
    return new ServiceUnavailableException({
      code: 'rate_limited',
      provider,
      retryAfterSec,
      cooldownUntil: new Date(cooldownUntilMs).toISOString(),
      message,
    });
  }

  private toPermanentHttpException(code: string, message: string): HttpException {
    if (code === 'video_unavailable') {
      return new NotFoundException({ code, message });
    }
    return new UnprocessableEntityException({ code: code || 'no_captions', message });
  }

  private getProviderEntry(
    state: PersistedGuardState,
    provider: TranscriptProviderKey,
  ): ProviderGuardStateEntry {
    if (!state.providers[provider]) {
      state.providers[provider] = {
        recentCallsMs: [],
        lastCallAtMs: 0,
        cooldownUntilMs: 0,
        consecutiveRateLimits: 0,
        lastRateLimitAtMs: 0,
      };
    }
    return state.providers[provider];
  }

  private pruneStateMaps(state: PersistedGuardState, now: number): void {
    for (const [key, entry] of Object.entries(state.negativeCache)) {
      if (!entry || entry.expiresAtMs <= now) {
        delete state.negativeCache[key];
      }
    }
    const targetEntries = Object.entries(state.recentTargets);
    for (const [key, ts] of targetEntries) {
      if (!Number.isFinite(ts) || now - ts > ONE_HOUR_MS) {
        delete state.recentTargets[key];
      }
    }
    const remaining = Object.entries(state.recentTargets);
    if (remaining.length > MAX_RECENT_TARGETS) {
      remaining.sort((a, b) => a[1] - b[1]);
      for (const [key] of remaining.slice(0, remaining.length - MAX_RECENT_TARGETS)) {
        delete state.recentTargets[key];
      }
    }
  }

  private emptyState(): PersistedGuardState {
    return {
      version: 1,
      providers: {},
      negativeCache: {},
      recentTargets: {},
    };
  }

  private loadState(): PersistedGuardState {
    try {
      if (!fs.existsSync(this.stateFilePath)) {
        return this.memoryState ? this.cloneState(this.memoryState) : this.emptyState();
      }
      const raw = fs.readFileSync(this.stateFilePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 1 && parsed.providers && typeof parsed.providers === 'object') {
        const normalized: PersistedGuardState = {
          version: 1,
          providers: parsed.providers || {},
          negativeCache: parsed.negativeCache || {},
          recentTargets: parsed.recentTargets || {},
        };
        this.memoryState = normalized;
        return this.cloneState(normalized);
      }
    } catch {
      if (this.memoryState) return this.cloneState(this.memoryState);
    }
    return this.emptyState();
  }

  private saveState(state: PersistedGuardState): void {
    this.memoryState = this.cloneState(state);
    try {
      fs.mkdirSync(path.dirname(this.stateFilePath), { recursive: true });
      const tmp = `${this.stateFilePath}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(state), 'utf-8');
      fs.renameSync(tmp, this.stateFilePath);
    } catch (err: any) {
      if (!this.diskWriteWarned) {
        this.diskWriteWarned = true;
        this.logger.warn(`Could not persist transcript guard state: ${err?.message || err}`);
      }
    }
  }

  private cloneState(state: PersistedGuardState): PersistedGuardState {
    return JSON.parse(JSON.stringify(state));
  }
}

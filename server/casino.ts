/**
 * The casino side of the Grove Casino contract (GAMES.md), as plain HTTP.
 *
 * Everything that talks to the casino lives in this file. It follows the
 * documented endpoints; where GAMES.md does not spell out a response field
 * (balances, limits, the halt reason) the readers below accept the likely
 * names. When the official `sdk/casino-game.js` is available, check these
 * readers against it or wrap the SDK behind the same `Casino` interface.
 */

export type GameStatus = 'live' | 'last_bets' | 'halted' | 'maintenance';

export interface Limits {
  minBetCents: number;
  maxBetCents: number;
  maxWinCents: number;
}

export interface ControlState {
  status: GameStatus;
  /** Reason the admin gave, shown to players. */
  reason: string;
  settings: Record<string, unknown>;
  limits: Limits;
  rtpBps: number | null;
}

/** A player's balance as the casino reports it. */
export interface Balance {
  value: number;
  unit: 'cents' | 'tokens';
}

export interface OpenedSession {
  session: string;
  player: { id: string; name: string };
  table: string | null;
  /** The player's balance, when the casino includes it. */
  balance: Balance | null;
}

export interface Casino {
  openSession(token: string): Promise<OpenedSession>;
  openRound(a: { session: string; round: string; betCents: number; meta?: unknown }): Promise<Balance | null>;
  settle(a: { round: string; winCents: number; outcome?: string; meta?: unknown }): Promise<Balance | null>;
  voidRound(round: string, reason: string): Promise<void>;
  heartbeat(version: string, players: number): Promise<ControlState | null>;
  control(): Promise<ControlState>;
  /** Streams `control` events until the returned function is called. */
  events(onControl: (c: ControlState) => void): () => void;
  score(session: string, score: number, meta?: unknown): Promise<void>;
  closeSession(session: string): Promise<void>;
}

/** An error answer from the casino: `{error}` plus extras such as `balance` or `game_status`. */
export class CasinoError extends Error {
  constructor(
    readonly status: number,
    readonly body: Record<string, unknown>,
  ) {
    super(typeof body.error === 'string' ? body.error : `casino answered ${status}`);
  }

  /** Network trouble or a casino-side failure: safe to retry with the same round id. */
  get retryable(): boolean {
    return this.status === 0 || this.status >= 500;
  }
}

/** Limits used until the casino sends its own; they match casino-game.json. */
export const DEFAULT_LIMITS: Limits = { minBetCents: 20, maxBetCents: 500, maxWinCents: 2_500_000 };

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const STATUSES: readonly GameStatus[] = ['live', 'last_bets', 'halted', 'maintenance'];

export function readControl(raw: unknown): ControlState {
  const r = (raw ?? {}) as Record<string, unknown>;
  const l = (r.limits ?? {}) as Record<string, unknown>;
  const status = STATUSES.includes(r.status as GameStatus) ? (r.status as GameStatus) : 'maintenance';
  return {
    status,
    reason: String(r.reason ?? r.message ?? r.status_reason ?? ''),
    settings: (r.settings && typeof r.settings === 'object' ? r.settings : {}) as Record<string, unknown>,
    limits: {
      minBetCents: num(l.min_bet_cents) ?? DEFAULT_LIMITS.minBetCents,
      maxBetCents: num(l.max_bet_cents) ?? DEFAULT_LIMITS.maxBetCents,
      maxWinCents: num(l.max_win_cents) ?? DEFAULT_LIMITS.maxWinCents,
    },
    rtpBps: num(r.rtp_bps),
  };
}

export function readBalance(raw: unknown): Balance | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const cents = num(r.balance_cents);
  if (cents !== null) return { value: cents, unit: 'cents' };
  const tokens = num(r.balance) ?? num(r.balance_tokens);
  return tokens === null ? null : { value: tokens, unit: 'tokens' };
}

/** Talks to the real casino with the game key. */
export class HttpCasino implements Casino {
  constructor(
    private readonly baseUrl: string,
    private readonly key: string,
    private readonly timeoutMs = 10_000,
  ) {}

  private async call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Record<string, unknown>> {
    let res: Response;
    try {
      res = await fetch(new URL(path, this.baseUrl), {
        method,
        headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      throw new CasinoError(0, { error: `network: ${(e as Error).message}` });
    }
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { error: text.slice(0, 200) };
    }
    if (!res.ok) throw new CasinoError(res.status, json);
    return json;
  }

  async openSession(token: string): Promise<OpenedSession> {
    const r = await this.call('POST', '/api/game/session/open', { token });
    const p = (r.player ?? {}) as Record<string, unknown>;
    return {
      session: String(r.session),
      player: { id: String(p.id ?? p.player_id ?? r.player), name: String(p.name ?? p.username ?? 'Player') },
      table: r.table == null ? null : String(r.table),
      balance: readBalance(r) ?? readBalance(p),
    };
  }

  async openRound(a: { session: string; round: string; betCents: number; meta?: unknown }) {
    return readBalance(await this.call('POST', '/api/game/round/open', { session: a.session, round: a.round, bet_cents: a.betCents, meta: a.meta }));
  }

  async settle(a: { round: string; winCents: number; outcome?: string; meta?: unknown }) {
    return readBalance(await this.call('POST', '/api/game/round/settle', { round: a.round, win_cents: a.winCents, outcome: a.outcome, meta: a.meta }));
  }

  async voidRound(round: string, reason: string) {
    await this.call('POST', '/api/game/round/void', { round, reason });
  }

  async heartbeat(version: string, players: number) {
    const r = await this.call('POST', '/api/game/heartbeat', { version, players });
    return 'status' in r ? readControl(r) : r.control ? readControl(r.control) : null;
  }

  async control() {
    return readControl(await this.call('GET', '/api/game/control'));
  }

  events(onControl: (c: ControlState) => void): () => void {
    let stopped = false;
    let controller: AbortController | null = null;
    const run = async () => {
      let delay = 1000;
      while (!stopped) {
        controller = new AbortController();
        try {
          const res = await fetch(new URL('/api/game/events', this.baseUrl), {
            headers: { Authorization: `Bearer ${this.key}`, Accept: 'text/event-stream' },
            signal: controller.signal,
          });
          if (!res.ok || !res.body) throw new Error(`events answered ${res.status}`);
          delay = 1000;
          await readSse(res.body, (event, data) => {
            if (event !== 'control') return;
            try {
              onControl(readControl(JSON.parse(data)));
            } catch {
              // Ignore a malformed event; the next heartbeat corrects the state.
            }
          });
        } catch {
          // Reconnect below.
        }
        if (!stopped) await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, 30_000);
      }
    };
    void run();
    return () => {
      stopped = true;
      controller?.abort();
    };
  }

  async score(session: string, score: number, meta?: unknown) {
    await this.call('POST', '/api/game/score', { session, score, meta });
  }

  async closeSession(session: string) {
    await this.call('POST', '/api/game/session/close', { session });
  }
}

/** Minimal server-sent-events reader. */
async function readSse(body: ReadableStream<Uint8Array>, onEvent: (event: string, data: string) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let cut: number;
    while ((cut = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      let event = 'message';
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
      }
      if (data.length > 0) onEvent(event, data.join('\n'));
    }
  }
}

import type { Alley } from '../engine/features/gamble';
import type { FeatureKey, RoundResult } from '../engine/round';
import type { PublicState } from '../../server/game';

export type { PublicState };

/** A refusal or failure from the game server, with the message to show. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body: Record<string, unknown>,
  ) {
    super(message);
  }
}

export interface Welcome {
  lobbyUrl: string;
  dev: boolean;
  state: PublicState;
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'offline', 'Lowrider could not be reached. Check your connection.', {});
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(res.status, String(json.code ?? 'error'), String(json.error ?? 'Something went wrong.'), json);
  }
  return json as T;
}

/**
 * The page's only connection: the Lowrider game server. It never talks to
 * the casino and never decides an outcome.
 */
export const api = {
  /** Swaps the casino's one-time `gc_token` for a game session (cookie). */
  openSession: (token: string | null) => call<Welcome>('POST', '/api/session', token ? { token } : {}),
  state: () => call<Welcome>('GET', '/api/state'),
  spin: (betCents: number, force?: FeatureKey | 'driveBy') =>
    call<{ result: RoundResult; state: PublicState }>('POST', '/api/spin', { betCents, force }),
  gamble: (pick: Alley) =>
    call<{ escape: Alley; won: boolean; stake: number; canContinue: boolean; state: PublicState }>('POST', '/api/gamble', { pick }),
  collect: () => call<{ state: PublicState }>('POST', '/api/collect', {}),
  leave: () => navigator.sendBeacon?.('/api/leave'),
  /** Live control state (live, last bets, halted, maintenance). */
  events: (onControl: (c: { status: PublicState['status']; reason: string }) => void): EventSource => {
    const source = new EventSource('/api/events');
    source.addEventListener('control', (e) => {
      try {
        onControl(JSON.parse((e as MessageEvent).data));
      } catch {
        // Ignore a malformed event; the next one corrects it.
      }
    });
    return source;
  },
};

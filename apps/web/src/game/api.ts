import type { Alley } from '@lowrider/shared/engine/features/gamble';
import type { FeatureKey, RoundResult } from '@lowrider/shared/engine/round';
import type { BalanceEvent, ControlEvent, PublicState, Welcome } from '@lowrider/shared/api';

export type { PublicState, Welcome };

/**
 * This tab's seat at the game. Tabs share cookies, so a cookie would let a second tab kick the first; the seat
 * travels as a header instead and lives in sessionStorage, which is per tab (memory when storage is off).
 */
const SEAT_KEY = 'lowrider_seat';
let seat: string | null = null;
try {
  seat = sessionStorage.getItem(SEAT_KEY);
} catch {
  seat = null;
}
function setSeat(id: string | null): void {
  seat = id;
  try {
    if (id) sessionStorage.setItem(SEAT_KEY, id);
    else sessionStorage.removeItem(SEAT_KEY);
  } catch {
    // No storage: the seat lives in memory for this tab.
  }
}
const seatQuery = (): string => (seat ? `?seat=${encodeURIComponent(seat)}` : '');

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


async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (seat) headers['X-Lowrider-Seat'] = seat;
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers,
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
  /** Swaps the casino's one-time `gc_token` for a game session; without a token, picks this tab's seat back up. */
  openSession: async (token: string | null): Promise<Welcome> => {
    const welcome = await call<Welcome>('POST', '/api/session', token ? { token } : {});
    setSeat(welcome.seat);
    return welcome;
  },
  state: async (): Promise<Welcome> => {
    const welcome = await call<Welcome>('GET', '/api/state');
    if (welcome.seat) setSeat(welcome.seat);
    return welcome;
  },
  spin: (betCents: number, force?: FeatureKey | 'driveBy') =>
    call<{ result: RoundResult; state: PublicState }>('POST', '/api/spin', { betCents, force }),
  gamble: (pick: Alley) =>
    call<{ escape: Alley; won: boolean; stake: number; canContinue: boolean; state: PublicState }>('POST', '/api/gamble', { pick }),
  collect: () => call<{ state: PublicState }>('POST', '/api/collect', {}),
  /** The bonus of the last spin has been played back: nothing from it is in progress any more. */
  shown: () => call<{ ok: boolean }>('POST', '/api/shown', {}),
  leave: () => navigator.sendBeacon?.(`/api/leave${seatQuery()}`),
  /** Live control state (open, demo, maintenance, closed, offline) and the player's balance. */
  events: (onControl: (c: ControlEvent) => void, onBalance: (b: BalanceEvent) => void): EventSource => {
    const source = new EventSource(`/api/events${seatQuery()}`);
    const listen = <T>(type: string, handler: (data: T) => void) =>
      source.addEventListener(type, (e) => {
        try {
          handler(JSON.parse((e as MessageEvent).data) as T);
        } catch {
          // Ignore a malformed event; the next one corrects it.
        }
      });
    listen('control', onControl);
    listen('balance', onBalance);
    return source;
  },
};

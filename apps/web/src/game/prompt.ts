import type { GameStore } from '../stores/game';
import type { Ask } from '../view/ask';
import { timing } from '../view/tween';

let pending: ((id: string) => void) | null = null;

/** Builds the scenes' `ask`: the question goes into the store, the Vue action bar answers it. */
export function createAsk(store: GameStore): Ask {
  return (choices, options = {}) =>
    new Promise<string>((resolve) => {
      pending?.(choices[0].id);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const done = (id: string) => {
        if (timer) clearTimeout(timer);
        if (pending === done) pending = null;
        store.prompt = null;
        resolve(id);
      };
      pending = done;
      store.prompt = { title: options.title, label: options.label, choices };
      if (options.autoAfterMs !== undefined) {
        timer = setTimeout(() => done(options.autoChoice ?? choices[0].id), options.autoAfterMs / timing.speed);
      }
    });
}

/** Called by the action bar. */
export function answer(id: string): void {
  pending?.(id);
}

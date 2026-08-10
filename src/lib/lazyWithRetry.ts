import { lazy, type ComponentType } from 'react';

/**
 * lazyWithRetry — hardened React.lazy.
 *
 * A failed dynamic import (flaky network, cold CDN, or a stale chunk hash after
 * a new deploy) rejects forever: the Suspense boundary never resolves and the
 * page renders BLANK with no error in most setups. This wrapper:
 *   1. retries the import a few times with backoff,
 *   2. force-reloads once (with a cache-busting flag) when the failure looks
 *      like a stale-deploy chunk error,
 *   3. otherwise rethrows so the nearest error boundary can show a real UI.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  retries = 3,
) {
  return lazy(async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await factory();
      } catch (err) {
        lastError = err;
        await new Promise(r => setTimeout(r, 250 * (attempt + 1)));
      }
    }

    const msg = String((lastError as Error)?.message ?? lastError);
    const isChunkError =
      /dynamically imported module|Loading chunk|Importing a module script failed|Failed to fetch/i.test(msg);

    if (isChunkError && typeof window !== 'undefined') {
      const KEY = 'wolfdex.chunkReload';
      const last = Number(window.sessionStorage.getItem(KEY) || 0);
      // only auto-reload once per minute to avoid a reload loop
      if (Date.now() - last > 60_000) {
        window.sessionStorage.setItem(KEY, String(Date.now()));
        window.location.reload();
        // keep the promise pending while the reload happens
        return new Promise<{ default: T }>(() => {});
      }
    }

    throw lastError;
  });
}

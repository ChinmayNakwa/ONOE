'use client';

import { useSyncExternalStore } from 'react';

// False while the server renders and during hydration, true afterwards in the browser.
// Pages use it to avoid a mismatch, because the wallet connection only exists in the browser.
export function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

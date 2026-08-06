import { useSyncExternalStore } from 'react';
import { classifyWriteError, type WriteFailure } from './client';

/**
 * One place that knows a write failed.
 *
 * Almost every mutation in this app is fired and forgotten — a toggle, a
 * chip, a modal that closes itself on save. That is the right shape for the
 * interface and a terrible shape for failure: when the write is refused
 * there is nothing holding the promise, nothing on screen moves, and a
 * broken control is indistinguishable from a working one. An entire settings
 * section shipped in exactly that state, rendering perfectly and persisting
 * nothing, because its migration had not been run.
 *
 * Both write paths report here — the session's profile and couple updates,
 * and every create/update/delete that goes through `useTable` — so a single
 * banner covers the whole app rather than each screen having to remember.
 *
 * It is a module-level store rather than a context on purpose. `useTable` is
 * called from inside the session's own subtree and from components mounted
 * above it; a context would force an ordering that neither of them should
 * have to care about, and this has no such constraint.
 */

let current: WriteFailure | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Records a failed write. Returns what it classified it as, for the caller. */
export function reportWriteFailure(error: unknown): WriteFailure {
  const failure = classifyWriteError(error);
  current = failure;
  emit();
  return failure;
}

export function clearWriteFailure(): void {
  if (current === null) return;
  current = null;
  emit();
}

/**
 * Resets the store between tests.
 *
 * Module state outlives a single render tree, so without this one test's
 * failure banner turns up in the next test's screen.
 */
export function resetWriteFailure(): void {
  current = null;
  listeners.clear();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): WriteFailure | null {
  return current;
}

export function useWriteFailure(): WriteFailure | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

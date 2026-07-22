'use client';
import { useCallback, useState } from 'react';

const PREFIX = 'bang-memory:';

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // storage full/disabled -- the memory feature is a convenience, fine to silently no-op
  }
}

/**
 * Small client-only "remember this for next time" store, e.g. the last machine name used on a
 * given production step, or a user's preferred pipeline view. Not synced with the server --
 * purely a per-device convenience, so it's fine if it resets when someone clears browser data or
 * switches devices.
 */
export function useLocalMemory<T>(key: string, fallback: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => read(key, fallback));

  const set = useCallback(
    (next: T) => {
      setValue(next);
      write(key, next);
    },
    [key]
  );

  return [value, set];
}

/** Bounded recently-used list (e.g. recently viewed lots/batches, recently used reason chips). */
export function pushRecent(key: string, item: string, max = 8): string[] {
  const current = read<string[]>(key, []);
  const next = [item, ...current.filter((x) => x !== item)].slice(0, max);
  write(key, next);
  return next;
}

export function readRecent(key: string): string[] {
  return read<string[]>(key, []);
}

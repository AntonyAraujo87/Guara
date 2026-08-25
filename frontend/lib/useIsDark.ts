import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', callback);
  return () => mq.removeEventListener('change', callback);
}

function getSnapshot() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function getServerSnapshot() {
  return false;
}

export function useIsDark(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Installable-app support: registers the service worker and tracks whether the app can be
 * installed, is already installed, is offline, or has an update waiting.
 */
import { useSyncExternalStore } from 'react';

/** Chrome / Edge / Android's install event (not in the standard DOM types yet). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  /** The browser offered a one-tap install (Android Chrome, desktop Chrome / Edge). */
  canPrompt: boolean;
  /** Running as an installed app (home screen / app window), not in a browser tab. */
  installed: boolean;
  /** iPhone or iPad, where installing is done from Safari's Share menu. */
  ios: boolean;
  online: boolean;
  /** A newer version of the app was downloaded and is ready after a refresh. */
  updateReady: boolean;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function detectIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac, so also check for a touch screen.
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function detectInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: minimal-ui)').matches || nav.standalone === true;
}

let state: PwaState = {
  canPrompt: false,
  installed: detectInstalled(),
  ios: detectIos(),
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  updateReady: false,
};

function set(patch: Partial<PwaState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function usePwa(): PwaState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** Opens the browser's install dialog. Returns true if the person installed the app. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const ev = deferred;
  deferred = null;
  set({ canPrompt: false });
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  return outcome === 'accepted';
}

/** Hooks up install, online/offline and update events and registers the service worker. */
export function initPwa() {
  if (typeof window === 'undefined') return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // show our own Install button instead of the browser's mini-bar
    deferred = e as BeforeInstallPromptEvent;
    set({ canPrompt: true });
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    set({ canPrompt: false, installed: true });
  });
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', () => set({ installed: detectInstalled() }));
  window.addEventListener('online', () => set({ online: true }));
  window.addEventListener('offline', () => set({ online: false }));

  // Only in the built app: in development the service worker would keep serving stale files.
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // First install takes control silently; later changes mean a new version arrived.
    if (hadController) set({ updateReady: true });
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js', { scope: './' })
      .then((reg) => {
        // Check for a new version whenever the app comes back to the foreground.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        });
      })
      .catch(() => {
        /* the app still works as a normal website */
      });
  });
}

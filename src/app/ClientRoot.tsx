'use client';
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { FeedbackProvider } from '@/components/feedback';
import { EditorProvider } from '@/components/editors';
import { processScheduled, releasePendingNotifications, runReminders } from '@/data/commsActions';
import { collectGarbage } from '@/lib/images';
import { collectFileGarbage } from '@/lib/files';
import { getDb } from '@/data/store';
import { initPwa } from '@/lib/pwa';

// Background jobs (browser-only: they run while the app is open).
function backgroundJobs(reminders: boolean) {
  try {
    processScheduled();
    releasePendingNotifications();
    if (reminders) runReminders();
  } catch {
    /* never block the app on housekeeping */
  }
}

let started = false;
function startOnce() {
  if (started) return;
  started = true;
  setTimeout(() => backgroundJobs(true), 1500);
  setInterval(() => backgroundJobs(false), 60_000);
  setInterval(() => backgroundJobs(true), 15 * 60_000);
  // Tidy up stored photo files that no longer belong to any record.
  setTimeout(() => collectGarbage(new Set((getDb().photos ?? []).map((p) => p.id))), 3000);
  setTimeout(() => collectFileGarbage(new Set((getDb().media ?? []).map((m) => m.id))), 4000);
  // Installable app: service worker, install button, offline notice.
  initPwa();
}

/**
 * The studio's data lives in this browser (localStorage / IndexedDB) for now, so screens
 * render only in the browser, never on the server. A soft loading screen shows for a moment.
 */
export function ClientRoot({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Old bookmarks from before the switch to Next.js look like /#/costumes: open that page.
    if (window.location.hash.startsWith('#/')) window.location.replace(window.location.hash.slice(1));
    startOnce();
    setReady(true);
  }, []);
  if (!ready) return <div className="app-loading" aria-label="Loading" />;
  return (
    <Suspense fallback={<div className="app-loading" aria-label="Loading" />}>
      <FeedbackProvider>
        <EditorProvider>{children}</EditorProvider>
      </FeedbackProvider>
    </Suspense>
  );
}

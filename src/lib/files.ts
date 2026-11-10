import { useEffect, useState } from 'react';

/**
 * Media library file storage (documents, music, video, images). Bytes live in
 * the browser's IndexedDB; the file's details live in `db.media`. Nothing is
 * uploaded to a server — files stay on this device until a real backend is
 * connected.
 */

const DB_NAME = 'studio-costume-manager-files';
const STORE = 'files';
export const MAX_FILE_BYTES = 200 * 1024 * 1024;
/** Files up to this size are embedded in the JSON backup. Larger ones (videos) are not. */
export const BACKUP_FILE_LIMIT = 8 * 1024 * 1024;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('This browser cannot store files.'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open file storage.'));
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(req ? req.result : undefined);
        t.onerror = () => reject(t.error ?? new Error('File storage error.'));
        t.onabort = () => reject(t.error ?? new Error('File storage is full or unavailable.'));
      }),
  );
}

const urlCache = new Map<string, string>();

export function saveFile(id: string, blob: Blob) {
  return tx('readwrite', (s) => s.put({ id, blob }));
}

export async function getFileBlob(id: string): Promise<Blob | undefined> {
  const rec = await tx<{ id: string; blob: Blob }>('readonly', (s) => s.get(id)).catch(() => undefined);
  return rec?.blob;
}

export function deleteFile(id: string) {
  const u = urlCache.get(id);
  if (u) URL.revokeObjectURL(u);
  urlCache.delete(id);
  return tx('readwrite', (s) => s.delete(id));
}

export async function clearFiles() {
  urlCache.forEach((u) => URL.revokeObjectURL(u));
  urlCache.clear();
  await tx('readwrite', (s) => s.clear());
}

export async function allFileIds(): Promise<string[]> {
  return ((await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys()).catch(() => [])) ?? []).map(String);
}

export async function fileUrl(id: string): Promise<string | null> {
  const c = urlCache.get(id);
  if (c) return c;
  const b = await getFileBlob(id);
  if (!b) return null;
  const u = URL.createObjectURL(b);
  urlCache.set(id, u);
  return u;
}

/** React hook: an object URL for a stored file (null while loading or missing). */
export function useFileUrl(id: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(id ? urlCache.get(id) ?? null : null);
  useEffect(() => {
    let alive = true;
    if (!id) {
      setUrl(null);
      return;
    }
    fileUrl(id).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [id]);
  return url;
}

export async function downloadStoredFile(id: string, name: string) {
  const u = await fileUrl(id);
  if (!u) throw new Error('This file is not stored on this device.');
  const a = document.createElement('a');
  a.href = u;
  a.download = name;
  a.click();
}

export async function collectFileGarbage(valid: Set<string>) {
  try {
    for (const id of await allFileIds()) if (!valid.has(id)) await deleteFile(id);
  } catch {
    /* storage unavailable */
  }
}

/* ---------------------------------------------------------- backup */

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

export async function exportFiles(ids: string[]) {
  const out: Record<string, string> = {};
  let skipped = 0;
  for (const id of ids) {
    const b = await getFileBlob(id);
    if (!b) continue;
    if (b.size > BACKUP_FILE_LIMIT) {
      skipped += 1;
      continue;
    }
    out[id] = await blobToDataUrl(b);
  }
  return { files: out, skipped };
}

export async function importFiles(map: Record<string, string> | undefined) {
  if (!map || typeof map !== 'object') return 0;
  let n = 0;
  for (const [id, url] of Object.entries(map)) {
    if (typeof url !== 'string' || !url.startsWith('data:')) continue;
    await saveFile(id, await (await fetch(url)).blob());
    n += 1;
  }
  return n;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

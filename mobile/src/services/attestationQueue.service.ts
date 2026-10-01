import * as FileSystem from 'expo-file-system';
import { initDb } from './offline.service';
import { driverApi } from '../api/driver';
import { useAuthStore } from '../stores/authStore';
import { AttestationQueue, type NewAttestation, type QueueStorage } from '../lib/attestationQueue';
import type { AssignedManifest, QueuedAttestation } from '../types/driver';

const VIDEO_DIR = `${FileSystem.documentDirectory ?? ''}attestations/`;
const MANIFEST_CACHE_KEY = 'driver_manifests';

async function ensureTables() {
  const db = await initDb();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS attestation_queue (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kv_cache (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

export const sqliteQueueStorage: QueueStorage = {
  async list() {
    const db = await ensureTables();
    const rows = await db.getAllAsync<{ data: string }>('SELECT data FROM attestation_queue ORDER BY created_at ASC');
    return rows.map((r) => JSON.parse(r.data) as QueuedAttestation);
  },
  async put(item) {
    const db = await ensureTables();
    await db.runAsync('INSERT OR REPLACE INTO attestation_queue (id, created_at, data) VALUES (?, ?, ?)', [
      item.id,
      item.createdAt,
      JSON.stringify(item),
    ]);
  },
  async remove(id) {
    const db = await ensureTables();
    await db.runAsync('DELETE FROM attestation_queue WHERE id = ?', [id]);
  },
};

/**
 * The picker returns videos in a cache directory the OS may purge before we
 * get online again. Copy into the app's document directory so a queued
 * attestation survives until it is uploaded.
 */
export async function persistVideo(sourceUri: string): Promise<string> {
  await FileSystem.makeDirectoryAsync(VIDEO_DIR, { intermediates: true }).catch(() => undefined);
  const dest = `${VIDEO_DIR}${Date.now()}-${Math.random().toString(16).slice(2, 8)}.mp4`;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  return dest;
}

export const attestationQueue = new AttestationQueue(
  sqliteQueueStorage,
  async (item) => {
    const token = useAuthStore.getState().token ?? (await useAuthStore.getState().getToken());
    await driverApi.submitAttestation(item, token);
  },
  {
    // The video is only needed until the server has it (or the user discards the item).
    onItemDone: (item) => FileSystem.deleteAsync(item.videoUri, { idempotent: true }).catch(() => undefined),
  },
);

export async function queueAttestation(input: NewAttestation): Promise<QueuedAttestation> {
  return attestationQueue.enqueue(input);
}

/** Last manifests fetched successfully, so the driver home works offline. */
export async function cacheManifests(manifests: AssignedManifest[]): Promise<void> {
  const db = await ensureTables();
  await db.runAsync('INSERT OR REPLACE INTO kv_cache (key, value) VALUES (?, ?)', [
    MANIFEST_CACHE_KEY,
    JSON.stringify(manifests),
  ]);
}

export async function getCachedManifests(): Promise<AssignedManifest[] | null> {
  const db = await ensureTables();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM kv_cache WHERE key = ?', [
    MANIFEST_CACHE_KEY,
  ]);
  return row ? (JSON.parse(row.value) as AssignedManifest[]) : null;
}

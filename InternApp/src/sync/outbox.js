import AsyncStorage from '@react-native-async-storage/async-storage';
import BlobUtils from 'react-native-blob-util';
import {getAppUser} from '../api/client';

// Durable write-after-offline queue (the "outbox").
// AsyncStorage is the source of truth so queued actions survive restarts even
// if the Redux mirror is lost. Binary uploads are copied into a dedicated
// pending dir so a later replay always has the original bytes.

const OUTBOX_PREFIX = 'outbox';
export const PENDING_DIR = `${BlobUtils.fs.dirs.CacheDir}/pending_uploads/`;

/**
 * Builds an idempotency-protected, replayable operation record.
 * op = {
 *   kind: 'intern' | 'admin' | 'mentor',
 *   label, method, url, body?,
 *   files?: [{fieldName, fileName, filePath, mimeType}],
 *   entityKey?, scope?, snapshot?,   // moderation precondition data
 * }
 */
export function makeItem(op) {
  return {
    id: `op_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    kind: op.kind || 'intern',
    label: op.label || op.url,
    method: op.method,
    url: op.url,
    body: op.body ?? null,
    files: op.files || [],
    idempotencyKey: op.idempotencyKey || null,
    entityKey: op.entityKey || null,
    scope: op.scope || null,
    snapshot: op.snapshot || null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'queued', // queued | sending | done | failed | conflict
    tries: 0,
    error: null,
  };
}

function storageKey(userId) {
  return `${OUTBOX_PREFIX}:${userId}`;
}

export function currentOutboxKey() {
  const user = getAppUser();
  return user?.userId ? storageKey(user.userId) : null;
}

export async function loadOutbox() {
  const key = currentOutboxKey();
  if (!key) return [];
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function replaceOutbox(items) {
  const key = currentOutboxKey();
  if (!key) return;
  try {
    await AsyncStorage.setItem(key, JSON.stringify(items));
  } catch {
    /* storage failure must not crash the app; UI shows stale until fixed */
  }
}

// Copy a user-picked file into our durable pending dir so replays always have
// the bytes even if the OS prunes the picker's temp file. Returns local path.
export async function promoteFile(source, fileName) {
  const ext = (fileName?.split('.').pop() || 'bin').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6);
  const dest = `${PENDING_DIR}${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}.${ext || 'bin'}`;
  try {
    await BlobUtils.fs.mkdir(PENDING_DIR);
    await BlobUtils.fs.cp(source, dest);
    return dest;
  } catch {
    try {
      const base64 = await BlobUtils.fs.readFile(source, 'base64');
      await BlobUtils.fs.writeFile(dest, base64, 'base64');
      return dest;
    } catch {
      return source; // fall back to the original reference
    }
  }
}

export async function clearOutbox(userId) {
  try {
    await AsyncStorage.removeItem(storageKey(userId));
  } catch {
    /* ignore */
  }
}
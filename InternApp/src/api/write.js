import client, {getAppUser, makeIdempotencyKey} from './client';
import {getConnectivity} from '../sync/connectivity';
import {makeItem, promoteFile, loadOutbox, replaceOutbox} from '../sync/outbox';
import {upsertItem} from '../store/slices/syncSlice';
import {store} from '../store';

// Classifies an axios error: offline/no-response vs a server verdict.
export function isNetworkError(err) {
  if (!err) return false;
  if (!err.response) return true;
  return err.code === 'ECONNABORTED';
}

// Anything the server didn't permanently reject can be retried later.
export function isTransientError(err) {
  if (isNetworkError(err)) return true;
  const s = err.response?.status;
  return !!s && s >= 500;
}

function isMultipart(op) {
  return !!op.files && op.files.length > 0;
}

function buildFormData(op) {
  const formData = new FormData();
  if (op.body && typeof op.body === 'object') {
    Object.entries(op.body).forEach(([k, v]) => {
      if (v !== undefined && v !== null) formData.append(k, v);
    });
  }
  op.files.forEach(f => {
    formData.append(f.fieldName, {
      uri: f.filePath,
      name: f.fileName,
      type: f.mimeType || 'application/octet-stream',
    });
  });
  return formData;
}

async function doLive(op) {
  const headers = {};
  if (op.idempotencyKey) headers['Idempotency-Key'] = op.idempotencyKey;
  if (isMultipart(op)) {
    headers['Content-Type'] = 'multipart/form-data';
    return client.request({method: op.method, url: op.url, data: buildFormData(op), headers});
  }
  return client.request({
    method: op.method,
    url: op.url,
    data: op.body ?? undefined,
    headers,
  });
}

let enqueueMutex = Promise.resolve();

async function enqueueOp(op) {
  // Copy binaries into the durable pending dir so a replay always has bytes.
  let files = op.files || [];
  if (files.length) {
    files = await Promise.all(
      files.map(async f => ({...f, filePath: await promoteFile(f.filePath, f.fileName)})),
    );
  }

  const create = () =>
    makeItem({
      kind: op.kind,
      label: op.label,
      method: op.method,
      url: op.url,
      body: isMultipart(op) ? op.body || {} : op.body ?? null,
      files,
      idempotencyKey: op.idempotencyKey,
      entityKey: op.entityKey,
      scope: op.scope,
      snapshot: op.snapshot,
    });

  const afterCreate = async item => {
    // Serialize read-modify-write so rapid taps can't drop an enqueue.
    enqueueMutex = enqueueMutex
      .then(async () => {
        const items = await loadOutbox();
        items.push(item);
        await replaceOutbox(items);
        store.dispatch(upsertItem({...item}));
      })
      .catch(() => {});
    await enqueueMutex;
    return item;
  };

  return afterCreate(create());
}

/**
 * Universal write helper for every screen.
 *
 * op = {
 *   kind: 'intern' | 'admin' | 'mentor',
 *   label, method, url,
 *   body?, files?: [{fieldName, fileName, filePath, mimeType}],
 *   entityKey?, scope?, snapshot?,
 *   requiresOnline?: true → throws a .__offline error when offline (attendance/auth)
 * }
 *
 * Resolves {queued:false, res} on a live success, or {queued:true, item} when the
 * action was parked in the outbox for later replay.
 */
export async function write(op) {
  const online = getConnectivity().isOnline;

  if (op.requiresOnline && !online) {
    const err = new Error('You are offline. This action needs an internet connection.');
    err.__offline = true;
    throw err;
  }

  const finalOp = {...op};
  if (!finalOp.idempotencyKey) finalOp.idempotencyKey = makeIdempotencyKey();
  if (!finalOp.label) finalOp.label = finalOp.url;

  if (online) {
    try {
      const res = await doLive(finalOp);
      return {queued: false, res};
    } catch (err) {
      if (!isTransientError(err)) throw err; // server said NO — surface it
      // transient (offline race / 5xx) → park it like an offline write
    }
  }

  if (op.requiresOnline) {
    const err = new Error('Could not reach the server. Try again when connected.');
    err.__offline = true;
    throw err;
  }

  const item = await enqueueOp(finalOp);
  return {queued: true, item};
}

export {getAppUser};
import client, {getAppUser, makeIdempotencyKey} from '../api/client';
import {loadOutbox, replaceOutbox} from './outbox';
import {getConnectivity, subscribeConnectivity} from './connectivity';
import {revalidateRecent, clearUserCache} from '../api/cache';
import {setOnline, setItems, upsertItem, removeItem, setLastSyncAt, addLocalNotification} from '../store/slices/syncSlice';
import {showToast} from '../components/AppToast';

export const MAX_TRANSIENT = 8;
let storeRef = null;
let initialized = false;
let draining = false;

export function initSyncEngine(store) {
  storeRef = store;
  if (initialized) return;
  initialized = true;

  const applyOnline = online => {
    if (storeRef) storeRef.dispatch(setOnline(online));
  };

  subscribeConnectivity(conn => {
    applyOnline(conn.isOnline);
    if (conn.isOnline) {
      drain().catch(() => {});
      revalidateRecent(client).catch(() => {});
    }
  });

  applyOnline(getConnectivity().isOnline);
  loadOutboxIndex().catch(() => {});
}

async function loadOutboxIndex() {
  if (!storeRef) return;
  const items = await loadOutbox();
  storeRef.dispatch(setItems(items.map(toUiItem)));
}

function toUiItem(item) {
  return {...item};
}

function notify(title, body) {
  if (!storeRef) return;
  const id = `sync_${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  storeRef.dispatch(
    addLocalNotification({
      id,
      title,
      body,
      isRead: false,
      type: 'sync',
      createdAt: Date.now(),
    }),
  );
  showToast(title, 'error');
}

async function checkPrecondition(item) {
  const snap = item.snapshot;
  if (!snap?.fetchUrl) return {ok: true};
  let state;
  try {
    const res = await client.get(snap.fetchUrl, {skipCache: true});
    state = res.data || {};
  } catch {
    // State endpoint unreachable → hand control to the server's CAS. Safe:
    // a stale approve will be rejected by the atomic UPDATE and become a 409.
    return {ok: true, unable: true};
  }
  const issues = [];
  if (snap.expectedStatus && state.status && state.status !== snap.expectedStatus) {
    issues.push(`state is now "${state.status}", expected "${snap.expectedStatus}"`);
  }
  if (snap.expectedWithdrawn === true) {
    if (state.withdrawn) issues.push('already withdrawn');
  } else if (snap.expectedWithdrawn === false && state.withdrawn) {
    issues.push('withdrawn by the intern');
  }
  if (snap.expectedMentorId && state.mentorId && state.mentorId !== snap.expectedMentorId) {
    issues.push('intern reassigned to another mentor');
  }
  if (issues.length) return {ok: false, message: issues.join('; ')};
  return {ok: true};
}

function buildFormParts(item) {
  // returns [FormData, headers] for multipart items, else null
  if (!item.files || item.files.length === 0) return null;
  const formData = new FormData();
  Object.entries(item.body || {}).forEach(([k, v]) => formData.append(k, v));
  item.files.forEach(f => {
    formData.append(f.fieldName, {
      uri: f.filePath,
      name: f.fileName,
      type: f.mimeType || 'application/octet-stream',
    });
  });
  return formData;
}

async function sendItem(item) {
  const config = {
    headers: {},
  };
  if (item.idempotencyKey) config.headers['Idempotency-Key'] = item.idempotencyKey;
  const parts = buildFormParts(item);
  if (parts) {
    config.headers['Content-Type'] = 'multipart/form-data';
    return client.request({method: item.method, url: item.url, data: parts, ...config});
  }
  return client.request({
    method: item.method,
    url: item.url,
    data: item.body ?? undefined,
    ...config,
  });
}

/**
 * Pure classifier for a failed item send. Mirrors drain()'s error handling
 * exactly so the retry/terminal policies are testable in isolation.
 * @param {Error & {response?: {status?: number, data?: {code?: string, message?: string}}}} err
 * @param {number} tries retry count on the item before this attempt
 * @returns {{outcome: 'conflict'|'terminal'|'transient', reason: string|null,
 *            nextTries: number, toast: string|null}}
 *   outcome 'conflict' → stale-state rejection (HTTP 409 or STALE_STATE code);
 *   'terminal' → permanently failed (any 4xx, or transient retries exhausted);
 *   'transient' → network/5xx, item stays queued for the next drain.
 *   reason is what drain() stores on item.error; toast is the notify() body
 *   (null = no toast). nextTries reproduces the current tries accounting,
 *   including the 4xx and transient branches both incrementing.
 */
// `reason` populates item.error (internal diagnostics);
// `toast` populates the user-facing notification. The cap case
// uses different strings for each — preserved from the original
// inline block — so the return shape carries both.
export function classifySendError(err, tries = 0) {
  const status = err?.response?.status;
  const data = err?.response?.data;

  if (status === 409 || data?.code === 'STALE_STATE') {
    return {
      outcome: 'conflict',
      reason: data?.message || 'Entity state changed; someone else may have acted on it.',
      nextTries: tries,
      toast: data?.message || 'Entity state changed; someone else may have acted on it.',
    };
  }

  if (status && status >= 400 && status < 500) {
    return {
      outcome: 'terminal',
      reason: data?.message || `Server rejected (HTTP ${status})`,
      nextTries: tries + 1,
      toast: data?.message || `Server rejected (HTTP ${status})`,
    };
  }

  const nextTries = tries + 1;
  if (nextTries > MAX_TRANSIENT) {
    return {
      outcome: 'terminal',
      reason: 'Kept failing after multiple retries.',
      nextTries,
      toast: 'still not synced.',
    };
  }
  return {outcome: 'transient', reason: null, nextTries, toast: null};
}

/**
 * Pure FIFO ordering for the outbox, oldest first. Returns a copy and never
 * mutates its input. JS sort is stable (ES2019), so items sharing an
 * entityKey keep their enqueue order and equal timestamps keep input order.
 * Per-entity blocking during a drain pass is applied by drain(), not here.
 * @param {Array<{createdAt: number}>} items
 * @returns {Array<{createdAt: number}>} copy sorted ascending by createdAt
 */
export function sortOutboxFifo(items) {
  return items.slice().sort((a, b) => a.createdAt - b.createdAt);
}

// FIFO drain. For items sharing an entityKey, only the oldest is eligible:
// later ops on the same entity wait for the earlier one to settle.
async function drain() {
  if (!storeRef || draining) return;
  if (!getConnectivity().isOnline) return;
  const user = getAppUser();
  if (!user?.userId) return;

  draining = true;
  try {
    let items = (await loadOutbox()).map(it => ({...it}));
    // A crash can leave an item 'sending'; idempotency keys make re-sending safe.
    items.forEach(it => {
      if (it.status === 'sending') it.status = 'queued';
    });

    const eligible = it =>
      it.status === 'queued' ||
      (it.status === 'failed' && it.tries <= MAX_TRANSIENT && !it.terminal);

    // block later ops on entities whose earlier op is still unsettled
    const blockedEntities = new Set();
    const ordered = sortOutboxFifo(items);

    for (const item of ordered) {
      if (!eligible(item)) continue;
      if (item.entityKey && blockedEntities.has(item.entityKey)) continue;
      if (getConnectivity().isOnline === false) break;

      item.status = 'sending';
      item.updatedAt = Date.now();
      await replaceOutbox(items);
      storeRef.dispatch(upsertItem(toUiItem(item)));

      const precondition = await checkPrecondition(item);
      if (!precondition.ok) {
        item.status = 'conflict';
        item.error = precondition.message;
        notify('Sync conflict', `${item.label} — ${precondition.message}`);
        items = items.map(i => (i.id === item.id ? item : i));
        await replaceOutbox(items);
        storeRef.dispatch(upsertItem(toUiItem(item)));
        if (item.entityKey) blockedEntities.add(item.entityKey);
        continue;
      }

      try {
        await sendItem(item);
        items = items.filter(i => i.id !== item.id);
        await replaceOutbox(items);
        storeRef.dispatch(removeItem(item.id));
        storeRef.dispatch(setLastSyncAt(Date.now()));
      } catch (err) {
        const verdict = classifySendError(err, item.tries);
        item.tries = verdict.nextTries;
        if (verdict.outcome === 'conflict') {
          item.status = 'conflict';
          item.error = verdict.reason;
          notify('Sync conflict', `${item.label} — ${verdict.toast}`);
        } else if (verdict.outcome === 'terminal') {
          item.terminal = true;
          item.status = 'failed';
          item.error = verdict.reason;
          notify('Sync failed', `${item.label} — ${verdict.toast}`);
        } else {
          // network / 5xx — transient, keep queued for the next drain
          item.status = 'queued';
          item.error = null;
        }
        item.updatedAt = Date.now();
        items = items.map(i => (i.id === item.id ? item : i));
        await replaceOutbox(items);
        storeRef.dispatch(upsertItem(toUiItem(item)));
        if (item.entityKey) blockedEntities.add(item.entityKey);
      }
    }
  } finally {
    draining = false;
  }
}

export async function flushPending() {
  return drain();
}

export async function retryItem(store, id) {
  if (!store) return;
  const items = await loadOutbox();
  const item = items.find(i => i.id === id);
  if (!item) return;
  item.status = 'queued';
  item.tries = 0;
  item.terminal = false;
  await replaceOutbox(items.map(i => (i.id === id ? item : i)));
  store.dispatch(upsertItem(toUiItem(item)));
  drain().catch(() => {});
}

export async function discardItem(store, id) {
  if (!store) return;
  const items = await loadOutbox();
  await replaceOutbox(items.filter(i => i.id !== id));
  store.dispatch(removeItem(id));
}

export async function retryAll(store) {
  if (!store) return;
  const items = (await loadOutbox()).map(i =>
    i.status === 'failed' || i.status === 'conflict' || i.status === 'queued'
      ? {...i, status: 'queued', tries: 0, terminal: false, error: null}
      : i,
  );
  await replaceOutbox(items);
  store.dispatch(setItems(items.map(toUiItem)));
  drain().catch(() => {});
}

export async function purgeOutbox(store) {
  const user = getAppUser();
  if (!user?.userId) return;
  await replaceOutbox([]);
  store.dispatch(setItems([]));
  clearUserCache(user.userId).catch(() => {});
}

export {makeIdempotencyKey};
export function setItemIdempotencyKey(item) {
  return item.idempotencyKey || makeIdempotencyKey();
}
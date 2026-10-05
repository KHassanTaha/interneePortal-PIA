import client, {getAppUser, makeIdempotencyKey} from '../api/client';
import {loadOutbox, replaceOutbox} from './outbox';
import {getConnectivity, subscribeConnectivity} from './connectivity';
import {revalidateRecent, clearUserCache} from '../api/cache';
import {setOnline, setItems, upsertItem, removeItem, setLastSyncAt, addLocalNotification} from '../store/slices/syncSlice';
import {showToast} from '../components/AppToast';

const MAX_TRANSIENT = 8;
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
    const ordered = items
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt);

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
        const status = err.response?.status;
        if (status === 409 || err.response?.data?.code === 'STALE_STATE') {
          item.status = 'conflict';
          item.error = err.response?.data?.message || 'Entity state changed; someone else may have acted on it.';
          notify('Sync conflict', `${item.label} — ${item.error}`);
        } else if (status && status >= 400 && status < 500) {
          item.tries += 1;
          item.terminal = true;
          item.status = 'failed';
          item.error = err.response?.data?.message || `Server rejected (HTTP ${status})`;
          notify('Sync failed', `${item.label} — ${item.error}`);
        } else {
          // network / 5xx — transient, keep queued for the next drain
          item.tries += 1;
          item.status = 'queued';
          item.error = null;
          if (item.tries > MAX_TRANSIENT) {
            item.terminal = true;
            item.status = 'failed';
            item.error = 'Kept failing after multiple retries.';
            notify('Sync failed', `${item.label} — still not synced.`);
          }
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
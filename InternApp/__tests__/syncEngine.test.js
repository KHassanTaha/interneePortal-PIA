import {
  classifySendError,
  sortOutboxFifo,
  MAX_TRANSIENT,
} from '../src/sync/syncEngine';

// These tests pin the two pure seams extracted from drain(). The WHY they
// matter (AGENTS.md 6): a 409/STALE_STATE must never retry or go terminal,
// any 4xx must go terminal immediately (D-S6), network/5xx must stay queued
// up to the retry cap, and replay order is FIFO per entity. If the business
// policy changes, these tests fail because the classifier changed, not
// because the fixtures changed.

describe('classifySendError', () => {
  test('HTTP 409 → conflict; tries are not consumed', () => {
    const verdict = classifySendError(
      {response: {status: 409, data: {message: 'stale'}}},
      3,
    );
    expect(verdict).toEqual({
      outcome: 'conflict',
      reason: 'stale',
      nextTries: 3,
      toast: 'stale',
    });
  });

  test('data.code STALE_STATE on a non-409 status → conflict, never terminal', () => {
    const verdict = classifySendError(
      {response: {status: 400, data: {code: 'STALE_STATE', message: 'someone else acted'}}},
      1,
    );
    expect(verdict.outcome).toBe('conflict');
    expect(verdict.nextTries).toBe(1);
  });

  test('HTTP 404 → terminal, failed, reason names the status', () => {
    const verdict = classifySendError({response: {status: 404, data: {}}}, 0);
    expect(verdict).toEqual({
      outcome: 'terminal',
      reason: 'Server rejected (HTTP 404)',
      nextTries: 1,
      toast: 'Server rejected (HTTP 404)',
    });
  });

  test('HTTP 401 → terminal; server message surfaces, not a generic one', () => {
    const verdict = classifySendError(
      {response: {status: 401, data: {message: 'Not authorized. Login again.'}}},
      2,
    );
    expect(verdict).toEqual({
      outcome: 'terminal',
      reason: 'Not authorized. Login again.',
      nextTries: 3,
      toast: 'Not authorized. Login again.',
    });
  });

  test('HTTP 500 → transient; stays queued, no toast', () => {
    const verdict = classifySendError({response: {status: 500, data: {}}}, 2);
    expect(verdict).toEqual({outcome: 'transient', reason: null, nextTries: 3, toast: null});
  });

  test('network error (no response) → transient', () => {
    const verdict = classifySendError(new Error('Network request failed'), 4);
    expect(verdict.outcome).toBe('transient');
    expect(verdict.nextTries).toBe(5);
  });

  test(`transient radio exhausted: tries ${MAX_TRANSIENT} → next attempt becomes terminal`, () => {
    const verdict = classifySendError(new Error('offline'), MAX_TRANSIENT);
    expect(verdict).toEqual({
      outcome: 'terminal',
      reason: 'Kept failing after multiple retries.',
      nextTries: MAX_TRANSIENT + 1,
      toast: 'still not synced.',
    });
  });

  test(`one below the cap stays transient (tries ${MAX_TRANSIENT - 1} → ${MAX_TRANSIENT})`, () => {
    const verdict = classifySendError(new Error('offline'), MAX_TRANSIENT - 1);
    expect(verdict.outcome).toBe('transient');
    expect(verdict.nextTries).toBe(MAX_TRANSIENT);
  });
});

describe('sortOutboxFifo', () => {
  test('mixed entityKeys → strictly createdAt-ascending (FIFO) order', () => {
    const a = {id: 'a', entityKey: 'k1', createdAt: 100};
    const b = {id: 'b', entityKey: 'k2', createdAt: 50};
    const c = {id: 'c', entityKey: 'k1', createdAt: 25};
    expect(sortOutboxFifo([a, b, c]).map(i => i.id)).toEqual(['c', 'b', 'a']);
  });

  test('two items sharing an entityKey keep their enqueue order', () => {
    const first = {id: 'enqueued-first', entityKey: 'e', createdAt: 1};
    const second = {id: 'enqueued-second', entityKey: 'e', createdAt: 5};
    expect(sortOutboxFifo([second, first]).map(i => i.id)).toEqual([
      'enqueued-first',
      'enqueued-second',
    ]);
  });

  test('equal timestamps → input order preserved (stable sort)', () => {
    const a = {id: 'a', entityKey: 'k', createdAt: 7};
    const b = {id: 'b', entityKey: 'k', createdAt: 7};
    const c = {id: 'c', entityKey: 'other', createdAt: 7};
    expect(sortOutboxFifo([b, a, c]).map(i => i.id)).toEqual(['b', 'a', 'c']);
  });

  test('empty input → empty output', () => {
    expect(sortOutboxFifo([])).toEqual([]);
  });

  test('single item → unchanged', () => {
    const item = {id: 'only', entityKey: 'k', createdAt: 42};
    expect(sortOutboxFifo([item])).toEqual([item]);
  });

  test('does not mutate its input', () => {
    const arr = [
      {id: 'late', createdAt: 99},
      {id: 'early', createdAt: 1},
    ];
    sortOutboxFifo(arr);
    expect(arr.map(i => i.id)).toEqual(['late', 'early']);
  });
});
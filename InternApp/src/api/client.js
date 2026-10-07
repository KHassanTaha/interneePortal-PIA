import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as tokenStore from './tokenStore';
import {API_BASE_URL} from '../config/constants';
import {getConnectivity} from '../sync/connectivity';
import {buildKey, cacheWrite, cacheRead, setCacheUser} from './cache';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {'Content-Type': 'application/json'},
});

// Tokens are cached in memory (keychain reads are per-request slow) and mirrored
// to the OS keychain via tokenStore so they survive app restarts.
let cachedAccessToken = null;
let cachedRefreshToken = null;
let hydratePromise = null;
let refreshPromise = null;

// Which user's read cache / outbox this device is operating as. Set on login /
// session restore; namespaces cached GETs and prevents cross-account leakage.
let currentUser = null;

export function setTokens(accessToken, refreshToken) {
  cachedAccessToken = accessToken;
  cachedRefreshToken = refreshToken;
  tokenStore.saveTokens(accessToken, refreshToken).catch(() => {});
}

export function getAccessToken() {
  return cachedAccessToken;
}

export function setAppUser(user) {
  currentUser = user || null;
  setCacheUser(user?.userId ?? user?.id ?? null);
}

export function getAppUser() {
  return currentUser;
}

export function makeIdempotencyKey() {
  return `ik_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}

export function clearTokens() {
  cachedAccessToken = null;
  cachedRefreshToken = null;
  refreshPromise = null;
  currentUser = null;
  setCacheUser(null);
  tokenStore.clearTokens().catch(() => {});
}

function hydrate() {
  if (!hydratePromise) {
    hydratePromise = (async () => {
      const [at, rt] = await Promise.all([tokenStore.getAccessToken(), tokenStore.getRefreshToken()]);
      cachedAccessToken = at;
      cachedRefreshToken = rt;
    })().finally(() => { hydratePromise = null; });
  }
  return hydratePromise;
}

// Request interceptor: attach token once hydrated; serve the read cache when
// the device is offline (never for writes, blob fetches, or explicit skipCache).
client.interceptors.request.use(async config => {
  if (!cachedAccessToken) await hydrate();
  if (cachedAccessToken) {
    config.headers.Authorization = `Bearer ${cachedAccessToken}`;
  }

  const isGet =
    (config.method || 'get').toLowerCase() === 'get' &&
    !config.skipCache &&
    !config.responseType;
  if (isGet && currentUser && !getConnectivity().isOnline) {
    const key = buildKey(config.url || '');
    const cached = await cacheRead(key);
    if (cached) {
      return {
        data: cached.data,
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
        request: {},
        __cached: true,
        __stale: cached.stale,
        __cachedAt: cached.fetchedAt,
      };
    }
  }
  return config;
});

// Response interceptor: keep the read cache warm; refresh token on 401 (mutex).
client.interceptors.response.use(
  response => {
    const config = response.config;
    const isGet =
      (config.method || 'get').toLowerCase() === 'get' &&
      !config.skipCache &&
      !config.responseType;
    if (isGet && currentUser) {
      cacheWrite(buildKey(config.url || ''), response.data).catch(() => {});
    }
    return response;
  },
  async error => {
    const original = error.config;
    if (!original || original._retry || error.response?.status !== 401) {
      return Promise.reject(error);
    }
    const url = original.url || '';
    if (url.includes('/auth/login') || url.includes('/auth/refresh') || url.includes('/auth/logout')) {
      return Promise.reject(error);
    }
    original._retry = true;

    if (!refreshPromise) {
      refreshPromise = (async () => {
        try {
          const refreshToken = cachedRefreshToken || await tokenStore.getRefreshToken();
          if (!refreshToken) throw new Error('No refresh token');
          const res = await axios.post(`${API_BASE_URL}/auth/refresh`, {refreshToken});
          const newAccess = res.data.accessToken;
          const newRefresh = res.data.refreshToken;
          setTokens(newAccess, newRefresh);
          return newAccess;
        } catch {
          // The refresh token is dead (revoked/rotated/expired). Clear the
          // keychain tokens AND reset the persisted redux session, otherwise the
          // app keeps drawing the dashboard with a rejected token: zeros and an
          // empty activity log with no error shown. Logging out sends the user
          // to the login screen instead of a frozen, no-data shell.
          clearTokens();
          await AsyncStorage.multiRemove(['user']);
          const {store} = require('../store');
          const {logoutUser} = require('../store/slices/authSlice');
          const {showToast} = require('../components/AppToast');
          if (store.getState().auth.isAuthenticated) {
            showToast('Your session expired. Please sign in again.', 'error');
            store.dispatch(logoutUser());
          }
          return null;
        } finally {
          refreshPromise = null;
        }
      })();
    }

    const newToken = await refreshPromise;
    if (newToken) {
      original.headers.Authorization = `Bearer ${newToken}`;
      return client(original);
    }
    return Promise.reject(error);
  },
);

export default client;
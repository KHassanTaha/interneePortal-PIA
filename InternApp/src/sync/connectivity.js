import {useEffect, useState} from 'react';
import NetInfo from '@react-native-community/netinfo';

// Single source of truth for network reachability.
// Implements an audience pattern so both the redux store (setOnline) and
// React components (useConnectivity) react to changes, and a "reconnect" tick
// that tells the sync engine (and optional UI) that the network just came back.

let currentState = {isOnline: true, reconnectTick: 0};
const listeners = new Set();

function emit(next) {
  currentState = next;
  listeners.forEach(cb => cb(currentState));
}

export function getConnectivity() {
  return currentState;
}

export function subscribeConnectivity(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

let started = false;

export function startConnectivityMonitoring() {
  if (started) return;
  started = true;
  const lastSnapshot = {isConnected: null, isInternetReachable: null};
  NetInfo.addEventListener(state => {
    const nowOnline =
      state.isConnected !== false && state.isInternetReachable !== false;
    const wasOnline = currentState.isOnline;
    const reconnect = !wasOnline && nowOnline;
    const tick = reconnect ? currentState.reconnectTick + 1 : currentState.reconnectTick;
    lastSnapshot.isConnected = state.isConnected;
    lastSnapshot.isInternetReachable = state.isInternetReachable;
    emit({isOnline: nowOnline, reconnectTick: tick});
  });
  // Seed the initial value so the UI never shows a stale "offline" state.
  NetInfo.fetch?.().then(state => {
    const nowOnline =
      state.isConnected !== false && state.isInternetReachable !== false;
    emit({isOnline: nowOnline, reconnectTick: currentState.reconnectTick});
  });
}

export function useConnectivity() {
  const [snapshot, setSnapshot] = useState(currentState);
  useEffect(() => subscribeConnectivity(setSnapshot), []);
  return snapshot;
}
/**
 * Jest setup — global mocks for native modules that have no JS
 * implementation under Node. AGENTS.md 6.2 requires AsyncStorage and
 * NetInfo to be mocked here.
 *
 * Mocks fall into two groups:
 *
 *  1. Official library mocks (`async-storage`, `netinfo`). These are
 *     behaviour-accurate and maintained by the library authors.
 *  2. Hand-written render-time stubs (blob-util, keychain, permissions,
 *     vision-camera, fs, share, html-to-pdf). These exist ONLY so the
 *     module graph can be imported by a smoke test. They are NOT
 *     behavioural mocks — a test that asserts real filesystem, Keychain
 *     or camera behaviour must build its own fake (W2.2 / W2.3).
 *
 * Anything a test actually asserts on belongs in that test, not here.
 */

// ---------------------------------------------------------------------------
// 1. Official library mocks
// ---------------------------------------------------------------------------

// AsyncStorage: in-memory jest mock shipped by the library.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// NetInfo: report a connected network so offline-aware code takes the
// online branch by default. Tests exercise D-03 by overriding this.
jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock'),
);

// ---------------------------------------------------------------------------
// 2. Render-time stubs
// ---------------------------------------------------------------------------

// react-native-blob-util — used by the sync outbox to copy picked
// documents into the cache dir (D-09). See src/sync/outbox.js.
jest.mock('react-native-blob-util', () => ({
  config: {},
  fetch: jest.fn(),
  fs: {
    dirs: {
      CachesDir: '/tmp/jest-caches',
      DocumentDir: '/tmp/jest-documents',
      DownloadDir: '/tmp/jest-downloads',
      CacheDir: '/tmp/jest-caches',
    },
    stat: jest.fn(() => Promise.resolve({size: 0, lastModified: 0})),
    exists: jest.fn(() => Promise.resolve(false)),
    readFile: jest.fn(() => Promise.resolve('')),
    writeFile: jest.fn(() => Promise.resolve(true)),
    unlink: jest.fn(() => Promise.resolve(true)),
    mkdir: jest.fn(() => Promise.resolve('/tmp/jest-created')),
    cp: jest.fn(() => Promise.resolve('/tmp/jest-copied')),
    mv: jest.fn(() => Promise.resolve('/tmp/jest-moved')),
    ls: jest.fn(() => Promise.resolve([])),
    isDir: jest.fn(() => Promise.resolve(false)),
  },
  MediaCollection: {},
}));

// react-native-keychain — token storage (AGENTS 4.5). Kept in memory so
// tests can assert WHAT is stored (service name), which is the W4.1
// requirement: tokens must never land in AsyncStorage.
jest.mock('react-native-keychain', () => {
  const store = new Map();
  return {
    ACCESSIBLE: {WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'AccessibleWhenUnlockedThisDeviceOnly'},
    SERVICE_TYPE: {ACCESSIBLE: 'Accessible'},
    getGenericPassword: jest.fn(({service} = {}) =>
      Promise.resolve(
        store.has(service)
          ? {username: 'jest-user', password: store.get(service), service}
          : false,
      ),
    ),
    setGenericPassword: jest.fn((username, password, opts = {}) => {
      store.set(opts.service, password);
      return Promise.resolve(true);
    }),
    resetGenericPassword: jest.fn(({service} = {}) => {
      store.delete(service);
      return Promise.resolve(true);
    }),
    getAllGenericPasswordServices: jest.fn(() => Promise.resolve([...store.keys()])),
    __store: store,
  };
});

// react-native-permissions — runtime permission requests.
jest.mock('react-native-permissions', () => ({
  PERMISSIONS: {
    CAMERA: 'android.permission.CAMERA',
    ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION',
    ACCESS_COARSE_LOCATION: 'android.permission.ACCESS_COARSE_LOCATION',
  },
  RESULTS: {GRANTED: 'granted', DENIED: 'denied', BLOCKED: 'blocked', UNAVAILABLE: 'unavailable'},
  check: jest.fn(() => Promise.resolve('granted')),
  request: jest.fn(() => Promise.resolve('granted')),
  requestMultiple: jest.fn(() => Promise.resolve({})),
  openSettings: jest.fn(() => Promise.resolve()),
}));

// react-native-vision-camera — face capture. The screen components use
// the hooks, so both the namespace and the named hooks are provided.
jest.mock('react-native-vision-camera', () => ({
  Camera: {
    requestCameraPermission: jest.fn(() => Promise.resolve('granted')),
    getCameraPermissionStatus: jest.fn(() => Promise.resolve('granted')),
  },
  useCameraDevice: jest.fn(() => ({device: null, hasPermission: true})),
  useCameraPermission: jest.fn(() => ({hasPermission: true, requestPermission: jest.fn()})),
  useFrameProcessor: jest.fn(),
  useCameraFormat: jest.fn(() => ({format: {width: 640, height: 480, fps: 30}})),
}));

jest.mock('react-native-fs', () => ({
  CachesDirectoryPath: '/tmp/jest-caches',
  DocumentDirectoryPath: '/tmp/jest-documents',
  TemporaryDirectoryPath: '/tmp/jest-tmp',
  exists: jest.fn(() => Promise.resolve(false)),
  readFile: jest.fn(() => Promise.resolve('')),
  writeFile: jest.fn(() => Promise.resolve(true)),
  unlink: jest.fn(() => Promise.resolve()),
  mkdir: jest.fn(() => Promise.resolve()),
  stat: jest.fn(() => Promise.resolve({size: 0, mtime: new Date()})),
}));

jest.mock('react-native-share', () => ({
  default: jest.fn(() => Promise.resolve({success: true})),
  open: jest.fn(() => Promise.resolve()),
}));

jest.mock('react-native-html-to-pdf', () => ({
  default: {},
  convert: jest.fn(() => Promise.resolve('/tmp/jest-output.pdf')),
}));

// @react-native-community/geolocation — GPS geofence check on
// attendance check-in (AGENTS 4.4 gate 4). Default position is PIA HQ,
// Karachi, which is inside the default 100 m department radius.
jest.mock('@react-native-community/geolocation', () => ({
  setRNConfiguration: jest.fn(),
  requestAuthorization: jest.fn((onSuccess) => onSuccess?.()),
  requestPosition: jest.fn((onSuccess) =>
    onSuccess?.({coords: {latitude: 24.9065, longitude: 67.1608, accuracy: 5}}),
  ),
  getCurrentPosition: jest.fn((onSuccess) =>
    onSuccess({coords: {latitude: 24.9065, longitude: 67.1608, accuracy: 5}}),
  ),
  watchPosition: jest.fn(() => 1),
  clearWatch: jest.fn(),
}));
// Emulator: `localhost` reaches the dev machine via `adb reverse tcp:5000 tcp:5000`.
// Physical USB device: switch to the host's LAN IP (e.g. http://192.168.x.x:5000/api);
// "localhost" on a phone points at the phone itself.
// LAN IP works for BOTH the emulator (same host network) and a phone on the same Wi-Fi.
export const API_BASE_URL = 'http://localhost:5000/api';

export const DEPARTMENTS = {
  ERP: {
    id: 1,
    name: 'ERP Section',
    lat: 24.894995,
    lon: 67.152182,
    radius: 100,
  },
  CYBER: {
    id: 2,
    name: 'Cyber Security',
    lat: 24.894427,
    lon: 67.151782,
    radius: 100,
  },
};

export const FACE_SIMILARITY_THRESHOLD = 0.58;
export const FACE_MAX_ATTEMPTS = 3;

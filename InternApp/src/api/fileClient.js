import ReactNativeBlobUtil from 'react-native-blob-util';
import {API_BASE_URL} from '../config/constants';
import {getAccessToken} from './client';

const FILE_BASE = API_BASE_URL;

function authHeader() {
  const tok = getAccessToken();
  return tok ? {Authorization: `Bearer ${tok}`} : {};
}

/// Builds a display URL for <Image> previews. The file endpoint requires auth;
/// RN's <Image> cannot attach headers, so the token rides in the query string
/// (GET only, validated exactly like the Authorization header server-side).
export function fileUrl(path) {
  const tok = getAccessToken();
  const q = tok ? `?token=${encodeURIComponent(tok)}` : '';
  return `${FILE_BASE}/files/${path}${q}`;
}

/// Downloads a file (with Authorization header) into the app cache and returns
/// the local path. Use for PDF/image previews that can't attach headers.
///
/// NOTE: uses RN's built-in fetch -> base64 -> fs.writeFile instead of
/// ReactNativeBlobUtil.config({fileCache}).fetch, because the bundled
/// react-native-blob-util native code has a broken drain that always reports
/// "Download interrupted." (bytesDownloaded never advances), so any
/// download-to-file via RNB throws. See node_modules patch history.
export async function fetchFileLocal(path) {
  if (!path) throw new Error('No file path');
  const url = `${FILE_BASE}/files/${path}`;
  const res = await fetch(url, {headers: authHeader()});
  if (!res.ok) throw new Error(`Failed to download file (${res.status})`);
  const blob = await res.blob();
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read downloaded file'));
    reader.readAsDataURL(blob);
  });
  const b64 = String(dataUrl).split(',')[1];
  const segments = String(path).split('/');
  const baseName = decodeURIComponent(segments[segments.length - 1]);
  const fallback = `file_${Date.now()}_${String(Math.random()).slice(2, 8)}.pdf`;
  const safe = /^[\w\-\s.()]+$/.test(baseName) && /\.\w{2,5}$/.test(baseName) ? baseName : fallback;
  const local = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${safe}`;
  await ReactNativeBlobUtil.fs.writeFile(local, b64, 'base64');
  return local;
}

/// Opens any stored file (PDF/image/office) through the system share sheet with
/// authenticated download — replaces direct Linking.openURL (header-less) calls.
export async function openFileWithAuth(path) {
  const local = await fetchFileLocal(path);
  try {
    const {default: Share} = require('react-native-share');
    await Share.open({url: `file://${local}`, failOnCancel: false});
  } finally {
    ReactNativeBlobUtil.fs.unlink(local).catch(() => {});
  }
}
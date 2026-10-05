import client from '../api/client';
import {fetchFileLocal} from '../api/fileClient';

export function formatVal(v) {
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return String(v);
    return v.toFixed(2).replace(/\.00$/, '');
  }
  if (typeof v === 'string') {
    if (/^P(?!T)/.test(v) || /^PT/.test(v)) return isoDurationToClock(v);
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return toLocal(v);
  }
  return String(v);
}

function toLocal(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', {day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'});
}

function isoDurationToClock(dur) {
  const m = /^PT(\d+)H(?:(\d+)M)?/.exec(dur);
  if (!m) return dur;
  const h = m[1].padStart(2, '0');
  const min = (m[2] || '0').padStart(2, '0');
  return `${h}:${min}`;
}

// Both exports hit the same server endpoint family:
//   /api/{role}/reports/{reportKey}/pdf|excel  (server-rendered, role-scoped)
// and return a local cached file path ready for shareFile().

// Matches PdfService.WriteReport's portrait A4 layout (~22 single-line data rows/page).
const REPORT_ROWS_PER_PAGE = 22;
export function estimateReportPages(count) {
  if (!count || count <= 0) return 0;
  return Math.ceil(count / REPORT_ROWS_PER_PAGE);
}

export async function downloadPdf(fileName, reportUrl) {
  const qIdx = reportUrl.indexOf('?');
  const base = qIdx === -1 ? reportUrl : reportUrl.slice(0, qIdx);
  const query = qIdx === -1 ? '' : reportUrl.slice(qIdx);
  const res = await client.get(`${base}/pdf${query}`);
  const path = res.data && res.data.path;
  if (!path) throw new Error('Server did not return a file.');
  return fetchFileLocal(path);
}

export async function downloadExcel(reportUrl) {
  const qIdx = reportUrl.indexOf('?');
  const base = qIdx === -1 ? reportUrl : reportUrl.slice(0, qIdx);
  const query = qIdx === -1 ? '' : reportUrl.slice(qIdx);
  const res = await client.get(`${base}/excel${query}`);
  const path = res.data && res.data.path;
  if (!path) throw new Error('Server did not return a file.');
  return fetchFileLocal(path);
}

export function shareFile(path, type) {
  const {default: Share} = require('react-native-share');
  if (!path) throw new Error('No file was produced for sharing.');
  const url = path.startsWith('file://') ? path : `file://${path}`;
  return Share.open({url, type, failOnCancel: false});
}
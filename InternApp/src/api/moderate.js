import {write} from './write';

const META = {
  documents: {expectedStatus: 'Pending', withdrawn: false},
  gatepasses: {expectedStatus: 'Pending'},
  idcards: {expectedStatus: 'Pending'},
  certificates: {expectedStatus: 'Pending'},
  'leave-applications': {expectedStatus: 'Pending'},
  face: {expectedStatus: 'Pending'},
};

export function snapshotFor(fullUrl) {
  const m = fullUrl.match(/^\/(admin|mentor)\/([a-z-]+)\/(\d+)(\/face)?\//);
  if (!m) return null;
  const [, role, resource, id, face] = m;
  const meta = META[face ? 'face' : resource];
  if (!meta) return null;
  const fetchUrl = face
    ? `/${role}/interns/${id}/face/state`
    : `/${role}/${resource}/${id}/state`;
  const snap = {fetchUrl, expectedStatus: meta.expectedStatus};
  if (meta.withdrawn !== undefined) snap.expectedWithdrawn = meta.withdrawn;
  return snap;
}

export async function moderate(op) {
  const finalOp = {...op};
  if (!finalOp.snapshot) finalOp.snapshot = snapshotFor(finalOp.url) || undefined;
  return write(finalOp);
}

export function queuedToast(queued, successLabel) {
  const {showToast} = require('../components/AppToast');
  showToast(
    queued ? 'Saved locally — will sync when online' : successLabel,
    queued ? 'info' : 'success',
  );
}
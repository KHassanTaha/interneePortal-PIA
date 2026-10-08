/**
 * geoUtils.test.js — the client's pre-camera geofence decision must mirror the
 * server's fail-closed gate (REQ-01, D-S25). If these helpers ever diverge from
 * GeoFenceService.HasValidCoordinates, an intern could reach the liveness camera
 * for a department the server would reject — or worse, the client could allow a
 * server-rejected coordinate pair past its own check.
 */
import {hasValidCoordinates, MISSING_GEOFENCE_CONFIG_MESSAGE} from '../src/utils/geoUtils';

test('rejects when either coordinate is missing', () => {
  expect(hasValidCoordinates(null, 67.15)).toBe(false);
  expect(hasValidCoordinates(24.9, undefined)).toBe(false);
  expect(hasValidCoordinates(undefined, undefined)).toBe(false);
});

test('rejects zero coordinates (the gulf of Guinea is not a geofence centre)', () => {
  expect(hasValidCoordinates(0, 0)).toBe(false);
});

test('rejects coordinates outside valid ranges', () => {
  expect(hasValidCoordinates(91, 67)).toBe(false);
  expect(hasValidCoordinates(-91, 67)).toBe(false);
  expect(hasValidCoordinates(24, 181)).toBe(false);
  expect(hasValidCoordinates(24, -181)).toBe(false);
});

test('rejects non-numeric strings', () => {
  expect(hasValidCoordinates('abc', 67)).toBe(false);
});

test('accepts valid non-zero coordinates', () => {
  expect(hasValidCoordinates(24.894995, 67.152182)).toBe(true);
  expect(hasValidCoordinates(-33.8688, 151.2093)).toBe(true);
});

test('the client message is identical to the server MISSING_GEOFENCE_CONFIG text', () => {
  expect(MISSING_GEOFENCE_CONFIG_MESSAGE).toBe(
    'This department does not have coordinates configured. Contact an administrator.',
  );
});
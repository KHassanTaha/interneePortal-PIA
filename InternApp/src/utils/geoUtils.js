/**
 * geoUtils.js — shared geofence helpers shared by the attendance pre-flight
 * gate. The geofence contract (D-S25, REQ-01) is fail-closed: the intern's
 * department coordinates are the ONLY authorised centre. The production code
 * derives the same truth from both servers; this module keeps the client's
 * pre-camera decision and its user-facing message identical to the server's.
 */

/** The exact message the server returns (GeoFenceService.MissingGeofenceConfigMessage). */
export const MISSING_GEOFENCE_CONFIG_MESSAGE =
  'This department does not have coordinates configured. Contact an administrator.';

/**
 * True only when a coordinate pair can be a real geofence centre: both values
 * present, non-zero, and inside valid latitude/longitude ranges. Mirrors the
 * server's GeoFenceService.HasValidCoordinates so a department that the server
 * would reject is rejected here too, before the camera ever opens.
 * @param {number|null|undefined} latitude
 * @param {number|null|undefined} longitude
 * @returns {boolean}
 */
export const hasValidCoordinates = (latitude, longitude) => {
  if (latitude === null || latitude === undefined ||
      longitude === null || longitude === undefined) return false;
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return false;
  if (lat === 0 || lng === 0) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
};
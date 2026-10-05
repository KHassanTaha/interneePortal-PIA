// Developer-override helpers. Temporary — removed with the debug section.
const realFaceStatus = profile => {
  const enrolled = profile?.faceEnrolled === true;
  return profile?.faceEnrollmentStatus ?? (enrolled ? 'Approved' : 'NotEnrolled');
};

// 'off' -> return the real status; 'enrolled'/'notEnrolled' -> override.
export const effectiveFaceStatus = (profile, debug) => {
  if (!debug) return realFaceStatus(profile);
  if (debug.simulateFace === 'enrolled') return 'Approved';
  if (debug.simulateFace === 'notEnrolled') return 'NotEnrolled';
  return realFaceStatus(profile);
};
/**
 * faceUtils.js — on-device helpers for server-side face recognition.
 *
 * The actual FaceNet embedding + passive anti-spoof run server-side (.NET ONNX).
 * The phone only captures a photo and ships it as base64; the server always
 * re-derives the embedding so a client can never submit a pre-computed vector.
 *
 * ACTIVE liveness (blink / head-turn / smile) is evaluated on-device from two
 * still frames 450ms apart via react-native-vision-camera-face-detector (ML Kit).
 * The server issues 2 random challenges per session; the phone confirms each was
 * performed and echoes the exact server challenge ids back with the selfie.
 */

/**
 * Converts a local image file:// URI to a base64 Data URL.
 * @param {string} imageUri - file:// URI
 * @returns {Promise<string>} data:image/jpeg;base64,...
 */
export const imageUriToBase64 = async (imageUri) => {
  try {
    const response = await fetch(imageUri);
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('imageUriToBase64 error:', error);
    throw new Error('Failed to convert captured photo for face verification.');
  }
};

/** Normalizes a vision-camera photo path into a fetchable file:// URI. */
export const toFileUri = (path) =>
  path && path.startsWith('file://') ? path : `file://${path}`;

/**
 * Evaluates whether a detected face satisfies a single active-liveness challenge.
 * Pure JS — safe to call from any JS context.
 *
 * @param {object} face       Face from react-native-vision-camera-face-detector
 * @param {string} challengeId "blink" | "turn_left" | "turn_right" | "smile"
 * @param {object} stateRef   Persistent tracker, e.g. {current: {eyesClosedDetected: false}}
 * @returns {boolean}
 */
export const evaluateFaceLiveness = (face, challengeId, stateRef) => {
  if (!face) return false;

  const state = stateRef.current;
  const leftEyeOpen = face.leftEyeOpenProbability ?? 1.0;
  const rightEyeOpen = face.rightEyeOpenProbability ?? 1.0;
  const smilingProb = face.smilingProbability ?? 0.0;
  const yaw = face.yawAngle ?? 0.0;

  switch (challengeId) {
    case 'blink': {
      // Close both eyes, then open at least one again — a real blink.
      if (leftEyeOpen < 0.38 && rightEyeOpen < 0.38) {
        state.eyesClosedDetected = true;
      }
      return state.eyesClosedDetected && (leftEyeOpen > 0.65 || rightEyeOpen > 0.65);
    }
    case 'turn_left':
      return yaw < -12.0;
    case 'turn_right':
      return yaw > 12.0;
    case 'smile':
      return smilingProb > 0.60;
    default:
      return true;
  }
};

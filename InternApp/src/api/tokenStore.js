import * as Keychain from 'react-native-keychain';

// Tokens live in the OS keychain/keystore (encrypted at rest), never AsyncStorage.
const ACCESS_SERVICE = 'com.internapp.access';
const REFRESH_SERVICE = 'com.internapp.refresh';

export async function getAccessToken() {
  const creds = await Keychain.getGenericPassword({service: ACCESS_SERVICE});
  return creds ? creds.password : null;
}

export async function getRefreshToken() {
  const creds = await Keychain.getGenericPassword({service: REFRESH_SERVICE});
  return creds ? creds.password : null;
}

export async function saveTokens(accessToken, refreshToken) {
  if (accessToken) await Keychain.setGenericPassword('tokens', accessToken, {service: ACCESS_SERVICE});
  if (refreshToken) await Keychain.setGenericPassword('tokens', refreshToken, {service: REFRESH_SERVICE});
}

export async function clearTokens() {
  await Keychain.resetGenericPassword({service: ACCESS_SERVICE});
  await Keychain.resetGenericPassword({service: REFRESH_SERVICE});
}
import {createSlice} from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {clearTokens} from '../../api/client';

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    role: null,
    profile: null,
    device: null,
    isLoading: true,
    isAuthenticated: false,
  },
  reducers: {
    setCredentials: (state, action) => {
      state.user = action.payload.user;
      state.role = action.payload.role;
      state.profile = action.payload.profile;
      state.device = action.payload.device ?? null;
      state.isAuthenticated = true;
      state.isLoading = false;
    },
    logout: state => {
      state.user = null;
      state.role = null;
      state.profile = null;
      state.device = null;
      state.isAuthenticated = false;
      state.isLoading = false;
    },
    setLoading: (state, action) => {
      state.isLoading = action.payload;
    },
  },
});

// Fully log out: clear the persisted session (token + user) then reset Redux.
// Reducers must stay pure, so the async cleanup lives in this thunk
// (tokens are keychain-backed via client.clearTokens; user bag is AsyncStorage).
export const logoutUser = () => async dispatch => {
  try {
    await AsyncStorage.multiRemove(['user']);
  } catch {
    /* ignore */
  }
  clearTokens();
  dispatch(logout());
};

export const {setCredentials, logout, setLoading} = authSlice.actions;
export default authSlice.reducer;

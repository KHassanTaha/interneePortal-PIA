import {configureStore, combineReducers} from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {persistReducer, persistStore} from 'redux-persist';
import authReducer from './slices/authSlice';
import notificationsReducer from './slices/notificationsSlice';
import syncReducer from './slices/syncSlice';
import debugReducer from './slices/debugSlice';

const persistConfig = {
  key: 'root',
  storage: AsyncStorage,
  // Session, notification list and sync state survive restarts; dev toggles don't.
  whitelist: ['auth', 'notifications', 'sync'],
};

const rootReducer = combineReducers({
  auth: authReducer,
  notifications: notificationsReducer,
  sync: syncReducer,
  debug: debugReducer,
});

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({
      serializableCheck: false,
      // background/retry flags flow through dispatches; RTK would otherwise nag
      immutableCheck: false,
    }),
});

export const persistor = persistStore(store);
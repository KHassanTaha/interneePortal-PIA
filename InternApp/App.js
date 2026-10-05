/**
 * PIA Intern Management System
 * Main App Entry Point
 */

import React, {useEffect, useState} from 'react';
import {StatusBar} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {Provider} from 'react-redux';
import {PersistGate} from 'redux-persist/integration/react';
import {store, persistor} from './src/store';
import AppNavigator from './src/navigation/RootNavigator';
import {initTheme, gradients} from './src/theme';
import ToastHost from './src/components/AppToast';
import ConfirmHost from './src/components/AppConfirm';
import ErrorBoundary from './src/components/ErrorBoundary';
import {initSyncEngine} from './src/sync/syncEngine';
import {startConnectivityMonitoring} from './src/sync/connectivity';

function ThemedStatusBar() {
  return <StatusBar barStyle="light-content" backgroundColor={gradients.primary[0]} />;
}

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initTheme().finally(() => setReady(true));
    startConnectivityMonitoring();
    initSyncEngine(store);
  }, []);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <Provider store={store}>
        <PersistGate loading={null} persistor={persistor}>
          <ThemedStatusBar />
          <ErrorBoundary>
            <AppNavigator />
          </ErrorBoundary>
          <ToastHost />
          <ConfirmHost />
        </PersistGate>
      </Provider>
    </SafeAreaProvider>
  );
}
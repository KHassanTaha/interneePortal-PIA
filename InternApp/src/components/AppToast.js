import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Animated, Text, View, TouchableOpacity, StyleSheet} from 'react-native';
import {useAppTheme} from '../theme';
import Icon from './Icon';

// Publish-subscribe bus so several ToastHosts (one at the app root, one inside
// each native Modal/SwipeableModal) can render the same toast simultaneously.
let listeners = new Set();

export function showToast(message, type = 'info') {
  console.log('[toast]', type, message);
  const event = {message, type, id: Date.now() + Math.random()};
  listeners.forEach(l => l(event));
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const typeStyles = {
  error: {icon: 'close', color: 'error'},
  success: {icon: 'check', color: 'success'},
  info: {icon: 'info', color: 'primary'},
};

export default function ToastHost() {
  const {colors} = useAppTheme();
  const [toast, setToast] = useState(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef(null);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(opacity, {toValue: 0, duration: 180, useNativeDriver: true}).start(() => setToast(null));
  }, [opacity]);

  useEffect(() => {
    const onToast = t => {
      if (timer.current) clearTimeout(timer.current);
      setToast(t);
      Animated.timing(opacity, {toValue: 1, duration: 200, useNativeDriver: true}).start();
      timer.current = setTimeout(dismiss, 4000);
    };
    const unsubscribe = subscribe(onToast);
    return () => {
      unsubscribe();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [dismiss, opacity]);

  const meta = typeStyles[toast?.type] || typeStyles.info;
  const tint = colors[meta.color];

  // Plain overlay, NOT a native Modal. A Modal on Android swallows every touch
  // while a toast is visible (verified on RN 0.86: pointerEvents="box-none" does
  // not pass touches through a Modal). A normal View overlay with box-none lets
  // taps reach the screen underneath, so Bug 3 (login toast froze the form) is
  // resolved. To keep toasts above a sheet/popup, the SAME host is rendered
  // inside that Modal as well (see SwipeableModal) — there it is again a plain
  // absolute View, so it never blocks the sheet's own taps either.
  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      {toast && (
        <Animated.View style={[styles.toast, {backgroundColor: colors.card, borderColor: tint, opacity}]}>
          <View style={[styles.iconBox, {backgroundColor: tint + '22'}]}>
            <Icon name={meta.icon} size={16} color={tint} />
          </View>
          <Text style={[styles.message, {color: colors.text}]}>{toast.message}</Text>
          <TouchableOpacity style={styles.closeBtn} onPress={dismiss}>
            <Icon name="close" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    zIndex: 999,
    elevation: 20,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    alignSelf: 'stretch',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 4},
    elevation: 8,
  },
  iconBox: {width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center'},
  message: {flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18},
  closeBtn: {padding: 4},
});
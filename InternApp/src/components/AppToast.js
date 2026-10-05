import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Animated, Text, View, TouchableOpacity, StyleSheet, Modal} from 'react-native';
import {useAppTheme} from '../theme';
import Icon from './Icon';

let listener = null;

export function showToast(message, type = 'info') {
  console.log('[toast]', type, message);
  if (listener) listener({message, type, id: Date.now() + Math.random()});
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
  const currentId = useRef(null);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(opacity, {toValue: 0, duration: 180, useNativeDriver: true}).start(() => setToast(null));
  }, [opacity]);

  useEffect(() => {
    listener = t => {
      if (timer.current) clearTimeout(timer.current);
      currentId.current = t.id;
      setToast(t);
      Animated.timing(opacity, {toValue: 1, duration: 200, useNativeDriver: true}).start();
      timer.current = setTimeout(dismiss, 4000);
    };
    return () => {
      listener = null;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [dismiss, opacity]);

  const meta = typeStyles[toast?.type] || typeStyles.info;
  const tint = colors[meta.color];

  // The toast renders inside its own native <Modal> window layer, so it paints
  // ABOVE any sheet/popup Forms. Each visible toast is a short-lived modal; the
  // id key guarantees a fresh native layer when a second toast follows quickly.
  return (
    <Modal
      visible={!!toast}
      transparent
      animationType="fade"
      statusBarTranslucent
      key={currentId.current}
      onRequestClose={dismiss}>
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: {position: 'absolute', left: 0, right: 0, bottom: 24, paddingHorizontal: 16, zIndex: 999, elevation: 20},
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
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
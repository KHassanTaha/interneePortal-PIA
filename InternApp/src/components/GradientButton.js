import React from 'react';
import {StyleSheet, TouchableOpacity, ActivityIndicator} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {gradients} from '../theme';

// Green-gradient primary CTA button (LoginScreen pattern), used across intern screens.
export default function GradientButton({onPress, disabled, loading, icon, children, style, textStyle, ...rest}) {
  return (
    <LinearGradient
      colors={gradients.primary}
      start={{x: 0, y: 0}}
      end={{x: 1, y: 0}}
      style={[styles.btn, disabled && styles.disabled, style]}>
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled || loading}
        style={styles.inner}
        {...rest}>
        {loading ? <ActivityIndicator size="small" color="#fff" /> : icon}
        {children}
      </TouchableOpacity>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: 14,
    shadowColor: '#004F30',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
    elevation: 5,
  },
  disabled: {opacity: 0.6},
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
});
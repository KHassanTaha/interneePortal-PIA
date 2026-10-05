import React from 'react';
import {TouchableOpacity, StyleSheet} from 'react-native';
import Icon from './Icon';
import {useAppTheme} from '../theme';

export default function BackButton({onPress, style, light = false}) {
  const {colors} = useAppTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.btn,
        light
          ? {borderColor: 'rgba(255,255,255,0.35)', backgroundColor: 'rgba(255,255,255,0.15)'}
          : {borderColor: colors.border, backgroundColor: colors.surface},
        style,
      ]}
      accessibilityLabel="Go back"
      hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
      <Icon name="back" size={22} color={light ? '#fff' : colors.textAccent} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
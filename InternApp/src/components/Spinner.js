import React from 'react';
import {View, ActivityIndicator, StyleSheet} from 'react-native';
import {useAppTheme} from '../theme';

export default function Spinner({size = 'large', color, style}) {
  const {colors} = useAppTheme();
  return (
    <View style={[styles.center, style]}>
      <ActivityIndicator size={size} color={color || colors.textAccent} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {alignItems: 'center', justifyContent: 'center', paddingVertical: 40},
});
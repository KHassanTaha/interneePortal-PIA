import React, {useEffect, useMemo, useRef} from 'react';
import {Animated, Text, StyleSheet, View} from 'react-native';
import {useAppTheme} from '../theme';

// Animated end-of-list marker — PIA dot + label that fades in once on mount
// (no looping animation), placed after list content, before the bottom padding. Use the Icon component elsewhere;
// this marker needs no icon (plain View dot, PIA theme colors only).
export default function EndOfListMarker() {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.timing(pulse, {toValue: 1, duration: 350, useNativeDriver: true});
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  const wrapOpacity = pulse.interpolate({inputRange: [0, 1], outputRange: [0, 1]});

  return (
    <Animated.View style={[styles.wrap, {opacity: wrapOpacity}]}>
      <View style={styles.dot} />
      <Text style={styles.text}>End of list</Text>
    </Animated.View>
  );
}

const makeStyles = colors => StyleSheet.create({
  wrap: {alignItems: 'center', paddingVertical: 24},
  dot: {width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary},
  text: {color: colors.textMuted, fontSize: 11, fontWeight: '600', marginTop: 8},
});
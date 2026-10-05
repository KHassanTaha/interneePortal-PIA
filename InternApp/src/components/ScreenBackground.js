import React from 'react';
import LinearGradient from 'react-native-linear-gradient';
import {gradients, useAppTheme} from '../theme';

// App-wide background wash — the one place the background gradient lives.
// Light: creamLight -> offWhite, Dark: subtle navy. Wrap screen roots with
// this instead of hardcoding a background color elsewhere.
export default function ScreenBackground({children, style}) {
  const {isDark} = useAppTheme();
  const [start, end] = isDark ? gradients.background.dark : gradients.background.light;
  return (
    <LinearGradient
      colors={[start, end]}
      start={{x: 0, y: 0}}
      end={{x: 0, y: 1}}
      style={[{flex: 1}, style]}>
      {children}
    </LinearGradient>
  );
}
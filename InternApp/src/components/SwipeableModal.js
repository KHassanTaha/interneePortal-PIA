import React, {useRef} from 'react';
import {View, Modal, PanResponder, Animated, ScrollView, KeyboardAvoidingView, Platform, useWindowDimensions} from 'react-native';
import {useAppTheme} from '../theme';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

// Bottom-sheet modal with iOS-style drag-to-dismiss.
//
// Drop-in for slide-up transparent modals: it renders the backdrop + sheet and a
// drag handle strip above `children`. Pulling the handle down past the threshold
// (or flicking down) calls onRequestClose. Content is scrollable by default and
// capped at 85% of the window height with bottom safe-area padding, so long forms
// stay reachable even when the keyboard is up. Pass `scrollable={false}` when the
// child already owns a ScrollView.
//
// Props are forwarded to <Modal>; `overlayStyle`/`sheetStyle` override the default
// backdrop and sheet look (pass the styles the old Modal already used).

export default function SwipeableModal({
  children,
  overlayStyle,
  sheetStyle,
  animationType = 'slide',
  onRequestClose,
  scrollable = true,
  ...props
}) {
  const {colors} = useAppTheme();
  const {height: windowHeight} = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const dy = useRef(new Animated.Value(0)).current;

  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_e, g) => {
      dy.setValue(Math.max(0, g.dy));
    },
    onPanResponderRelease: (_e, g) => {
      if (g.dy > 70 || g.vy > 0.7) {
        if (onRequestClose) onRequestClose();
      }
      Animated.spring(dy, {toValue: 0, useNativeDriver: true}).start();
    },
    onPanResponderTerminate: () => Animated.spring(dy, {toValue: 0, useNativeDriver: true}).start(),
  })).current;

  const content = scrollable ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={{maxHeight: windowHeight * 0.85}}
      showsVerticalScrollIndicator={false}>
      <View style={{paddingBottom: insets.bottom + 16}}>{children}</View>
    </ScrollView>
  ) : (
    <View style={{paddingBottom: insets.bottom + 16}}>{children}</View>
  );

  return (
    <Modal animationType={animationType} transparent onRequestClose={onRequestClose} {...props}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={overlayStyle || {flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end'}}>
        <Animated.View style={[sheetStyle || {backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24}, {transform: [{translateY: dy}]}]}>
          <View
            {...pan.panHandlers}
            style={{alignItems: 'center', paddingTop: 2, paddingBottom: 10}}
            hitSlop={{top: 8, bottom: 8, left: 0, right: 0}}>
            <View style={{width: 44, height: 5, borderRadius: 3, backgroundColor: colors.textMuted, opacity: 0.5}} />
          </View>
          {content}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
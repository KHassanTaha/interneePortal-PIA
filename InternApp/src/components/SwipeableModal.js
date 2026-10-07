import React from 'react';
import {View, Modal, Animated, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity, Text, useWindowDimensions} from 'react-native';
import {useAppTheme} from '../theme';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import ToastHost from './AppToast';

// Bottom sheet modal with reliable dismissal affordances.
//
// Android back button (onRequestClose), a visible "Close" button in the grab
// header row, and tapping the shaded backdrop all dismiss the sheet. Every
// dismiss control is rendered INSIDE the sheet's scrollable content region:
// in RN 0.86 (Fabric) on Android, touches that start on the bare chrome strip
// above a Modal's ScrollView never reach the JS responder system — verified
// on device with PanResponder, raw responder handlers and TouchableOpacity
// alike. Rendering the pill + close control as content restored full
// touchability.
//
// The pill is decorative (annotates "drag" behaviour) and the header hints
// "Pull down or tap ? to close". Content is scrollable by default and capped
// at 85% of the window height; pass `scrollable={false}` when the child
// already owns a ScrollView.
//
// A ToastHost renders inside the Modal so toasts paint ABOVE this sheet (a
// root overlay alone would be hidden behind a native Modal).

export default function SwipeableModal({
  children,
  overlayStyle,
  sheetStyle,
  animationType = 'slide',
  onRequestClose,
  closeLabel = 'Close',
  scrollable = true,
  ...props
}) {
  const {colors} = useAppTheme();
  const {height: windowHeight} = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const header = (
    <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 12}}>
      <View style={{flex: 1, alignItems: 'center'}}>
        <View style={{width: 48, height: 6, borderRadius: 3, backgroundColor: colors.textMuted, opacity: 0.5}} />
      </View>
      <TouchableOpacity
        onPress={onRequestClose}
        hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}
        style={{position: 'absolute', right: 0}}>
        <Text style={{color: colors.primary, fontSize: 16, fontWeight: '600'}}>{closeLabel}</Text>
      </TouchableOpacity>
    </View>
  );

  const content = scrollable ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={{maxHeight: windowHeight * 0.85}}
      showsVerticalScrollIndicator={false}>
      <View>
        {header}
        <View style={{paddingBottom: insets.bottom + 16}}>{children}</View>
      </View>
    </ScrollView>
  ) : (
    <View>
      {header}
      <View style={{paddingBottom: insets.bottom + 16}}>{children}</View>
    </View>
  );

  return (
    <Modal animationType={animationType} transparent onRequestClose={onRequestClose} {...props}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={overlayStyle || {flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end'}}>
        <TouchableOpacity
          onPress={onRequestClose}
          activeOpacity={1}
          style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0}}
        />
        <Animated.View
          style={[sheetStyle || {backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24}]}>
          {content}
        </Animated.View>
      </KeyboardAvoidingView>
      <ToastHost />
    </Modal>
  );
}
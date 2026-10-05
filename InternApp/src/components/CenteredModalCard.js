import React from 'react';
import {KeyboardAvoidingView, Platform, ScrollView, View, StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

// Centered modal card with keyboard avoidance, a scrollable body capped at 80% of
// the window height, and bottom safe-area padding. Keeps small centred dialogs
// reachable when the keyboard is up and prevents long content from clipping.
export default function CenteredModalCard({children, style}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.frame}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kav}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[style, {paddingBottom: insets.bottom + 16}]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {maxWidth: '94%', width: '100%', alignSelf: 'center', flexShrink: 1},
  kav: {flexShrink: 1},
  scroll: {maxHeight: '80%'},
});
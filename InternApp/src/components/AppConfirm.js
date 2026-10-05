import React, {useEffect, useState} from 'react';
import {Modal, Text, View, TouchableOpacity, StyleSheet, ScrollView, useWindowDimensions} from 'react-native';
import {useAppTheme} from '../theme';

let confirmListener = null;

export function showConfirm({title, message, confirmText = 'Confirm', cancelText = 'Cancel', destructive = false}) {
  return new Promise(resolve => {
    if (confirmListener) confirmListener({title, message, confirmText, cancelText, destructive, resolve});
    else resolve(false);
  });
}

export default function ConfirmHost() {
  const {colors} = useAppTheme();
  const {height: windowHeight} = useWindowDimensions();
  const [state, setState] = useState(null);

  useEffect(() => {
    confirmListener = setState;
    return () => { confirmListener = null; };
  }, []);

  const answer = v => {
    state?.resolve(v);
    setState(null);
  };

  return (
    <Modal visible={!!state} transparent animationType="fade" onRequestClose={() => answer(false)}>
      <View style={styles.overlay}>
        <View style={[styles.card, {backgroundColor: colors.surface, borderColor: colors.border, maxHeight: windowHeight * 0.8}]}>
          <Text style={[styles.title, {color: colors.text}]}>{state?.title}</Text>
          {!!state?.message && (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.message, {color: colors.textSecondary}]}>{state.message}</Text>
            </ScrollView>
          )}
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.cancelBtn, {borderColor: colors.border}]} onPress={() => answer(false)}>
              <Text style={[styles.cancelText, {color: colors.textSecondary}]}>{state?.cancelText}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, {backgroundColor: state?.destructive ? colors.error : colors.primary}]}
              onPress={() => answer(true)}>
              <Text style={styles.confirmText}>{state?.confirmText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 28},
  card: {borderRadius: 18, padding: 22, borderWidth: 1},
  title: {fontSize: 17, fontWeight: '700', marginBottom: 8},
  message: {fontSize: 14, lineHeight: 20, marginBottom: 18},
  actions: {flexDirection: 'row', justifyContent: 'flex-end', gap: 10},
  cancelBtn: {paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10, borderWidth: 1},
  cancelText: {fontWeight: '700', fontSize: 14},
  confirmBtn: {paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10},
  confirmText: {color: '#fff', fontWeight: '700', fontSize: 14},
});
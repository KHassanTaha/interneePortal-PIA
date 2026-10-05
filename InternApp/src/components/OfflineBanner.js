import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useSelector} from 'react-redux';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useConnectivity} from '../sync/connectivity';
import {useAppTheme} from '../theme';
import Icon from './Icon';

// Global offline banner: shows how many actions are waiting in the outbox and
// offers a tap-through to the Sync screen to review failures/conflicts.
export default function OfflineBanner() {
  const {isOnline} = useConnectivity();
  const insets = useSafeAreaInsets();
  const {colors} = useAppTheme();
  const navigation = useNavigation();
  const sync = useSelector(s => s.sync);

  if (isOnline) return null;

  const pending = sync.items.filter(i => i.status === 'queued' || i.status === 'sending').length;
  const failed = sync.items.filter(i => i.status === 'failed').length;
  const conflicts = sync.items.filter(i => i.status === 'conflict').length;

  const statusBits = [];
  if (pending > 0) statusBits.push(`${pending} pending`);
  if (failed > 0) statusBits.push(`${failed} failed`);
  if (conflicts > 0) statusBits.push(`${conflicts} conflict`);

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      style={[styles.banner, {bottom: insets.bottom + 12, backgroundColor: colors.offline || '#37474f'}]}
      onPress={() => {
        try {
          navigation.navigate('Sync');
        } catch {
          /* not on a logged-in stack — ignore */
        }
      }}>
      <View style={styles.row}>
        <Icon name="wifiOff" size={15} color="#fff" />
        <Text style={styles.text}>Offline — showing saved data</Text>
        {statusBits.length > 0 ? (
          <Text style={styles.count}> · {statusBits.join(' · ')}</Text>
        ) : null}
        <Icon name="chevronRight" size={14} color="#fff" style={{marginLeft: 'auto'}} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    zIndex: 999,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
    elevation: 10,
  },
  row: {flexDirection: 'row', alignItems: 'center', gap: 8},
  text: {color: '#fff', fontSize: 13, fontWeight: '700'},
  count: {color: 'rgba(255,255,255,0.85)', fontSize: 12},
});
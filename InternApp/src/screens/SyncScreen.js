import React, {useMemo} from 'react';
import {View, Text, ScrollView, StyleSheet, TouchableOpacity} from 'react-native';
import {useDispatch, useSelector} from 'react-redux';
import {useNavigation} from '@react-navigation/native';
import {useAppTheme} from '../theme';
import ScreenBackground from '../components/ScreenBackground';
import AppHeader from '../components/AppHeader';
import GradientButton from '../components/GradientButton';
import Icon from '../components/Icon';
import {retryItem, retryAll, discardItem} from '../sync/syncEngine';
import {markLocalNotificationRead} from '../store/slices/syncSlice';
import {useConnectivity} from '../sync/connectivity';
import {store} from '../store';

const STATUS_META = {
  queued: {label: 'Pending', icon: 'clock', color: 'warning'},
  sending: {label: 'Syncing', icon: 'refresh', color: 'primary'},
  failed: {label: 'Failed', icon: 'close', color: 'error'},
  conflict: {label: 'Conflict', icon: 'alert', color: 'warning'},
};

export default function SyncScreen() {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const {colors} = useAppTheme();
  const {isOnline} = useConnectivity();
  const sync = useSelector(s => s.sync);
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const items = sync.items || [];
  const pending = items.filter(i => i.status === 'queued' || i.status === 'sending');
  const failed = items.filter(i => i.status === 'failed');
  const conflicts = items.filter(i => i.status === 'conflict');

  const Row = ({item}) => {
    const meta = STATUS_META[item.status] || STATUS_META.queued;
    const tint = colors[meta.color];
    const isFailed = item.status === 'failed' || item.status === 'conflict';
    return (
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <View style={[styles.iconBox, {backgroundColor: tint + '22'}]}>
            <Icon name={meta.icon} size={16} color={tint} />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle}>{item.label}</Text>
            <Text numberOfLines={1} style={styles.cardUrl}>{item.method?.toUpperCase()} {item.url}</Text>
            {item.error ? <Text style={styles.cardError}>{item.error}</Text> : null}
            <Text style={styles.cardMeta}>
              {new Date(item.updatedAt || item.createdAt).toLocaleString()}
              {' · '}
              {item.tries ? `${item.tries} attempt${item.tries > 1 ? 's' : ''}` : 'not sent yet'}
            </Text>
          </View>
          <View style={[styles.badge, {backgroundColor: tint + '22'}]}>
            <Text style={[styles.badgeText, {color: tint}]}>{meta.label}</Text>
          </View>
        </View>
        {isFailed ? (
          <View style={styles.cardActions}>
            <TouchableOpacity
              style={[styles.smallBtn, {borderColor: colors.border}]}
              onPress={() => retryItem(store, item.id)}>
              <Icon name="refresh" size={13} color={tint} />
              <Text style={styles.smallBtnText}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.smallBtn, {borderColor: colors.border}]}
              onPress={() => discardItem(store, item.id)}>
              <Icon name="trash" size={13} color={colors.error} />
              <Text style={styles.smallBtnText}>Discard</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <ScreenBackground>
      <AppHeader onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View style={[styles.connector, {backgroundColor: isOnline ? colors.success + '22' : colors.warning + '22'}]}>
            <Icon name={isOnline ? 'wifi' : 'wifiOff'} size={14} color={isOnline ? colors.success : colors.warning} />
            <Text style={{color: isOnline ? colors.success : colors.warning, fontSize: 13, fontWeight: '700'}}>
              {isOnline ? 'Online' : 'Offline'}
            </Text>
          </View>
        </View>

        <Text style={styles.hint}>
          Actions performed offline are saved on this device and automatically sync
          when you reconnect. Items that cannot be synced stay here until you retry or discard them.
        </Text>

        {items.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="check" size={28} color={colors.success} />
            <Text style={styles.emptyText}>Nothing pending — everything is synced.</Text>
          </View>
        ) : (
          <>
            {failed.length > 0 || conflicts.length > 0 ? (
              <GradientButton style={styles.retryAll} onPress={() => retryAll(store)}>
                <Text style={styles.retryAllText}>Retry all failed / conflicted</Text>
              </GradientButton>
            ) : null}
            {pending.length > 0 ? (
              <Text style={styles.sectionLabel}>Pending ({pending.length})</Text>
            ) : null}
            {pending.map(i => <Row key={i.id} item={i} />)}
            {conflicts.length > 0 ? (
              <Text style={styles.sectionLabel}>Conflicts ({conflicts.length})</Text>
            ) : null}
            {conflicts.map(i => <Row key={i.id} item={i} />)}
            {failed.length > 0 ? (
              <Text style={styles.sectionLabel}>Failed ({failed.length})</Text>
            ) : null}
            {failed.map(i => <Row key={i.id} item={i} />)}
          </>
        )}

        {sync.localNotifications.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>Recent sync activity</Text>
            {sync.localNotifications.slice(0, 10).map(n => (
              <TouchableOpacity
                key={n.id}
                style={styles.activityRow}
                onPress={() => dispatch(markLocalNotificationRead(n.id))}>
                <Icon name={n.isRead ? 'check' : 'bell'} size={13} color={n.isRead ? colors.textMuted : colors.primary} />
                <View style={styles.activityInfo}>
                  <Text style={[styles.activityTitle, n.isRead && {color: colors.textMuted}]}>{n.title}</Text>
                  <Text style={styles.activityBody} numberOfLines={2}>{n.body}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </>
        ) : null}
      </ScrollView>
    </ScreenBackground>
  );
}

const makeStyles = colors => StyleSheet.create({
  container: {padding: 20, paddingBottom: 100},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12},
  connector: {flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6},
  hint: {color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 16},
  sectionLabel: {color: colors.textSecondary, fontSize: 13, fontWeight: '700', marginTop: 12, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5},
  card: {backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10},
  cardRow: {flexDirection: 'row', gap: 12, alignItems: 'center'},
  iconBox: {width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center'},
  cardInfo: {flex: 1},
  cardTitle: {color: colors.text, fontSize: 14, fontWeight: '700'},
  cardUrl: {color: colors.textMuted, fontSize: 11, marginTop: 2},
  cardError: {color: colors.error, fontSize: 12, marginTop: 4, lineHeight: 16},
  cardMeta: {color: colors.textMuted, fontSize: 11, marginTop: 6},
  badge: {borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4},
  badgeText: {fontSize: 11, fontWeight: '700'},
  cardActions: {flexDirection: 'row', gap: 10, marginTop: 12},
  smallBtn: {flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7},
  smallBtnText: {color: colors.text, fontSize: 12, fontWeight: '600'},
  retryAll: {marginTop: 4, marginBottom: 4, borderRadius: 10},
  retryAllText: {color: '#fff', fontWeight: '700'},
  empty: {alignItems: 'center', marginTop: 40, gap: 8},
  emptyText: {color: colors.textMuted, fontSize: 14},
  activityRow: {flexDirection: 'row', gap: 10, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8},
  activityInfo: {flex: 1},
  activityTitle: {color: colors.text, fontSize: 13, fontWeight: '600'},
  activityBody: {color: colors.textMuted, fontSize: 12, marginTop: 2},
});
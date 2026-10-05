import React, {useState, useEffect, useCallback, useMemo} from 'react';
import {View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl} from 'react-native';
import {useSelector, useDispatch} from 'react-redux';
import ScreenBackground from '../components/ScreenBackground';
import AppHeader from '../components/AppHeader';
import Icon from '../components/Icon';
import Spinner from '../components/Spinner';
import {useAppTheme} from '../theme';
import {
  fetchNotifications,
  markNotificationRead,
  markNotificationAllRead,
} from '../store/slices/notificationsSlice';
import {markLocalNotificationRead, markAllLocalNotificationRead} from '../store/slices/syncSlice';

const TYPE_ICON = {
  General: 'info',
  Attendance: 'mapPin',
  Transfer: 'transfer',
  ShiftChange: 'clock',
  Document: 'upload',
  Certificate: 'gradCap',
  FaceEnrollment: 'user',
  PasswordReset: 'key',
  MentorAssignment: 'userPlus',
  Task: 'clipboard',
};

export default function NotificationsScreen({navigation}) {
  const {colors, isDark} = useAppTheme();
  const styles = makeStyles(colors, isDark);
  const dispatch = useDispatch();
  const {items} = useSelector(s => s.notifications);
  const local = useSelector(s => s.sync.localNotifications || []);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const combined = useMemo(() => {
    const toNum = n => {
      const t = new Date(n.createdAt).getTime();
      return isNaN(t) ? 0 : t;
    };
    return [...items, ...local.map(n => ({...n, isLocal: true}))].sort(
      (a, b) => toNum(b) - toNum(a),
    );
  }, [items, local]);
  const unreadCount = combined.filter(n => !n.isRead).length;

  const load = useCallback(async reset => {
    if (reset) setLoading(true);
    await dispatch(fetchNotifications());
    setLoading(false);
    setRefreshing(false);
  }, [dispatch]);

  useEffect(() => {
    load(true);
  }, [load]);

  const tapItem = n => {
    if (n.isRead) return;
    if (n.isLocal) dispatch(markLocalNotificationRead(n.id));
    else dispatch(markNotificationRead(n.id));
  };

  return (
    <ScreenBackground style={styles.container}>
      <AppHeader title="Notifications" right={
        unreadCount > 0 ? (
          <TouchableOpacity style={styles.readAllBtn} onPress={() => {
            dispatch(markNotificationAllRead());
            dispatch(markAllLocalNotificationRead());
          }}>
            <Icon name="markRead" size={14} color="#fff" />
            <Text style={styles.readAllText}>Mark all read</Text>
          </TouchableOpacity>
        ) : null
      } onBack={() => navigation.goBack()} />

      {loading ? <Spinner style={styles.center} /> : (
        <ScrollView
          contentContainerStyle={{paddingTop: 12, paddingBottom: 100}}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); load(false);}} tintColor={colors.primary}/>}>
          {combined.length === 0 ? (
            <View style={styles.emptyBox}>
              <Icon name="bell" size={36} color={colors.textMuted} />
              <Text style={styles.emptyText}>No notifications yet</Text>
              <Text style={styles.emptySub}>Updates about transfers, approvals and certificates will appear here.</Text>
            </View>
          ) : combined.map(n => (
            <TouchableOpacity
              key={`${n.isLocal ? 'local' : 'server'}-${n.id}`}
              style={[styles.card, !n.isRead && styles.cardUnread]}
              onPress={() => tapItem(n)}>
              <View style={[styles.iconWrap, {backgroundColor: n.isRead ? colors.border : colors.primary + '22'}]}>
                <Icon name={n.isLocal ? 'alert' : (TYPE_ICON[n.type] || 'info')} size={18} color={n.isRead ? colors.textMuted : n.isLocal ? colors.warning : colors.primary} />
              </View>
              <View style={styles.cardBody}>
                <View style={styles.cardHeader}>
                  <Text style={styles.title} numberOfLines={1}>{n.title}</Text>
                  <Text style={styles.date}>{timeAgo(n.createdAt)}</Text>
                </View>
                <Text style={styles.message} numberOfLines={2}>{n.body}</Text>
                {n.isLocal ? <Text style={styles.localTag}>Saved on this device</Text> : null}
              </View>
              {!n.isRead ? <View style={styles.unreadDot} /> : null}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </ScreenBackground>
  );

  function timeAgo(iso) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
  }
}

const makeStyles = (colors, isDark) => StyleSheet.create({
  container: {flex: 1},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  readAllBtn: {flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6},
  readAllText: {color: '#fff', fontSize: 12, fontWeight: '600'},
  emptyBox: {alignItems: 'center', paddingVertical: 80, paddingHorizontal: 32, gap: 8},
  emptyText: {color: colors.textSecondary, fontSize: 16, fontWeight: '600'},
  emptySub: {color: colors.textMuted, fontSize: 13, textAlign: 'center'},
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardUnread: {borderColor: colors.primary, borderWidth: 1.2},
  iconWrap: {width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center'},
  cardBody: {flex: 1},
  cardHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8},
  title: {flexShrink: 1, color: colors.text, fontSize: 14, fontWeight: '700'},
  date: {color: colors.textMuted, fontSize: 11},
  message: {color: colors.textSecondary, fontSize: 13, marginTop: 3, lineHeight: 18},
  localTag: {color: colors.warning, fontSize: 11, fontWeight: '600', marginTop: 4},
  unreadDot: {width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary},
});
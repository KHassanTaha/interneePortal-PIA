import React, {useState, useEffect, useMemo} from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import {useSelector, useDispatch} from 'react-redux';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client, {clearTokens} from '../../api/client';
import {logout} from '../../store/slices/authSlice';
import {showToast} from '../../components/AppToast';
import {useAppTheme} from '../../theme';
import ScreenBackground from '../../components/ScreenBackground';
import AppHeader from '../../components/AppHeader';
import RightSidebar from '../../components/RightSidebar';
import Icon from '../../components/Icon';
import Spinner from '../../components/Spinner';
import LogDetailModal from '../../components/LogDetailModal';
import ActivityCard from '../../components/ActivityCard';
import {logTypeColors, logFallbackColor} from '../../utils/logTypes';
import EndOfListMarker from '../../components/EndOfListMarker';

export default function AdminDashboard({navigation}) {
  const {colors, isDark} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const dispatch = useDispatch();
  const {profile} = useSelector(s => s.auth);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [detailLog, setDetailLog] = useState(null);

  const fetchDashboard = async () => {
    try {
      const res = await client.get('/admin/dashboard');
      setDashboard(res.data);
    } catch (e) {
      showToast("Couldn't load the dashboard. Check your connection and pull to refresh.", 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await client.get('/admin/dashboard');
        if (!cancelled) setDashboard(res.data);
      } catch (e) {
        if (!cancelled) showToast("Couldn't load the dashboard. Check your connection and pull to refresh.", 'error');
      } finally {
        if (!cancelled) { setLoading(false); setRefreshing(false); }
      }
    };
    run();
    return () => { cancelled = true; };
  }, []);

  const handleLogout = async () => {
    const {getRefreshToken} = require('../../api/tokenStore');
    const refreshToken = await getRefreshToken();
    try { await client.post('/auth/logout', {refreshToken}); } catch {}
    await AsyncStorage.removeItem('user');
    clearTokens();
    dispatch(logout());
  };

  if (loading) {
    return <Spinner style={styles.center} />;
  }

  const stats = [
    {label: 'Mentors', value: dashboard?.totalMentors ?? 0, icon: 'users', screen: 'MentorManagement', sub: 'mentors'},
    {label: 'Interns', value: dashboard?.activeInterns ?? 0, icon: 'gradCap', screen: 'AdminInterns', sub: 'active interns'},
    {label: 'Departments', value: dashboard?.totalDepartments ?? 0, icon: 'building', screen: 'Departments', sub: 'departments'},
  ];



  return (
    <ScreenBackground>
    <ScrollView
      style={styles.container}
      contentContainerStyle={{paddingBottom: 100, flexGrow: 1}}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchDashboard();}} tintColor={colors.primary} />}>

      {/* Header */}
      <AppHeader
        hideTitle
        title="Dashboard"
        right={(
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open navigation menu" id="admin-menu-btn" onPress={() => setSidebarVisible(true)} style={styles.menuBtn}><Icon name="menu" size={22} color="#fff" />
          </TouchableOpacity>
        )}
      />

      <RightSidebar
        visible={sidebarVisible}
        onClose={() => setSidebarVisible(false)}
        navigation={navigation}
      />

      {/* Stats + Quick Actions (merged) */}
      <View style={styles.statsGrid}>
        {stats.map((s, i) => (
          <TouchableOpacity
            key={i}
            id={`admin-action-${s.screen.toLowerCase()}`}
            style={styles.statCard}
            onPress={() => navigation.navigate(s.screen)}>
            <View style={styles.statTop}>
              <Icon name={s.icon} size={18} color={colors.primary} />
              <Text style={styles.statValue}>{s.value}</Text>
            </View>
            <Text style={styles.statLabel}>{s.label}</Text>
            <Text style={styles.statSub}>{s.sub}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Recent Activity */}
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        <TouchableOpacity id="view-all-logs" style={styles.viewAllBtn} onPress={() => navigation.navigate('ActivityLogs')}>
          <Text style={styles.viewAllText}>View All</Text>
          <Icon name="chevronRight" size={16} color={colors.textAccent} />
        </TouchableOpacity>
      </View>
      {dashboard?.recentActivity?.map((log, i) => (
        <ActivityCard
          key={log.id}
          id={`dash-log-${log.id}`}
          log={log}
          color={colors.primary}
          showLine={i < dashboard.recentActivity.length - 1}
          onPress={() => setDetailLog(log)}
        />
      ))}
      {dashboard?.recentActivity?.length > 0 && <EndOfListMarker />}
    </ScrollView>

    <LogDetailModal
      log={detailLog}
      typeColor={detailLog ? (logTypeColors(colors, isDark)[detailLog.logType] || logFallbackColor(colors, isDark)) : null}
      onClose={() => setDetailLog(null)}
    />
    </ScreenBackground>
  );
}

const makeStyles = (colors, isDark) => StyleSheet.create({
  container: {flex: 1},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background},
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 14, marginBottom: 8,
  },
  menuBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
    justifyContent: 'center', alignItems: 'center',
  },
  statCard: {
    width: '48%', backgroundColor: colors.surface,
    borderRadius: 14, padding: 12, borderLeftWidth: 3, borderLeftColor: colors.primary,
    marginBottom: 10, borderWidth: 1, borderColor: colors.border,
  },
  statTop: {flexDirection: 'row', alignItems: 'center', gap: 8},
  statValue: {fontSize: 22, fontWeight: '800', color: colors.text},
  statLabel: {color: colors.text, fontSize: 12, fontWeight: '600', marginTop: 8},
  statSub: {color: colors.textSecondary, fontSize: 10, marginTop: 2},
  sectionTitle: {
    color: colors.text, fontSize: 16, fontWeight: '700',
    marginHorizontal: 20, marginTop: 12, marginBottom: 12,
  },
  sectionRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 4,
  },
  viewAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginRight: 20, paddingVertical: 4, paddingHorizontal: 8,
  },
  viewAllText: {color: colors.textAccent, fontSize: 13, fontWeight: '700'},
  deptText: {color: isDark ? colors.accentLight : colors.accent, fontSize: 10, fontWeight: '600'},
});

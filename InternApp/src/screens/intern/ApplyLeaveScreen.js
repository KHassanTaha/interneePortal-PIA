import React, {useCallback, useState, useMemo} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {showToast} from '../../components/AppToast';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, RefreshControl, TextInput, Platform,
} from 'react-native';
import client from '../../api/client';
import {write} from '../../api/write';
import {useAppTheme} from '../../theme';
import ScreenBackground from '../../components/ScreenBackground';
import AppHeader from '../../components/AppHeader';
import RightSidebar from '../../components/RightSidebar';
import Icon from '../../components/Icon';
import Spinner from '../../components/Spinner';
import GradientButton from '../../components/GradientButton';

const STATUS_COLORS = {Pending: 'warning', Approved: 'success', Rejected: 'error'};

export default function ApplyLeaveScreen({navigation}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchLeaves = async () => {
    try {
      const res = await client.get('/intern/leaves');
      setLeaves(res.data);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    const loadLeaves = async () => {
      try {
        const res = await client.get('/intern/leaves');
        if (!cancelled) setLeaves(res.data);
      } catch {} finally { if (!cancelled) { setLoading(false); setRefreshing(false); } }
    };
    loadLeaves();
    return () => { cancelled = true; };
  }, []));

  const parseDate = s => {
    const parts = s.split(/[/-]/);
    if (parts.length < 3) return null;
    const [y, m, d] = parts.map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  };

  const submitLeave = async () => {
    const sd = parseDate(startDate);
    const ed = parseDate(endDate);
    if (!sd || !ed) return showToast('Enter dates as YYYY-MM-DD.', 'error');
    if (ed < sd) return showToast('End date cannot be before start date.', 'error');
    if (!reason.trim()) return showToast('Please provide a reason.', 'error');
    setSubmitting(true);
    try {
      const {queued} = await write({
        kind: 'intern',
        label: 'Leave application',
        method: 'post',
        url: '/intern/leaves',
        body: {startDate: sd.toISOString(), endDate: ed.toISOString(), reason: reason.trim()},
      });
      showToast(
        queued
          ? 'Leave saved locally — will submit when online.'
          : 'Leave application submitted.',
        queued ? 'info' : 'success',
      );
      setStartDate(''); setEndDate(''); setReason('');
      fetchLeaves();
    } catch (e) {
      showToast(e.response?.data?.message || "Couldn't submit. Try again.", 'error');
    } finally { setSubmitting(false); }
  };

  const badgeStyle = s => {
    const map = {Pending: colors.warning, Approved: colors.success, Rejected: colors.error};
    return {color: map[s] || colors.textMuted};
  };

  if (loading) return <Spinner style={styles.center} />;

  return (
    <ScreenBackground>
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchLeaves(); }} tintColor={colors.primary} />}
      >
        <AppHeader
          right={<TouchableOpacity accessibilityRole="button" accessibilityLabel="Open navigation menu" id="leave-menu-btn" onPress={() => setSidebarVisible(true)} style={styles.menuBtn}><Icon name="menu" size={22} color="#fff" /></TouchableOpacity>}
        />
        <RightSidebar visible={sidebarVisible} onClose={() => setSidebarVisible(false)} navigation={navigation} />

        <View style={styles.header}>
          <Text style={styles.title}>Apply for Leave</Text>
          <Text style={styles.subtitle}>Submit a leave request to your mentor for approval</Text>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.formLabel}>Start Date (YYYY-MM-DD)</Text>
          <TextInput style={styles.input} value={startDate} onChangeText={setStartDate} placeholder="2026-09-01" placeholderTextColor={colors.textMuted} />

          <Text style={styles.formLabel}>End Date (YYYY-MM-DD)</Text>
          <TextInput style={styles.input} value={endDate} onChangeText={setEndDate} placeholder="2026-09-03" placeholderTextColor={colors.textMuted} />

          <Text style={styles.formLabel}>Reason</Text>
          <TextInput style={[styles.input, styles.inputMultiline]} value={reason} onChangeText={setReason} placeholder="Why do you need leave?" placeholderTextColor={colors.textMuted} multiline numberOfLines={3} />

          <TouchableOpacity id="apply-leave-btn" style={[styles.submitBtn, submitting && {opacity: 0.6}]} onPress={submitLeave} disabled={submitting}>
            {submitting ? <ActivityIndicator size="small" color="#fff" /> : <><Icon name="calendar" size={18} color="#fff" /><Text style={styles.submitBtnText}>Submit Request</Text></>}
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>My Leave Requests</Text>
        {leaves.length === 0 && <View style={styles.emptyBox}><Icon name="calendar" size={32} color={colors.textMuted} /><Text style={styles.emptyText}>No leave requests yet</Text></View>}

        {leaves.map(l => (
          <View key={l.id} style={styles.leaveCard}>
            <View style={styles.leaveRow}>
              <Text style={styles.leaveDates}>{new Date(l.startDate).toLocaleDateString()} – {new Date(l.endDate).toLocaleDateString()}</Text>
              <Text style={[styles.leaveBadge, badgeStyle(l.status)]}>{l.status}</Text>
            </View>
            <Text style={styles.leaveReason}>{l.reason}</Text>
            {l.rejectionReason && <Text style={styles.leaveRejectReason}>Rejection reason: {l.rejectionReason}</Text>}
            <Text style={styles.leaveDate}>Applied {new Date(l.createdAt).toLocaleDateString()}</Text>
          </View>
        ))}
      </ScrollView>
    </ScreenBackground>
  );
}

const makeStyles = colors => StyleSheet.create({
  center: {flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg},
  container: {flex: 1, backgroundColor: colors.bg},
  menuBtn: {padding: 6, borderRadius: 8},
  header: {marginTop: 4, marginBottom: 16, paddingHorizontal: 20},
  title: {fontSize: 22, fontWeight: '700', color: colors.text},
  subtitle: {fontSize: 13, color: colors.textMuted, marginTop: 4},
  formCard: {backgroundColor: colors.card, borderRadius: 14, padding: 16, marginHorizontal: 20, marginBottom: 20, borderWidth: 1, borderColor: colors.border},
  formLabel: {fontSize: 12, fontWeight: '600', color: colors.textMuted, marginBottom: 4, marginTop: 8},
  input: {backgroundColor: colors.bg, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, fontSize: 14, color: colors.text, marginBottom: 4},
  inputMultiline: {minHeight: 72, textAlignVertical: 'top'},
  submitBtn: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 13, marginTop: 10},
  submitBtnText: {fontSize: 15, fontWeight: '600', color: '#fff'},
  sectionTitle: {fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 10, paddingHorizontal: 20},
  emptyBox: {alignItems: 'center', paddingVertical: 28},
  emptyText: {fontSize: 13, color: colors.textMuted, marginTop: 8},
  leaveCard: {backgroundColor: colors.card, borderRadius: 12, padding: 14, marginHorizontal: 20, marginBottom: 10, borderWidth: 1, borderColor: colors.border},
  leaveRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  leaveDates: {fontSize: 14, fontWeight: '600', color: colors.text, flex: 1},
  leaveBadge: {fontSize: 12, fontWeight: '600'},
  leaveReason: {fontSize: 13, color: colors.text, marginTop: 6},
  leaveRejectReason: {fontSize: 12, color: colors.error, marginTop: 4},
  leaveDate: {fontSize: 11, color: colors.textMuted, marginTop: 6},
});
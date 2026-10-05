import React, {useState, useEffect, useMemo, useCallback} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, RefreshControl, Modal, TextInput,
} from 'react-native';
import client from '../../api/client';
import {showToast} from '../../components/AppToast';
import {showConfirm} from '../../components/AppConfirm';
import {moderate, queuedToast} from '../../api/moderate';
import {useAppTheme} from '../../theme';
import ScreenBackground from '../../components/ScreenBackground';
import AppHeader from '../../components/AppHeader';
import Icon from '../../components/Icon';
import Spinner from '../../components/Spinner';
import FilterChips from '../../components/FilterChips';
import Dropdown from '../../components/Dropdown';
import CenteredModalCard from '../../components/CenteredModalCard';

const STATUS_TABS = [
  {key: 'Pending', label: 'Pending', color: 'warning'},
  {key: 'Approved', label: 'Approved', color: 'success'},
  {key: 'Rejected', label: 'Rejected', color: 'error'},
];

export default function AdminLeaveApprovalsScreen({navigation}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('Pending');
  const [departments, setDepartments] = useState([]);
  const [deptFilter, setDeptFilter] = useState(null);
  const [rejectLeave, setRejectLeave] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    const fetchDepts = async () => {
      try {
        const r = await client.get('/admin/departments');
        if (!cancelled) setDepartments(r.data);
      } catch {}
    };
    fetchDepts();
    return () => { cancelled = true; };
  }, []);

  const fetchLeavesStandalone = async () => {
    try {
      const res = await client.get('/admin/leave-applications');
      setLeaves(res.data);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    const fetchLeaves = async () => {
      try {
        const res = await client.get('/admin/leave-applications');
        if (!cancelled) setLeaves(res.data);
      } catch {} finally { if (!cancelled) { setLoading(false); setRefreshing(false); } }
    };
    fetchLeaves();
    return () => { cancelled = true; };
  }, []));

  const handleApprove = async item => {
    const ok = await showConfirm({title: 'Approve Leave', message: `Approve ${item.internName}'s leave from ${new Date(item.startDate).toLocaleDateString()} to ${new Date(item.endDate).toLocaleDateString()}?`, confirmText: 'Approve'});
    if (!ok) return;
    try {
      const {queued} = await moderate({kind: 'admin', label: 'Approve leave', method: 'POST', url: `/admin/leave-applications/${item.id}/approve`, entityKey: `leave:${item.id}`});
      queuedToast(queued, 'Leave approved.');
      fetchLeavesStandalone();
    } catch (e) { showToast(e.response?.data?.message || "Couldn't approve. Try again.", 'error'); }
  };

  const openReject = item => { setRejectLeave(item); setRejectReason(''); };

  const submitReject = async () => {
    if (!rejectReason.trim()) return;
    const item = rejectLeave;
    try {
      const {queued} = await moderate({kind: 'admin', label: 'Reject leave', method: 'POST', url: `/admin/leave-applications/${item.id}/reject`, body: {reason: rejectReason.trim()}, entityKey: `leave:${item.id}`});
      queuedToast(queued, 'Leave rejected.');
      setRejectLeave(null);
      fetchLeavesStandalone();
    } catch (e) { showToast(e.response?.data?.message || "Couldn't reject. Try again.", 'error'); }
  };

  const colorMap = {warning: colors.warning, success: colors.success, error: colors.error};
  const q = query.trim().toLowerCase();
  const filtered = leaves.filter(l =>
    l.status === tab &&
    (!q || l.internName.toLowerCase().includes(q) || (l.username || '').toLowerCase().includes(q) || String(l.internId ?? '').includes(q)) &&
    (!deptFilter || l.department === deptFilter)
  );

  if (loading) return <Spinner style={styles.center} />;

  return (
    <ScreenBackground>
      <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchLeavesStandalone(); }} tintColor={colors.primary} />}>
        <AppHeader home />
        <View style={styles.header}>
          <Text style={styles.subtitle}>All intern leave requests</Text>
        </View>

        <View style={styles.searchWrap}>
          <Icon name="search" size={15} color={colors.textMuted} />
          <TextInput style={styles.searchInput} placeholder="Search by intern name, username or ID" placeholderTextColor={colors.textMuted} value={query} onChangeText={setQuery} autoCorrect={false} />
          {query.length > 0 && (
            <TouchableOpacity id="leave-standalone-search-clear" onPress={() => setQuery('')} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Icon name="close" size={15} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.deptFilter}>
          <Dropdown
            compact
            id="leave-dept-filter"
            searchable
            clearable
            onClear={() => setDeptFilter(null)}
            value={deptFilter}
            onChange={v => setDeptFilter(v)}
            options={[{value: null, label: 'All Departments'}, ...departments.map(d => ({value: d.name, label: d.name}))]}
            placeholder="Department"
          />
        </View>

        <FilterChips
          compact
          idPrefix="leave-status"
          options={STATUS_TABS.map(s => ({key: s.key, label: s.label, color: colorMap[s.color]}))}
          value={tab}
          onChange={setTab}
        />

        {filtered.length === 0 && <View style={styles.emptyBox}><Icon name="calendar" size={32} color={colors.textMuted} /><Text style={styles.emptyText}>No {tab.toLowerCase()} leaves</Text></View>}

        {filtered.map(item => (
          <View key={item.id} style={styles.leaveCard}>
            <View style={styles.leaveHeader}>
              <Text style={styles.internName}>{item.internName}</Text>
              <Text style={[styles.badge, {color: item.status === 'Approved' ? colors.success : item.status === 'Rejected' ? colors.error : colors.warning}]}>{item.status}</Text>
            </View>
            <Text style={styles.leaveDates}>{new Date(item.startDate).toLocaleDateString()} – {new Date(item.endDate).toLocaleDateString()}</Text>
            <Text style={styles.leaveReason}>{item.reason}</Text>
            {item.rejectionReason && <Text style={styles.rejectionReason}>Rejection: {item.rejectionReason}</Text>}
            <Text style={styles.leaveDate}>Applied {new Date(item.createdAt).toLocaleDateString()}</Text>
            {item.status === 'Pending' && (
              <View style={styles.actionRow}>
                <TouchableOpacity id={`reject-${item.id}`} style={styles.rejectBtn} onPress={() => openReject(item)}>
                  <Icon name="close" size={16} color={colors.error} /><Text style={styles.rejectBtnText}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity id={`approve-${item.id}`} style={styles.approveBtn} onPress={() => handleApprove(item)}>
                  <Icon name="check" size={16} color="#fff" /><Text style={styles.approveBtnText}>Approve</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      <Modal visible={!!rejectLeave} transparent animationType="fade" onRequestClose={() => setRejectLeave(null)}>
        <View style={styles.modalOverlay}>
          <CenteredModalCard style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reject Leave</Text>
            <Text style={styles.modalSub}>{rejectLeave?.internName}'s leave from {rejectLeave ? new Date(rejectLeave.startDate).toLocaleDateString() : ''} to {rejectLeave ? new Date(rejectLeave.endDate).toLocaleDateString() : ''}</Text>
            <TextInput style={styles.modalInput} value={rejectReason} onChangeText={setRejectReason} placeholder="Reason for rejection" placeholderTextColor={colors.textMuted} multiline autoFocus />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setRejectLeave(null)}><Text style={styles.modalCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={submitReject}><Text style={styles.modalConfirmText}>Confirm</Text></TouchableOpacity>
            </View>
          </CenteredModalCard>
        </View>
      </Modal>
    </ScreenBackground>
  );
}

const makeStyles = colors => StyleSheet.create({
  center: {flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg},
  container: {flex: 1, backgroundColor: colors.bg},
  header: {marginTop: 4, marginBottom: 12, paddingHorizontal: 20},
  subtitle: {fontSize: 13, color: colors.textMuted, marginTop: 4},
  deptFilter: {paddingHorizontal: 20, marginBottom: 4},
  searchWrap: {flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, marginHorizontal: 20, marginTop: 2, marginBottom: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8},
  searchInput: {flex: 1, color: colors.text, fontSize: 13, padding: 0},
  emptyBox: {alignItems: 'center', paddingVertical: 32},
  emptyText: {fontSize: 13, color: colors.textMuted, marginTop: 8},
  leaveCard: {backgroundColor: colors.card, borderRadius: 12, padding: 14, marginHorizontal: 20, marginBottom: 10, borderWidth: 1, borderColor: colors.border},
  leaveHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  internName: {fontSize: 15, fontWeight: '600', color: colors.text, flex: 1},
  badge: {fontSize: 12, fontWeight: '600'},
  leaveDates: {fontSize: 13, color: colors.text, marginTop: 4},
  leaveReason: {fontSize: 13, color: colors.textMuted, marginTop: 4},
  rejectionReason: {fontSize: 12, color: colors.error, marginTop: 4},
  leaveDate: {fontSize: 11, color: colors.textMuted, marginTop: 4},
  actionRow: {flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10},
  rejectBtn: {flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.error},
  rejectBtnText: {fontSize: 13, fontWeight: '600', color: colors.error},
  approveBtn: {flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 14, borderRadius: 8, backgroundColor: colors.success},
  approveBtnText: {fontSize: 13, fontWeight: '600', color: '#fff'},
  modalOverlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24},
  modalCard: {backgroundColor: colors.card, borderRadius: 14, padding: 20},
  modalTitle: {fontSize: 18, fontWeight: '700', color: colors.text},
  modalSub: {fontSize: 13, color: colors.textMuted, marginTop: 4},
  modalInput: {backgroundColor: colors.bg, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, fontSize: 14, color: colors.text, marginTop: 12, minHeight: 72, textAlignVertical: 'top'},
  modalActions: {flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14},
  modalCancel: {paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8},
  modalCancelText: {fontSize: 14, fontWeight: '600', color: colors.textMuted},
  modalConfirm: {paddingVertical: 8, paddingHorizontal: 18, borderRadius: 8, backgroundColor: colors.error},
  modalConfirmText: {fontSize: 14, fontWeight: '600', color: '#fff'},
});
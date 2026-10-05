import React, {useEffect, useMemo, useState} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, ActivityIndicator, ScrollView, RefreshControl,
} from 'react-native';
import client from '../api/client';
import {showToast} from '../components/AppToast';
import {showConfirm} from '../components/AppConfirm';
import {useAppTheme} from '../theme';
import Icon from '../components/Icon';
import FilterChips from '../components/FilterChips';
import Dropdown from '../components/Dropdown';
import Spinner from './Spinner';

const FILTERS = ['All', 'Pending', 'Approved', 'Rejected'];

export default function LeaveRequestsSection({base}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('Pending');
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busy, setBusy] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [dept, setDept] = useState(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('default');
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = () => client.get(`${base}/leave-applications`).then(r => setLeaves(r.data)).catch(() => showToast("Couldn't load leave requests.", 'error')).finally(() => { setLoading(false); setRefreshing(false); });

  useEffect(() => {
    fetchData();
    if (base !== '/admin') return;
    let cancelled = false;
    client.get('/admin/departments').then(r => { if (!cancelled) setDepartments(r.data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [base]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  const filterOpts = FILTERS.map(f => ({key: f, label: f}));

  const doAction = async (item, action) => {
    setBusy(`${item.id}-${action}`);
    try {
      if (action === 'reject') {
        if (!rejectReason.trim()) { showToast('Please provide a reason.', 'error'); setBusy(null); return; }
        await client.post(`${base}/leave-applications/${item.id}/reject`, {reason: rejectReason.trim()});
        setRejectTarget(null); setRejectReason('');
      } else {
        await client.post(`${base}/leave-applications/${item.id}/approve`);
      }
      showToast(action === 'reject' ? 'Leave rejected.' : 'Leave approved.', 'success');
      fetchData();
    } catch (e) {
      showToast(e.response?.data?.message || 'Action failed, try again.', 'error');
    } finally { setBusy(null); }
  };

  const confirmApprove = item => showConfirm({
    title: 'Approve Leave',
    message: `Approve ${item.internName}'s leave from ${new Date(item.startDate).toLocaleDateString()} to ${new Date(item.endDate).toLocaleDateString()}?`,
    confirmText: 'Approve',
  }).then(ok => { if (ok) doAction(item, 'approve'); });

  const q = query.trim().toLowerCase();
  const nowDate = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const visible = leaves
    .filter(l => (status === 'All' || l.status === status) && (!dept || l.department === dept) && (
      !q || l.internName.toLowerCase().includes(q) || (l.username || '').toLowerCase().includes(q) || String(l.internId ?? '').includes(q)
    ))
    .sort((a, b) => {
      if (sort === 'upcoming') return new Date(a.startDate) - new Date(b.startDate);
      if (sort === 'active' || sort === 'recentlyPassed') return new Date(b.endDate) - new Date(a.endDate);
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  const visibleByPhase = visible.filter(l => {
    if (sort === 'default') return true;
    const s = new Date(l.startDate); s.setHours(0, 0, 0, 0);
    const e = new Date(l.endDate); e.setHours(0, 0, 0, 0);
    const t = nowDate();
    if (sort === 'upcoming') return s >= t;
    if (sort === 'active') return s <= t && e >= t;
    if (sort === 'recentlyPassed') return e < t;
    return true;
  });
  const statusColor = s => s === 'Approved' ? colors.success : s === 'Rejected' ? colors.error : colors.warning;

  if (loading) return <Spinner style={styles.center} />;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.list}
        contentContainerStyle={{paddingTop: 6, paddingBottom: 90, flexGrow: 1}}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        <View style={styles.searchWrap}>
          <Icon name="search" size={15} color={colors.textMuted} />
          <TextInput style={styles.searchInput} placeholder="Search by intern name, username or ID" placeholderTextColor={colors.textMuted} value={query} onChangeText={setQuery} autoCorrect={false} />
          {query.length > 0 && (
            <TouchableOpacity id="leave-search-clear" onPress={() => setQuery('')} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Icon name="close" size={15} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.chipsWrap}>
          <FilterChips compact options={filterOpts} value={status} onChange={setStatus} idPrefix="leave-status" />
        </View>

        {base === '/admin' && (
          <View id="leave-sec-dept" style={styles.deptWrap}>
            <Dropdown
              compact
              placeholder="Department"
              value={dept}
              onChange={setDept}
              options={[{value: null, label: 'All Departments'}, ...departments.map(d => ({value: d.name, label: d.name}))]}
            />
          </View>
        )}

        <View id="leave-sort" style={styles.deptWrap}>
        <Dropdown
          compact
          placeholder="Sort by"
          value={sort}
          onChange={setSort}
          options={[
            {value: 'default', label: 'Newest first'},
            {value: 'upcoming', label: 'Upcoming'},
            {value: 'active', label: 'Active'},
            {value: 'recentlyPassed', label: 'Recently passed'},
          ]}
        />
      </View>

        {visibleByPhase.length === 0 ? (
          <View style={styles.emptyBox}>
            <Icon name="calendar" size={40} color={colors.textMuted} />
            <Text style={styles.emptyText}>No {status.toLowerCase()} leave requests</Text>
          </View>
        ) : visibleByPhase.map(item => (
          <View key={item.id} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.avatarBox}><Text style={styles.avatarText}>{item.internName[0]}</Text></View>
              <View style={styles.cardInfo}>
                <Text style={styles.name}>{item.internName}</Text>
                <Text style={styles.sub}>{new Date(item.startDate).toLocaleDateString()} – {new Date(item.endDate).toLocaleDateString()}</Text>
                <Text style={styles.sub2}>{item.reason}</Text>
                {item.rejectionReason && <Text style={styles.rej}>{'Rejection: ' + item.rejectionReason}</Text>}
              </View>
              <View style={[styles.badge, {backgroundColor: statusColor(item.status) + '22'}]}>
                <Text style={[styles.badgeText, {color: statusColor(item.status)}]}>{item.status}</Text>
              </View>
            </View>
            {item.status === 'Pending' && (
              <View style={styles.actionsRow}>
                <TouchableOpacity id={`approve-leave-${item.id}`} style={styles.approveBtn} disabled={busy !== null} onPress={() => confirmApprove(item)}>
                  {busy === `${item.id}-approve` ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="check" size={16} color="#fff" />}
                  <Text style={styles.approveBtnText}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity id={`reject-leave-${item.id}`} style={styles.rejectBtn} disabled={busy !== null} onPress={() => { setRejectReason(''); setRejectTarget(item); }}>
                  <Icon name="close" size={16} color={colors.error} />
                  <Text style={styles.rejectBtnText}>Reject</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      <Modal visible={rejectTarget !== null} transparent animationType="fade" onRequestClose={() => setRejectTarget(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reject Leave</Text>
            <Text style={styles.modalSubtitle}>{rejectTarget?.internName}</Text>
            <TextInput style={styles.reasonInput} placeholder="Reason for rejection" placeholderTextColor={colors.textMuted} value={rejectReason} onChangeText={setRejectReason} multiline />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setRejectTarget(null)}><Text style={styles.modalCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity id="confirm-reject-leave" style={styles.modalConfirm} disabled={busy !== null} onPress={() => doAction(rejectTarget, 'reject')}>
                <Text style={styles.modalConfirmText}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = colors => StyleSheet.create({
  container: {flex: 1},
  center: {alignItems: 'center', paddingVertical: 60},
  deptWrap: {paddingHorizontal: 16, marginTop: 10},
  chipsWrap: {marginTop: 8},
  searchWrap: {flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, marginHorizontal: 16, marginTop: 10, borderRadius: 9, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 7},
  searchInput: {flex: 1, color: colors.text, fontSize: 13, padding: 0},
  list: {flex: 1},
  emptyBox: {alignItems: 'center', paddingVertical: 80},
  emptyText: {color: colors.textSecondary, fontSize: 15, marginTop: 10},
  card: {backgroundColor: colors.surface, marginHorizontal: 12, marginBottom: 12, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border},
  cardTop: {flexDirection: 'row', alignItems: 'flex-start'},
  avatarBox: {width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: 12},
  avatarText: {color: '#fff', fontSize: 16, fontWeight: '700'},
  cardInfo: {flex: 1},
  name: {color: colors.text, fontSize: 15, fontWeight: '700'},
  sub: {color: colors.textSecondary, fontSize: 12, marginTop: 2},
  sub2: {color: colors.textMuted, fontSize: 11, marginTop: 2},
  rej: {color: colors.error, fontSize: 11, marginTop: 2},
  badge: {borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8},
  badgeText: {fontSize: 11, fontWeight: '700'},
  actionsRow: {flexDirection: 'row', gap: 12, marginTop: 14},
  approveBtn: {flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.success, borderRadius: 10, paddingVertical: 12},
  approveBtnText: {color: '#fff', fontWeight: '700'},
  rejectBtn: {flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.card, borderRadius: 10, paddingVertical: 12, borderWidth: 1, borderColor: colors.error},
  rejectBtnText: {color: colors.error, fontWeight: '700'},
  modalBackdrop: {flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24},
  modalCard: {backgroundColor: colors.surface, borderRadius: 16, padding: 20, width: '100%', borderWidth: 1, borderColor: colors.border},
  modalTitle: {color: colors.text, fontSize: 17, fontWeight: '700'},
  modalSubtitle: {color: colors.textMuted, fontSize: 13, marginTop: 2, marginBottom: 14},
  reasonInput: {backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, color: colors.text, minHeight: 70, textAlignVertical: 'top'},
  modalActions: {flexDirection: 'row', gap: 10, marginTop: 14},
  modalCancel: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderRadius: 10, paddingVertical: 12, borderWidth: 1, borderColor: colors.border},
  modalCancelText: {color: colors.text, fontWeight: '600'},
  modalConfirm: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.error, borderRadius: 10, paddingVertical: 12},
  modalConfirmText: {color: '#fff', fontWeight: '700'},
});
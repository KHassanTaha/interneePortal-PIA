import React, {useState, useEffect, useMemo, useCallback} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, RefreshControl, Modal, TextInput, Image,
} from 'react-native';
import client from '../../api/client';
import {fileUrl} from '../../api/fileClient';
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

export default function FaceApprovalsScreen({navigation, route, role}) {
  const resolvedRole = role || route?.params?.role || 'admin';
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [interns, setInterns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('Pending');
  const [departments, setDepartments] = useState([]);
  const [deptFilter, setDeptFilter] = useState(null);
  const [rejectIntern, setRejectIntern] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [viewerUri, setViewerUri] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (resolvedRole !== 'admin') return;
    let cancelled = false;
    const fetchDepts = async () => {
      try {
        const r = await client.get('/admin/departments');
        if (!cancelled) setDepartments(r.data);
      } catch {}
    };
    fetchDepts();
    return () => { cancelled = true; };
  }, [resolvedRole]);

  const fetchListStandalone = async () => {
    try {
      const res = await client.get(`/${resolvedRole}/face-approvals`);
      setInterns(res.data);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    const fetchList = async () => {
      try {
        const res = await client.get(`/${resolvedRole}/face-approvals`);
        if (!cancelled) setInterns(res.data);
      } catch {} finally { if (!cancelled) { setLoading(false); setRefreshing(false); } }
    };
    fetchList();
    return () => { cancelled = true; };
  }, [resolvedRole]));

  const handleApprove = async item => {
    const ok = await showConfirm({title: 'Approve Face Enrollment', message: `Approve face enrollment for ${item.fullName}?`, confirmText: 'Approve'});
    if (!ok) return;
    try {
      const {queued} = await moderate({kind: resolvedRole, label: 'Approve face enrollment', method: 'POST', url: `/${resolvedRole}/interns/${item.id}/face/approve`, entityKey: `face:${item.id}`});
      queuedToast(queued, 'Face enrollment approved.');
      fetchListStandalone();
    } catch (e) { showToast(e.response?.data?.message || "Couldn't approve. Try again.", 'error'); }
  };

  const openReject = item => { setRejectIntern(item); setRejectReason(''); };

  const submitReject = async () => {
    if (!rejectReason.trim()) return;
    const item = rejectIntern;
    try {
      const {queued} = await moderate({kind: resolvedRole, label: 'Reject face enrollment', method: 'POST', url: `/${resolvedRole}/interns/${item.id}/face/reject`, body: {reason: rejectReason.trim()}, entityKey: `face:${item.id}`});
      queuedToast(queued, 'Face enrollment rejected.');
      setRejectIntern(null);
      fetchListStandalone();
    } catch (e) { showToast(e.response?.data?.message || "Couldn't reject. Try again.", 'error'); }
  };

  const handleDelete = async item => {
    const ok = await showConfirm({title: 'Delete Face Enrollment', message: `Delete ${item.fullName}'s face enrollment? They can re-enroll afterwards.`, confirmText: 'Delete'});
    if (!ok) return;
    try {
      const {queued} = await moderate({kind: resolvedRole, label: 'Delete face enrollment', method: 'POST', url: `/${resolvedRole}/interns/${item.id}/face/reset`, entityKey: `face:${item.id}`});
      queuedToast(queued, 'Face enrollment deleted.');
      fetchListStandalone();
    } catch (e) { showToast(e.response?.data?.message || "Couldn't delete. Try again.", 'error'); }
  };

  const colorMap = {warning: colors.warning, error: colors.error, success: colors.success};
  const q = query.trim().toLowerCase();
  const filtered = interns.filter(i =>
    i.faceEnrollmentStatus === tab &&
    (!q || i.fullName.toLowerCase().includes(q) || (i.username || '').toLowerCase().includes(q) || String(i.id ?? '').includes(q)) &&
    (!deptFilter || (i.departmentId != null ? i.departmentId === deptFilter : i.department === deptFilter))
  );

  if (loading) return <Spinner style={styles.center} />;

  return (
    <ScreenBackground>
      <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchListStandalone(); }} tintColor={colors.primary} />}>
        <AppHeader home />
        <View style={styles.header}>
          <Text style={styles.subtitle}>Interns awaiting face verification</Text>
        </View>

        <View style={styles.searchWrap}>
          <Icon name="search" size={15} color={colors.textMuted} />
          <TextInput style={styles.searchInput} placeholder="Search by intern name, username or ID" placeholderTextColor={colors.textMuted} value={query} onChangeText={setQuery} autoCorrect={false} />
          {query.length > 0 && (
            <TouchableOpacity id="face-standalone-search-clear" onPress={() => setQuery('')} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Icon name="close" size={15} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {resolvedRole === 'admin' && (
          <View style={styles.deptFilter}>
            <Dropdown
              compact
              id="face-dept-filter"
              searchable
              clearable
              onClear={() => setDeptFilter(null)}
              value={deptFilter}
              onChange={v => setDeptFilter(v)}
              options={[{value: null, label: 'All Departments'}, ...departments.map(d => ({value: d.id, label: d.name}))]}
              placeholder="Department"
            />
          </View>
        )}

        <FilterChips
          compact
          idPrefix="face-status"
          options={STATUS_TABS.map(s => ({key: s.key, label: s.label, color: colorMap[s.color]}))}
          value={tab}
          onChange={setTab}
        />

        {filtered.length === 0 && <View style={styles.emptyBox}><Icon name="camera" size={32} color={colors.textMuted} /><Text style={styles.emptyText}>No {tab.toLowerCase()} face enrollments</Text></View>}

        {filtered.map(item => (
          <TouchableOpacity key={item.id} style={styles.card} activeOpacity={0.7} onPress={() => { if (item.photoPath) setViewerUri(fileUrl(item.photoPath)); }}>
            <View style={styles.rowTop}>
              {item.photoThumbPath || item.photoPath ? (
                <TouchableOpacity id={`photo-${item.id}`} onPress={() => setViewerUri(fileUrl(item.photoPath))}>
                  <Image source={{uri: fileUrl(item.photoThumbPath || item.photoPath)}} style={styles.avatar} />
                </TouchableOpacity>
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}><Icon name="user" size={20} color={colors.textMuted} /></View>
              )}
              <View style={styles.nameBlock}>
                <Text style={styles.internName}>{item.fullName}</Text>
                <Text style={styles.username}>@{item.username}</Text>
                <Text style={styles.department}>{item.department}</Text>
                <Text style={styles.dates}>{new Date(item.startDate).toLocaleDateString()} – {new Date(item.endDate).toLocaleDateString()}</Text>
              </View>
              <Text style={[styles.badge, {color: item.faceEnrollmentStatus === 'Rejected' ? colors.error : item.faceEnrollmentStatus === 'Approved' ? colors.success : colors.warning}]}>{item.faceEnrollmentStatus}</Text>
            </View>
            {item.faceRejectedReason ? <Text style={styles.rejectionReason}>Rejection: {item.faceRejectedReason}</Text> : null}
            {item.faceEnrolledAt ? <Text style={styles.enrolledAt}>Enrolled {new Date(item.faceEnrolledAt).toLocaleString()}</Text> : null}
            {item.faceEnrollmentStatus === 'Pending' && (
              <View style={styles.actionRow}>
                <TouchableOpacity id={`reject-${item.id}`} style={styles.rejectBtn} onPress={() => openReject(item)}>
                  <Icon name="close" size={16} color={colors.error} /><Text style={styles.rejectBtnText}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity id={`approve-${item.id}`} style={styles.approveBtn} onPress={() => handleApprove(item)}>
                  <Icon name="check" size={16} color="#fff" /><Text style={styles.approveBtnText}>Approve</Text>
                </TouchableOpacity>
              </View>
            )}
            {item.faceEnrollmentStatus !== 'Pending' && (
              <View style={styles.actionRow}>
                <TouchableOpacity id={`delete-${item.id}`} style={styles.deleteBtn} onPress={() => handleDelete(item)}>
                  <Icon name="trash" size={15} color={colors.error} /><Text style={styles.deleteBtnText}>Delete</Text>
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal visible={!!rejectIntern} transparent animationType="fade" onRequestClose={() => setRejectIntern(null)}>
        <View style={styles.modalOverlay}>
          <CenteredModalCard style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reject Face Enrollment</Text>
            <Text style={styles.modalSub}>{rejectIntern?.fullName}'s face enrollment ({rejectIntern?.department})</Text>
            <TextInput style={styles.modalInput} value={rejectReason} onChangeText={setRejectReason} placeholder="Reason for rejection" placeholderTextColor={colors.textMuted} multiline autoFocus />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setRejectIntern(null)}><Text style={styles.modalCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={submitReject}><Text style={styles.modalConfirmText}>Confirm</Text></TouchableOpacity>
            </View>
          </CenteredModalCard>
        </View>
      </Modal>

      <Modal visible={!!viewerUri} transparent animationType="fade" onRequestClose={() => setViewerUri(null)}>
        <View style={styles.viewerOverlay}>
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerUri(null)}>
            <Icon name="close" size={22} color="#fff" />
          </TouchableOpacity>
          {viewerUri && <Image source={{uri: viewerUri}} style={styles.viewerImage} resizeMode="contain" />}
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
  card: {backgroundColor: colors.card, borderRadius: 12, padding: 14, marginHorizontal: 20, marginBottom: 10, borderWidth: 1, borderColor: colors.border},
  rowTop: {flexDirection: 'row', alignItems: 'center'},
  avatar: {width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: colors.border},
  avatarPlaceholder: {alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg},
  nameBlock: {flex: 1, marginLeft: 12},
  internName: {fontSize: 15, fontWeight: '600', color: colors.text},
  username: {fontSize: 12, color: colors.textMuted, marginTop: 2},
  department: {fontSize: 13, color: colors.textSecondary, marginTop: 2},
  dates: {fontSize: 11, color: colors.textMuted, marginTop: 2},
  badge: {fontSize: 12, fontWeight: '600'},
  rejectionReason: {fontSize: 12, color: colors.error, marginTop: 8},
  enrolledAt: {fontSize: 11, color: colors.textMuted, marginTop: 4},
  actionRow: {flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10},
  rejectBtn: {flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.error},
  rejectBtnText: {fontSize: 13, fontWeight: '600', color: colors.error},
  approveBtn: {flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 14, borderRadius: 8, backgroundColor: colors.success},
  approveBtnText: {fontSize: 13, fontWeight: '600', color: '#fff'},
  deleteBtn: {flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.error + '55'},
  deleteBtnText: {fontSize: 13, fontWeight: '600', color: colors.error},
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
  viewerOverlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center'},
  viewerClose: {position: 'absolute', top: 24, right: 20, zIndex: 1, padding: 6},
  viewerImage: {width: '92%', height: '80%'},
});
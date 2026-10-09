import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, ActivityIndicator, RefreshControl, ScrollView, Image,
} from 'react-native';
import client from '../api/client';
import {fileUrl} from '../api/fileClient';
import {showToast} from '../components/AppToast';
import {showConfirm} from '../components/AppConfirm';
import {useAppTheme} from '../theme';
import Icon from '../components/Icon';
import InternAvatar from '../components/InternAvatar';
import FilterChips from '../components/FilterChips';
import Dropdown from '../components/Dropdown';
import Spinner from './Spinner';

export default function FaceApprovalsSection({base}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [viewerUri, setViewerUri] = useState(null);
  const [busy, setBusy] = useState(null);
  const [status, setStatus] = useState('All');
  const [departments, setDepartments] = useState([]);
  const [dept, setDept] = useState(null);
  const [query, setQuery] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const res = await client.get(`${base}/face-approvals`);
      setItems(res.data);
    } catch { showToast("Couldn't load face approvals.", 'error'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [base]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (base !== '/admin') return;
    let cancelled = false;
    client.get('/admin/departments').then(r => { if (!cancelled) setDepartments(r.data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [base]);

  const doAction = async (item, action) => {
    setBusy(`${item.id}-${action}`);
    try {
      const body = action === 'reject' ? {reason: rejectReason.trim() || 'Face profile rejected'} : undefined;
      const res = await client.post(`${base}/interns/${item.id}/face/${action}`, body);
      showToast(res.data.message || (action === 'approve' ? 'Face enrollment approved' : 'Face enrollment rejected'), 'success');
      setRejectTarget(null); setRejectReason('');
      fetchData();
    } catch (e) { showToast(e.response?.data?.message || 'Action failed, try again', 'error'); }
    finally { setBusy(null); }
  };

  const deleteEnrollment = async item => {
    const ok = await showConfirm({
      title: 'Delete Face Enrollment',
      message: `Delete ${item.fullName}'s face enrollment? They can re-enroll afterwards.`,
      confirmText: 'Delete',
    });
    if (!ok) return;
    setBusy(`${item.id}-delete`);
    try {
      const res = await client.post(`${base}/interns/${item.id}/face/reset`);
      showToast(res.data.message || 'Face enrollment deleted.', 'success');
      fetchData();
    } catch (e) { showToast(e.response?.data?.message || 'Delete failed, try again.', 'error'); }
    finally { setBusy(null); }
  };

  if (loading) return <Spinner style={styles.center} />;

  const badge = s => s === 'Pending' ? {label: 'Pending', color: colors.warning} : s === 'Rejected' ? {label: 'Rejected', color: colors.error} : {label: s, color: colors.success};

  const q = query.trim().toLowerCase();
  const visible = items.filter(i =>
    (status === 'All' || i.faceEnrollmentStatus === status) &&
    (!dept || i.department === dept) &&
    (!q || i.fullName.toLowerCase().includes(q) || (i.username || '').toLowerCase().includes(q) || String(i.id ?? '').includes(q))
  );

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.list}
        contentContainerStyle={{paddingTop: 6, paddingBottom: 90, flexGrow: 1}}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={colors.primary} />}>
        <View style={styles.searchWrap}>
          <Icon name="search" size={15} color={colors.textMuted} />
          <TextInput style={styles.searchInput} placeholder="Search by intern name, username or ID" placeholderTextColor={colors.textMuted} value={query} onChangeText={setQuery} autoCorrect={false} />
          {query.length > 0 && (
            <TouchableOpacity id="face-search-clear" onPress={() => setQuery('')} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Icon name="close" size={15} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <FilterChips compact options={[{key: 'All', label: 'All'}, {key: 'Approved', label: 'Approved'}, {key: 'Pending', label: 'Pending'}, {key: 'Rejected', label: 'Rejected'}]} value={status} onChange={setStatus} idPrefix="face-sec-status" />

        {base === '/admin' && (
          <View id="face-sec-dept" style={styles.deptWrap}>
            <Dropdown
              compact
              placeholder="Department"
              value={dept}
              onChange={setDept}
              options={[{value: null, label: 'All Departments'}, ...departments.map(d => ({value: d.name, label: d.name}))]}
            />
          </View>
        )}

        {visible.length === 0 ? (
          <View style={styles.emptyBox}>
            <Icon name="user" size={44} color={colors.textMuted} />
            <Text style={styles.emptyText}>No face enrollments found</Text>
          </View>
        ) : visible.map(item => {
          const b = badge(item.faceEnrollmentStatus);
          const isPending = item.faceEnrollmentStatus === 'Pending';
          const busyThis = busy === `${item.id}-approve` || busy === `${item.id}-reject` || busy === `${item.id}-delete`;
          const photo = item.photoPath || item.photoThumbPath;
          return (
            <TouchableOpacity key={item.id} style={styles.card} activeOpacity={0.7} onPress={() => { if (photo) setViewerUri(fileUrl(photo)); }}>
              <View style={styles.cardTop}>
                {photo ? (
                  <TouchableOpacity id={`enroll-photo-${item.id}`} onPress={() => setViewerUri(fileUrl(photo))}>
                    <InternAvatar name={item.fullName} thumbPath={photo} size={44} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.avatarBox}><Text style={styles.avatarText}>{item.fullName[0]}</Text></View>
                )}
                <View style={styles.cardInfo}>
                  <Text style={styles.name}>{item.fullName}</Text>
                  <Text style={styles.sub}>@{item.username} • {item.department}</Text>
                  <Text style={styles.sub2}>Submitted {item.faceEnrolledAt ? new Date(item.faceEnrolledAt).toLocaleString() : '—'}</Text>
                </View>
                <View style={[styles.badge, {backgroundColor: b.color + '22'}]}>
                  <Text style={[styles.badgeText, {color: b.color}]}>{b.label}</Text>
                </View>
              </View>
              {item.faceEnrollmentStatus === 'Rejected' && item.faceRejectedReason && (
                <View style={styles.rejectionBox}>
                  <Text style={styles.rejectionText}>Reason: {item.faceRejectedReason}</Text>
                </View>
              )}
              {isPending && (
                <View style={styles.actionsRow}>
                  <TouchableOpacity id={`approve-face-${item.id}`} style={styles.approveBtn} disabled={busy !== null} onPress={() => { setRejectReason(''); doAction(item, 'approve'); }}>
                    {busy === `${item.id}-approve` ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="check" size={16} color="#fff" />}
                    <Text style={styles.approveBtnText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity id={`reject-face-${item.id}`} style={styles.rejectBtn} disabled={busy !== null} onPress={() => { setRejectReason(''); setRejectTarget(item); }}>
                    <Icon name="close" size={16} color={colors.error} />
                    <Text style={styles.rejectBtnText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              )}
              {!isPending && (
                <View style={styles.actionsRow}>
                  <TouchableOpacity id={`delete-face-${item.id}`} style={styles.deleteBtn} disabled={busy !== null} onPress={() => deleteEnrollment(item)}>
                    {busy === `${item.id}-delete` ? <ActivityIndicator size="small" color={colors.error} /> : <Icon name="trash" size={15} color={colors.error} />}
                    <Text style={styles.deleteBtnText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Modal visible={rejectTarget !== null} transparent animationType="fade" onRequestClose={() => setRejectTarget(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reject Face Enrollment</Text>
            <Text style={styles.modalSubtitle}>{rejectTarget?.fullName}</Text>
            <TextInput style={styles.reasonInput} placeholder="Reason for rejection" placeholderTextColor={colors.textMuted} value={rejectReason} onChangeText={setRejectReason} multiline />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setRejectTarget(null)}><Text style={styles.modalCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity id="confirm-reject-face" style={styles.modalConfirm} disabled={busy !== null} onPress={() => doAction(rejectTarget, 'reject')}>
                {busy === `${rejectTarget?.id}-reject` ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="close" size={16} color="#fff" />}
                <Text style={styles.modalConfirmText}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    <Modal visible={viewerUri !== null} transparent animationType="fade" onRequestClose={() => setViewerUri(null)}>
        <View style={styles.viewerOverlay}>
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerUri(null)}>
            <Icon name="close" size={22} color="#fff" />
          </TouchableOpacity>
          {viewerUri && <Image source={{uri: viewerUri}} style={styles.viewerImage} resizeMode="contain" />}
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = colors => StyleSheet.create({
  container: {flex: 1},
  center: {alignItems: 'center', paddingVertical: 60},
  deptWrap: {paddingHorizontal: 16, marginTop: 8},
  searchWrap: {flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, marginHorizontal: 16, marginTop: 10, borderRadius: 9, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 7},
  searchInput: {flex: 1, color: colors.text, fontSize: 13, padding: 0, paddingVertical: 0},
  list: {flex: 1},
  emptyBox: {alignItems: 'center', paddingVertical: 80},
  emptyText: {color: colors.textSecondary, fontSize: 15, marginTop: 10},
  card: {backgroundColor: colors.surface, marginHorizontal: 12, marginBottom: 8, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border},
  cardTop: {flexDirection: 'row', alignItems: 'center', marginBottom: 8},
  avatarBox: {width: 44, height: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: 12},
  avatarText: {color: '#fff', fontSize: 18, fontWeight: '700'},
  cardInfo: {flex: 1},
  name: {color: colors.text, fontSize: 15, fontWeight: '700'},
  sub: {color: colors.textSecondary, fontSize: 12},
  sub2: {color: colors.textMuted, fontSize: 11, marginTop: 2},
  badge: {borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4},
  badgeText: {fontSize: 11, fontWeight: '700'},
  rejectionBox: {backgroundColor: colors.error + '22', borderRadius: 8, padding: 10, marginBottom: 10},
  rejectionText: {color: colors.error, fontSize: 12},
  actionsRow: {flexDirection: 'row', gap: 10},
  approveBtn: {flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.success, borderRadius: 10, paddingVertical: 10},
  approveBtnText: {color: '#fff', fontWeight: '700'},
  rejectBtn: {flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.card, borderRadius: 10, paddingVertical: 10, borderWidth: 1, borderColor: colors.error},
  rejectBtnText: {color: colors.error, fontWeight: '700'},
  deleteBtn: {flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.card, borderRadius: 10, paddingVertical: 10, borderWidth: 1, borderColor: colors.error + '55'},
  deleteBtnText: {color: colors.error, fontWeight: '700'},
  modalBackdrop: {flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24},
  modalCard: {backgroundColor: colors.surface, borderRadius: 16, padding: 20, width: '100%', borderWidth: 1, borderColor: colors.border},
  modalTitle: {color: colors.text, fontSize: 17, fontWeight: '700'},
  modalSubtitle: {color: colors.textMuted, fontSize: 13, marginTop: 2, marginBottom: 14},
  reasonInput: {backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, color: colors.text, minHeight: 70, textAlignVertical: 'top'},
  modalActions: {flexDirection: 'row', gap: 10, marginTop: 14},
  modalCancel: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderRadius: 10, paddingVertical: 12, borderWidth: 1, borderColor: colors.border},
  modalCancelText: {color: colors.text, fontWeight: '600'},
  modalConfirm: {flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.error, borderRadius: 10, paddingVertical: 12},
  modalConfirmText: {color: '#fff', fontWeight: '700'},
  viewerOverlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center'},
  viewerClose: {position: 'absolute', top: 50, right: 20, zIndex: 1, padding: 8},
  viewerImage: {width: '100%', height: '78%'},
});
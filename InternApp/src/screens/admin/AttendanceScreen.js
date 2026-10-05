import React, {useState, useEffect, useMemo, useCallback} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, TextInput, Image, Modal} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import client from '../../api/client';
import {fileUrl} from '../../api/fileClient';
import {showToast} from '../../components/AppToast';
import {moderate, queuedToast} from '../../api/moderate';
import {useAppTheme} from '../../theme';
import ScreenBackground from '../../components/ScreenBackground';
import AppHeader from '../../components/AppHeader';
import Dropdown from '../../components/Dropdown';
import Icon from '../../components/Icon';
import Spinner from '../../components/Spinner';
import EndOfListMarker from '../../components/EndOfListMarker';
import FilterChips from '../../components/FilterChips';
import SwipeableModal from '../../components/SwipeableModal';
import FaceApprovalsSection from '../../components/FaceApprovalsSection';
import LeaveRequestsSection from '../../components/LeaveRequestsSection';

const TABS = [
  {key: 'logs', label: 'Logs'},
  {key: 'face', label: 'Face Approvals'},
  {key: 'leaves', label: 'Leave Requests'},
];

const STATUS_CHIPS = [
  {key: 'All', label: 'All'},
  {key: 'Present', label: 'Present'},
  {key: 'Absent', label: 'Absent'},
  {key: 'PendingReview', label: 'On Leave'},
];

const SLOT_COLORS = {OnTime: '#22c55e', Early: '#22c55e', Late: '#ef4444', Absent: '#ef4444', OnLeave: '#f59e0b', Pending: '#94a3b8'};
const OUT_SLOT_COLORS = {OnTime: '#22c55e', Early: '#ef4444', Late: '#22c55e', Absent: '#ef4444', OnLeave: '#f59e0b', Pending: '#94a3b8'};

const hhmm = dt => dt ? `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}` : '';
const dateISO = dt => dt ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}` : '';

export default function AdminAttendanceScreen({navigation}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [tab, setTab] = useState('logs');
  const [departments, setDepartments] = useState([]);
  const [deptId, setDeptId] = useState(null);
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);
  const [showPicker, setShowPicker] = useState(false);
  const [statusFilter, setStatusFilter] = useState('All');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [viewerUri, setViewerUri] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [editIn, setEditIn] = useState('');
  const [editOut, setEditOut] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchRecordsStandalone = useCallback(async (overrides = {}) => {
    try {
      const params = new URLSearchParams();
      const dept = 'departmentId' in overrides ? overrides.departmentId : deptId;
      const date = 'date' in overrides ? overrides.date : dateFilter;
      const status = 'status' in overrides ? overrides.status : statusFilter;
      if (dept) params.append('departmentId', dept);
      if (date) params.append('date', date);
      if (status && status !== 'All') params.append('status', status);
      const res = await client.get(`/admin/attendance?${params}`);
      setRecords(res.data);
    } catch { showToast("Couldn't load attendance. Check your connection and try again.", 'error'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [deptId, dateFilter, statusFilter]);

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

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const fetchRecords = async () => {
        try {
          const params = new URLSearchParams();
          if (deptId) params.append('departmentId', deptId);
          if (dateFilter) params.append('date', dateFilter);
          if (statusFilter && statusFilter !== 'All') params.append('status', statusFilter);
          const res = await client.get(`/admin/attendance?${params}`);
          if (!cancelled) setRecords(res.data);
        } catch { if (!cancelled) showToast("Couldn't load attendance. Check your connection and try again.", 'error'); }
        finally { if (!cancelled) { setLoading(false); setRefreshing(false); } }
      };
      fetchRecords();
      return () => { cancelled = true; };
    }, [deptId, dateFilter, statusFilter])
  );

  const statusColors = {Present: colors.success, Absent: colors.error, PendingReview: colors.warning};

  const openEdit = a => {
    setEditTarget(a);
    setEditIn(hhmm(new Date(a.timestamp)));
    setEditOut(a.outTime ? hhmm(new Date(a.outTime)) : '');
  };

  const saveEditTime = async () => {
    if (!editTarget) return;
    if (!/^\d{1,2}:\d{2}$/.test(editIn)) { showToast('In time format: HH:MM', 'error'); return; }
    if (editOut && !/^\d{1,2}:\d{2}$/.test(editOut)) { showToast('Out time format: HH:MM', 'error'); return; }
    const base = dateISO(new Date(editTarget.timestamp));
    const body = {inTime: `${base}T${editIn}:00`, outTime: editOut ? `${base}T${editOut}:00` : null};
    setSavingEdit(true);
    try {
      const {queued} = await moderate({kind: 'admin', label: 'Edit attendance time', method: 'PUT', url: `/admin/attendance/${editTarget.id}`, body, entityKey: `attendance:${editTarget.id}`});
      queuedToast(queued, 'Attendance updated.');
      setEditTarget(null);
      fetchRecordsStandalone();
    } catch (e) { showToast(e.response?.data?.message || "Couldn't update attendance.", 'error'); }
    finally { setSavingEdit(false); }
  };

  return (
    <ScreenBackground style={styles.container}>
      <AppHeader hideTitle home title="Attendance" />

      <View style={styles.tabs}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            id={`att-tab-${t.key}`}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            onPress={() => setTab(t.key)}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'face' && <FaceApprovalsSection base="/admin" />}
      {tab === 'leaves' && <LeaveRequestsSection base="/admin" />}

      {tab === 'logs' && (
        <>
              {loading ? <Spinner style={styles.center} /> : (() => {
              const q = query.trim().toLowerCase();
              const visible = records.filter(a =>
                !q || a.internName.toLowerCase().includes(q) || (a.username || '').toLowerCase().includes(q) || String(a.internId ?? '').includes(q)
              );
              return (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={{paddingBottom: 100, flexGrow: 1}}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchRecordsStandalone();}} tintColor={colors.primary}/>}>
              <View style={styles.filterWrap}>
                <Dropdown
                  compact
                  id="att-dept-filter"
                  searchable
                  clearable
                  onClear={() => { setDeptId(null); setLoading(true); }}
                  placeholder="Department"
                  value={deptId}
                  onChange={v => { setDeptId(v); setLoading(true); }}
                  options={[{value: null, label: 'All Departments'}, ...departments.map(d => ({value: d.id, label: d.name}))]}
                />
              </View>

              <View style={styles.filterRow}>
                <View style={styles.dateBox}>
                  <TouchableOpacity id="admin-attendance-date" style={styles.datePickerBtn} onPress={() => setShowPicker(true)}>
                    <Icon name="calendar" size={15} color={colors.textSecondary} />
                    <Text style={styles.datePickerText}>{dateFilter}</Text>
                  </TouchableOpacity>
                  {dateFilter ? (
                    <TouchableOpacity style={styles.clearBtn} onPress={() => setDateFilter('')} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                      <Icon name="close" size={15} color={colors.textSecondary} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              <View style={styles.chipsWrap}>
                <FilterChips compact options={STATUS_CHIPS} value={statusFilter} onChange={v => { setStatusFilter(v); setLoading(true); fetchRecordsStandalone({status: v}); }} idPrefix="att-status" />
              </View>

              <View style={styles.searchWrap}>
                <Icon name="search" size={15} color={colors.textMuted} />
                <TextInput style={styles.searchInput} placeholder="Search by intern name, username or ID" placeholderTextColor={colors.textMuted} value={query} onChangeText={setQuery} autoCorrect={false} />
                {query.length > 0 && (
                  <TouchableOpacity id="att-search-clear" onPress={() => setQuery('')} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                    <Icon name="close" size={15} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>

              {visible.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Icon name="mapPin" size={48} color={colors.textMuted} />
                  <Text style={styles.emptyText}>No attendance records{dateFilter ? ` for ${dateFilter}` : ''}</Text>
                </View>
              ) : visible.map(a => (
                <TouchableOpacity key={a.id} style={styles.recordCard} activeOpacity={0.7} onPress={() => { if (a.checkInPhotoPath || a.checkOutPhotoPath) setViewerUri(fileUrl(a.checkInPhotoPath || a.checkOutPhotoPath)); }}>
                  <View style={styles.recordHeader}>
                    <View style={styles.recordInfo}>
                      <Text style={styles.recordName}>{a.internName}</Text>
                      <Text style={styles.recordDept}>{a.department}</Text>
                    </View>
                    <View style={[styles.statusBadge, {backgroundColor: (statusColors[a.status] || colors.text) + '22'}]}>
                      <Text style={[styles.statusText, {color: statusColors[a.status] || colors.text}]}>{a.status}</Text>
                    </View>
                    <TouchableOpacity id={`att-edit-${a.id}`} style={styles.editBtn} onPress={() => openEdit(a)} disabled={!!editTarget}>
                      <Icon name="edit" size={13} color={colors.textAccent} /><Text style={styles.editBtnText}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                  {(a.arrivalStatus !== 'Pending' || a.departureStatus !== 'Pending' || !a.outTime) && (
                    <View style={styles.slotRow}>
                      {a.arrivalStatus !== 'Pending' && (
                        <View style={[styles.slotChip, {backgroundColor: (SLOT_COLORS[a.arrivalStatus] || colors.textMuted) + '22'}]}>
                          <Text style={[styles.slotChipText, {color: SLOT_COLORS[a.arrivalStatus] || colors.textMuted}]}>In: {a.arrivalStatus}</Text>
                        </View>
                      )}
                      {a.outTime ? (
                        a.departureStatus !== 'Pending' && (
                          <View style={[styles.slotChip, {backgroundColor: (OUT_SLOT_COLORS[a.departureStatus] || colors.textMuted) + '22'}]}>
                            <Text style={[styles.slotChipText, {color: OUT_SLOT_COLORS[a.departureStatus] || colors.textMuted}]}>Out: {a.departureStatus}</Text>
                          </View>
                        )
                      ) : (
                        <View style={[styles.slotChip, {backgroundColor: colors.warning + '22'}]}>
                          <Text style={[styles.slotChipText, {color: colors.warning}]}>Out: Missing check-out</Text>
                        </View>
                      )}
                    </View>
                  )}
                  {(a.checkInPhotoPath || a.checkOutPhotoPath) && (
                    <View style={styles.photoRow}>
                      {['In', 'Out'].map(slot => {
                        const path = slot === 'In' ? a.checkInPhotoPath : a.checkOutPhotoPath;
                        if (!path) return null;
                        return (
                          <TouchableOpacity key={slot} id={`att-${slot.toLowerCase()}-${a.id}`} style={styles.photoCell} onPress={() => setViewerUri(fileUrl(path))}>
                            <Image source={{uri: fileUrl(path)}} style={styles.photoThumb} />
                            <Text style={styles.photoLabel}>{slot}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                  <View style={styles.recordDetails}>
                    <Text style={styles.detail}>
                      <Icon name="clock" size={13} color={colors.textSecondary} /> In: {hhmm(new Date(a.timestamp))}<Text style={styles.detailSep}> • </Text>Out: {a.outTime ? hhmm(new Date(a.outTime)) : <Text style={{color: colors.warning, fontWeight: '600'}}>Missing</Text>}
                    </Text>
                    <Text style={styles.detail}>
                      <Icon name="calendar" size={13} color={colors.textSecondary} /> {new Date(a.timestamp).toLocaleString()}
                    </Text>
                    <Text style={[styles.detail, {color: a.isInRange ? colors.success : colors.error}]}>
                      <Icon name="mapPin" size={13} color={a.isInRange ? colors.success : colors.error} /> {a.isInRange ? `In Range (${Math.round(a.distanceMeters)}m)` : `Out of Range (${Math.round(a.distanceMeters)}m)`}
                    </Text>
                    <Text style={[styles.detail, {color: a.faceVerified ? colors.success : colors.error}]}>
                      <Icon name="user" size={13} color={a.faceVerified ? colors.success : colors.error} /> Face: {a.faceVerified ? `Verified (${(a.faceConfidence * 100).toFixed(0)}%)` : 'Failed'}
                    </Text>
                    {a.notes ? <Text style={styles.noteText}>{a.notes}</Text> : null}
                  </View>
                </TouchableOpacity>
              ))}
              {visible.length > 0 && <EndOfListMarker />}
            </ScrollView>
            );
            })()}
          )}

          {viewerUri && (
            <Modal visible transparent animationType="fade" onRequestClose={() => setViewerUri(null)}>
              <View style={styles.viewerOverlay}>
                <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerUri(null)}>
                  <Icon name="close" size={22} color="#fff" />
                </TouchableOpacity>
                <Image source={{uri: viewerUri}} style={styles.viewerImage} resizeMode="contain" />
              </View>
            </Modal>
          )}

          {showPicker && (
            <DateTimePicker
              value={dateFilter ? new Date(dateFilter + 'T00:00:00') : new Date()}
              mode="date"
              maximumDate={new Date()}
              display="material"
              onChange={(event, selected) => {
                setShowPicker(false);
                if (event.type === 'set' && selected) {
                  const y = selected.getFullYear();
                  const m = String(selected.getMonth() + 1).padStart(2, '0');
                  const d = String(selected.getDate()).padStart(2, '0');
                  setDateFilter(`${y}-${m}-${d}`);
                }
              }}
            />
          )}

          <SwipeableModal visible={!!editTarget} transparent overlayStyle={styles.editOverlay} sheetStyle={styles.editSheet} onRequestClose={() => setEditTarget(null)}>
            <Text style={styles.editTitle}>Edit Attendance — {editTarget?.internName}</Text>
            <Text style={styles.editSub}>Date: {dateISO(new Date(editTarget?.timestamp))}</Text>
            <View style={styles.timeRow}>
              <View style={styles.timeField}>
                <Text style={styles.fieldLabel}>In time (HH:MM) *</Text>
                <TextInput style={styles.fieldInput} placeholder="09:00" placeholderTextColor={colors.textMuted} value={editIn} onChangeText={setEditIn} keyboardType="numbers-and-punctuation" />
              </View>
              <View style={styles.timeField}>
                <Text style={styles.fieldLabel}>Out time (HH:MM)</Text>
                <TextInput style={styles.fieldInput} placeholder="17:00" placeholderTextColor={colors.textMuted} value={editOut} onChangeText={setEditOut} keyboardType="numbers-and-punctuation" />
              </View>
            </View>
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.editCancel} onPress={() => setEditTarget(null)}><Text style={styles.editCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.editSave} onPress={saveEditTime} disabled={savingEdit}>
                {savingEdit ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.editSaveText}>Save Times</Text>}
              </TouchableOpacity>
            </View>
          </SwipeableModal>
        </>
      )}
    </ScreenBackground>
  );
}

const makeStyles = colors => StyleSheet.create({
  container: {flex: 1},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  scroll: {flex: 1},
  tabs: {flexDirection: 'row', backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border},
  tab: {flex: 1, paddingVertical: 14, alignItems: 'center'},
  tabActive: {borderBottomWidth: 2, borderBottomColor: colors.primary},
  tabText: {color: colors.textMuted, fontSize: 13, fontWeight: '600'},
  tabTextActive: {color: colors.textAccent},
  filterWrap: {marginHorizontal: 16, marginTop: 10},
  filterRow: {flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingHorizontal: 16, marginTop: 8, marginBottom: 6},
  chipsWrap: {paddingHorizontal: 16, marginBottom: 0},
  searchWrap: {flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, marginHorizontal: 16, marginTop: 6, marginBottom: 6, borderRadius: 9, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 7},
  searchInput: {flex: 1, color: colors.text, fontSize: 13, padding: 0},
  dateBox: {flexDirection: 'row', alignItems: 'center', marginBottom: 1},
  datePickerBtn: {flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.card, borderRadius: 8, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 6},
  datePickerText: {color: colors.text, fontSize: 13, fontWeight: '600'},
  clearBtn: {marginLeft: 8, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border},
  emptyBox: {alignItems: 'center', paddingVertical: 60},
  emptyText: {color: colors.textSecondary, fontSize: 15},
  recordCard: {backgroundColor: colors.surface, margin: 12, marginBottom: 4, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border},
  recordHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8},
  recordInfo: {flex: 1},
  recordName: {color: colors.text, fontSize: 15, fontWeight: '700'},
  recordDept: {color: colors.textSecondary, fontSize: 12},
  statusBadge: {borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4},
  statusText: {fontSize: 11, fontWeight: '700'},
  recordDetails: {gap: 4},
  detail: {color: colors.textSecondary, fontSize: 13},
  detailSep: {color: colors.border},
  editBtn: {flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.card, borderRadius: 8, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 8, paddingVertical: 5},
  editBtnText: {color: colors.textAccent, fontSize: 11, fontWeight: '600'},
  slotRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8},
  slotChip: {borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4},
  slotChipText: {fontSize: 11, fontWeight: '700'},
  editOverlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end'},
  editSheet: {backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24},
  editTitle: {color: colors.text, fontSize: 18, fontWeight: '700'},
  editSub: {color: colors.textMuted, fontSize: 13, marginTop: 4, marginBottom: 16},
  timeRow: {flexDirection: 'row', gap: 12},
  timeField: {flex: 1},
  fieldLabel: {color: colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 6},
  fieldInput: {backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14},
  editActions: {flexDirection: 'row', gap: 12, marginTop: 20, marginBottom: 10},
  editCancel: {flex: 1, backgroundColor: colors.card, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border},
  editCancelText: {color: colors.textSecondary, fontWeight: '600'},
  editSave: {flex: 1, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center'},
  editSaveText: {color: '#fff', fontWeight: '700', fontSize: 14},
  noteText: {color: colors.warning, fontSize: 12, fontStyle: 'italic'},
  photoRow: {flexDirection: 'row', gap: 12, marginBottom: 8},
  photoCell: {alignItems: 'center'},
  photoThumb: {width: 52, height: 52, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card},
  photoLabel: {color: colors.textMuted, fontSize: 10, fontWeight: '600', marginTop: 3},
  viewerOverlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center'},
  viewerClose: {position: 'absolute', top: 50, right: 20, zIndex: 1, padding: 8},
  viewerImage: {width: '100%', height: '78%'},
});
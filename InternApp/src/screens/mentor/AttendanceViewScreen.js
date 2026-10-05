import React, {useState, useEffect, useMemo} from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, RefreshControl, Modal, TextInput, Image,
} from 'react-native';
import client from '../../api/client';
import {fileUrl} from '../../api/fileClient';
import {showToast} from '../../components/AppToast';
import {useAppTheme} from '../../theme';
import ScreenBackground from '../../components/ScreenBackground';
import AppHeader from '../../components/AppHeader';
import Icon from '../../components/Icon';
import Spinner from '../../components/Spinner';
import DateField from '../../components/DateField';
import Dropdown from '../../components/Dropdown';
import FilterChips from '../../components/FilterChips';
import FaceApprovalsSection from '../../components/FaceApprovalsSection';
import SwipeableModal from '../../components/SwipeableModal';
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

export default function AttendanceViewScreen({navigation}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [tab, setTab] = useState('logs');

  const [interns, setInterns] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [selectedIntern, setSelectedIntern] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [statusFilter, setStatusFilter] = useState('All');

  const [editTarget, setEditTarget] = useState(null);
  const [editArrival, setEditArrival] = useState('');
  const [editDeparture, setEditDeparture] = useState('');
  const [editStatus, setEditStatus] = useState('Present');
  const [editSaving, setEditSaving] = useState(false);
const [viewerUri, setViewerUri] = useState(null);

  const fetchInterns = async () => {
    try { const res = await client.get('/mentor/interns'); setInterns(res.data); }
    catch {} finally { setLoading(false); }
  };

  const fetchAttendance = async (internId, from, to, status) => {
    try {
      const params = [];
      if (internId) params.push(`internId=${internId}`);
      if (from) params.push(`from=${from}`);
      if (to) params.push(`to=${to}`);
      if (status && status !== 'All') params.push(`status=${status}`);
      const q = params.length ? `?${params.join('&')}` : '';
      const res = await client.get(`/mentor/attendance${q}`);
      setAttendance(res.data);
    } catch { showToast("Couldn't load attendance. Check your connection and try again.", 'error'); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try { const res = await client.get('/mentor/interns'); if (!cancelled) setInterns(res.data); }
      catch {} finally { if (!cancelled) setLoading(false); }
      try {
        const res = await client.get('/mentor/attendance');
        if (!cancelled) setAttendance(res.data);
      } catch { showToast("Couldn't load attendance. Check your connection and try again.", 'error'); }
      finally { if (!cancelled) { setLoading(false); setRefreshing(false); } }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const statusColors = {Present: colors.success, Absent: colors.error, PendingReview: colors.warning};

  const openEdit = (a) => {
    setEditTarget(a);
    const t = a.timestamp ? new Date(a.timestamp) : new Date();
    const hh = String(t.getHours()).padStart(2, '0');
    const mm = String(t.getMinutes()).padStart(2, '0');
    setEditArrival(`${hh}:${mm}`);
    setEditDeparture('');
    setEditStatus(a.status || 'Present');
  };

  const submitEdit = async () => {
    if (!editTarget) return;
    setEditSaving(true);
    try {
      await client.put(`/mentor/attendance/${editTarget.id}`, {
        arrivalTime: editArrival || null,
        departureTime: editDeparture || null,
        status: editStatus,
      });
      showToast('Attendance updated.', 'success');
      setEditTarget(null);
      fetchAttendance(selectedIntern?.id, dateFrom, dateTo, statusFilter);
    } catch (e) { showToast(e.response?.data?.message || 'Failed to update.', 'error'); }
    finally { setEditSaving(false); }
  };

  return (
    <ScreenBackground style={styles.container}>
      <AppHeader home title="Attendance" />

      <View style={styles.tabsRow}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} id={`att-tab-${t.key}`} style={[styles.tabBtn, tab === t.key && {backgroundColor: colors.primary}]} onPress={() => setTab(t.key)}>
            <Text style={[styles.tabText, tab === t.key && {color: '#fff'}]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'face' && <FaceApprovalsSection base="/mentor" />}
      {tab === 'leaves' && <LeaveRequestsSection base="/mentor" />}

      {tab === 'logs' && (
        <>
          {loading ? <Spinner style={styles.center} /> : (
            <ScrollView contentContainerStyle={{paddingBottom: 100, flexGrow: 1}} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchAttendance(selectedIntern?.id, dateFrom, dateTo, statusFilter);}} tintColor={colors.primary}/>}>
              <View style={styles.filterCard}>
                <View style={styles.filterRowFlex}>
                  <View style={{flex: 1}}>
                    <Dropdown
                      compact
                      placeholder="Intern"
                      id="attendance-intern-filter"
                      value={selectedIntern?.id ?? null}
                      options={[{value: null, label: 'All Interns'}, ...interns.map(i => ({value: i.id, label: i.fullName}))]}
                      onChange={id => {
                        const it = interns.find(x => x.id === id) || null;
                        setSelectedIntern(it);
                        fetchAttendance(it?.id, dateFrom, dateTo, statusFilter);
                      }}
                      placeholder="All Interns"
                    />
                  </View>
                </View>
                <View style={styles.filterRowFlex}>
                  <View style={{flex: 1}}>
                    <DateField value={dateFrom} onChange={d => { const v = d ? d.toISOString().split('T')[0] : ''; setDateFrom(v); fetchAttendance(selectedIntern?.id, v, dateTo, statusFilter); }} placeholder="YYYY-MM-DD" />
                  </View>
                  <View style={{flex: 1}}>
                    <DateField value={dateTo} onChange={d => { const v = d ? d.toISOString().split('T')[0] : ''; setDateTo(v); fetchAttendance(selectedIntern?.id, dateFrom, v, statusFilter); }} placeholder="YYYY-MM-DD" />
                  </View>
                </View>
              </View>

              <View style={styles.chipsWrap}>
                <FilterChips compact options={STATUS_CHIPS} value={statusFilter} onChange={s => { setStatusFilter(s); fetchAttendance(selectedIntern?.id, dateFrom, dateTo, s); }} idPrefix="att-status" />
              </View>

              {attendance.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Icon name="mapPin" size={40} color={colors.textMuted} />
                  <Text style={styles.emptyText}>No attendance records</Text>
                </View>
              ) : attendance.map(a => (
                <TouchableOpacity key={a.id} style={styles.recordCard} onPress={() => { if (a.checkInPhotoPath || a.checkOutPhotoPath) setViewerUri(fileUrl(a.checkInPhotoPath || a.checkOutPhotoPath)); }} onLongPress={() => openEdit(a)}>
                  <View style={styles.recordHeader}>
                    <Text style={styles.recordName}>{a.internName}</Text>
                    <View style={[styles.statusBadge, {backgroundColor:(statusColors[a.status]||colors.text)+'22'}]}>
                      <Text style={[styles.statusText, {color:statusColors[a.status]||colors.text}]}>{a.status}</Text>
                    </View>
                  </View>
                  {(a.arrivalStatus !== 'Pending' || a.departureStatus !== 'Pending' || !a.departureStatus) && (
                    <View style={styles.slotRow}>
                      {a.arrivalStatus !== 'Pending' && (
                        <View style={[styles.slotChip, {backgroundColor:(SLOT_COLORS[a.arrivalStatus] || colors.textMuted)+'22'}]}>
                          <Text style={[styles.slotChipText, {color:SLOT_COLORS[a.arrivalStatus] || colors.textMuted}]}>In: {a.arrivalStatus}</Text>
                        </View>
                      )}
                      {a.departureStatus ? (
                        a.departureStatus !== 'Pending' && (
                          <View style={[styles.slotChip, {backgroundColor:(OUT_SLOT_COLORS[a.departureStatus] || colors.textMuted)+'22'}]}>
                            <Text style={[styles.slotChipText, {color:OUT_SLOT_COLORS[a.departureStatus] || colors.textMuted}]}>Out: {a.departureStatus}</Text>
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
                    <View style={styles.detailRow}>
                      <Icon name="clock" size={13} color={colors.textSecondary} />
                      <Text style={styles.detail}>{new Date(a.timestamp).toLocaleTimeString()}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Icon name="mapPin" size={13} color={a.isInRange ? colors.success : colors.error} />
                      <Text style={[styles.detail, {color: a.isInRange ? colors.success : colors.error}]}>
                        {a.isInRange ? `In Range (${Math.round(a.distanceMeters)}m)` : `Out of Range (${Math.round(a.distanceMeters)}m)`}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Icon name="user" size={13} color={a.faceVerified ? colors.success : colors.error} />
                      <Text style={[styles.detail, {color: a.faceVerified ? colors.success : colors.error}]}>
                        Face: {a.faceVerified ? `Verified (${(a.faceConfidence*100).toFixed(0)}%)` : `Failed (${(a.faceConfidence*100).toFixed(0)}%)`}
                      </Text>
                    </View>
                    {a.notes && (
                      <View style={styles.detailRow}>
                        <Icon name="file" size={13} color={colors.warning} />
                        <Text style={styles.noteText}>{a.notes}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.editHint}>Long-press to edit</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <SwipeableModal visible={!!editTarget} transparent overlayStyle={styles.modalOverlay} sheetStyle={styles.modalContent} onRequestClose={() => setEditTarget(null)}>
                <Text style={styles.modalTitle}>Edit Attendance</Text>
                <Text style={styles.modalSubtitle}>{editTarget?.internName} — {editTarget ? new Date(editTarget.timestamp).toLocaleDateString() : ''}</Text>

                <View style={styles.modalField}>
                  <Text style={styles.fieldLabel}>Arrival Time (HH:MM)</Text>
                  <TextInput style={styles.fieldInput} value={editArrival} onChangeText={setEditArrival} placeholder="09:00" placeholderTextColor={colors.textMuted} />
                </View>
                <View style={styles.modalField}>
                  <Text style={styles.fieldLabel}>Departure Time (HH:MM)</Text>
                  <TextInput style={styles.fieldInput} value={editDeparture} onChangeText={setEditDeparture} placeholder="17:00" placeholderTextColor={colors.textMuted} />
                </View>
                <View style={styles.modalField}>
                  <Dropdown label="Status" value={editStatus} onChange={setEditStatus} options={[{value:'Present',label:'Present'},{value:'Absent',label:'Absent'}]} inline />
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditTarget(null)}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.saveBtn} onPress={submitEdit} disabled={editSaving}>
                    {editSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save</Text>}
                  </TouchableOpacity>
                </View>
      </SwipeableModal>

      <Modal visible={viewerUri !== null} transparent animationType="fade" onRequestClose={() => setViewerUri(null)}>
        <View style={styles.viewerOverlay}>
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerUri(null)}>
            <Icon name="close" size={22} color="#fff" />
          </TouchableOpacity>
          {viewerUri && <Image source={{uri: viewerUri}} style={styles.viewerImage} resizeMode="contain" />}
        </View>
      </Modal>
        </>
      )}
    </ScreenBackground>
  );
}

const makeStyles = colors => StyleSheet.create({
  container:{flex:1},
  center:{flex:1, justifyContent:'center', alignItems:'center'},
  tabsRow:{flexDirection:'row', gap:8, paddingHorizontal:16, marginTop:12, marginBottom:4},
  tabBtn:{paddingVertical:8, paddingHorizontal:16, borderRadius:18, backgroundColor:colors.card, borderWidth:1, borderColor:colors.border},
  tabText:{fontSize:13, fontWeight:'600', color:colors.text},
  filterCard:{backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, marginHorizontal: 16, marginVertical: 12, padding: 14, gap: 12},
  filterRowFlex:{flexDirection:'row', gap: 12},
  chipsWrap:{paddingHorizontal:16, marginBottom:4},
  emptyBox:{alignItems:'center', paddingVertical:60, gap:8},
  emptyText:{color:colors.textSecondary, fontSize:15},
  recordCard:{backgroundColor:colors.surface, margin:12, marginBottom:4, borderRadius:14, padding:14, borderWidth:1, borderColor:colors.border},
  recordHeader:{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:8},
  recordName:{color:colors.text, fontSize:15, fontWeight:'700'},
  statusBadge:{borderRadius:6, paddingHorizontal:8, paddingVertical:4},
  statusText:{fontSize:11, fontWeight:'700'},
  recordDetails:{gap:4},
  detailRow:{flexDirection:'row', alignItems:'center', gap:6},
  detail:{color:colors.textSecondary, fontSize:13},
  slotRow:{flexDirection:'row', flexWrap:'wrap', gap:6, marginBottom:8},
  slotChip:{borderRadius:6, paddingHorizontal:8, paddingVertical:4},
  slotChipText:{fontSize:11, fontWeight:'700'},
  noteText:{color:colors.warning, fontSize:12, fontStyle:'italic'},
  editHint:{color:colors.textMuted, fontSize:10, textAlign:'right', marginTop:6},
  modalOverlay:{flex:1, backgroundColor:'rgba(0,0,0,0.7)', justifyContent:'flex-end'},
  modalContent:{backgroundColor:colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, padding:24},
  modalTitle:{color:colors.text, fontSize:18, fontWeight:'700', marginBottom:2},
  modalSubtitle:{color:colors.textMuted, fontSize:12, marginBottom:16},
  modalField:{marginBottom:12},
  fieldLabel:{color:colors.textSecondary, fontSize:12, fontWeight:'600', marginBottom:6},
  fieldInput:{backgroundColor:colors.card, borderRadius:10, borderWidth:1, borderColor:colors.border, color:colors.text, paddingHorizontal:14, paddingVertical:12, fontSize:14},
  modalActions:{flexDirection:'row', gap:12, marginTop:8},
  cancelBtn:{flex:1, backgroundColor:colors.card, borderRadius:12, paddingVertical:14, alignItems:'center', borderWidth:1, borderColor:colors.border},
  cancelBtnText:{color:colors.textSecondary, fontWeight:'600'},
  saveBtn:{flex:1, backgroundColor:colors.primary, borderRadius:12, paddingVertical:14, alignItems:'center'},
  saveBtnText:{color:'#fff', fontWeight:'700'},
  photoRow:{flexDirection:'row', gap:12, marginBottom:8},
  photoCell:{alignItems:'center'},
  photoThumb:{width:52, height:52, borderRadius:10, borderWidth:1, borderColor:colors.border, backgroundColor:colors.card},
  photoLabel:{color:colors.textMuted, fontSize:10, fontWeight:'600', marginTop:3},
  viewerOverlay:{flex:1, backgroundColor:'rgba(0,0,0,0.92)', justifyContent:'center', alignItems:'center'},
  viewerClose:{position:'absolute', top:50, right:20, zIndex:1, padding:8},
  viewerImage:{width:'100%', height:'78%'},
});
import React, {useCallback, useState, useMemo} from 'react';
import {View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import client from '../../api/client';
import {showToast} from '../../components/AppToast';
import {moderate, queuedToast} from '../../api/moderate';
import {useAppTheme} from '../../theme';
import ScreenBackground from '../../components/ScreenBackground';
import AppHeader from '../../components/AppHeader';
import Icon from '../../components/Icon';
import Spinner from '../../components/Spinner';
import Dropdown from '../../components/Dropdown';
import FilterChips from '../../components/FilterChips';
import EndOfListMarker from '../../components/EndOfListMarker';
import SwipeableModal from '../../components/SwipeableModal';
import RightSidebar from '../../components/RightSidebar';

const STATUS_COLORS = {Pending: '#f59e0b', Endorsed: '#3b82f6', InternAccepted: '#8b5cf6', Finalised: '#22c55e', Rejected: '#ef4444'};
const STATUSES = ['Pending', 'Endorsed', 'InternAccepted', 'Finalised', 'Rejected'];
const SORT_OPTIONS = [
  {value: 'createdat_desc', label: 'Newest first'},
  {value: 'createdat_asc', label: 'Oldest first'},
  {value: 'intern_asc', label: 'Intern A-Z'},
  {value: 'intern_desc', label: 'Intern Z-A'},
  {value: 'status_asc', label: 'Status A-Z'},
];

export default function AdminTransfersScreen({navigation}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [initiatorFilter, setInitiatorFilter] = useState('all');
  const [sort, setSort] = useState('createdat_desc');
  const [editingTransfer, setEditingTransfer] = useState(null);
  const [mentors, setMentors] = useState([]);
  const [editToMentor, setEditToMentor] = useState(null);
  const [editNotes, setEditNotes] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (statusFilter !== 'all') params.append('status', statusFilter);
    if (initiatorFilter !== 'all') params.append('initiatedBy', initiatorFilter);
    const [sortBy, order] = sort.split('_');
    params.append('sortBy', sortBy);
    params.append('order', order);
    return `/admin/intern-transfers?${params}`;
  }, [search, statusFilter, initiatorFilter, sort]);

  const fetchTransfersData = async () => {
    try {
      const res = await client.get(buildUrl());
      setTransfers(res.data);
    } catch { showToast("Couldn't load transfers.", 'error'); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const res = await client.get(buildUrl());
        if (!cancelled) setTransfers(res.data);
      } catch { if (!cancelled) showToast("Couldn't load transfers.", 'error'); }
      finally { if (!cancelled) { setLoading(false); setRefreshing(false); } }
    };
    fetchData();
    return () => { cancelled = true; setSearch(''); };
  }, [buildUrl]));

  const openEdit = async (t) => {
    setEditingTransfer(t);
    setEditToMentor(null);
    setEditNotes(t.notes || '');
    try {
      if (mentors.length === 0) {
        const res = await client.get('/admin/mentors');
        setMentors(res.data.map(m => ({value: m.id, label: `${m.fullName} (${m.department})`})));
      }
    } catch {}
  };

  const saveEdit = async () => {
    if (!editToMentor) { showToast('Pick a target mentor.', 'error'); return; }
    const body = {toMentorId: editToMentor};
    if (editNotes !== (editingTransfer.notes || '')) body.notes = editNotes;
    setSavingEdit(true);
    try {
      await client.put(`/admin/transfers/${editingTransfer.id}`, body);
      showToast('Transfer updated.', 'success');
      setEditingTransfer(null);
      fetchTransfersData();
    } catch (e) { showToast(e.response?.data?.message || 'Failed to update transfer.', 'error'); }
    finally { setSavingEdit(false); }
  };

  const endorse = async (id) => {
    setActionLoading(id);
    try { const {queued} = await moderate({kind: 'admin', label: 'Endorse transfer', method: 'POST', url: `/admin/transfers/${id}/endorse`, entityKey: `transfer:${id}`}); queuedToast(queued, 'Transfer endorsed.'); fetchTransfersData(); }
    catch (e) { showToast(e.response?.data?.message || 'Failed to endorse.', 'error'); }
    finally { setActionLoading(null); }
  };

  const reject = async (id) => {
    setActionLoading(id);
    try { const {queued} = await moderate({kind: 'admin', label: 'Reject transfer', method: 'POST', url: `/admin/transfers/${id}/reject`, body: {reason: 'Rejected by admin'}, entityKey: `transfer:${id}`}); queuedToast(queued, 'Transfer rejected.'); fetchTransfersData(); }
    catch (e) { showToast(e.response?.data?.message || 'Failed to reject.', 'error'); }
    finally { setActionLoading(null); }
  };

  if (loading) return <Spinner style={styles.center} />;

  return (
    <ScreenBackground style={styles.container}>
      <AppHeader hideTitle home title="Transfers" right={<TouchableOpacity style={styles.menuBtn} onPress={() => setSidebarVisible(true)}><Icon name="menu" size={20} color="#fff" /></TouchableOpacity>} />
      <RightSidebar visible={sidebarVisible} onClose={() => setSidebarVisible(false)} navigation={navigation} />
      <ScrollView contentContainerStyle={{paddingBottom:100, flexGrow:1}} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchTransfersData();}} tintColor={colors.primary}/>}>
        <View style={styles.searchWrap}>
          <Icon name="search" size={16} color={colors.textMuted} />
          <TextInput style={styles.searchInput} placeholder="Search intern or mentor..." placeholderTextColor={colors.textMuted} value={search} onChangeText={setSearch} />
          {search.length > 0 && (
            <TouchableOpacity id="transfer-search-clear" onPress={() => setSearch('')} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Icon name="close" size={15} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.filterRow}>
          <Dropdown
            id="transfer-initiator"
            compact
            style={{flex: 1}}
            value={initiatorFilter}
            onChange={setInitiatorFilter}
            options={[{value: 'all', label: 'Any source'}, {value: 'Mentor', label: 'By mentor'}, {value: 'Admin', label: 'By admin'}]}
          />
          <Dropdown
            id="transfer-sort"
            compact
            style={{flex: 1}}
            value={sort}
            onChange={setSort}
            options={SORT_OPTIONS}
          />
        </View>
        <FilterChips
          compact
          wrap
          idPrefix="transfer-status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[{key: 'all', label: 'All'}, ...STATUSES.map(s => ({key: s, label: s, color: STATUS_COLORS[s]}))]}
        />
        {transfers.length === 0 ? (
          <View style={styles.emptyBox}><Icon name="transfer" size={44} color={colors.textMuted} /><Text style={styles.emptyText}>No intern transfers</Text></View>
        ) : transfers.map(t => {
          const canEndorse = t.status === 'Pending' && t.initiatedBy === 'Mentor';
          return (
            <View key={t.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{t.internName}</Text>
                <View style={[styles.statusBadge, {backgroundColor: (STATUS_COLORS[t.status] || colors.text) + '22'}]}>
                  <Text style={[styles.statusText, {color: STATUS_COLORS[t.status] || colors.text}]}>{t.status}</Text>
                </View>
              </View>
              <Text style={styles.cardSub}>Initiated by {t.initiatedBy}</Text>
              <View style={styles.transferFlow}>
                <View style={styles.flowNode}><Text style={styles.flowLabel}>From</Text><Text style={styles.flowValue}>{t.fromMentor}</Text>{t.fromDepartment ? <Text style={styles.flowDept}>{t.fromDepartment}</Text> : null}</View>
                <Icon name="transfer" size={16} color={colors.textAccent} />
                <View style={styles.flowNode}><Text style={styles.flowLabel}>To</Text><Text style={styles.flowValue}>{t.toMentor}</Text>{t.toDepartment ? <Text style={styles.flowDept}>{t.toDepartment}</Text> : null}</View>
              </View>
              {t.notes && <Text style={styles.noteText}>Note: {t.notes}</Text>}
              {t.rejectionReason && <Text style={styles.rejectNote}>Rejected: {t.rejectionReason}</Text>}
              <View style={styles.actions}>
                {t.status === 'Pending' && (
                  <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(t)}>
                    <Icon name="edit" size={14} color={colors.textAccent} /><Text style={styles.editBtnText}>Edit</Text>
                  </TouchableOpacity>
                )}
                {canEndorse ? (
                  <>
                    <TouchableOpacity style={styles.endorseBtn} onPress={() => endorse(t.id)} disabled={actionLoading === t.id}>
                      {actionLoading === t.id ? <ActivityIndicator color={colors.success} size="small" /> : <><Icon name="check" size={14} color={colors.success} /><Text style={styles.endorseBtnText}>Endorse</Text></>}
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.rejectBtn} onPress={() => reject(t.id)} disabled={actionLoading === t.id}>
                      <Icon name="close" size={14} color={colors.error} /><Text style={styles.rejectBtnText}>Reject</Text>
                    </TouchableOpacity>
                  </>
                ) : t.status === 'Pending' ? (
                  <TouchableOpacity style={styles.rejectBtn} onPress={() => reject(t.id)} disabled={actionLoading === t.id}>
                    <Icon name="close" size={14} color={colors.error} /><Text style={styles.rejectBtnText}>Reject</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          );
        })}
        {transfers.length > 0 && <EndOfListMarker />}
      </ScrollView>

      <SwipeableModal visible={!!editingTransfer} transparent overlayStyle={styles.modalOverlay} sheetStyle={styles.modalContent} onRequestClose={() => setEditingTransfer(null)}>
            <Text style={styles.modalTitle}>Edit Transfer</Text>
            <Text style={styles.modalSub}>{editingTransfer?.internName} · {editingTransfer?.fromMentor} → {editingTransfer?.toMentor}</Text>
            <View style={styles.modalField}>
              <Text style={styles.fieldLabel}>Target Mentor *</Text>
              <Dropdown id="edit-to-mentor" value={editToMentor} onChange={setEditToMentor} options={[{value: null, label: 'Select...'}, ...mentors]} />
            </View>
            <View style={styles.modalField}>
              <Text style={styles.fieldLabel}>Notes</Text>
              <TextInput style={[styles.fieldInput, styles.notesInput]} multiline placeholder="Reason for transfer..." placeholderTextColor={colors.textMuted} value={editNotes} onChangeText={setEditNotes} />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingTransfer(null)}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveEdit} disabled={savingEdit}>
                {savingEdit ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
              </TouchableOpacity>
            </View>
      </SwipeableModal>
    </ScreenBackground>
  );
}

const makeStyles = colors => StyleSheet.create({
  container:{flex:1}, center:{flex:1, justifyContent:'center', alignItems:'center'},
  menuBtn:{backgroundColor:'rgba(255,255,255,0.18)', borderWidth:1, borderColor:'rgba(255,255,255,0.35)', borderRadius:20, paddingHorizontal:12, paddingVertical:8},
  emptyBox:{alignItems:'center', paddingVertical:60}, emptyText:{color:colors.textSecondary, fontSize:15, marginTop:10},
  card:{backgroundColor:colors.surface, margin:12, marginBottom:4, borderRadius:14, padding:14, borderWidth:1, borderColor:colors.border},
  cardHeader:{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:4},
  cardTitle:{color:colors.text, fontSize:15, fontWeight:'700'},
  statusBadge:{borderRadius:6, paddingHorizontal:8, paddingVertical:4},
  statusText:{fontSize:11, fontWeight:'700'},
  cardSub:{color:colors.textMuted, fontSize:12, marginBottom:8},
  transferFlow:{flexDirection:'row', alignItems:'center', justifyContent:'center', gap:12, backgroundColor:colors.card, borderRadius:10, padding:12, marginBottom:8},
  flowNode:{alignItems:'center'},
  flowLabel:{color:colors.textMuted, fontSize:10, fontWeight:'600', textTransform:'uppercase'},
  flowValue:{color:colors.text, fontSize:13, fontWeight:'700', marginTop:2},
  flowDept:{color:colors.textMuted, fontSize:11, marginTop:1},
  noteText:{color:colors.textSecondary, fontSize:12, fontStyle:'italic', marginBottom:4},
  rejectNote:{color:colors.error, fontSize:12, fontStyle:'italic', marginBottom:4},
  actions:{flexDirection:'row', gap:10, marginTop:4},
  editBtn:{flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, borderRadius:10, paddingVertical:10, backgroundColor:colors.primary+'18', borderWidth:1, borderColor:colors.primary+'44'},
  editBtnText:{color:colors.textAccent, fontWeight:'700', fontSize:13},
  endorseBtn:{flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, borderRadius:10, paddingVertical:10, backgroundColor:colors.success+'18', borderWidth:1, borderColor:colors.success+'44'},
  endorseBtnText:{color:colors.success, fontWeight:'700', fontSize:13},
  rejectBtn:{flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, borderRadius:10, paddingVertical:10, backgroundColor:colors.error+'18', borderWidth:1, borderColor:colors.error+'44'},
  rejectBtnText:{color:colors.error, fontWeight:'700', fontSize:13},
  searchWrap:{flexDirection:'row', alignItems:'center', gap:8, backgroundColor:colors.card, marginHorizontal:16, marginTop:10, marginBottom:10, borderRadius:10, borderWidth:1, borderColor:colors.border, paddingHorizontal:12, paddingVertical:10},
  searchInput:{flex:1, color:colors.text, fontSize:14, padding:0},
  filterRow:{flexDirection:'row', gap:8, paddingHorizontal:16, marginBottom:10},
  sortBtnText:{color:'#fff', fontWeight:'700'},
  modalOverlay:{flex:1, backgroundColor:'rgba(0,0,0,0.7)', justifyContent:'flex-end'},
  modalContent:{backgroundColor:colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, padding:24},
  modalTitle:{color:colors.text, fontSize:18, fontWeight:'700'},
  modalSub:{color:colors.textMuted, fontSize:12, marginTop:4, marginBottom:16},
  modalField:{marginBottom:12},
  fieldLabel:{color:colors.textSecondary, fontSize:12, fontWeight:'600', marginBottom:6},
  fieldInput:{backgroundColor:colors.card, borderRadius:10, borderWidth:1, borderColor:colors.border, color:colors.text, paddingHorizontal:14, paddingVertical:12, fontSize:14},
  notesInput:{height:90, textAlignVertical:'top'},
  modalActions:{flexDirection:'row', gap:12, marginTop:8},
  cancelBtn:{flex:1, backgroundColor:colors.card, borderRadius:12, paddingVertical:14, alignItems:'center', borderWidth:1, borderColor:colors.border},
  cancelBtnText:{color:colors.textSecondary, fontWeight:'600'},
  saveBtn:{flex:1, backgroundColor:colors.primary, borderRadius:12, paddingVertical:14, alignItems:'center'},
  saveBtnText:{color:'#fff', fontWeight:'700'},
});

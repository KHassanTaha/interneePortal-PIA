import React, {useCallback, useState, useMemo} from 'react';
import {View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl, Modal} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import client from '../../api/client';
import {showToast} from '../../components/AppToast';
import {useAppTheme} from '../../theme';
import ScreenBackground from '../../components/ScreenBackground';
import AppHeader from '../../components/AppHeader';
import Icon from '../../components/Icon';
import Spinner from '../../components/Spinner';
import EndOfListMarker from '../../components/EndOfListMarker';
import SwipeableModal from '../../components/SwipeableModal';

export default function MentorShiftsScreen({navigation}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newStart, setNewStart] = useState('09:00');
  const [newEnd, setNewEnd] = useState('17:00');
  const [saving, setSaving] = useState(false);
  const [interns, setInterns] = useState([]);
  const [overview, setOverview] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchData = async () => {
    try {
      const [shiftsRes, internsRes] = await Promise.all([
        client.get('/mentor/shifts'),
        client.get('/mentor/interns'),
      ]);
      setShifts(shiftsRes.data);
      setInterns(internsRes.data);
    }
    catch { showToast("Couldn't load shifts.", 'error'); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const shiftsRes = await client.get('/mentor/shifts');
        if (!cancelled) setShifts(shiftsRes.data);
        const internsRes = await client.get('/mentor/interns');
        if (!cancelled) setInterns(internsRes.data);
      }
      catch { showToast("Couldn't load shifts.", 'error'); }
      finally { if (!cancelled) { setLoading(false); setRefreshing(false); } }
    };
    load();
    return () => { cancelled = true; };
  }, []));

  const closeShiftForm = () => { setShowCreate(false); setEditTarget(null); setNewName(''); setNewStart('09:00'); setNewEnd('17:00'); };

  const openEdit = (s) => {
    setEditTarget(s);
    setNewName(s.name);
    setNewStart(s.startTime?.slice(0, 5));
    setNewEnd(s.endTime?.slice(0, 5));
    setShowCreate(true);
  };

  const formatTime = (t) => {
    if (!t) return '';
    const [h, m] = t.split(':');
    const hr = parseInt(h, 10);
    return `${hr > 12 ? hr - 12 : hr}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
  };

  const parseTimeSpan = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return `${String(h).padStart(2,'0')}:${String(m||0).padStart(2,'0')}:00`;
  };

  const submitShift = async () => {
    if (!newName.trim()) { showToast('Name required.', 'error'); return; }
    if (!/^\d{1,2}:\d{2}$/.test(newStart) || !/^\d{1,2}:\d{2}$/.test(newEnd)) { showToast('Time format: HH:MM', 'error'); return; }
    setSaving(true);
    const body = {name: newName.trim(), startTime: parseTimeSpan(newStart), endTime: parseTimeSpan(newEnd)};
    try {
      if (editTarget) { await client.put(`/mentor/shifts/${editTarget.id}`, body); showToast('Shift updated.', 'success'); }
      else { await client.post('/mentor/shifts', body); showToast('Shift created.', 'success'); }
      closeShiftForm();
      fetchData();
    } catch (e) { showToast(e.response?.data?.message || 'Failed.', 'error'); }
    finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await client.delete(`/mentor/shifts/${deleteTarget.id}`);
      showToast('Shift deleted.', 'success');
      setDeleteTarget(null);
      fetchData();
    } catch (e) { showToast(e.response?.data?.message || 'Failed.', 'error'); setDeleteTarget(null); }
    finally { setSaving(false); }
  };

  const shiftPeople = (id) => {
    const groups = {};
    interns.filter(p => p.shiftId === id).forEach(p => {
      const dept = p.department || 'Ungrouped';
      (groups[dept] = groups[dept] || []).push(p);
    });
    return groups;
  };

  const filteredShifts = shifts.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.department || '').toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <Spinner style={styles.center} />;

  return (
    <ScreenBackground style={styles.container}>
      <AppHeader home title="Shifts" right={<TouchableOpacity style={styles.addBtn} onPress={() => setShowCreate(true)}><Icon name="plus" size={16} color="#fff" /><Text style={styles.addBtnText}>Add Shift</Text></TouchableOpacity>} />
      <ScrollView contentContainerStyle={{paddingBottom:100, flexGrow:1}} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchData();}} tintColor={colors.primary}/>}>
        <View style={styles.searchWrap}>
          <Icon name="search" size={16} color={colors.textMuted} />
          <TextInput style={styles.searchInput} placeholder="Search by shift or department..." placeholderTextColor={colors.textMuted} value={search} onChangeText={setSearch} />
          {search.length > 0 && (
            <TouchableOpacity id="mentor-shifts-search-clear" onPress={() => setSearch('')} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Icon name="close" size={15} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        {filteredShifts.length === 0 ? (
          <View style={styles.emptyBox}><Icon name="clock" size={44} color={colors.textMuted} /><Text style={styles.emptyText}>{shifts.length === 0 ? 'No shifts' : 'No shifts match your search'}</Text></View>
        ) : filteredShifts.map(s => (
          <View key={s.id} style={styles.cardWrap}>
            <TouchableOpacity style={styles.card} onPress={() => setOverview(s)}>
              <View style={styles.cardLeft}>
                <View style={[styles.dot, {backgroundColor: s.isCompanyWide ? colors.primary : colors.accent}]} />
                <View>
                  <Text style={styles.shiftName}>{s.name}</Text>
                  <Text style={styles.shiftTime}>{formatTime(s.startTime)} – {formatTime(s.endTime)}</Text>
                </View>
              </View>
              <View style={[styles.typeBadge, {backgroundColor: (s.isCompanyWide ? colors.primary : colors.accent) + '22'}]}>
                <Text style={[styles.typeText, {color: s.isCompanyWide ? colors.primary : colors.accent}]}>
                  {s.isCompanyWide ? 'Company' : s.department || 'Dept'}
                </Text>
              </View>
              <View style={[styles.statusBadge, {backgroundColor: s.isActive ? colors.success + '22' : colors.textMuted + '22'}]}>
                <Text style={[styles.statusText, {color: s.isActive ? colors.success : colors.textMuted}]}>{s.isActive ? 'Active' : 'Inactive'}</Text>
              </View>
            </TouchableOpacity>
            {s.isOwner && (
              <View style={styles.cardActions}>
                <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(s)}><Icon name="edit" size={14} color={colors.textAccent} /><Text style={styles.editBtnText}>Edit</Text></TouchableOpacity>
                <TouchableOpacity style={styles.delBtn} onPress={() => setDeleteTarget(s)}><Icon name="trash" size={14} color={colors.error} /><Text style={styles.delBtnText}>Delete</Text></TouchableOpacity>
              </View>
            )}
          </View>
        ))}
        {filteredShifts.length > 0 && <EndOfListMarker />}
      </ScrollView>

      <SwipeableModal visible={showCreate} transparent overlayStyle={styles.modalOverlay} sheetStyle={styles.modalContent} onRequestClose={closeShiftForm}>
            <Text style={styles.modalTitle}>{editTarget ? 'Edit Shift' : 'Create Department Shift'}</Text>
            <View style={styles.modalField}>
              <Text style={styles.fieldLabel}>Shift Name *</Text>
              <TextInput style={styles.fieldInput} placeholder="e.g. Custom" placeholderTextColor={colors.textMuted} value={newName} onChangeText={setNewName} />
            </View>
            <View style={styles.timeRow}>
              <View style={styles.timeField}>
                <Text style={styles.fieldLabel}>Start (HH:MM)</Text>
                <TextInput style={styles.fieldInput} placeholder="09:00" placeholderTextColor={colors.textMuted} value={newStart} onChangeText={setNewStart} />
              </View>
              <View style={styles.timeField}>
                <Text style={styles.fieldLabel}>End (HH:MM)</Text>
                <TextInput style={styles.fieldInput} placeholder="17:00" placeholderTextColor={colors.textMuted} value={newEnd} onChangeText={setNewEnd} />
              </View>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeShiftForm}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.createBtn} onPress={submitShift} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>{editTarget ? 'Save' : 'Create'}</Text>}
              </TouchableOpacity>
            </View>
      </SwipeableModal>

      {/* Item 9: shift click -> associated people by department */}
      <SwipeableModal visible={!!overview} transparent overlayStyle={styles.modalOverlay} sheetStyle={styles.sheetContent} scrollable={false} onRequestClose={() => setOverview(null)}>
            <View style={styles.sheetHeader}>
              <Text style={styles.modalTitle}>{overview?.name}</Text>
              <TouchableOpacity onPress={() => setOverview(null)}><Icon name="close" size={18} color={colors.textSecondary} /></TouchableOpacity>
            </View>
            <Text style={styles.sheetSub}>{overview ? `${formatTime(overview.startTime)} – ${formatTime(overview.endTime)}` : ''}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {Object.keys(shiftPeople(overview?.id)).length === 0 ? (
                <View style={styles.emptyBox}><Icon name="user" size={40} color={colors.textMuted} /><Text style={styles.emptyText}>No interns currently assigned to this shift.</Text></View>
              ) : Object.entries(shiftPeople(overview?.id)).map(([dept, list]) => (
                <View key={dept} style={styles.deptSection}>
                  <Text style={styles.deptTitle}>{dept}<Text style={styles.deptCount}>  {list.length}</Text></Text>
                  {list.map(p => (
                    <View key={p.id} style={styles.personRow}>
                      <View style={styles.personDot} />
                      <Text style={styles.personName}>{p.fullName}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </ScrollView>
      </SwipeableModal>

      {/* Item 8: delete confirm */}
      <SwipeableModal visible={!!deleteTarget} transparent overlayStyle={styles.modalOverlay} sheetStyle={styles.modalContent} onRequestClose={() => setDeleteTarget(null)}>
            <Text style={styles.modalTitle}>Delete Shift</Text>
            <Text style={styles.deletePrompt}>Delete "{deleteTarget?.name}"?{'\n'}If interns are still assigned to this shift, deletion will be blocked until they are relocated.</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setDeleteTarget(null)}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.deleteBtn} onPress={confirmDelete} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.deleteBtnText}>Delete</Text>}
              </TouchableOpacity>
            </View>
      </SwipeableModal>
    </ScreenBackground>
  );
}

const makeStyles = colors => StyleSheet.create({
  container:{flex:1}, center:{flex:1, justifyContent:'center', alignItems:'center'},
  addBtn:{flexDirection:'row', alignItems:'center', gap:6, backgroundColor:'rgba(255,255,255,0.18)', borderWidth:1, borderColor:'rgba(255,255,255,0.35)', borderRadius:20, paddingHorizontal:14, paddingVertical:9},
  addBtnText:{color:'#fff', fontWeight:'700', fontSize:13},
  searchWrap:{flexDirection:'row', alignItems:'center', gap:8, backgroundColor:colors.card, marginHorizontal:16, marginTop:10, marginBottom:14, borderRadius:10, borderWidth:1, borderColor:colors.border, paddingHorizontal:12, paddingVertical:10},
  searchInput:{flex:1, color:colors.text, fontSize:14, padding:0},
  emptyBox:{alignItems:'center', paddingVertical:60}, emptyText:{color:colors.textSecondary, fontSize:15, marginTop:10},
  card:{flexDirection:'row', alignItems:'center', justifyContent:'space-between', backgroundColor:colors.surface, borderRadius:14, padding:14, borderWidth:1, borderColor:colors.border},
  cardWrap:{marginHorizontal:12, marginBottom:14},
  cardActions:{flexDirection:'row', justifyContent:'flex-end', gap:10, marginTop:8},
  editBtn:{flexDirection:'row', alignItems:'center', gap:5, backgroundColor:colors.card, borderRadius:10, paddingHorizontal:12, paddingVertical:7, borderWidth:1, borderColor:colors.border},
  editBtnText:{color:colors.textAccent, fontWeight:'600', fontSize:12},
  delBtn:{flexDirection:'row', alignItems:'center', gap:5, backgroundColor:colors.card, borderRadius:10, paddingHorizontal:12, paddingVertical:7, borderWidth:1, borderColor:colors.border},
  delBtnText:{color:colors.error, fontWeight:'600', fontSize:12},
  cardLeft:{flexDirection:'row', alignItems:'center', gap:12},
  dot:{width:10, height:10, borderRadius:5},
  shiftName:{color:colors.text, fontSize:15, fontWeight:'700'},
  shiftTime:{color:colors.textMuted, fontSize:12, marginTop:2},
  typeBadge:{borderRadius:6, paddingHorizontal:8, paddingVertical:4},
  typeText:{fontSize:11, fontWeight:'700'},
  statusBadge:{borderRadius:6, paddingHorizontal:8, paddingVertical:4},
  statusText:{fontSize:11, fontWeight:'700'},
  modalOverlay:{flex:1, backgroundColor:'rgba(0,0,0,0.7)', justifyContent:'flex-end'},
  modalContent:{backgroundColor:colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, padding:24},
  modalTitle:{color:colors.text, fontSize:18, fontWeight:'700', marginBottom:16},
  modalField:{marginBottom:12},
  fieldLabel:{color:colors.textSecondary, fontSize:12, fontWeight:'600', marginBottom:6},
  fieldInput:{backgroundColor:colors.card, borderRadius:10, borderWidth:1, borderColor:colors.border, color:colors.text, paddingHorizontal:14, paddingVertical:12, fontSize:14},
  timeRow:{flexDirection:'row', gap:12},
  timeField:{flex:1},
  modalActions:{flexDirection:'row', gap:12, marginTop:20, marginBottom:10},
  cancelBtn:{flex:1, backgroundColor:colors.card, borderRadius:12, paddingVertical:14, alignItems:'center', borderWidth:1, borderColor:colors.border},
  cancelBtnText:{color:colors.textSecondary, fontWeight:'600'},
  createBtn:{flex:1, backgroundColor:colors.primary, borderRadius:12, paddingVertical:14, alignItems:'center'},
  createBtnText:{color:'#fff', fontWeight:'700'},
  deleteBtn:{flex:1, backgroundColor:colors.error, borderRadius:12, paddingVertical:14, alignItems:'center'},
  deleteBtnText:{color:'#fff', fontWeight:'700'},
  deletePrompt:{color:colors.textSecondary, fontSize:14, lineHeight:20, marginBottom:16},
  sheetContent:{backgroundColor:colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, padding:24, maxHeight:'70%'},
  sheetHeader:{flexDirection:'row', alignItems:'center', justifyContent:'space-between'},
  sheetSub:{color:colors.textMuted, fontSize:13, marginTop:6, marginBottom:14},
  deptSection:{marginBottom:10},
  deptTitle:{color:colors.textSecondary, fontSize:14, fontWeight:'700', marginBottom:6},
  deptCount:{color:colors.textSecondary, fontSize:12, fontWeight:'400'},
  personRow:{flexDirection:'row', alignItems:'center', gap:8, paddingVertical:6},
  personDot:{width:8, height:8, borderRadius:4, backgroundColor:colors.primary},
  personName:{color:colors.text, fontSize:14},
});

import React, {useCallback, useState, useMemo} from 'react';
import {View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import client from '../../api/client';
import {showToast} from '../../components/AppToast';
import {showConfirm} from '../../components/AppConfirm';
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

export default function ShiftsScreen({navigation}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [shifts, setShifts] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [scopeFilter, setScopeFilter] = useState('all');

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formName, setFormName] = useState('');
  const [formStart, setFormStart] = useState('09:00');
  const [formEnd, setFormEnd] = useState('17:00');
  const [formCompany, setFormCompany] = useState(true);
  const [formDept, setFormDept] = useState(null);
  const [saving, setSaving] = useState(false);

  const [impactShift, setImpactShift] = useState(null);
  const [impact, setImpact] = useState(null);

  const fetchShiftsData = async () => {
    try {
      const [sRes, dRes] = await Promise.all([client.get('/admin/shifts'), client.get('/admin/departments')]);
      setShifts(sRes.data);
      setDepartments(dRes.data.map(d => ({value: d.id, label: d.name})));
    } catch { showToast("Couldn't load shifts.", 'error'); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const [sRes, dRes] = await Promise.all([client.get('/admin/shifts'), client.get('/admin/departments')]);
        if (!cancelled) {
          setShifts(sRes.data);
          setDepartments(dRes.data.map(d => ({value: d.id, label: d.name})));
        }
      } catch { if (!cancelled) showToast("Couldn't load shifts.", 'error'); }
      finally { if (!cancelled) { setLoading(false); setRefreshing(false); } }
    };
    fetchData();
    return () => { cancelled = true; setSearch(''); };
  }, []));

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

  const openCreate = () => {
    setEditing(null);
    setFormName(''); setFormStart('09:00'); setFormEnd('17:00'); setFormCompany(true); setFormDept(null);
    setShowForm(true);
  };

  const openEdit = (s) => {
    setEditing(s);
    setFormName(s.name); setFormStart(s.startTime.slice(0, 5)); setFormEnd(s.endTime.slice(0, 5));
    setFormCompany(s.isCompanyWide); setFormDept(s.DepartmentId ?? null);
    setShowForm(true);
  };

  const saveShift = async () => {
    if (!formName.trim()) { showToast('Shift name is required.', 'error'); return; }
    if (!/^\d{1,2}:\d{2}$/.test(formStart) || !/^\d{1,2}:\d{2}$/.test(formEnd)) { showToast('Time format: HH:MM', 'error'); return; }
    if (formStart === formEnd) { showToast('End time must be after start time.', 'error'); return; }
    if (!formCompany && !formDept) { showToast('Pick a department.', 'error'); return; }
    const body = {name: formName.trim(), startTime: parseTimeSpan(formStart), endTime: parseTimeSpan(formEnd), isCompanyWide: formCompany, departmentId: formCompany ? null : formDept};
    setSaving(true);
    try {
      if (editing) await client.put(`/admin/shifts/${editing.id}`, body);
      else {
        const {queued} = await moderate({kind: 'admin', label: 'Create shift', method: 'POST', url: '/admin/shifts', body});
        queuedToast(queued, 'Shift created.');
      }
      setShowForm(false);
      fetchShiftsData();
    } catch (e) { showToast(e.response?.data?.message || 'Failed to save shift.', 'error'); }
    finally { setSaving(false); }
  };

  const toggleShift = async (s) => {
    if (s.isActive) {
      if (s.assignedInterns > 0) { showToast('Cannot deactivate: interns are still assigned.', 'error'); return; }
      const ok = await showConfirm({title: 'Deactivate shift?', message: `"${s.name}" will no longer be selectable by interns.`, confirmText: 'Deactivate', destructive: true});
      if (!ok) return;
    }
    try {
      await client.post(`/admin/shifts/${s.id}/toggle`);
      showToast(s.isActive ? 'Shift deactivated.' : 'Shift activated.', 'success');
      fetchShiftsData();
    } catch (e) { showToast(e.response?.data?.message || 'Failed to toggle shift.', 'error'); }
  };

  const loadImpact = async (s) => {
    setImpactShift(s);
    setImpact(null);
    try {
      const res = await client.get(`/admin/shifts/${s.id}/impact`);
      setImpact(res.data);
    } catch (e) { showToast(e.response?.data?.message || "Couldn't load impact.", 'error'); }
  };

  const deleteShift = async (s) => {
    const ok = await showConfirm({title: 'Delete shift?', message: `"${s.name}" will be permanently removed.`, confirmText: 'Delete', destructive: true});
    if (!ok) return;
    try {
      await client.delete(`/admin/shifts/${s.id}`);
      showToast('Shift deleted.', 'success');
      setImpactShift(null); setImpact(null);
      fetchShiftsData();
    } catch (e) { showToast(e.response?.data?.message || 'Failed to delete shift.', 'error'); }
  };

  const filtered = shifts.filter(s =>
    (statusFilter === 'all' || (statusFilter === 'active' ? s.isActive : !s.isActive)) &&
    (scopeFilter === 'all' || (scopeFilter === 'company' ? s.isCompanyWide : !s.isCompanyWide)) &&
    (!search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.department || '').toLowerCase().includes(search.toLowerCase()))
  );

  const deptName = deptId => departments.find(d => d.value === deptId)?.label || 'Unknown';
  const deptKey = i => i.DepartmentId ?? 'none';
  const impactGroups = impact ? [...new Set(impact.assignedInterns.map(deptKey))].map(deptId => ({
    deptId,
    name: deptName(deptId),
    interns: impact.assignedInterns.filter(i => deptKey(i) === deptId),
  })) : [];

  if (loading) return <Spinner style={styles.center} />;

  return (
    <ScreenBackground style={styles.container}>
      <AppHeader hideTitle onBack={() => navigation.goBack()} title="Shifts" right={<TouchableOpacity style={styles.addBtn} onPress={openCreate}><Icon name="plus" size={16} color="#fff" /><Text style={styles.addBtnText}>Add Shift</Text></TouchableOpacity>} />

      <ScrollView contentContainerStyle={{paddingBottom:100, flexGrow:1}} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchShiftsData();}} tintColor={colors.primary}/>}>
        <View style={styles.searchWrap}>
          <Icon name="search" size={16} color={colors.textMuted} />
          <TextInput style={styles.searchInput} placeholder="Search by shift or department..." placeholderTextColor={colors.textMuted} value={search} onChangeText={setSearch} />
          {search.length > 0 && (
            <TouchableOpacity id="shifts-search-clear" onPress={() => setSearch('')} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Icon name="close" size={15} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <FilterChips compact options={[{key: 'all', label: 'All'}, {key: 'active', label: 'Active'}, {key: 'inactive', label: 'Inactive'}]} value={statusFilter} onChange={setStatusFilter} idPrefix="shift-status" />
        <FilterChips compact options={[{key: 'all', label: 'All Scopes'}, {key: 'company', label: 'Company'}, {key: 'dept', label: 'Department'}]} value={scopeFilter} onChange={setScopeFilter} idPrefix="shift-scope" />

        {filtered.length === 0 ? (
          <View style={styles.emptyBox}><Icon name="clock" size={44} color={colors.textMuted} /><Text style={styles.emptyText}>No shifts found</Text></View>
        ) : filtered.map(s => (
          <View key={s.id} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.cardLeft}>
                <View style={[styles.dot, {backgroundColor: s.isCompanyWide ? colors.primary : colors.accent}]} />
                <View style={{flex:1}}>
                  <Text style={styles.shiftName}>{s.name}</Text>
                  <Text style={styles.shiftTime}>{formatTime(s.startTime)} – {formatTime(s.endTime)}</Text>
                </View>
              </View>
              <View style={[styles.typeBadge, {backgroundColor: (s.isCompanyWide ? colors.primary : colors.accent) + '22'}]}>
                <Text style={[styles.typeText, {color: s.isCompanyWide ? colors.primary : colors.accent}]}>
                  {s.isCompanyWide ? 'Company' : s.department || 'Dept'}
                </Text>
              </View>
            </View>
            <View style={styles.cardMeta}>
              <View style={[styles.statusBadge, {backgroundColor: s.isActive ? colors.success + '22' : colors.textMuted + '22'}]}>
                <Text style={[styles.statusText, {color: s.isActive ? colors.success : colors.textMuted}]}>
                  {s.isActive ? 'Active' : 'Inactive'}
                </Text>
              </View>
              <Text style={styles.assignedText}>{s.assignedInterns} assigned</Text>
              <TouchableOpacity style={styles.iconBtn} onPress={() => toggleShift(s)}>
                <Icon name="refresh" size={15} color={colors.textAccent} />
                <Text style={styles.iconBtnText}>{s.isActive ? 'Deactivate' : 'Activate'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconBtn} onPress={() => openEdit(s)}>
                <Icon name="edit" size={14} color={colors.textAccent} />
                <Text style={styles.iconBtnText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconBtn} onPress={() => loadImpact(s)}>
                <Icon name="users" size={15} color={colors.textAccent} />
                <Text style={styles.iconBtnText}>Impact</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
        {filtered.length > 0 && <EndOfListMarker />}
      </ScrollView>

      <SwipeableModal visible={showForm} transparent overlayStyle={styles.modalOverlay} sheetStyle={styles.modalContent} onRequestClose={() => setShowForm(false)}>
            <Text style={styles.modalTitle}>{editing ? 'Edit Shift' : 'Add Shift'}</Text>
            <View style={styles.modalField}>
              <Text style={styles.fieldLabel}>Shift Name *</Text>
              <TextInput style={styles.fieldInput} placeholder="e.g. General / Night" placeholderTextColor={colors.textMuted} value={formName} onChangeText={setFormName} />
            </View>
            <View style={styles.timeRow}>
              <View style={styles.timeField}>
                <Text style={styles.fieldLabel}>Start (HH:MM)</Text>
                <TextInput style={styles.fieldInput} placeholder="09:00" placeholderTextColor={colors.textMuted} value={formStart} onChangeText={setFormStart} />
              </View>
              <View style={styles.timeField}>
                <Text style={styles.fieldLabel}>End (HH:MM)</Text>
                <TextInput style={styles.fieldInput} placeholder="17:00" placeholderTextColor={colors.textMuted} value={formEnd} onChangeText={setFormEnd} />
              </View>
            </View>
            <View style={styles.scopeRow}>
              <TouchableOpacity style={[styles.scopeBtn, formCompany && styles.scopeBtnOn]} onPress={() => setFormCompany(true)}>
                <Text style={[styles.scopeText, formCompany && styles.scopeTextOn]}>Company-wide</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.scopeBtn, !formCompany && styles.scopeBtnOn]} onPress={() => setFormCompany(false)}>
                <Text style={[styles.scopeText, !formCompany && styles.scopeTextOn]}>Department</Text>
              </TouchableOpacity>
            </View>
            {!formCompany && (
              <View style={styles.modalField}>
                <Text style={styles.fieldLabel}>Department *</Text>
                <Dropdown id="shift-dept" value={formDept} onChange={setFormDept} options={[{value: null, label: 'Select...'}, ...departments]} />
              </View>
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowForm(false)}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.createBtn} onPress={saveShift} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>{editing ? 'Update' : 'Create'}</Text>}
              </TouchableOpacity>
            </View>
      </SwipeableModal>

      <SwipeableModal visible={!!impactShift} transparent overlayStyle={styles.modalOverlay} sheetStyle={styles.modalContent} onRequestClose={() => setImpactShift(null)}>
          <View>
            <Text style={styles.modalTitle}>Impact — {impactShift?.name}</Text>
            {!impact ? <ActivityIndicator color={colors.textAccent} style={{marginVertical: 24}} /> : (
              <>
                <Text style={styles.fieldLabel}>Assigned interns ({impact.assignedInterns.length})</Text>
                {impact.assignedInterns.length === 0 ? (
                  <Text style={styles.emptyText}>None</Text>
                ) : impactGroups.map(g => (
                  <View key={`${g.deptId}`} style={styles.impactGroup}>
                    <Text style={styles.impactGroupTitle}>{g.name} ({g.interns.length})</Text>
                    {g.interns.map(i => (
                      <View key={i.id} style={styles.impactRow}><Icon name="user" size={14} color={colors.textSecondary} /><Text style={styles.impactText}>{i.fullName}</Text></View>
                    ))}
                  </View>
                ))}
                <Text style={[styles.fieldLabel, {marginTop: 12}]}>Pending shift-change requests ({impact.openRequests.length})</Text>
                {impact.openRequests.length === 0 ? (
                  <Text style={styles.emptyText}>None</Text>
                ) : impact.openRequests.map(r => (
                  <View key={r.id} style={styles.impactRow}><Icon name="clock" size={14} color={colors.textSecondary} /><Text style={styles.impactText}>{r.internName}</Text></View>
                ))}
                {!impact.canDelete && <Text style={styles.warnText}>This shift cannot be deactivated or deleted while interns or open requests reference it.</Text>}
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setImpactShift(null)}><Text style={styles.cancelBtnText}>Close</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.createBtn, styles.deleteBtn]} disabled={!impact.canDelete} onPress={() => deleteShift(impactShift)}>
                    <Icon name="trash" size={15} color="#fff" />
                    <Text style={styles.createBtnText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
      </SwipeableModal>
    </ScreenBackground>
  );
}

const makeStyles = colors => StyleSheet.create({
  container:{flex:1}, center:{flex:1, justifyContent:'center', alignItems:'center'},
  addBtn:{flexDirection:'row', alignItems:'center', gap:6, backgroundColor:'rgba(255,255,255,0.18)', borderWidth:1, borderColor:'rgba(255,255,255,0.35)', borderRadius:20, paddingHorizontal:14, paddingVertical:9},
  addBtnText:{color:'#fff', fontWeight:'700', fontSize:13},
  searchWrap:{flexDirection:'row', alignItems:'center', gap:8, backgroundColor:colors.card, marginHorizontal:16, marginTop:10, marginBottom:10, borderRadius:10, borderWidth:1, borderColor:colors.border, paddingHorizontal:12, paddingVertical:10},
  searchInput:{flex:1, color:colors.text, fontSize:14, padding:0},
  emptyBox:{alignItems:'center', paddingVertical:60}, emptyText:{color:colors.textSecondary, fontSize:14, marginTop:10},
  card:{backgroundColor:colors.surface, margin:12, marginBottom:4, borderRadius:14, padding:14, borderWidth:1, borderColor:colors.border},
  cardTop:{flexDirection:'row', alignItems:'center', justifyContent:'space-between', gap:8},
  cardLeft:{flexDirection:'row', alignItems:'center', gap:12, flex:1},
  dot:{width:10, height:10, borderRadius:5},
  shiftName:{color:colors.text, fontSize:15, fontWeight:'700'},
  shiftTime:{color:colors.textMuted, fontSize:12, marginTop:2},
  typeBadge:{borderRadius:6, paddingHorizontal:8, paddingVertical:4},
  typeText:{fontSize:11, fontWeight:'700'},
  cardMeta:{flexDirection:'row', alignItems:'center', gap:10, marginTop:12, flexWrap:'wrap'},
  statusBadge:{borderRadius:6, paddingHorizontal:8, paddingVertical:3},
  statusText:{fontSize:11, fontWeight:'700'},
  assignedText:{color:colors.textSecondary, fontSize:12},
  iconBtn:{flexDirection:'row', alignItems:'center', gap:4, backgroundColor:colors.card, borderRadius:8, borderWidth:1, borderColor:colors.border, paddingHorizontal:8, paddingVertical:5},
  iconBtnText:{color:colors.textAccent, fontSize:11, fontWeight:'600'},
  modalOverlay:{flex:1, backgroundColor:'rgba(0,0,0,0.7)', justifyContent:'flex-end'},
  modalContent:{backgroundColor:colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, padding:24, maxHeight:'85%'},
  modalTitle:{color:colors.text, fontSize:18, fontWeight:'700', marginBottom:16},
  modalField:{marginBottom:12},
  fieldLabel:{color:colors.textSecondary, fontSize:12, fontWeight:'600', marginBottom:6},
  fieldInput:{backgroundColor:colors.card, borderRadius:10, borderWidth:1, borderColor:colors.border, color:colors.text, paddingHorizontal:14, paddingVertical:12, fontSize:14},
  timeRow:{flexDirection:'row', gap:12},
  timeField:{flex:1},
  scopeRow:{flexDirection:'row', gap:10, marginBottom:12},
  scopeBtn:{flex:1, borderRadius:10, borderWidth:1, borderColor:colors.border, paddingVertical:10, alignItems:'center', backgroundColor:colors.card},
  scopeBtnOn:{backgroundColor:colors.primary, borderColor:colors.primary},
  scopeText:{color:colors.textSecondary, fontSize:13, fontWeight:'600'},
  scopeTextOn:{color:'#fff'},
  modalActions:{flexDirection:'row', gap:12, marginTop:20, marginBottom:10},
  cancelBtn:{flex:1, backgroundColor:colors.card, borderRadius:12, paddingVertical:14, alignItems:'center', borderWidth:1, borderColor:colors.border},
  cancelBtnText:{color:colors.textSecondary, fontWeight:'600'},
  createBtn:{flex:1, backgroundColor:colors.primary, borderRadius:12, paddingVertical:14, alignItems:'center', flexDirection:'row', justifyContent:'center', gap:6},
  createBtnText:{color:'#fff', fontWeight:'700'},
  deleteBtn:{backgroundColor:colors.error},
  impactGroup:{marginBottom:8},
  impactGroupTitle:{color:colors.text, fontSize:12, fontWeight:'700', marginBottom:2},
  impactRow:{flexDirection:'row', alignItems:'center', gap:8, paddingVertical:4},
  impactText:{color:colors.text, fontSize:13},
  warnText:{color:colors.error, fontSize:12, marginTop:12, lineHeight:17},
});
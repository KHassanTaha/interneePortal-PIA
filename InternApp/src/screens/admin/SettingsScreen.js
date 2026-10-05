import React, {useCallback, useState, useMemo} from 'react';
import {View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import client from '../../api/client';
import {showToast} from '../../components/AppToast';
import {useAppTheme} from '../../theme';
import ScreenBackground from '../../components/ScreenBackground';
import AppHeader from '../../components/AppHeader';
import Icon from '../../components/Icon';
import Spinner from '../../components/Spinner';
import DateField from '../../components/DateField';
import EndOfListMarker from '../../components/EndOfListMarker';
import SwipeableModal from '../../components/SwipeableModal';

export default function SettingsScreen({navigation}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editingGrace, setEditingGrace] = useState('');
  const [editingThreshold, setEditingThreshold] = useState('');
  const [editingLeaveDays, setEditingLeaveDays] = useState('');
  const [editingTaskThreshold, setEditingTaskThreshold] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [holidays, setHolidays] = useState([]);

  const [showAddHoliday, setShowAddHoliday] = useState(false);
  const [holidayName, setHolidayName] = useState('');
  const [holidayDate, setHolidayDate] = useState(null);
  const [editingHoliday, setEditingHoliday] = useState(null);
  const [savingHoliday, setSavingHoliday] = useState(false);

  const fetchSettingsData = async () => {
    try {
      const [sRes, hRes] = await Promise.all([
        client.get('/admin/settings'),
        client.get('/admin/holidays'),
      ]);
      setEditingGrace(String(sRes.data.graceMinutes));
      setEditingThreshold(String(sRes.data.thresholdPct));
      setEditingLeaveDays(String(sRes.data.allowedLeaveDays ?? 0));
      setEditingTaskThreshold(String(sRes.data.taskThresholdPct ?? 80));
      setHolidays(hRes.data);
    } catch {
      showToast("Couldn't load settings. Pull to refresh.", 'error');
    } finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const [sRes, hRes] = await Promise.all([
          client.get('/admin/settings'),
          client.get('/admin/holidays'),
        ]);
        if (!cancelled) {
          setEditingGrace(String(sRes.data.graceMinutes));
          setEditingThreshold(String(sRes.data.thresholdPct));
          setEditingLeaveDays(String(sRes.data.allowedLeaveDays ?? 0));
          setEditingTaskThreshold(String(sRes.data.taskThresholdPct ?? 80));
          setHolidays(hRes.data);
        }
      } catch {
        if (!cancelled) showToast("Couldn't load settings. Pull to refresh.", 'error');
      } finally { if (!cancelled) { setLoading(false); setRefreshing(false); } }
    };
    fetchData();
    return () => { cancelled = true; };
  }, []));

  const saveSettings = async () => {
    const grace = parseInt(editingGrace, 10);
    const thresh = parseFloat(editingThreshold);
    const leave = parseInt(editingLeaveDays, 10);
    const taskThresh = parseFloat(editingTaskThreshold);
    if (isNaN(grace) || grace < 0 || grace > 120) { showToast('Grace minutes must be 0-120.', 'error'); return; }
    if (isNaN(thresh) || thresh <= 0 || thresh > 100) { showToast('Threshold must be 1-100.', 'error'); return; }
    if (isNaN(leave) || leave < 0 || leave > 60) { showToast('Allowed leave days must be 0-60.', 'error'); return; }
    if (isNaN(taskThresh) || taskThresh < 0 || taskThresh > 100) { showToast('Task completion threshold must be 0-100.', 'error'); return; }
    setSavingSettings(true);
    try {
      const res = await client.put('/admin/settings', {graceMinutes: grace, thresholdPct: thresh, allowedLeaveDays: leave, taskThresholdPct: taskThresh});
      setEditingGrace(String(res.data.graceMinutes));
      setEditingThreshold(String(res.data.thresholdPct));
      setEditingLeaveDays(String(res.data.allowedLeaveDays ?? 0));
      setEditingTaskThreshold(String(res.data.taskThresholdPct ?? 80));
      showToast('Settings updated.', 'success');
    } catch (e) {
      showToast(e.response?.data?.message || 'Failed to save settings.', 'error');
    } finally { setSavingSettings(false); }
  };

  const addHoliday = async () => {
    if (!holidayName.trim()) { showToast('Holiday name is required.', 'error'); return; }
    if (!holidayDate) { showToast('Pick a date.', 'error'); return; }
    setSavingHoliday(true);
    try {
      if (editingHoliday) {
        await client.put(`/admin/holidays/${editingHoliday.id}`, {date: holidayDate, name: holidayName.trim()});
        showToast('Holiday updated.', 'success');
      } else {
        await client.post('/admin/holidays', {date: holidayDate, name: holidayName.trim()});
        showToast('Holiday added.', 'success');
      }
      setShowAddHoliday(false);
      setEditingHoliday(null);
      setHolidayName(''); setHolidayDate(null);
      fetchSettingsData();
    } catch (e) {
      showToast(e.response?.data?.message || 'Failed to save holiday.', 'error');
    } finally { setSavingHoliday(false); }
  };

  const startEditHoliday = (h) => {
    setEditingHoliday(h);
    setHolidayName(h.name);
    setHolidayDate(h.date);
    setShowAddHoliday(true);
  };

  const deleteHoliday = async (h) => {
    try {
      await client.delete(`/admin/holidays/${h.id}`);
      showToast('Holiday removed.', 'success');
      fetchSettingsData();
    } catch { showToast('Failed to delete holiday.', 'error'); }
  };

  if (loading) return <Spinner style={styles.center} />;

  return (
    <ScreenBackground style={styles.container}>
      <AppHeader hideTitle home title="Settings" />
      <ScrollView contentContainerStyle={{paddingBottom:100, flexGrow:1}} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchSettingsData();}} tintColor={colors.primary}/>}>

        {/* Scoring Parameters */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Scoring Parameters</Text>
          <View style={styles.fieldRow}>
            <View style={styles.fieldHalf}>
              <Text style={styles.fieldLabel}>Grace Minutes</Text>
              <TextInput style={styles.fieldInput} keyboardType="numeric" value={editingGrace} onChangeText={setEditingGrace} placeholder="15" placeholderTextColor={colors.textMuted} />
              <Text style={styles.hint}>Max minutes after shift start before marking Late</Text>
            </View>
            <View style={styles.fieldHalf}>
              <Text style={styles.fieldLabel}>Threshold %</Text>
              <TextInput style={styles.fieldInput} keyboardType="decimal-pad" value={editingThreshold} onChangeText={setEditingThreshold} placeholder="80" placeholderTextColor={colors.textMuted} />
              <Text style={styles.hint}>Minimum % to qualify for certificate</Text>
            </View>
          </View>
          <View style={styles.fieldRow}>
            <View style={styles.fieldHalf}>
              <Text style={styles.fieldLabel}>Allowed Leave Days</Text>
              <TextInput style={styles.fieldInput} keyboardType="numeric" value={editingLeaveDays} onChangeText={setEditingLeaveDays} placeholder="0" placeholderTextColor={colors.textMuted} />
              <Text style={styles.hint}>On-leave days that still count as full attendance</Text>
            </View>
            <View style={styles.fieldHalf}>
              <Text style={styles.fieldLabel}>Task Completion %</Text>
              <TextInput style={styles.fieldInput} keyboardType="decimal-pad" value={editingTaskThreshold} onChangeText={setEditingTaskThreshold} placeholder="80" placeholderTextColor={colors.textMuted} />
              <Text style={styles.hint}>Minimum task completion % for certificate</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.saveBtn} onPress={saveSettings} disabled={savingSettings}>
            {savingSettings ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Settings</Text>}
          </TouchableOpacity>
        </View>

        {/* Shifts */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Configurability</Text>
          <TouchableOpacity style={styles.linkRow} onPress={() => navigation.getParent()?.navigate('AdminShifts')}>
            <View style={[styles.linkIcon, {backgroundColor: colors.primary + '18'}]}>
              <Icon name="clock" size={18} color={colors.textAccent} />
            </View>
            <View style={{flex:1}}>
              <Text style={styles.linkLabel}>Shifts</Text>
              <Text style={styles.linkHint}>Configure company & department shift timings</Text>
            </View>
            <Icon name="chevronRight" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Public Holidays */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Public Holidays</Text>
            <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddHoliday(true)}>
              <Icon name="plus" size={14} color={colors.textAccent} />
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>
          </View>
          {holidays.length === 0 ? (
            <Text style={styles.emptyText}>No public holidays configured.</Text>
          ) : holidays.map(h => (
            <View key={h.id} style={styles.holidayRow}>
              <View style={{flex:1}}>
                <Text style={styles.holidayName}>{h.name}</Text>
                <Text style={styles.holidayDate}>{new Date(h.date).toLocaleDateString('en-US', {weekday:'long', year:'numeric', month:'long', day:'numeric'})}</Text>
              </View>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => startEditHoliday(h)}>
                <Icon name="edit" size={14} color={colors.textAccent} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteHoliday(h)}>
                <Icon name="trash" size={14} color={colors.error} />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <EndOfListMarker />
      </ScrollView>

      {/* Add Holiday Modal */}
      <SwipeableModal visible={showAddHoliday} transparent overlayStyle={styles.modalOverlay} sheetStyle={styles.modalContent} onRequestClose={() => setShowAddHoliday(false)}>
            <Text style={styles.modalTitle}>{editingHoliday ? 'Edit Public Holiday' : 'Add Public Holiday'}</Text>
            <View style={styles.modalField}>
              <Text style={styles.fieldLabel}>Holiday Name</Text>
              <TextInput style={styles.fieldInput} placeholder="e.g. Independence Day" placeholderTextColor={colors.textMuted} value={holidayName} onChangeText={setHolidayName} />
            </View>
            <View style={styles.modalField}>
              <DateField label="Date" value={holidayDate} onChange={d => setHolidayDate(d ? d.toISOString().slice(0,10) : null)} />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => {setShowAddHoliday(false); setEditingHoliday(null); setHolidayName(''); setHolidayDate(null);}}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.createBtn} onPress={addHoliday} disabled={savingHoliday}>
                {savingHoliday ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>{editingHoliday ? 'Update Holiday' : 'Add Holiday'}</Text>}
              </TouchableOpacity>
            </View>
      </SwipeableModal>
    </ScreenBackground>
  );
}

const makeStyles = colors => StyleSheet.create({
  container:{flex:1}, center:{flex:1, justifyContent:'center', alignItems:'center'},
  sectionCard:{backgroundColor:colors.surface, marginHorizontal:12, marginBottom:12, borderRadius:14, padding:16, borderWidth:1, borderColor:colors.border},
  sectionHeader:{flexDirection:'row', justifyContent:'space-between', alignItems:'center'},
  sectionTitle:{color:colors.text, fontSize:15, fontWeight:'700', marginBottom:12},
  fieldRow:{flexDirection:'row', gap:12},
  fieldHalf:{flex:1},
  fieldLabel:{color:colors.textSecondary, fontSize:12, fontWeight:'600', marginBottom:6},
  fieldInput:{backgroundColor:colors.card, borderRadius:10, borderWidth:1, borderColor:colors.border, color:colors.text, paddingHorizontal:14, paddingVertical:12, fontSize:14},
  hint:{color:colors.textMuted, fontSize:11, marginTop:4},
  saveBtn:{flexDirection:'row', alignItems:'center', justifyContent:'center', backgroundColor:colors.primary, paddingVertical:12, borderRadius:10, marginTop:14},
  linkRow:{flexDirection:'row', alignItems:'center', gap:12, paddingVertical:10},
  linkIcon:{width:38, height:38, borderRadius:10, alignItems:'center', justifyContent:'center'},
  linkLabel:{color:colors.text, fontSize:15, fontWeight:'600'},
  linkHint:{color:colors.textMuted, fontSize:12, marginTop:2},
  saveBtnText:{color:'#fff', fontWeight:'700'},
  addBtn:{flexDirection:'row', alignItems:'center', gap:4, backgroundColor:colors.primary+'15', borderRadius:8, paddingHorizontal:10, paddingVertical:6, borderWidth:1, borderColor:colors.primary+'44'},
  addBtnText:{color:colors.textAccent, fontWeight:'600', fontSize:12},
  emptyText:{color:colors.textMuted, fontSize:13, textAlign:'center', paddingVertical:16},
  holidayRow:{flexDirection:'row', alignItems:'center', paddingVertical:12, borderTopWidth:1, borderTopColor:colors.border},
  holidayName:{color:colors.text, fontSize:14, fontWeight:'600'},
  holidayDate:{color:colors.textMuted, fontSize:12, marginTop:2},
  deleteBtn:{padding:8},
  modalOverlay:{flex:1, backgroundColor:'rgba(0,0,0,0.7)', justifyContent:'flex-end'},
  modalContent:{backgroundColor:colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, padding:24},
  modalTitle:{color:colors.text, fontSize:18, fontWeight:'700', marginBottom:16},
  modalField:{marginBottom:12},
  modalActions:{flexDirection:'row', gap:12, marginTop:8},
  cancelBtn:{flex:1, backgroundColor:colors.card, borderRadius:12, paddingVertical:14, alignItems:'center', borderWidth:1, borderColor:colors.border},
  cancelBtnText:{color:colors.textSecondary, fontWeight:'600'},
  createBtn:{flex:1, backgroundColor:colors.primary, borderRadius:12, paddingVertical:14, alignItems:'center'},
  createBtnText:{color:'#fff', fontWeight:'700'},
});

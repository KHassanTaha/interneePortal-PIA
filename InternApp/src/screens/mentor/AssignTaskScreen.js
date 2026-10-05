import React, {useState, useEffect, useMemo, useCallback} from 'react';
import {View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, TextInput, RefreshControl} from 'react-native';
import client from '../../api/client';
import {showToast} from '../../components/AppToast';
import {useAppTheme} from '../../theme';
import ScreenBackground from '../../components/ScreenBackground';
import AppHeader from '../../components/AppHeader';
import Icon from '../../components/Icon';
import Spinner from '../../components/Spinner';
import DateField from '../../components/DateField';
import Dropdown from '../../components/Dropdown';
import FilterChips from '../../components/FilterChips';
import SwipeableModal from '../../components/SwipeableModal';

export default function AssignTaskScreen({navigation}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [interns, setInterns] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedIntern, setSelectedIntern] = useState(null);
  const [form, setForm] = useState({title:'', description:'', deadline:''});
  const [assigning, setAssigning] = useState(false);
  const [filterInternId, setFilterInternId] = useState(null);
  const [filterStatus, setFilterStatus] = useState('All');
  const [detailTask, setDetailTask] = useState(null);
  const [editForm, setEditForm] = useState({title:'', description:'', deadline:''});
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [internsRes, tasksRes] = await Promise.all([
        client.get('/mentor/interns'),
        client.get(filterInternId ? `/mentor/tasks?internId=${filterInternId}` : '/mentor/tasks'),
      ]);
      setInterns(internsRes.data);
      setTasks(tasksRes.data);
    } catch {} finally { setLoading(false); }
  }, [filterInternId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [internsRes, tasksRes] = await Promise.all([
          client.get('/mentor/interns'),
          client.get(filterInternId ? `/mentor/tasks?internId=${filterInternId}` : '/mentor/tasks'),
        ]);
        if (!cancelled) { setInterns(internsRes.data); setTasks(tasksRes.data); }
      } catch {} finally { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [filterInternId]);

  const assignTask = async () => {
    if (!selectedIntern || !form.title || !form.description) {
      showToast('Select an intern, and fill in the title and description.', 'error'); return;
    }
    setAssigning(true);
    try {
      await client.post('/mentor/tasks', {
        internId: selectedIntern.id, ...form,
        deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
      });
      showToast(`Task assigned to ${selectedIntern.fullName}.`, 'success');
      setShowModal(false);
      setForm({title:'', description:'', deadline:''});
      setSelectedIntern(null);
      fetchData();
    } catch (e) {
      showToast(e.response?.data?.message || "Couldn't assign the task. Try again.", 'error');
    } finally { setAssigning(false); }
  };

  const openDetail = t => {
    setDetailTask(t);
    setEditForm({
      title: t.title || '',
      description: t.description || '',
      deadline: t.deadline ? new Date(t.deadline).toISOString().slice(0, 10) : '',
    });
  };

  const saveTask = async () => {
    if (!editForm.title.trim() || !editForm.description.trim()) {
      showToast('Title and description are required.', 'error'); return;
    }
    setSavingEdit(true);
    try {
      await client.patch(`/mentor/tasks/${detailTask.id}`, {
        title: editForm.title.trim(),
        description: editForm.description.trim(),
        deadline: editForm.deadline ? new Date(editForm.deadline).toISOString() : null,
      });
      showToast('Task updated and intern notified.', 'success');
      setDetailTask(null);
      fetchData();
    } catch (e) {
      showToast(e.response?.data?.message || "Couldn't update the task. Try again.", 'error');
    } finally { setSavingEdit(false); }
  };

  const statusColors = {Pending:colors.warning, InProgress:colors.info, Completed:colors.success, Overdue:colors.error};
  const STATUS_CHIPS = [ {key:'All'}, {key:'Pending'}, {key:'InProgress'}, {key:'Completed'}, {key:'Overdue'} ];
  const visibleTasks = filterStatus === 'All' ? tasks : tasks.filter(t => t.status === filterStatus);

  return (
    <ScreenBackground style={styles.container}>
      <AppHeader
        home
        title="Assign Tasks"
        right={(
          <TouchableOpacity id="assign-task-btn" style={styles.addBtn} onPress={() => setShowModal(true)}>
            <Icon name="plus" size={15} color="#fff" />
            <Text style={styles.addBtnText}>Assign Task</Text>
          </TouchableOpacity>
        )}
      />

      {loading ? <Spinner style={styles.center} /> : (
        <ScrollView contentContainerStyle={{paddingBottom: 100, flexGrow: 1}}>
          {/* Status filter */}
          <FilterChips
            compact
            idPrefix="task-status"
            options={STATUS_CHIPS.map(s => ({key: s.key, label: s.key, color: s.key === 'All' ? colors.primary : statusColors[s.key]}))}
            value={filterStatus}
            onChange={setFilterStatus}
          />

          {/* Intern filter */}
          <View style={styles.filterWrap}>
            <Dropdown
              compact
              id="task-intern-filter"
              value={filterInternId ?? null}
              options={[{value: null, label: 'All Interns'}, ...interns.map(i => ({value: i.id, label: i.fullName}))]}
              onChange={id => setFilterInternId(id)}
              placeholder="Intern"
            />
          </View>
          {visibleTasks.length === 0 && (
            <View style={styles.emptyBox}><Text style={styles.emptyText}>No {filterStatus === 'All' ? '' : filterStatus.toLowerCase() + ' '}tasks{filterInternId ? ' for this intern' : ''}</Text></View>
          )}
          {visibleTasks.map(t => (
            <TouchableOpacity key={t.id} id={`task-card-${t.id}`} style={styles.taskCard} onPress={() => openDetail(t)}>
              <View style={styles.taskHeader}>
                <Text style={styles.taskTitle}>{t.title}</Text>
                <View style={[styles.statusBadge, {backgroundColor:(statusColors[t.status]||colors.text)+'22'}]}>
                  <Text style={[styles.statusText, {color:statusColors[t.status]||colors.text}]}>{t.status}</Text>
                </View>
              </View>
              <View style={styles.taskHeaderRow}>
                <Icon name="user" size={14} color={colors.textAccent} />
                <Text style={styles.internName}>{t.internName}</Text>
              </View>
              <Text style={styles.taskDesc}>{t.description}</Text>
              {t.deadline && (
                <View style={styles.deadlineRow}>
                  <Icon name="calendar" size={13} color={colors.warning} />
                  <Text style={styles.deadline}>{new Date(t.deadline).toLocaleDateString()}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <SwipeableModal visible={showModal} transparent overlayStyle={styles.modalOverlay} sheetStyle={styles.modalContent} scrollable={false} onRequestClose={() => setShowModal(false)}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Assign Task</Text>
              <View style={styles.formField}>
                <Dropdown
                  label="Select Intern *"
                  id="assign-task-intern"
                  inline
                  value={selectedIntern?.id ?? null}
                  options={interns.map(i => ({value: i.id, label: i.fullName}))}
                  onChange={id => setSelectedIntern(interns.find(i => i.id === id) || null)}
                  placeholder="Select an intern"
                />
              </View>
              {[
                {key:'title', label:'Task Title *', placeholder:'Design landing page'},
                {key:'description', label:'Description *', placeholder:'Detailed task description...', multi:true},
                {key:'deadline', label:'Deadline (YYYY-MM-DD)', placeholder:'2026-08-30'},
              ].map(f => (
                <View key={f.key} style={styles.formField}>
                  <Text style={styles.fieldLabel}>{f.label}</Text>
                  {f.key === 'deadline' ? (
                    <DateField
                      value={form.deadline}
                      onChange={d => setForm(p => ({...p, deadline: d ? d.toISOString().slice(0,10) : ''}))}
                      placeholder="2026-08-30"
                    />
                  ) : (
                    <TextInput
                      id={`task-${f.key}`}
                      style={[styles.fieldInput, f.multi && styles.textArea]}
                      placeholder={f.placeholder}
                      placeholderTextColor={colors.textMuted}
                      multiline={f.multi}
                      numberOfLines={f.multi ? 3 : 1}
                      autoCapitalize="none"
                      value={form[f.key]}
                      onChangeText={v => setForm(p => ({...p, [f.key]:v}))}
                    />
                  )}
                </View>
              ))}
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity id="assign-task-submit" style={styles.createBtn} onPress={assignTask} disabled={assigning}>
                  {assigning ? <ActivityIndicator color="#fff"/> : <Text style={styles.createBtnText}>Assign</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
      </SwipeableModal>

      {/* Task Detail / Edit Modal */}
      <SwipeableModal visible={!!detailTask} transparent overlayStyle={styles.modalOverlay} sheetStyle={styles.modalContent} scrollable={false} onRequestClose={() => setDetailTask(null)}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.detailHeader}>
                <Text style={styles.modalTitle}>Task Details</Text>
                <TouchableOpacity onPress={() => setDetailTask(null)}><Icon name="close" size={18} color={colors.textSecondary} /></TouchableOpacity>
              </View>
              <View style={[styles.statusBadge, {backgroundColor:(statusColors[detailTask?.status]||colors.text)+'22', alignSelf:'flex-start', marginBottom:12}]}>
                <Text style={[styles.statusText, {color:statusColors[detailTask?.status]||colors.text}]}>{detailTask?.status}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Assigned To</Text>
                <Text style={styles.detailValue}>{detailTask?.internName}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Created At</Text>
                <Text style={styles.detailValue}>{detailTask?.createdAt ? new Date(detailTask.createdAt).toLocaleString() : '—'}</Text>
              </View>
              {detailTask?.completedAt && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Completed At</Text>
                  <Text style={styles.detailValue}>{new Date(detailTask.completedAt).toLocaleString()}</Text>
                </View>
              )}
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Title *</Text>
                <TextInput
                  id="task-edit-title"
                  style={styles.fieldInput}
                  value={editForm.title}
                  onChangeText={v => setEditForm(f => ({...f, title: v}))}
                />
              </View>
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Description *</Text>
                <TextInput
                  id="task-edit-desc"
                  style={[styles.fieldInput, styles.textArea]}
                  multiline
                  numberOfLines={4}
                  value={editForm.description}
                  onChangeText={v => setEditForm(f => ({...f, description: v}))}
                />
              </View>
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Deadline (YYYY-MM-DD)</Text>
                <DateField
                  value={editForm.deadline}
                  onChange={d => setEditForm(f => ({...f, deadline: d ? d.toISOString().slice(0,10) : ''}))}
                  placeholder="2026-08-30"
                />
              </View>
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setDetailTask(null)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity id="task-edit-save" style={styles.createBtn} onPress={saveTask} disabled={savingEdit}>
                  {savingEdit ? <ActivityIndicator color="#fff"/> : <Text style={styles.createBtnText}>Save Changes</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
      </SwipeableModal>
    </ScreenBackground>
  );
}

const makeStyles = colors => StyleSheet.create({
  container:{flex:1},
  center:{flex:1, justifyContent:'center', alignItems:'center'},
  emptyBox:{alignItems:'center', paddingVertical:40},
  emptyText:{color:colors.textSecondary, fontSize:14},
  addBtn:{flexDirection:'row', alignItems:'center', gap:5, backgroundColor:'rgba(255,255,255,0.18)', borderRadius:16, paddingHorizontal:10, paddingVertical:6},
  addBtnText:{color:'#fff', fontWeight:'700', fontSize:12, marginBottom:0},
  filterWrap:{paddingHorizontal:16, paddingVertical:12},
  taskCard:{backgroundColor:colors.surface, margin:12, marginBottom:4, borderRadius:14, padding:14, borderWidth:1, borderColor:colors.border},
  taskHeader:{flexDirection:'row', justifyContent:'space-between', marginBottom:4},
  taskTitle:{color:colors.text, fontSize:15, fontWeight:'700', flex:1, marginRight:8},
  statusBadge:{borderRadius:6, paddingHorizontal:8, paddingVertical:4},
  statusText:{fontSize:11, fontWeight:'700'},
  taskHeaderRow:{flexDirection:'row', alignItems:'center', gap:5, marginBottom:4},
  internName:{color:colors.textSecondary, fontSize:13, fontWeight:'600'},
  taskDesc:{color:colors.textSecondary, fontSize:13},
  deadlineRow:{flexDirection:'row', alignItems:'center', gap:5, marginTop:4},
  deadline:{color:colors.warning, fontSize:12},
  detailHeader:{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:4},
  detailRow:{flexDirection:'row', justifyContent:'space-between', paddingVertical:10, borderTopWidth:1, borderTopColor:colors.border, marginBottom:12},
  detailLabel:{color:colors.textSecondary, fontSize:13},
  detailValue:{color:colors.text, fontSize:13, fontWeight:'600'},
  // Modal
  modalOverlay:{flex:1, backgroundColor:'rgba(0,0,0,0.7)', justifyContent:'flex-end'},
  modalContent:{backgroundColor:colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, padding:24, maxHeight:'88%'},
  modalTitle:{color:colors.text, fontSize:18, fontWeight:'700', marginBottom:16},
  fieldLabel:{color:colors.textSecondary, fontSize:12, fontWeight:'600', marginBottom:6},
  formField:{marginBottom:12},
  fieldInput:{backgroundColor:colors.card, borderRadius:10, borderWidth:1, borderColor:colors.border, color:colors.text, paddingHorizontal:14, paddingVertical:12, fontSize:14},
  textArea:{height:80, textAlignVertical:'top'},
  modalActions:{flexDirection:'row', gap:12, marginTop:8},
  cancelBtn:{flex:1, backgroundColor:colors.card, borderRadius:12, paddingVertical:14, alignItems:'center', borderWidth:1, borderColor:colors.border},
  cancelBtnText:{color:colors.textSecondary, fontWeight:'600'},
  createBtn:{flex:1, backgroundColor:colors.primary, borderRadius:12, paddingVertical:14, alignItems:'center'},
  createBtnText:{color:'#fff', fontWeight:'700'},
});

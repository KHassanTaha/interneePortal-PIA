import React, {useState, useEffect, useMemo} from 'react';
import {View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, TextInput} from 'react-native';
import client from '../../api/client';
import {showToast} from '../../components/AppToast';
import {showConfirm} from '../../components/AppConfirm';
import {useAppTheme} from '../../theme';
import ScreenBackground from '../../components/ScreenBackground';
import FilterChips from '../../components/FilterChips';
import AppHeader from '../../components/AppHeader';
import RightSidebar from '../../components/RightSidebar';
import GradientButton from '../../components/GradientButton';
import Icon from '../../components/Icon';
import Spinner from '../../components/Spinner';
import DateField from '../../components/DateField';

export default function TasksScreen({navigation}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('All');
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [kwInput, setKwInput] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const toDateStr = d => {
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const fetchTasks = async () => {
    try {
      const params = new URLSearchParams();
      if (activeFilter !== 'All') params.set('status', activeFilter);
      if (keyword.trim()) params.set('keyword', keyword.trim());
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      const res = await client.get(`/intern/tasks?${params.toString()}`);
      setTasks(res.data);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => {
    let cancelled = false;
    const loadTasks = async () => {
      try {
        const params = new URLSearchParams();
        if (activeFilter !== 'All') params.set('status', activeFilter);
        if (keyword.trim()) params.set('keyword', keyword.trim());
        if (fromDate) params.set('from', fromDate);
        if (toDate) params.set('to', toDate);
        const res = await client.get(`/intern/tasks?${params.toString()}`);
        if (!cancelled) setTasks(res.data);
      } catch {} finally { if (!cancelled) { setLoading(false); setRefreshing(false); } }
    };
    loadTasks();
    return () => { cancelled = true; };
  }, [activeFilter, keyword, fromDate, toDate]);

  const completeTask = async (task) => {
    showConfirm({
      title: 'Complete task',
      message: `Mark "${task.title}" as completed?`,
      confirmText: 'Complete',
    }).then(async ok => {
      if (!ok) return;
      try {
        await client.patch(`/intern/tasks/${task.id}/complete`);
        fetchTasks();
      } catch { showToast("Couldn't update the task. Try again.", 'error'); }
    });
  };

  const statusColors = {Pending: colors.warning, InProgress: colors.accent, Completed: colors.success, Overdue: colors.error};
  const filters = ['All', 'Pending', 'InProgress', 'Overdue', 'Completed'];

  return (
    <ScreenBackground style={styles.container}>
      <AppHeader
        home
        title="Tasks"
        right={(
          <TouchableOpacity id="tasks-menu-btn" onPress={() => setSidebarVisible(true)} style={styles.menuBtn}>
            <Icon name="menu" size={22} color="#fff" />
          </TouchableOpacity>
        )}
      />

      <RightSidebar
        visible={sidebarVisible}
        onClose={() => setSidebarVisible(false)}
        navigation={navigation}
      />
      {loading ? <Spinner style={styles.center} /> : (
        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchTasks();}} tintColor={colors.primary}/>}>
          <FilterChips
            idPrefix="task-filter"
            compact
            options={filters.map(f => ({key: f, label: f, color: statusColors[f] || colors.primary}))}
            value={activeFilter}
            onChange={f => {setActiveFilter(f); setLoading(true);}}
          />
          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <Icon name="search" size={16} color={colors.textMuted} />
              <TextInput
                id="task-search-input"
                style={styles.searchInput}
                placeholder="Search tasks..."
                placeholderTextColor={colors.textMuted}
                value={kwInput}
                onChangeText={setKwInput}
                returnKeyType="search"
                onSubmitEditing={() => setKeyword(kwInput.trim())}
              />
              {kwInput.length > 0 && (
                <TouchableOpacity id="task-search-clear" onPress={() => { setKwInput(''); setKeyword(''); }} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                  <Icon name="close" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.dateRow}>
              <DateField value={fromDate} onChange={d => setFromDate(toDateStr(d))} placeholder="From" containerStyle={styles.dateField} />
              <DateField value={toDate} onChange={d => setToDate(toDateStr(d))} placeholder="To" containerStyle={styles.dateField} />
            </View>
          </View>
          {tasks.length === 0 ? (
            <View style={styles.emptyBox}><Icon name="check" size={48} color={colors.success} /><Text style={styles.emptyText}>{activeFilter === 'All' ? 'No tasks found' : `No ${activeFilter.toLowerCase()} tasks`}</Text></View>
          ) : tasks.map(t => (
            <View key={t.id} style={styles.taskCard}>
              <View style={styles.taskHeader}>
                <Text style={styles.taskTitle}>{t.title}</Text>
                <View style={[styles.statusBadge, {backgroundColor:(statusColors[t.status]||colors.text)+'22'}]}>
                  <Text style={[styles.statusText, {color:statusColors[t.status]||colors.text}]}>{t.status}</Text>
                </View>
              </View>
              <Text style={styles.taskDesc}>{t.description}</Text>
              {t.deadline && (
                <View style={styles.deadlineRow}>
                  <Icon name="calendar" size={13} color={colors.warning} />
                  <Text style={styles.taskDeadline}>Due: {new Date(t.deadline).toLocaleDateString()}</Text>
                </View>
              )}
              {t.status === 'Pending' && (
                <GradientButton
                  id={`complete-task-${t.id}`}
                  style={styles.completeBtn}
                  onPress={() => completeTask(t)}
                  icon={<Icon name="check" size={15} color="#fff" />}>
                  <Text style={styles.completeBtnText}>Mark Complete</Text>
                </GradientButton>
              )}
            </View>
          ))}
        </ScrollView>
      )}
    </ScreenBackground>
  );
}

const makeStyles = colors => StyleSheet.create({
  container:{flex:1},
  center:{flex:1, justifyContent:'center', alignItems:'center'},
  menuBtn: {width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', justifyContent: 'center', alignItems: 'center'},
  emptyBox:{alignItems:'center', paddingVertical:60},
  emptyText:{color:colors.textSecondary, fontSize:16},
  taskCard:{backgroundColor:colors.surface, margin:12, marginBottom:4, borderRadius:16, padding:16, borderWidth:1, borderColor:colors.border},
  taskHeader:{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8},
  taskTitle:{color:colors.text, fontSize:15, fontWeight:'700', flex:1, marginRight:8},
  statusBadge:{borderRadius:6, paddingHorizontal:8, paddingVertical:4},
  statusText:{fontSize:11, fontWeight:'700'},
  taskDesc:{color:colors.textSecondary, fontSize:13, marginBottom:8},
  deadlineRow:{flexDirection:'row', alignItems:'center', gap:5, marginBottom:8},
  taskDeadline:{color:colors.warning, fontSize:12},
  completeBtn:{borderRadius:10, marginTop:2},
  completeBtnText:{color:'#fff', fontWeight:'700'},
  searchRow:{paddingHorizontal:16, marginTop:12, marginBottom:10, gap:8},
  searchBox:{flexDirection:'row', alignItems:'center', gap:8, backgroundColor:colors.card, borderRadius:10, borderWidth:1, borderColor:colors.border, paddingHorizontal:12, paddingVertical:10},
  searchInput:{flex:1, color:colors.text, fontSize:14, padding:0},
  dateRow:{flexDirection:'row', gap:10},
  dateField:{flex:1},
});

import React, {useState, useEffect, useMemo} from 'react';
import {View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl} from 'react-native';
import client from '../../api/client';
import {showToast} from '../../components/AppToast';
import {useAppTheme} from '../../theme';
import ScreenBackground from '../../components/ScreenBackground';
import AppHeader from '../../components/AppHeader';
import Dropdown from '../../components/Dropdown';
import DateField from '../../components/DateField';
import ActivityCard from '../../components/ActivityCard';
import {logTypeColors, logFallbackColor, LOG_TYPES} from '../../utils/logTypes';
import Spinner from '../../components/Spinner';
import LogDetailModal from '../../components/LogDetailModal';
import EndOfListMarker from '../../components/EndOfListMarker';

export default function ActivityLogsScreen({navigation}) {
  const {colors, isDark} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const [logs, setLogs] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selectedDept, setSelectedDept] = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const [dateFilter, setDateFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [detailLog, setDetailLog] = useState(null);

  const fetchLogsStandalone = async (p = 1, reset = false) => {
    try {
      const params = new URLSearchParams({page:p, pageSize:20});
      if (selectedDept) params.append('departmentId', selectedDept);
      if (selectedType) params.append('logType', selectedType);
      if (dateFilter) {
        params.append('from', `${dateFilter}T00:00:00`);
        params.append('to', `${dateFilter}T23:59:59`);
      }
      const res = await client.get(`/admin/logs?${params}`);
      if (reset) setLogs(res.data.logs);
      else setLogs(prev => p === 1 ? res.data.logs : [...prev, ...res.data.logs]);
      setTotal(res.data.total);
    } catch { showToast("Couldn't load activity logs. Check your connection and try again.", 'error'); }
    finally { setLoading(false); setRefreshing(false); }
  };

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

  useEffect(() => {
    let cancelled = false;
    const fetchLogs = async (p = 1, reset = false) => {
      try {
        const params = new URLSearchParams({page:p, pageSize:20});
        if (selectedDept) params.append('departmentId', selectedDept);
        if (selectedType) params.append('logType', selectedType);
        if (dateFilter) {
          params.append('from', `${dateFilter}T00:00:00`);
          params.append('to', `${dateFilter}T23:59:59`);
        }
        const res = await client.get(`/admin/logs?${params}`);
        if (!cancelled) {
          if (reset) setLogs(res.data.logs);
          else setLogs(prev => p === 1 ? res.data.logs : [...prev, ...res.data.logs]);
          setTotal(res.data.total);
        }
      } catch { if (!cancelled) showToast("Couldn't load activity logs. Check your connection and try again.", 'error'); }
      finally { if (!cancelled) { setLoading(false); setRefreshing(false); } }
    };
    setPage(1); setLoading(true); fetchLogs(1, true);
    return () => { cancelled = true; };
  }, [selectedDept, selectedType, dateFilter]);



  const logTypes = LOG_TYPES;

  return (
    <ScreenBackground style={styles.container}>
      <AppHeader hideTitle home title="Activity Logs" right={<Text style={styles.total}>{total} records</Text>} />

      {loading ? <Spinner style={styles.center} /> : (
<ScrollView
          contentContainerStyle={{paddingBottom: 24}}
          onScroll={({nativeEvent}) => {
            const {layoutMeasurement, contentOffset, contentSize} = nativeEvent;
            if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 50 && logs.length < total) {
              const nextPage = page + 1;
              setPage(nextPage);
              fetchLogsStandalone(nextPage);
            }
          }}
          scrollEventThrottle={400}>
          <View style={styles.filters}>
            <Dropdown
              id="log-dept"
              compact
              placeholder="Department"
              clearable
              onClear={() => setSelectedDept(null)}
              value={selectedDept}
              onChange={v => setSelectedDept(v)}
              options={[{value: null, label: 'All Departments'}, ...departments.map(d => ({value: d.id, label: d.name}))]}
            />
          </View>
          <View style={styles.filters}>
            <Dropdown
              id="log-type"
              compact
              placeholder="Type"
              value={selectedType}
              onChange={v => setSelectedType(v)}
              options={[{value: null, label: 'All Types'}, ...logTypes.map(t => ({value: t, label: t.replace(/([A-Z])/g, ' $1').trim()}))]}
              style={{flex: 1}}
            />
            <DateField
              value={dateFilter || ''}
              onChange={d => setDateFilter(d ? d.toISOString().split('T')[0] : '')}
              placeholder="All dates"
              containerStyle={{flex: 1}}
            />
          </View>
          {logs.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No activity logs found</Text>
            </View>
          ) : logs.map((log, i) => (
            <ActivityCard
              key={log.id}
              id={`log-card-${log.id}`}
              log={log}
              color={logTypeColors(colors, isDark)[log.logType] || logFallbackColor(colors, isDark)}
              showLine={i < logs.length - 1}
              onPress={() => setDetailLog(log)}
            />
          ))}
          {logs.length < total && <ActivityIndicator color={colors.textAccent} style={{marginVertical: 16}}/>}
          {logs.length >= total && logs.length > 0 && <EndOfListMarker />}
        </ScrollView>
      )}

      <LogDetailModal
        log={detailLog}
        typeColor={detailLog ? (logTypeColors(colors, isDark)[detailLog.logType] || logFallbackColor(colors, isDark)) : null}
        onClose={() => setDetailLog(null)}
      />
    </ScreenBackground>
  );
}

const makeStyles = (colors, isDark) => StyleSheet.create({
  container: {flex: 1},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  total: {color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '600'},
  filters: {flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginBottom: 12},
  emptyBox: {alignItems: 'center', paddingVertical: 60},
  emptyText: {color: colors.textSecondary, fontSize: 15},
});

import React, {useCallback, useState, useMemo} from 'react';
import {View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, RefreshControl} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import client from '../../api/client';
import {showToast} from '../../components/AppToast';
import {moderate, queuedToast} from '../../api/moderate';
import {useAppTheme} from '../../theme';
import ScreenBackground from '../../components/ScreenBackground';
import AppHeader from '../../components/AppHeader';
import Icon from '../../components/Icon';
import Spinner from '../../components/Spinner';
import EndOfListMarker from '../../components/EndOfListMarker';
import RightSidebar from '../../components/RightSidebar';

const STATUS_COLORS = {Pending: '#f59e0b', Accepted: '#22c55e', Rejected: '#ef4444'};

export default function ShiftChangeScreen({navigation}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  const fetchData = async () => {
    try {
      const res = await client.get('/intern/shift-change');
      setRequests(res.data);
    } catch { showToast("Couldn't load data.", 'error'); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    const loadData = async () => {
      try {
        const res = await client.get('/intern/shift-change');
        if (!cancelled) setRequests(res.data);
      } catch { if (!cancelled) showToast("Couldn't load data.", 'error'); }
      finally { if (!cancelled) { setLoading(false); setRefreshing(false); } }
    };
    loadData();
    return () => { cancelled = true; };
  }, []));

  const accept = async (id) => {
    setActionLoading(id);
    try { const {queued} = await moderate({kind: 'intern', label: 'Accept shift change', method: 'POST', url: `/intern/shift-change/${id}/accept`, entityKey: `shiftChange:${id}`}); queuedToast(queued, 'Shift change accepted.'); fetchData(); }
    catch (e) { showToast(e.response?.data?.message || 'Failed.', 'error'); }
    finally { setActionLoading(null); }
  };

  const reject = async (id) => {
    setActionLoading(id);
    try { const {queued} = await moderate({kind: 'intern', label: 'Reject shift change', method: 'POST', url: `/intern/shift-change/${id}/reject`, entityKey: `shiftChange:${id}`}); queuedToast(queued, 'Shift change rejected.'); fetchData(); }
    catch (e) { showToast(e.response?.data?.message || 'Failed.', 'error'); }
    finally { setActionLoading(null); }
  };

  if (loading) return <Spinner style={styles.center} />;

  return (
    <ScreenBackground style={styles.container}>
      <AppHeader
        right={<TouchableOpacity style={styles.menuBtn} onPress={() => setSidebarVisible(true)}><Icon name="menu" size={22} color="#fff" /></TouchableOpacity>}
      />
      <RightSidebar visible={sidebarVisible} onClose={() => setSidebarVisible(false)} navigation={navigation} />

      <ScrollView contentContainerStyle={{paddingBottom:100, flexGrow:1}} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchData();}} tintColor={colors.primary}/>}>
        {requests.length === 0 ? (
          <View style={styles.emptyBox}><Icon name="clock" size={44} color={colors.textMuted} /><Text style={styles.emptyText}>No shift change requests</Text></View>
        ) : requests.map(r => {
          const canRespond = r.status === 'Pending';
          return (
            <View key={r.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Shift Change Request</Text>
                <View style={[styles.statusBadge, {backgroundColor: (STATUS_COLORS[r.status] || colors.text) + '22'}]}>
                  <Text style={[styles.statusText, {color: STATUS_COLORS[r.status] || colors.text}]}>{r.status}</Text>
                </View>
              </View>
              <Text style={styles.cardSub}>{r.fromShift} → {r.toShift}</Text>
              {r.notes && <Text style={styles.noteText}>Note: {r.notes}</Text>}
              {canRespond && (
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.acceptBtn} onPress={() => accept(r.id)} disabled={actionLoading === r.id}>
                    {actionLoading === r.id ? <ActivityIndicator color={colors.success} size="small" /> : <><Icon name="check" size={14} color={colors.success} /><Text style={styles.acceptBtnText}>Accept</Text></>}
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.rejectBtn} onPress={() => reject(r.id)} disabled={actionLoading === r.id}>
                    <Icon name="close" size={14} color={colors.error} /><Text style={styles.rejectBtnText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
        {requests.length > 0 && <EndOfListMarker />}
      </ScrollView>
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
  cardSub:{color:colors.textSecondary, fontSize:13, marginBottom:8},
  noteText:{color:colors.textSecondary, fontSize:12, fontStyle:'italic', marginBottom:4},
  actions:{flexDirection:'row', gap:10, marginTop:4},
  acceptBtn:{flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, borderRadius:10, paddingVertical:10, backgroundColor:colors.success+'18', borderWidth:1, borderColor:colors.success+'44'},
  acceptBtnText:{color:colors.success, fontWeight:'700', fontSize:13},
  rejectBtn:{flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, borderRadius:10, paddingVertical:10, backgroundColor:colors.error+'18', borderWidth:1, borderColor:colors.error+'44'},
  rejectBtnText:{color:colors.error, fontWeight:'700', fontSize:13},
});

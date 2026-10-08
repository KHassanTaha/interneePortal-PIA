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
import FilterChips from '../../components/FilterChips';
import RightSidebar from '../../components/RightSidebar';
import {downloadPdf, downloadExcel, shareFile} from '../../utils/reportHelpers';

const STATUS_COLORS = {Pending: '#f59e0b', Endorsed: '#3b82f6', InternAccepted: '#8b5cf6', Finalised: '#22c55e', Rejected: '#ef4444'};
const STATUS_FILTERS = ['All', 'Pending', 'Endorsed', 'InternAccepted', 'Finalised', 'Rejected'];

export default function InternTransfersScreen({navigation}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [statusFilter, setStatusFilter] = useState('All');

  const fetchData = async () => {
    try { const res = await client.get('/intern/transfers'); setTransfers(res.data); }
    catch { showToast("Couldn't load transfers.", 'error'); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    const loadData = async () => {
      try { const res = await client.get('/intern/transfers'); if (!cancelled) setTransfers(res.data); }
      catch { if (!cancelled) showToast("Couldn't load transfers.", 'error'); }
      finally { if (!cancelled) { setLoading(false); setRefreshing(false); } }
    };
    loadData();
    return () => { cancelled = true; };
  }, []));

  const accept = async (id) => {
    setActionLoading(id);
    try { const {queued} = await moderate({kind: 'intern', label: 'Accept transfer', method: 'POST', url: `/intern/transfers/${id}/accept`, entityKey: `transfer:${id}`}); queuedToast(queued, 'Transfer accepted.'); fetchData(); }
    catch (e) { showToast(e.response?.data?.message || 'Failed.', 'error'); }
    finally { setActionLoading(null); }
  };

  const reject = async (id) => {
    setActionLoading(id);
    try { const {queued} = await moderate({kind: 'intern', label: 'Reject transfer', method: 'POST', url: `/intern/transfers/${id}/reject`, body: {reason: 'Rejected by intern'}, entityKey: `transfer:${id}`}); queuedToast(queued, 'Transfer rejected.'); fetchData(); }
    catch (e) { showToast(e.response?.data?.message || 'Failed.', 'error'); }
    finally { setActionLoading(null); }
  };

  const exportReport = async (type) => {
    try {
      if (type === 'pdf') {
        const path = await downloadPdf('my-transfers', '/intern/reports/transfers');
        await shareFile(path, 'application/pdf');
      } else {
        const path = await downloadExcel('/intern/reports/transfers');
        await shareFile(path, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      }
    } catch { showToast('Report export failed.', 'error'); }
  };

  const visibleTransfers = statusFilter === 'All' ? transfers : transfers.filter(t => t.status === statusFilter);

  if (loading) return <Spinner style={styles.center} />;

  return (
    <ScreenBackground style={styles.container}>
      <AppHeader
        onBack={() => navigation.goBack()}
        right={<TouchableOpacity accessibilityRole="button" accessibilityLabel="Open navigation menu" style={styles.menuBtn} onPress={() => setSidebarVisible(true)}><Icon name="menu" size={22} color="#fff" /></TouchableOpacity>}
      />
      <RightSidebar visible={sidebarVisible} onClose={() => setSidebarVisible(false)} navigation={navigation} />
      <ScrollView contentContainerStyle={{paddingBottom:100, flexGrow:1}} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchData();}} tintColor={colors.primary}/>}>
        <View style={styles.exportRow}>
          <TouchableOpacity id="transfers-export-pdf" style={styles.exportBtn} onPress={() => exportReport('pdf')}>
            <Icon name="file" size={14} color={colors.textAccent} /><Text style={styles.exportText}>Export PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity id="transfers-export-excel" style={styles.exportBtn} onPress={() => exportReport('excel')}>
            <Icon name="table" size={14} color={colors.textAccent} /><Text style={styles.exportText}>Export Excel</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.chipsWrap}>
          <FilterChips compact options={STATUS_FILTERS.map(s => ({key: s, label: s}))} value={statusFilter} onChange={setStatusFilter} idPrefix="transfers-status" />
        </View>
        {visibleTransfers.length === 0 ? (
          <View style={styles.emptyBox}><Icon name="transfer" size={44} color={colors.textMuted} /><Text style={styles.emptyText}>{transfers.length === 0 ? 'No transfer requests' : 'No transfers match this status'}</Text></View>
        ) : visibleTransfers.map(t => {
          const canAccept = t.status === 'Endorsed';
          const canReject = t.status === 'Endorsed';
          return (
            <View key={t.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Department Transfer</Text>
                <View style={[styles.statusBadge, {backgroundColor: (STATUS_COLORS[t.status] || colors.text) + '22'}]}>
                  <Text style={[styles.statusText, {color: STATUS_COLORS[t.status] || colors.text}]}>{t.status}</Text>
                </View>
              </View>
              <Text style={styles.cardSub}>Initiated by {t.initiatedBy}</Text>
              <View style={styles.transferFlow}>
                <View style={styles.flowNode}><Text style={styles.flowLabel}>From</Text><Text style={styles.flowValue}>{t.fromMentor}</Text><Text style={styles.flowDept}>{t.fromDepartment}</Text></View>
                <Icon name="transfer" size={16} color={colors.textAccent} />
                <View style={styles.flowNode}><Text style={styles.flowLabel}>To</Text><Text style={styles.flowValue}>{t.toMentor}</Text><Text style={styles.flowDept}>{t.toDepartment}</Text></View>
              </View>
              {t.notes && <Text style={styles.noteText}>Note: {t.notes}</Text>}
              {t.rejectionReason && <Text style={styles.rejectNote}>Rejected: {t.rejectionReason}</Text>}
              {(canAccept || canReject) && (
                <View style={styles.actions}>
                  {canAccept && (
                    <TouchableOpacity style={styles.acceptBtn} onPress={() => accept(t.id)} disabled={actionLoading === t.id}>
                      {actionLoading === t.id ? <ActivityIndicator color={colors.success} size="small" /> : <><Icon name="check" size={14} color={colors.success} /><Text style={styles.acceptBtnText}>Accept</Text></>}
                    </TouchableOpacity>
                  )}
                  {canReject && (
                    <TouchableOpacity style={styles.rejectBtn} onPress={() => reject(t.id)} disabled={actionLoading === t.id}>
                      <Icon name="close" size={14} color={colors.error} /><Text style={styles.rejectBtnText}>Reject</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          );
        })}
        {transfers.length > 0 && <EndOfListMarker />}
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
  cardSub:{color:colors.textMuted, fontSize:12, marginBottom:8},
  transferFlow:{flexDirection:'row', alignItems:'center', justifyContent:'center', gap:12, backgroundColor:colors.card, borderRadius:10, padding:12, marginBottom:8},
  flowNode:{alignItems:'center'}, flowLabel:{color:colors.textMuted, fontSize:10, fontWeight:'600', textTransform:'uppercase'},
  flowValue:{color:colors.text, fontSize:13, fontWeight:'700', marginTop:2},
  flowDept:{color:colors.textMuted, fontSize:11, marginTop:1},
  noteText:{color:colors.textSecondary, fontSize:12, fontStyle:'italic', marginBottom:4},
  rejectNote:{color:colors.error, fontSize:12, fontStyle:'italic', marginBottom:4},
  actions:{flexDirection:'row', gap:10, marginTop:4},
  acceptBtn:{flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, borderRadius:10, paddingVertical:10, backgroundColor:colors.success+'18', borderWidth:1, borderColor:colors.success+'44'},
  acceptBtnText:{color:colors.success, fontWeight:'700', fontSize:13},
  rejectBtn:{flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, borderRadius:10, paddingVertical:10, backgroundColor:colors.error+'18', borderWidth:1, borderColor:colors.error+'44'},
  rejectBtnText:{color:colors.error, fontWeight:'700', fontSize:13},
  exportRow:{flexDirection:'row', gap:10, paddingHorizontal:16, paddingTop:12},
  chipsWrap:{paddingHorizontal:16, paddingTop:10},
  exportBtn:{flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, borderRadius:10, paddingVertical:9, paddingHorizontal:14, backgroundColor:colors.card, borderWidth:1, borderColor:colors.border},
  exportText:{color:colors.textAccent, fontWeight:'700', fontSize:12},
});

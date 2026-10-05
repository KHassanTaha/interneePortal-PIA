import React, {useCallback, useState, useMemo} from 'react';
import {View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, RefreshControl, Modal, TextInput} from 'react-native';
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
import SwipeableModal from '../../components/SwipeableModal';
import FilterChips from '../../components/FilterChips';

const STATUS_COLORS = {Pending: '#f59e0b', Endorsed: '#3b82f6', InternAccepted: '#8b5cf6', Finalised: '#22c55e', Rejected: '#ef4444'};
const STATUS_FILTERS = ['All', 'Pending', 'Endorsed', 'InternAccepted', 'Finalised', 'Rejected'];

export default function MentorInternTransfersScreen({navigation}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [detail, setDetail] = useState(null);
  const [objectionTarget, setObjectionTarget] = useState(null);
  const [objectionReason, setObjectionReason] = useState('');
  const [sendingObjection, setSendingObjection] = useState(false);
  const [statusFilter, setStatusFilter] = useState('All');

  const fetchData = async () => {
    try { const res = await client.get('/mentor/intern-transfers'); setTransfers(res.data); }
    catch { showToast("Couldn't load transfers.", 'error'); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    const load = async () => {
      try { const res = await client.get('/mentor/intern-transfers'); if (!cancelled) setTransfers(res.data); }
      catch { showToast("Couldn't load transfers.", 'error'); }
      finally { if (!cancelled) { setLoading(false); setRefreshing(false); } }
    };
    load();
    return () => { cancelled = true; };
  }, []));

  const endorse = async (id) => {
    setActionLoading(id);
    try { const {queued} = await moderate({kind: 'mentor', label: 'Endorse intern transfer', method: 'POST', url: `/mentor/transfers/${id}/endorse`, entityKey: `transfer:${id}`}); queuedToast(queued, 'Endorsed.'); fetchData(); }
    catch (e) { showToast(e.response?.data?.message || 'Failed.', 'error'); }
    finally { setActionLoading(null); }
  };

  const finalise = async (id) => {
    setActionLoading(id);
    try { await client.post(`/mentor/transfers/${id}/finalise`); showToast('Transfer finalised. Intern moved.', 'success'); fetchData(); }
    catch (e) { showToast(e.response?.data?.message || 'Failed.', 'error'); }
    finally { setActionLoading(null); }
  };

  const reject = async (id) => {
    setActionLoading(id);
    try { const {queued} = await moderate({kind: 'mentor', label: 'Reject intern transfer', method: 'POST', url: `/mentor/transfers/${id}/reject`, body: {reason: 'Rejected by mentor'}, entityKey: `transfer:${id}`}); queuedToast(queued, 'Rejected.'); fetchData(); }
    catch (e) { showToast(e.response?.data?.message || 'Failed.', 'error'); }
    finally { setActionLoading(null); }
  };

  const openDetail = t => {
    setDetail(t);
    setObjectionTarget(null);
    setObjectionReason('');
  };

  const submitObjection = async () => {
    if (!objectionTarget) return;
    const reason = objectionReason.trim();
    if (!reason) { showToast('Enter an objection reason.', 'error'); return; }
    setSendingObjection(true);
    try {
      await client.post(`/mentor/transfers/${objectionTarget.id}/objection`, {reason});
      showToast('Objection recorded. Stakeholders notified.', 'success');
      setObjectionTarget(null);
      fetchData();
    } catch (e) { showToast(e.response?.data?.message || 'Failed.', 'error'); }
    finally { setSendingObjection(false); }
  };

  const timeline = t => [
    {label: 'Created', at: t.createdAt},
    {label: 'Endorsed', at: t.endorsedAt},
    {label: 'Intern Accepted', at: t.internAcceptedAt},
    {label: 'Finalised', at: t.finalisedAt},
  ].filter(s => !!s.at).map((s, i) => ({...s, i}));

  if (loading) return <Spinner style={styles.center} />;

  return (
    <ScreenBackground style={styles.container}>
      <AppHeader home title="Intern Transfers" />
      <ScrollView contentContainerStyle={{paddingBottom:100, flexGrow:1}} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchData();}} tintColor={colors.primary}/>}>
        {transfers.length === 0 ? (
          <View style={styles.emptyBox}><Icon name="transfer" size={44} color={colors.textMuted} /><Text style={styles.emptyText}>No intern transfers</Text></View>
        ) : <><View style={styles.chipsWrap}><FilterChips compact options={STATUS_FILTERS.map(s => ({key: s, label: s}))} value={statusFilter} onChange={setStatusFilter} idPrefix="mit-status" /></View>
        {transfers.length > 0 && (statusFilter === 'All' ? transfers : transfers.filter(t => t.status === statusFilter)).length === 0 && (
          <View style={styles.emptyBox}><Text style={styles.emptyText}>No transfers match this status</Text></View>
        )}
        {(statusFilter === 'All' ? transfers : transfers.filter(t => t.status === statusFilter)).map(t => {
          const isFromMentor = t.fromMentorId === t.internId;
          const canEndorse = t.status === 'Pending' && t.initiatedBy === 'Admin';
          const canFinalise = t.status === 'InternAccepted';
          const canReject = t.status === 'Pending' || t.status === 'Endorsed';
          return (
    <View key={t.id} style={styles.card}>
              <TouchableOpacity style={styles.cardTouch} onPress={() => openDetail(t)}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{t.internName}</Text>
                <View style={[styles.statusBadge, {backgroundColor: (STATUS_COLORS[t.status]||colors.text)+'22'}]}>
                  <Text style={[styles.statusText, {color: STATUS_COLORS[t.status]||colors.text}]}>{t.status}</Text>
                </View>
              </View>
              <Text style={styles.cardSub}>Initiated by {t.initiatedBy} • {new Date(t.createdAt).toLocaleDateString()}</Text>
              <View style={styles.transferFlow}>
                <View style={styles.flowNode}><Text style={styles.flowLabel}>From</Text><Text style={styles.flowValue}>{t.fromMentor}</Text><Text style={styles.flowDept}>{t.fromDepartment}</Text></View>
                <Icon name="transfer" size={16} color={colors.textAccent} />
                <View style={styles.flowNode}><Text style={styles.flowLabel}>To</Text><Text style={styles.flowValue}>{t.toMentor}</Text><Text style={styles.flowDept}>{t.toDepartment}</Text></View>
              </View>
              {t.notes && <Text style={styles.noteText}>Note: {t.notes}</Text>}
              {t.rejectionReason && <Text style={styles.rejectNote}>Rejected: {t.rejectionReason}</Text>}
              </TouchableOpacity>
              <View style={styles.actions}>
                {canEndorse && (
                  <TouchableOpacity style={styles.endorseBtn} onPress={() => endorse(t.id)} disabled={actionLoading === t.id}>
                    {actionLoading === t.id ? <ActivityIndicator color={colors.success} size="small" /> : <><Icon name="check" size={14} color={colors.success} /><Text style={styles.endorseBtnText}>Endorse</Text></>}
                  </TouchableOpacity>
                )}
                {canFinalise && (
                  <TouchableOpacity style={styles.endorseBtn} onPress={() => finalise(t.id)} disabled={actionLoading === t.id}>
                    {actionLoading === t.id ? <ActivityIndicator color={colors.textAccent} size="small" /> : <><Icon name="check" size={14} color={colors.textAccent} /><Text style={[styles.endorseBtnText, {color:colors.textAccent}]}>Finalise</Text></>}
                  </TouchableOpacity>
                )}
                {canReject && (
                  <TouchableOpacity style={styles.rejectBtn} onPress={() => reject(t.id)} disabled={actionLoading === t.id}>
                    <Icon name="close" size={14} color={colors.error} /><Text style={styles.rejectBtnText}>Reject</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}</>}
        {transfers.length > 0 && <EndOfListMarker />}
      </ScrollView>

      {/* Transfer Detail */}
      <SwipeableModal visible={!!detail} transparent overlayStyle={styles.modalOverlay} sheetStyle={styles.modalContent} scrollable={false} onRequestClose={() => setDetail(null)}>
            <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.detailHeader}>
              <Text style={styles.modalTitle}>{detail?.internName}</Text>
              <TouchableOpacity onPress={() => setDetail(null)}><Icon name="close" size={18} color={colors.textSecondary} /></TouchableOpacity>
            </View>
            <View style={[styles.statusBadge, {backgroundColor: (STATUS_COLORS[detail?.status]||colors.text)+'22', alignSelf:'flex-start'}]}>
              <Text style={[styles.statusText, {color: STATUS_COLORS[detail?.status]||colors.text}]}>{detail?.status}</Text>
            </View>
            <Text style={styles.detailSub}>Initiated by {detail?.initiatedBy} • {detail?.createdAt ? new Date(detail.createdAt).toLocaleString() : '—'}</Text>

            <View style={styles.transferFlow}>
              <View style={styles.flowNode}><Text style={styles.flowLabel}>From</Text><Text style={styles.flowValue}>{detail?.fromMentor}</Text><Text style={styles.flowDept}>{detail?.fromDepartment}</Text></View>
              <Icon name="transfer" size={16} color={colors.textAccent} />
              <View style={styles.flowNode}><Text style={styles.flowLabel}>To</Text><Text style={styles.flowValue}>{detail?.toMentor}</Text><Text style={styles.flowDept}>{detail?.toDepartment}</Text></View>
            </View>

            {detail?.notes && <Text style={styles.noteText}>Note: {detail.notes}</Text>}
            {detail?.rejectionReason && <Text style={styles.rejectNote}>Rejected: {detail.rejectionReason}</Text>}

            <Text style={styles.sheetTitle}>Timeline</Text>
            {detail && (timeline(detail).length === 0 ? (
              <Text style={styles.emptyHint}>No update events recorded for this transfer.</Text>
            ) : timeline(detail).map(s => (
              <View key={s.i} style={styles.timelineRow}>
                <View style={styles.timelineDot} />
                <Text style={styles.timelineLabel}>{s.label}</Text>
                <Text style={styles.timelineAt}>{new Date(s.at).toLocaleString()}</Text>
              </View>
            )))}

            <View style={styles.detailActions}>
              <TouchableOpacity style={styles.objectBtn} onPress={() => setObjectionTarget(detail)}>
                <Icon name="alert" size={16} color={colors.warning} /><Text style={styles.objectBtnText}>Raise Objection</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setDetail(null)}><Text style={styles.closeBtnText}>Close</Text></TouchableOpacity>
            </View>
            </ScrollView>
      </SwipeableModal>

      {/* Objection Modal */}
      <SwipeableModal visible={!!objectionTarget} transparent overlayStyle={styles.modalOverlay} sheetStyle={styles.modalContent} onRequestClose={() => setObjectionTarget(null)}>
            <Text style={styles.modalTitle}>Raise Objection</Text>
            <Text style={styles.detailSub}>Notify stakeholders about a concern regarding the transfer of {objectionTarget?.internName}.</Text>
            <TextInput
              style={styles.fieldInput}
              multiline
              placeholder="Reason for objection"
              placeholderTextColor={colors.textMuted}
              value={objectionReason}
              onChangeText={setObjectionReason}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setObjectionTarget(null)}><Text style={styles.closeBtnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.objectBtn} onPress={submitObjection} disabled={sendingObjection}>
                {sendingObjection ? <ActivityIndicator size="small" color={colors.warning} /> : <Text style={styles.objectBtnText}>Submit Objection</Text>}
              </TouchableOpacity>
            </View>
      </SwipeableModal>
    </ScreenBackground>
  );
}

const makeStyles = colors => StyleSheet.create({
  container:{flex:1}, center:{flex:1, justifyContent:'center', alignItems:'center'},
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
  chipsWrap:{paddingHorizontal:12, paddingTop:12},
  noteText:{color:colors.textSecondary, fontSize:12, fontStyle:'italic', marginBottom:4},
  rejectNote:{color:colors.error, fontSize:12, fontStyle:'italic', marginBottom:4},
  actions:{flexDirection:'row', gap:10, marginTop:4},
  endorseBtn:{flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, borderRadius:10, paddingVertical:10, backgroundColor:colors.success+'18', borderWidth:1, borderColor:colors.success+'44'},
  endorseBtnText:{color:colors.success, fontWeight:'700', fontSize:13},
  rejectBtn:{flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, borderRadius:10, paddingVertical:10, backgroundColor:colors.error+'18', borderWidth:1, borderColor:colors.error+'44'},
  rejectBtnText:{color:colors.error, fontWeight:'700', fontSize:13},
  cardTouch:{alignSelf:'stretch'},
  modalOverlay:{flex:1, backgroundColor:'rgba(0,0,0,0.7)', justifyContent:'flex-end'},
  modalContent:{backgroundColor:colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, padding:24},
  detailHeader:{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:4},
  modalTitle:{color:colors.text, fontSize:18, fontWeight:'700', marginBottom:2},
  detailSub:{color:colors.textMuted, fontSize:12, marginBottom:4},
  sheetTitle:{color:colors.text, fontSize:14, fontWeight:'700', marginTop:12, marginBottom:8},
  timelineRow:{flexDirection:'row', alignItems:'center', gap:10},
  timelineDot:{width:10, height:10, borderRadius:5, backgroundColor:colors.primary, marginRight:4},
  timelineLabel:{color:colors.text, fontSize:13, flex:1},
  timelineAt:{color:colors.textSecondary, fontSize:11},
  emptyHint:{color:colors.textMuted, fontSize:13},
  detailActions:{flexDirection:'row', gap:10, marginTop:16},
  objectBtn:{flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, borderRadius:10, paddingVertical:12, backgroundColor:colors.warning+'18', borderWidth:1, borderColor:colors.warning+'44'},
  objectBtnText:{color:colors.warning, fontWeight:'700', fontSize:13},
  closeBtn:{flex:1, backgroundColor:colors.card, borderRadius:10, paddingVertical:12, alignItems:'center', borderWidth:1, borderColor:colors.border},
  closeBtnText:{color:colors.textSecondary, fontWeight:'600', fontSize:13},
  modalActions:{flexDirection:'row', gap:10, marginTop:12},
  fieldInput:{backgroundColor:colors.card, borderRadius:10, borderWidth:1, borderColor:colors.border, color:colors.text, minHeight:100, textAlignVertical:'top', padding:12, fontSize:14, marginTop:8},
});

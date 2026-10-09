import React, {useState, useEffect, useMemo, useCallback} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, RefreshControl, Modal, Image, TextInput,
} from 'react-native';
import client from '../../api/client';
import {showToast} from '../../components/AppToast';
import {showConfirm} from '../../components/AppConfirm';
import {moderate, queuedToast} from '../../api/moderate';
import {useAppTheme} from '../../theme';
import ScreenBackground from '../../components/ScreenBackground';
import AppHeader from '../../components/AppHeader';
import Icon from '../../components/Icon';
import InternAvatar from '../../components/InternAvatar';
import Spinner from '../../components/Spinner';
import FilterChips from '../../components/FilterChips';
import CenteredModalCard from '../../components/CenteredModalCard';


const DOC_LABELS = {
  Cnic: 'CNIC',
  UniversityId: 'University ID',
  Resume: 'Resume',
  Noc: 'NOC',
  Report: 'Internship Report',
};

const isImagePath = path => /\.(jpe?g|png)$/i.test(path || '');

const STATUS_TABS = [
  {key: 'Pending', label: 'Pending'},
  {key: 'Approved', label: 'Approved'},
  {key: 'Rejected', label: 'Rejected'},
];

export default function DocumentsApprovalScreen({navigation}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [docs, setDocs] = useState([]);
  const [tab, setTab] = useState('Pending');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState({});
  const [batchApproveLoading, setBatchApproveLoading] = useState(false);
  const [viewerUri, setViewerUri] = useState(null);
  const [rejectDoc, setRejectDoc] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const selectedIds = Object.keys(selected).filter(k => selected[k]);

  const handleBatchApprove = async () => {
    if (selectedIds.length === 0) return;
    setBatchApproveLoading(true);
    let ok = 0;
    try {
      for (const id of selectedIds) {
        try {
          const {queued} = await moderate({kind: 'mentor', label: 'Approve document', method: 'POST', url: `/mentor/documents/${id}/approve`, entityKey: `document:${id}`});
          if (queued) queuedToast(queued, 'Document approved.');
          else ok++;
        } catch {}
      }
      if (ok > 0) showToast(`${ok} document(s) approved.`, 'success');
      setSelected({});
      fetchDocs();
    } finally { setBatchApproveLoading(false); }
  };

  const fetchDocs = async () => {
    try {
      const res = await client.get(`/mentor/documents?status=${tab}`);
      setDocs(res.data);
    } catch { showToast("Couldn't load documents. Check your connection and try again.", 'error'); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const load = async () => {
        try {
          const res = await client.get(`/mentor/documents?status=${tab}`);
          if (!cancelled) setDocs(res.data);
        } catch { showToast("Couldn't load documents. Check your connection and try again.", 'error'); }
        finally { if (!cancelled) { setLoading(false); setRefreshing(false); } }
      };
      load();
      return () => { cancelled = true; };
    }, [tab])
  );

  const viewDocument = doc => {
    if (isImagePath(doc.filePath)) {
      const {fileUrl} = require('../../api/fileClient');
      setViewerUri(fileUrl(doc.filePath));
    } else {
      const {openFileWithAuth} = require('../../api/fileClient');
      openFileWithAuth(doc.filePath).catch(() => showToast("Couldn't open the file. Try again.", 'error'));
    }
  };

  const handleApprove = async doc => {
    const ok = await showConfirm({
      title: 'Approve document',
      message: `Approve ${DOC_LABELS[doc.documentType] || doc.documentType} for ${doc.internName}?`,
      confirmText: 'Approve',
    });
    if (!ok) return;
    try {
      const {queued} = await moderate({kind: 'mentor', label: 'Approve document', method: 'POST', url: `/mentor/documents/${doc.id}/approve`, entityKey: `document:${doc.id}`});
      queuedToast(queued, 'Document approved.');
      fetchDocs();
    } catch (e) { showToast(e.response?.data?.message || "Couldn't approve. Try again.", 'error'); }
  };

  const handleReject = doc => {
    setRejectReason('');
    setRejectDoc(doc);
  };

  const submitReject = async () => {
    if (!rejectReason.trim()) return;
    const doc = rejectDoc;
    try {
      const {queued} = await moderate({kind: 'mentor', label: 'Reject document', method: 'POST', url: `/mentor/documents/${doc.id}/reject`, body: {reason: rejectReason.trim()}, entityKey: `document:${doc.id}`});
      queuedToast(queued, 'Document rejected.');
      setRejectDoc(null);
      setRejectReason('');
      fetchDocs();
    } catch { showToast("Couldn't reject. Try again.", 'error'); }
  };

  const handleDelete = async doc => {
    const ok = await showConfirm({
      title: 'Delete document',
      message: `Delete ${DOC_LABELS[doc.documentType] || doc.documentType} for ${doc.internName}? This lets the intern re-upload.`,
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await client.delete(`/mentor/documents/${doc.id}`);
      showToast('Document deleted.', 'success');
      fetchDocs();
    } catch { showToast("Couldn't delete. Try again.", 'error'); }
  };

  if (loading) return <Spinner style={styles.center} />;

  return (
    <ScreenBackground style={styles.container}>
      <AppHeader home title="Documents" />
      <ScrollView
        contentContainerStyle={{paddingBottom: 100, flexGrow: 1}}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchDocs();}} tintColor={colors.primary}/>}>
        <View style={{paddingTop: 12}}>
          <FilterChips
            compact
            idPrefix="tab"
            options={STATUS_TABS.map(t => ({key: t.key, label: t.label}))}
            value={tab}
            onChange={t => { setTab(t); setSelected({}); setLoading(true); }}
          />
        </View>

        {tab === 'Pending' && selectedIds.length > 0 && (
          <View style={styles.batchBar}>
            <Text style={styles.batchBarText}>{selectedIds.length} selected</Text>
            <TouchableOpacity style={styles.batchClear} onPress={() => setSelected({})} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Icon name="close" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity id="approve-selected-docs" style={styles.batchApprove} onPress={handleBatchApprove} disabled={batchApproveLoading}>
              {batchApproveLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.batchApproveText}>Approve Selected</Text>}
            </TouchableOpacity>
          </View>
        )}

        {docs.length === 0 ? (
          <View style={styles.emptyBox}>
            <Icon name="folder" size={40} color={colors.textMuted} />
            <Text style={styles.emptyText}>No {tab.toLowerCase()} documents</Text>
          </View>
        ) : docs.map(item => (
          <View key={item.id} style={styles.requestCard}>
            <View style={styles.cardTop}>
              {item.status === 'Pending' && (
                <TouchableOpacity
                  id={`select-doc-${item.id}`}
                  style={[styles.checkbox, selected[item.id] && styles.checkboxOn]}
                  onPress={() => setSelected(p => ({...p, [item.id]: !p[item.id]}))}>
                  {selected[item.id] && <Icon name="check" size={15} color="#fff" />}
                </TouchableOpacity>
              )}
              <View style={styles.avatarCircle}>
                <InternAvatar name={item.internName} thumbPath={item.photoThumbPath} size={34} />
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.cardName}>{item.internName}</Text>
                <Text style={styles.cardSub}>{item.department}</Text>
                <Text style={styles.docType}>{DOC_LABELS[item.documentType] || item.documentType} · {item.originalFileName}</Text>
              </View>
            </View>
            <Text style={styles.requestDate}>
              Uploaded: {new Date(item.uploadedAt).toLocaleDateString()}
            </Text>
            {item.status === 'Rejected' && item.rejectionReason && (
              <View style={styles.rejectionBox}>
                <Text style={styles.rejectionText}>Reason: {item.rejectionReason}</Text>
              </View>
            )}
            <View style={styles.actionRow}>
              <TouchableOpacity id={`view-${item.id}`} style={styles.iconBtn} onPress={() => viewDocument(item)}>
                <Icon name="eye" size={17} color={colors.text} />
                <Text style={styles.iconBtnText}>View</Text>
              </TouchableOpacity>
              {item.status === 'Pending' && (
                <>
                  <TouchableOpacity id={`reject-${item.id}`} style={[styles.iconBtn, {borderColor:colors.error}]} onPress={() => handleReject(item)}>
                    <Icon name="close" size={17} color={colors.error} />
                    <Text style={[styles.iconBtnText, {color:colors.error}]}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity id={`approve-${item.id}`} style={[styles.approveBtn]} onPress={() => handleApprove(item)}>
                    <Icon name="check" size={17} color="#fff" />
                    <Text style={styles.approveBtnText}>Approve</Text>
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity id={`delete-${item.id}`} style={[styles.iconBtn, {borderColor:colors.error+'55'}]} onPress={() => handleDelete(item)}>
                <Icon name="trash" size={17} color={colors.error} />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      <Modal visible={!!rejectDoc} transparent animationType="fade" onRequestClose={() => setRejectDoc(null)}>
        <View style={styles.rejectOverlay}>
          <CenteredModalCard style={styles.rejectCard}>
            <Text style={styles.rejectTitle}>Reject Document</Text>
            <Text style={styles.rejectSub}>
              {rejectDoc?.internName}'s {rejectDoc ? DOC_LABELS[rejectDoc.documentType] || rejectDoc.documentType : ''}
            </Text>
            <TextInput
              style={styles.rejectInput}
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Reason for rejection"
              placeholderTextColor={colors.textMuted}
              multiline
              autoFocus
            />
            <View style={styles.rejectActions}>
              <TouchableOpacity style={styles.rejectCancel} onPress={() => setRejectDoc(null)}>
                <Text style={styles.rejectCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.rejectConfirm} onPress={submitReject}>
                <Text style={styles.rejectConfirmText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </CenteredModalCard>
        </View>
      </Modal>

      <Modal visible={!!viewerUri} transparent animationType="fade" onRequestClose={() => setViewerUri(null)}>
        <View style={styles.viewerOverlay}>
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerUri(null)}>
            <View style={styles.viewerCloseRow}>
              <Icon name="close" size={14} color="#fff" />
              <Text style={styles.viewerCloseText}>Close</Text>
            </View>
          </TouchableOpacity>
          {viewerUri && <Image source={{uri: viewerUri}} style={styles.viewerImage} resizeMode="contain" />}
        </View>
      </Modal>
    </ScreenBackground>
  );
}

const makeStyles = colors => StyleSheet.create({
  container: {flex:1},
  center: {flex:1, justifyContent:'center', alignItems:'center', backgroundColor:colors.background},
  emptyBox: {alignItems:'center', paddingVertical:60, gap:8},
  emptyText: {color:colors.textSecondary, fontSize:16},
  batchBar: {flexDirection:'row', alignItems:'center', gap:12, marginHorizontal:16, marginTop:10, paddingHorizontal:12, paddingVertical:10, backgroundColor:colors.primary+'11', borderRadius:10, borderWidth:1, borderColor:colors.border},
  batchBarText: {flex:1, color:colors.text, fontWeight:'700'},
  batchClear: {paddingVertical:8, paddingHorizontal:14, borderRadius:8, borderWidth:1, borderColor:colors.border},
  batchApprove: {backgroundColor:colors.success, paddingVertical:10, paddingHorizontal:18, borderRadius:8},
  batchApproveText: {color:'#fff', fontWeight:'700'},
  checkbox: {width:32, height:32, borderRadius:8, borderWidth:2, borderColor:colors.border, alignItems:'center', justifyContent:'center', marginRight:10},
  checkboxOn: {backgroundColor:colors.primary, borderColor:colors.primary},
  requestCard: {backgroundColor:colors.surface, margin:12, marginBottom:6, borderRadius:12, padding:12, borderWidth:1, borderColor:colors.border},
  cardTop: {flexDirection:'row', alignItems:'center', marginBottom:8},
  avatarCircle: {width:34, height:34, borderRadius:17, justifyContent:'center', alignItems:'center', marginRight:10},
  cardInfo: {flex:1},
  cardName: {color:colors.text, fontSize:14, fontWeight:'700'},
  cardSub: {color:colors.textSecondary, fontSize:12},
  docType: {color:colors.textMuted, fontSize:11, marginTop:1},
  requestDate: {color:colors.textMuted, fontSize:11, marginBottom:8},
  rejectionBox: {backgroundColor:colors.error+'22', borderRadius:8, padding:8, marginBottom:8},
  rejectionText: {color:colors.error, fontSize:12},
  actionRow: {flexDirection:'row', gap:8},
  iconBtn: {flex:1, borderRadius:10, paddingVertical:7, alignItems:'center', justifyContent:'center', flexDirection:'row', gap:6, borderWidth:1, borderColor:colors.border},
  iconBtnText: {color:colors.text, fontWeight:'700', fontSize:12},
  approveBtn: {flex:1.5, backgroundColor:colors.primary, borderRadius:10, paddingVertical:7, alignItems:'center', justifyContent:'center', flexDirection:'row', gap:6},
  approveBtnText: {color:'#fff', fontWeight:'700', fontSize:12},
  viewerOverlay: {flex:1, backgroundColor:'rgba(0,0,0,0.9)', justifyContent:'center'},
  viewerClose: {position:'absolute', top:50, right:20, zIndex:1, backgroundColor:'rgba(255,255,255,0.15)', borderRadius:8, paddingHorizontal:14, paddingVertical:8},
  viewerCloseRow: {flexDirection:'row', alignItems:'center', gap:6},
  viewerCloseText: {color:'#fff', fontWeight:'700'},
  viewerImage: {width:'100%', height:'80%'},
  rejectOverlay: {flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'center', padding:24},
  rejectCard: {backgroundColor:colors.surface, borderRadius:16, padding:20},
  rejectTitle: {color:colors.text, fontSize:18, fontWeight:'700', marginBottom:4},
  rejectSub: {color:colors.textSecondary, fontSize:13, marginBottom:16},
  rejectInput: {backgroundColor:colors.background, borderWidth:1, borderColor:colors.border, borderRadius:10, padding:12, color:colors.text, fontSize:14, minHeight:90, textAlignVertical:'top'},
  rejectActions: {flexDirection:'row', gap:12, marginTop:16, justifyContent:'flex-end'},
  rejectCancel: {paddingVertical:10, paddingHorizontal:20, borderRadius:10, borderWidth:1, borderColor:colors.border},
  rejectCancelText: {color:colors.textSecondary, fontWeight:'700'},
  rejectConfirm: {backgroundColor:colors.error, paddingVertical:10, paddingHorizontal:20, borderRadius:10},
  rejectConfirmText: {color:'#fff', fontWeight:'700'},
});

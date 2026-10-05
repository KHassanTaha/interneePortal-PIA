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
import Spinner from '../../components/Spinner';
import FilterChips from '../../components/FilterChips';
import Dropdown from '../../components/Dropdown';
import EndOfListMarker from '../../components/EndOfListMarker';
import CenteredModalCard from '../../components/CenteredModalCard';


const DOC_LABELS = {
  Cnic: 'CNIC',
  UniversityId: 'University ID',
  Resume: 'Resume',
  Noc: 'NOC',
  Report: 'Internship Report',
};

const isImagePath = path => /\.(jpe?g|png)$/i.test(path || '');

const TYPE_TABS = [
  {key: null, label: 'All'},
  {key: 'Cnic', label: 'CNIC'},
  {key: 'UniversityId', label: 'University ID'},
  {key: 'Resume', label: 'Resume'},
  {key: 'Noc', label: 'NOC'},
  {key: 'Report', label: 'Report'},
];

const STATUS_TABS = ['Pending', 'Approved', 'Rejected'];

export default function AdminDocumentsScreen({navigation}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [docs, setDocs] = useState([]);
  const [tab, setTab] = useState('Pending');
  const [docType, setDocType] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [deptFilter, setDeptFilter] = useState(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState({});
  const [batchApproveLoading, setBatchApproveLoading] = useState(false);
  const [viewerUri, setViewerUri] = useState(null);
  const [rejectDoc, setRejectDoc] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectLoading, setRejectLoading] = useState(false);

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

  const selectedIds = Object.keys(selected).filter(k => selected[k]);

  const handleBatchApprove = async () => {
    if (selectedIds.length === 0) return;
    setBatchApproveLoading(true);
    let ok = 0;
    try {
      for (const id of selectedIds) {
        try {
          const {queued} = await moderate({kind: 'admin', label: 'Approve document', method: 'POST', url: `/admin/documents/${id}/approve`, entityKey: `document:${id}`});
          if (queued) queuedToast(queued, 'Document approved.');
          else ok++;
        } catch {}
      }
      if (ok > 0) showToast(`${ok} document(s) approved.`, 'success');
      setSelected({});
      fetchDocsStandalone();
    } finally { setBatchApproveLoading(false); }
  };

  const fetchDocsStandalone = async () => {
    try {
      const res = await client.get(`/admin/documents?status=${tab}`);
      setDocs(res.data);
    } catch { showToast("Couldn't load documents. Check your connection and try again.", 'error'); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const fetchDocs = async () => {
        try {
          const res = await client.get(`/admin/documents?status=${tab}`);
          if (!cancelled) setDocs(res.data);
        } catch { if (!cancelled) showToast("Couldn't load documents. Check your connection and try again.", 'error'); }
        finally { if (!cancelled) { setLoading(false); setRefreshing(false); } }
      };
      fetchDocs();
      return () => { cancelled = true; };
    }, [tab])
  );

  const q = query.trim().toLowerCase();
  const visibleDocs = docs.filter(d =>
    (!docType || d.documentType === docType) &&
    (!deptFilter || d.department === deptFilter) &&
    (!q || d.internName.toLowerCase().includes(q) || (d.username || '').toLowerCase().includes(q) || String(d.internId ?? '').includes(q))
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
      const {queued} = await moderate({kind: 'admin', label: 'Approve document', method: 'POST', url: `/admin/documents/${doc.id}/approve`, entityKey: `document:${doc.id}`});
      queuedToast(queued, 'Document approved.');
      fetchDocsStandalone();
    } catch (e) { showToast(e.response?.data?.message || "Couldn't approve. Try again.", 'error'); }
  };

  const handleReject = doc => {
    setRejectReason('');
    setRejectDoc(doc);
  };

  const submitReject = async () => {
    if (!rejectReason.trim()) { showToast('Rejection reason is required.', 'error'); return; }
    const doc = rejectDoc;
    setRejectLoading(true);
    try {
      const {queued} = await moderate({kind: 'admin', label: 'Reject document', method: 'POST', url: `/admin/documents/${doc.id}/reject`, body: {reason: rejectReason.trim()}, entityKey: `document:${doc.id}`});
      queuedToast(queued, 'Document rejected.');
      setRejectDoc(null);
      setRejectReason('');
      fetchDocsStandalone();
    } catch { showToast("Couldn't reject. Try again.", 'error'); }
    finally { setRejectLoading(false); }
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
      await client.delete(`/admin/documents/${doc.id}`);
      showToast('Document deleted.', 'success');
      fetchDocsStandalone();
    } catch { showToast("Couldn't delete. Try again.", 'error'); }
  };

  if (loading) return <Spinner style={styles.center} />;

  return (
    <ScreenBackground style={styles.container}>
      <AppHeader hideTitle home title="Approve Documents" />

      <ScrollView
        contentContainerStyle={{paddingBottom: 100, flexGrow: 1}}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchDocsStandalone();}} tintColor={colors.primary}/>}>
        {/* Document type tabs */}
        <View style={styles.tabs}>
          {TYPE_TABS.map(t => (
            <TouchableOpacity
              key={t.label}
              id={`doc-type-tab-${t.key || 'all'}`}
              style={[styles.tab, docType === t.key && styles.tabActive]}
              onPress={() => setDocType(t.key)}>
              <Text style={[styles.tabText, docType === t.key && styles.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Status filter */}
        <FilterChips
          compact
          idPrefix="status-filter"
          options={STATUS_TABS.map(s => ({key: s, label: s}))}
          value={tab}
          onChange={s => { setTab(s); setSelected({}); setLoading(true); }}
        />

        {/* Department filter + intern search */}
        <View style={styles.filterRow}>
          <Dropdown
            compact
            id="docs-dept-filter"
            searchable
            clearable
            onClear={() => setDeptFilter(null)}
            value={deptFilter}
            onChange={v => setDeptFilter(v)}
            options={[{value: null, label: 'All Departments'}, ...departments.map(d => ({value: d.name, label: d.name}))]}
            placeholder="Department"
          />
        </View>
        <View style={styles.searchWrap}>
          <Icon name="search" size={16} color={colors.textMuted} />
          <TextInput style={styles.searchInput} placeholder="Search by intern name, username or ID" placeholderTextColor={colors.textMuted} value={query} onChangeText={setQuery} autoCorrect={false} />
          {query.length > 0 && (
            <TouchableOpacity id="docs-search-clear" onPress={() => setQuery('')} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Icon name="close" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
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

        {visibleDocs.length === 0 ? (
          <View style={styles.emptyBox}>
            <Icon name="folder" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>No {tab.toLowerCase()} documents</Text>
          </View>
        ) : visibleDocs.map(item => (
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
                <Text style={styles.avatarText}>{item.internName[0]}</Text>
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
              <TouchableOpacity id={`view-${item.id}`} style={styles.viewBtn} onPress={() => viewDocument(item)}>
                <Icon name="eye" size={15} color={colors.text} />
                <Text style={styles.viewBtnText}>View</Text>
              </TouchableOpacity>
              {item.status === 'Pending' && (
                <>
                  <TouchableOpacity id={`reject-${item.id}`} style={styles.rejectBtn} onPress={() => handleReject(item)}>
                    <Icon name="close" size={15} color={colors.error} />
                    <Text style={styles.rejectBtnText}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity id={`approve-${item.id}`} style={styles.approveBtn} onPress={() => handleApprove(item)}>
                    <Icon name="check" size={15} color="#fff" />
                    <Text style={styles.approveBtnText}>Approve</Text>
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity id={`delete-${item.id}`} style={styles.deleteBtn} onPress={() => handleDelete(item)}>
                <Icon name="trash" size={16} color={colors.error} />
              </TouchableOpacity>
            </View>
          </View>
        ))}
        {visibleDocs.length > 0 && <EndOfListMarker />}
      </ScrollView>

      <Modal visible={!!rejectDoc} transparent animationType="fade" onRequestClose={() => setRejectDoc(null)}>
        <View style={styles.rejectOverlay}>
          <CenteredModalCard style={styles.rejectCard}>
            <Text style={styles.rejectTitle}>Reject {rejectDoc?.internName}'s {rejectDoc ? DOC_LABELS[rejectDoc.documentType] || rejectDoc.documentType : ''}</Text>
            <Text style={styles.rejectSub}>Reason for rejecting</Text>
            <TextInput
              style={styles.rejectInput}
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Enter rejection reason"
              placeholderTextColor={colors.textMuted}
              multiline
            />
            <View style={styles.rejectActions}>
              <TouchableOpacity style={styles.rejectCancel} onPress={() => setRejectDoc(null)}>
                <Text style={styles.rejectCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                id="confirm-reject"
                style={[styles.rejectConfirm, (!rejectReason.trim() || rejectLoading) && {opacity: 0.5}]}
                disabled={!rejectReason.trim() || rejectLoading}
                onPress={submitReject}>
                {rejectLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.rejectConfirmText}>Reject</Text>}
              </TouchableOpacity>
            </View>
          </CenteredModalCard>
        </View>
      </Modal>

      <Modal visible={!!viewerUri} transparent animationType="fade" onRequestClose={() => setViewerUri(null)}>
        <View style={styles.viewerOverlay}>
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerUri(null)}>
            <Icon name="close" size={16} color="#fff" />
            <Text style={styles.viewerCloseText}>Close</Text>
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
  tabs: {flexDirection:'row', backgroundColor:colors.surface, borderBottomWidth:1, borderBottomColor:colors.border},
  tab: {flex:1, paddingVertical:14, alignItems:'center'},
  tabActive: {borderBottomWidth:2, borderBottomColor:colors.primary},
  tabText: {color:colors.textMuted, fontSize:13, fontWeight:'600'},
  tabTextActive: {color:colors.textAccent},
  emptyBox: {alignItems:'center', paddingVertical:60},
  emptyText: {color:colors.textSecondary, fontSize:16},
  filterRow: {marginHorizontal:16, marginTop:12},
  searchWrap: {flexDirection:'row', alignItems:'center', gap:8, backgroundColor:colors.card, marginHorizontal:16, marginTop:10, marginBottom:4, borderRadius:10, borderWidth:1, borderColor:colors.border, paddingHorizontal:12, paddingVertical:10},
  searchInput: {flex:1, color:colors.text, fontSize:14, padding:0},
  batchBar: {flexDirection:'row', alignItems:'center', gap:12, marginHorizontal:16, marginTop:8, paddingHorizontal:12, paddingVertical:10, backgroundColor:colors.primary+'11', borderRadius:10, borderWidth:1, borderColor:colors.border},
  batchBarText: {flex:1, color:colors.text, fontWeight:'700'},
  batchClear: {paddingVertical:8, paddingHorizontal:14, borderRadius:8, borderWidth:1, borderColor:colors.border},
  batchApprove: {backgroundColor:colors.success, paddingVertical:10, paddingHorizontal:18, borderRadius:8},
  batchApproveText: {color:'#fff', fontWeight:'700'},
  checkbox: {width:32, height:32, borderRadius:8, borderWidth:2, borderColor:colors.border, alignItems:'center', justifyContent:'center', marginRight:10},
  checkboxOn: {backgroundColor:colors.primary, borderColor:colors.primary},
  requestCard: {backgroundColor:colors.surface, margin:12, marginBottom:6, borderRadius:12, padding:12, borderWidth:1, borderColor:colors.border},
  cardTop: {flexDirection:'row', alignItems:'center', marginBottom:8},
  avatarCircle: {width:34, height:34, borderRadius:17, backgroundColor:colors.primary, justifyContent:'center', alignItems:'center', marginRight:10},
  avatarText: {color:'#fff', fontSize:15, fontWeight:'700'},
  cardInfo: {flex:1},
  cardName: {color:colors.text, fontSize:14, fontWeight:'700'},
  cardSub: {color:colors.textSecondary, fontSize:12},
  docType: {color:colors.textMuted, fontSize:11, marginTop:1},
  requestDate: {color:colors.textMuted, fontSize:11, marginBottom:8},
  rejectionBox: {backgroundColor:colors.error+'22', borderRadius:8, padding:8, marginBottom:8},
  rejectionText: {color:colors.error, fontSize:12},
  actionRow: {flexDirection:'row', gap:8},
  viewBtn: {flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:5, borderRadius:10, paddingVertical:7, borderWidth:1, borderColor:colors.border},
  viewBtnText: {color:colors.text, fontWeight:'700', fontSize:12},
  rejectBtn: {flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:5, borderRadius:10, paddingVertical:7, borderWidth:1, borderColor:colors.error},
  rejectBtnText: {color:colors.error, fontWeight:'700', fontSize:12},
  approveBtn: {flex:1.5, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:5, backgroundColor:colors.primary, borderRadius:10, paddingVertical:7},
  approveBtnText: {color:'#fff', fontWeight:'700', fontSize:12},
  deleteBtn: {width:40, borderRadius:10, alignItems:'center', justifyContent:'center', borderWidth:1, borderColor:colors.error+'55'},
  viewerOverlay: {flex:1, backgroundColor:'rgba(0,0,0,0.9)', justifyContent:'center'},
  viewerClose: {position:'absolute', top:50, right:20, zIndex:1, flexDirection:'row', alignItems:'center', gap:6, backgroundColor:'rgba(255,255,255,0.15)', borderRadius:8, paddingHorizontal:14, paddingVertical:8},
  viewerCloseText: {color:'#fff', fontWeight:'700'},
  viewerImage: {width:'100%', height:'80%'},
  rejectOverlay: {flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'center', padding:24},
  rejectCard: {backgroundColor:colors.surface, borderRadius:16, padding:20},
  rejectTitle: {color:colors.text, fontSize:18, fontWeight:'700', marginBottom:4},
  rejectSub: {color:colors.textSecondary, fontSize:13, marginBottom:16},
  rejectInput: {borderWidth:1, borderColor:colors.border, borderRadius:10, padding:12, color:colors.text, minHeight:80, textAlignVertical:'top', marginBottom:4},
  rejectActions: {flexDirection:'row', gap:12, marginTop:16, justifyContent:'flex-end'},
  rejectCancel: {paddingVertical:10, paddingHorizontal:20, borderRadius:10, borderWidth:1, borderColor:colors.border},
  rejectCancelText: {color:colors.textSecondary, fontWeight:'700'},
  rejectConfirm: {backgroundColor:colors.error, paddingVertical:10, paddingHorizontal:20, borderRadius:10},
  rejectConfirmText: {color:'#fff', fontWeight:'700'},
});
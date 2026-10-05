import React, {useState, useMemo, useCallback} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, RefreshControl, Modal, TextInput,
} from 'react-native';
import client from '../../api/client';
import {moderate, queuedToast} from '../../api/moderate';
import {useAppTheme} from '../../theme';
import ScreenBackground from '../../components/ScreenBackground';
import AppHeader from '../../components/AppHeader';
import Icon from '../../components/Icon';
import Spinner from '../../components/Spinner';
import FilterChips from '../../components/FilterChips';
import Dropdown from '../../components/Dropdown';
import EndOfListMarker from '../../components/EndOfListMarker';
import {showToast} from '../../components/AppToast';
import {showConfirm} from '../../components/AppConfirm';
import SwipeableModal from '../../components/SwipeableModal';
import CenteredModalCard from '../../components/CenteredModalCard';


const TABS = [
  {key: 'all', label: 'All'},
  {key: 'gatepass', label: 'Gate Pass'},
  {key: 'idcard', label: 'ID Cards'},
  {key: 'certificate', label: 'Certificates'},
];

const STATUSES = ['Pending', 'Approved', 'Rejected'];

export default function IssueDocumentsScreen({navigation, route, role}) {
  const resolvedRole = role || route?.params?.role || 'admin';
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [tab, setTab] = useState('all');
  const [status, setStatus] = useState('Pending');
  const [query, setQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState({});
  const [batchLoading, setBatchLoading] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectLoading, setRejectLoading] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [selectedCert, setSelectedCert] = useState(null);
  const [mentorNotes, setMentorNotes] = useState('');
  const [techStack, setTechStack] = useState('');
  const [internWork, setInternWork] = useState('');
  const [processing, setProcessing] = useState(false);

  const base = `/${resolvedRole}`;
  const selectedIds = Object.keys(selected).filter(k => selected[k]);
  const isCertificate = item => item._type === 'certificate';

  const fetchItemsStandalone = useCallback(async () => {
    const fetchOne = async (typePath, _type) => {
      const res = await client.get(`${base}/${typePath}?status=${status}`);
      return (res.data || []).map(i => ({...i, _type}));
    };
    try {
      if (tab === 'all') {
        const [g, id, c] = await Promise.allSettled([
          fetchOne('gatepasses', 'gatepass'),
          fetchOne('idcards', 'idcard'),
          fetchOne('certificates', 'certificate'),
        ]);
        const ok = r => (r.status === 'fulfilled' ? r.value : []);
        setItems([...ok(g), ...ok(id), ...ok(c)].sort((a, b) => new Date(b.requestedAt ?? b.appliedAt) - new Date(a.requestedAt ?? a.appliedAt)));
      } else {
        const typePath = tab === 'gatepass' ? 'gatepasses' : tab === 'idcard' ? 'idcards' : 'certificates';
        const res = await client.get(`${base}/${typePath}?status=${status}`);
        setItems((res.data || []).map(i => ({...i, _type: tab})));
      }
    } catch { showToast("Couldn't load requests. Check your connection and try again.", 'error'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [tab, status, base]);

  useFocusEffect(
    useCallback(() => {
      fetchItemsStandalone();
      return () => { setQuery(''); };
    }, [fetchItemsStandalone])
  );

  const openIssuedPdf = item => {
    const {openFileWithAuth} = require('../../api/fileClient');
    openFileWithAuth(item.pdfPath).catch(() => showToast("Couldn't open the PDF. Try again.", 'error'));
  };

  const switchTab = key => {
    setTab(key);
    setSelected({});
    setLoading(true);
  };

  const statusColors = {
    Pending: colors.warning, Approved: colors.success, Rejected: colors.error,
  };

  const typeName = item => item?._type === 'gatepass' ? 'gate pass' : item?._type === 'idcard' ? 'ID card' : 'certificate';

  const handleApprove = async item => {
    const typePath = item._type === 'gatepass' ? 'gatepasses' : 'idcards';
    const ok = await showConfirm({
      title: 'Approve request',
      message: `Approve ${typeName(item)} for ${item.internName}?`,
      confirmText: 'Approve',
    });
    if (!ok) return;
    try {
      const {queued} = await moderate({kind: resolvedRole, label: `Approve ${typeName(item)}`, method: 'POST', url: `${base}/${typePath}/${item.id}/approve`, entityKey: `${item._type}:${item.id}`});
      queuedToast(queued, 'PDF generated.');
      fetchItemsStandalone();
    } catch (e) { showToast(e.response?.data?.message || "Couldn't approve. Try again.", 'error'); }
  };

  const handleReject = item => {
    setRejectTarget({typePath: item._type === 'gatepass' ? 'gatepasses' : item._type === 'idcard' ? 'idcards' : 'certificates', item});
    setRejectReason('');
  };

  const confirmReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    setRejectLoading(true);
    try {
      const {queued} = await moderate({kind: resolvedRole, label: `Reject ${typeName(rejectTarget.item)}`, method: 'POST', url: `${base}/${rejectTarget.typePath}/${rejectTarget.item.id}/reject`, body: {reason: rejectReason.trim()}, entityKey: `${rejectTarget.item._type}:${rejectTarget.item.id}`});
      queuedToast(queued, 'Request rejected.');
      setRejectTarget(null);
      setRejectReason('');
      fetchItemsStandalone();
    } catch (e) { showToast(e.response?.data?.message || "Couldn't reject. Try again.", 'error'); }
    finally { setRejectLoading(false); }
  };

  const confirmBatchApprove = async () => {
    setBatchLoading(true);
    try {
      const {queued, res} = await moderate({kind: resolvedRole, label: 'Batch approve gate passes', method: 'POST', url: `${base}/gatepasses/batch-approve`, body: {
        gatePassIds: selectedIds.map(Number),
      }, entityKey: 'gatepasses:batch'});
      showToast(queued ? 'Saved locally — will sync when online' : `${res.data.message} (${res.data.lettersGenerated} letter(s) generated).`, queued ? 'info' : 'success');
      setSelected({});
      fetchItemsStandalone();
    } catch (e) {
      showToast(e.response?.data?.message || "Batch approval failed. Try again.", 'error');
    } finally { setBatchLoading(false); }
  };

  const openBatchApprove = async () => {
    const ok = await showConfirm({
      title: 'Approve selected gate passes',
      message: `Approve ${selectedIds.length} selected gate pass(es)? Letters are generated as system-generated documents.`,
      confirmText: 'Approve',
    });
    if (ok) confirmBatchApprove();
  };

  const openCertApprove = cert => {
    setSelectedCert(cert);
    setMentorNotes('');
    setTechStack('');
    setInternWork('');
    setShowApproveModal(true);
  };

  const approveCert = async () => {
    if (!selectedCert) return;
    if (!techStack.trim() || !internWork.trim()) {
      showToast('Tech Stack and Intern Work are required.', 'error');
      return;
    }
    setProcessing(true);
    try {
      const {queued} = await moderate({kind: resolvedRole, label: 'Approve certificate', method: 'POST', url: `${base}/certificates/${selectedCert.id}/approve`, body: {
        mentorNotes,
        techStack: techStack.trim(),
        internWork: internWork.trim(),
      }, entityKey: `certificate:${selectedCert.id}`});
      queuedToast(queued, 'Certificate PDF generated and sent to the intern.');
      setShowApproveModal(false);
      setSelectedCert(null);
      fetchItemsStandalone();
    } catch (e) {
      showToast(e.response?.data?.message || "Approval failed. Try again.", 'error');
    } finally { setProcessing(false); }
  };

  const pathFor = item => item._type === 'certificate' ? 'certificates' : item._type === 'idcard' ? 'idcards' : 'gatepasses';

  const handleDelete = async item => {
    const ok = await showConfirm({
      title: `Delete ${typeName(item)}`,
      message: `Delete ${item.internName}'s issued ${typeName(item).toLowerCase()}? This cannot be undone.`,
      confirmText: 'Delete',
    });
    if (!ok) return;
    try {
      await client.delete(`${base}/${pathFor(item)}/${item.id}`);
      showToast('Document deleted.', 'success');
      fetchItemsStandalone();
    } catch (e) {
      showToast(e.response?.data?.message || "Couldn't delete. Try again.", 'error');
    }
  };

  if (loading) return <Spinner style={styles.center} />;

  const q = query.trim().toLowerCase();
  const visible = items.filter(item =>
    (deptFilter === 'all' || item.department === deptFilter) &&
    (!q || item.internName.toLowerCase().includes(q))
  );

  const showSelect = tab === 'gatepass' && status === 'Pending';

  return (
    <ScreenBackground style={styles.container}>
      <AppHeader hideTitle home title="Issue Documents" />

      {/* Document type tabs */}
      <View style={styles.tabs}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            id={`doc-tab-${t.key}`}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            onPress={() => switchTab(t.key)}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={{paddingBottom: 100, flexGrow: 1}}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchItemsStandalone();}} tintColor={colors.primary}/>}>
        {/* Status filter */}
        <FilterChips
          compact
          idPrefix="status-filter"
          options={STATUSES.map(s => ({key: s, label: s, color: statusColors[s]}))}
          value={status}
          onChange={s => { setStatus(s); setSelected({}); setLoading(true); }}
        />

        <View style={styles.searchWrap}>
          <Icon name="search" size={16} color={colors.textMuted} />
          <TextInput style={styles.searchInput} placeholder="Search by intern name or username" placeholderTextColor={colors.textMuted} value={query} onChangeText={setQuery} autoCorrect={false} />
          {query.length > 0 && (
            <TouchableOpacity id="issue-search-clear" onPress={() => setQuery('')} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Icon name="close" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {resolvedRole !== 'mentor' && (
          <View style={styles.filterRow}>
            <Dropdown
              compact
              id="issue-dept-filter"
              searchable
              clearable
              onClear={() => setDeptFilter('all')}
              value={deptFilter}
              onChange={v => setDeptFilter(v || 'all')}
              options={[{value: 'all', label: 'All Departments'}, ...Array.from(new Set(items.map(i => i.department).filter(Boolean))).map(d => ({value: d, label: d}))]}
              placeholder="Department"
            />
          </View>
        )}

        {showSelect && selectedIds.length > 0 && (
          <View style={styles.batchBar}>
            <Text style={styles.batchBarText}>{selectedIds.length} selected</Text>
            <TouchableOpacity style={styles.batchClear} onPress={() => setSelected({})} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Icon name="close" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity id="approve-selected" style={styles.batchApprove} onPress={openBatchApprove}>
              <Text style={styles.batchApproveText}>Approve Selected</Text>
            </TouchableOpacity>
          </View>
        )}

        {visible.length === 0 ? (
          <View style={styles.emptyBox}>
            <Icon name={tab === 'gatepass' ? 'ticket' : tab === 'idcard' ? 'idCard' : 'certificate'} size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>No {status.toLowerCase()} requests</Text>
          </View>
        ) : visible.map(item => (
          <View key={`${item._type}-${item.id}`} style={styles.requestCard}>
            <View style={styles.cardTop}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>{item.internName[0]}</Text>
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.cardName}>{item.internName}</Text>
                <Text style={styles.cardSub}>{item.department}</Text>
                {item.internCnic && <Text style={styles.cardCnic}>CNIC: {item.internCnic}</Text>}
              </View>
              {showSelect && (
                <TouchableOpacity
                  id={`select-${item.id}`}
                  style={[styles.checkbox, selected[item.id] && styles.checkboxOn]}
                  onPress={() => setSelected(p => ({...p, [item.id]: !p[item.id]}))}>
                  {selected[item.id] && <Icon name="check" size={16} color="#fff" />}
                </TouchableOpacity>
              )}
              <View style={[styles.statusBadge, {backgroundColor: (statusColors[item.status] || colors.text) + '22'}]}>
                <Text style={[styles.statusText, {color: statusColors[item.status] || colors.text}]}>{item.status}</Text>
              </View>
            </View>

            {isCertificate(item) ? (
              <>
                <Text style={styles.requestDate}>Requested: {new Date(item.appliedAt).toLocaleDateString()}</Text>
                <View style={styles.detailsBox}>
                  <Text style={styles.detailKey}>Project</Text>
                  <Text style={styles.detailVal}>{item.projectName}</Text>
                  <Text style={styles.detailKey}>Technologies</Text>
                  <Text style={styles.detailVal}>{item.languagesUsed}</Text>
                  <Text style={styles.detailKey}>Outcomes</Text>
                  <Text style={styles.detailVal}>{item.projectOutcomes}</Text>
                </View>
              </>
            ) : (
              <Text style={styles.requestDate}>Requested: {new Date(item.requestedAt).toLocaleDateString()}</Text>
            )}

            {item.status === 'Pending' ? (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  id={`reject-${tab}-${item.id}`}
                  style={styles.rejectBtn}
                  onPress={() => handleReject(item)}>
                  <Text style={styles.rejectBtnText}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  id={`approve-${tab}-${item.id}`}
                  style={styles.approveBtn}
                  onPress={() => isCertificate(item) ? openCertApprove(item) : handleApprove(item)}>
                  <Text style={styles.approveBtnText}>Approve & Generate PDF</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.infoRow}>
                {item.pdfPath && (
                  <>
                    <View style={styles.pdfReady}>
                      <Icon name="check" size={14} color={colors.success} />
                      <Text style={styles.pdfReadyText}>PDF Ready</Text>
                    </View>
                    <TouchableOpacity
                      id={`view-${item._type}-${item.id}`}
                      style={styles.viewBtn}
                      onPress={() => openIssuedPdf(item)}>
                      <Icon name="eye" size={14} color={colors.text} />
                      <Text style={styles.viewBtnText}>View</Text>
                    </TouchableOpacity>
                  </>
                )}
                {item.rejectionReason && (
                  <Text style={styles.rejectReason} numberOfLines={2}>Reason: {item.rejectionReason}</Text>
                )}
                {item.status === 'Approved' && (
                  <TouchableOpacity
                    id={`delete-${item._type}-${item.id}`}
                    style={styles.deleteBtn}
                    onPress={() => handleDelete(item)}>
                    <Icon name="trash" size={14} color={colors.error} />
                    <Text style={styles.deleteBtnText}>Delete</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        ))}
        {visible.length > 0 && <EndOfListMarker />}
      </ScrollView>

      {/* Reject modal */}
      <Modal visible={!!rejectTarget} transparent animationType="fade" onRequestClose={() => setRejectTarget(null)}>
        <View style={styles.rejectOverlay}>
          <CenteredModalCard style={styles.rejectCard}>
            <Text style={styles.rejectTitle}>Reject {rejectTarget?.item?.internName}'s {typeName(rejectTarget?.item)}</Text>
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
              <TouchableOpacity style={styles.rejectCancel} onPress={() => setRejectTarget(null)}>
                <Text style={styles.rejectCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                id="confirm-reject"
                style={[styles.rejectConfirm, (!rejectReason.trim() || rejectLoading) && {opacity: 0.5}]}
                disabled={!rejectReason.trim() || rejectLoading}
                onPress={confirmReject}>
                {rejectLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.rejectConfirmText}>Reject</Text>}
              </TouchableOpacity>
            </View>
          </CenteredModalCard>
        </View>
      </Modal>

      {/* Certificate approve modal */}
      <SwipeableModal visible={showApproveModal} transparent overlayStyle={styles.modalOverlay} sheetStyle={styles.modalContent} scrollable={false} onRequestClose={() => setShowApproveModal(false)}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.rejectTitle}>Approve Certificate</Text>
              <Text style={styles.rejectSub}>For: {selectedCert?.internName}</Text>
              {selectedCert?.reportPath && (
                <View style={styles.certDocRow}>
                  <View style={styles.docBadge}>
                    <Icon name="file" size={14} color={colors.textAccent} />
                    <Text style={styles.docBadgeText}>Internship Report</Text>
                  </View>
                  <TouchableOpacity
                    id="view-cert-report"
                    style={styles.viewBtn}
                    onPress={() => {
                      const {openFileWithAuth} = require('../../api/fileClient');
                      openFileWithAuth(selectedCert.reportPath).catch(() => showToast("Couldn't open the report. Try again.", 'error'));
                    }}>
                    <Icon name="eye" size={14} color={colors.text} />
                    <Text style={styles.viewBtnText}>View</Text>
                  </TouchableOpacity>
                </View>
              )}
              {selectedCert?.highlightTaskTitle && (
                <View style={styles.certDocRow}>
                  <View style={styles.docBadge}>
                    <Icon name="list" size={14} color={colors.textAccent} />
                    <Text style={styles.docBadgeText} numberOfLines={1}>Highlight: {selectedCert.highlightTaskTitle}</Text>
                  </View>
                </View>
              )}
              <Text style={styles.fieldLabel}>Tech Stack *</Text>
              <TextInput
                id="approve-cert-techstack"
                style={styles.notesInput}
                placeholder="e.g. C#, .NET, SQL Server, React"
                placeholderTextColor={colors.textMuted}
                value={techStack}
                onChangeText={setTechStack}
              />
              <Text style={styles.fieldLabel}>Intern Work *</Text>
              <TextInput
                id="approve-cert-work"
                style={styles.notesInput}
                placeholder="Describe the intern's work during the internship..."
                placeholderTextColor={colors.textMuted}
                multiline numberOfLines={3}
                value={internWork}
                onChangeText={setInternWork}
              />
              <Text style={styles.fieldLabel}>Additional Mentor Notes (Optional)</Text>
              <TextInput
                id="approve-cert-notes"
                style={styles.notesInput}
                placeholder="Add any additional comments to the certificate..."
                placeholderTextColor={colors.textMuted}
                multiline numberOfLines={3}
                value={mentorNotes}
                onChangeText={setMentorNotes}
              />
              <Text style={styles.modalHint}>Approving will generate the official PIA internship certificate PDF.</Text>
              <View style={styles.rejectActions}>
                <TouchableOpacity style={styles.rejectCancel} onPress={() => setShowApproveModal(false)}>
                  <Text style={styles.rejectCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity id="confirm-approve-cert" style={styles.approveBtn} onPress={approveCert} disabled={processing}>
                  {processing ? <ActivityIndicator color="#fff" /> : <Text style={styles.approveBtnText}>Generate Certificate</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
      </SwipeableModal>
    </ScreenBackground>
  );
}

const makeStyles = colors => StyleSheet.create({
  container: {flex:1},
  center: {flex:1, justifyContent:'center', alignItems:'center', backgroundColor:colors.background},
  tabs: {flexDirection:'row', backgroundColor:colors.surface, borderBottomWidth:1, borderBottomColor:colors.border},
  filterRow: {marginHorizontal:16, marginTop:10},
  tab: {flex:1, paddingVertical:14, alignItems:'center'},
  tabActive: {borderBottomWidth:2, borderBottomColor:colors.primary},
  tabText: {color:colors.textMuted, fontSize:13, fontWeight:'600'},
  tabTextActive: {color:colors.textAccent},
  searchWrap: {flexDirection:'row', alignItems:'center', gap:8, backgroundColor:colors.card, marginHorizontal:16, marginTop:12, marginBottom:10, borderRadius:10, borderWidth:1, borderColor:colors.border, paddingHorizontal:12, paddingVertical:10},
  searchInput: {flex:1, color:colors.text, fontSize:14, padding:0},
  batchBar: {flexDirection:'row', alignItems:'center', gap:12, paddingHorizontal:16, paddingVertical:10, backgroundColor:colors.primary+'11', borderBottomWidth:1, borderBottomColor:colors.border},
  batchBarText: {flex:1, color:colors.text, fontWeight:'700'},
  batchClear: {paddingVertical:8, paddingHorizontal:14, borderRadius:8, borderWidth:1, borderColor:colors.border},
  batchApprove: {backgroundColor:colors.success, paddingVertical:10, paddingHorizontal:18, borderRadius:8},
  batchApproveText: {color:'#fff', fontWeight:'700'},
  emptyBox: {alignItems:'center', paddingVertical:60},
  emptyText: {color:colors.textSecondary, fontSize:16},
  requestCard: {backgroundColor:colors.surface, margin:12, marginBottom:6, borderRadius:12, padding:12, borderWidth:1, borderColor:colors.border},
  cardTop: {flexDirection:'row', alignItems:'center', marginBottom:8},
  avatarCircle: {width:34, height:34, borderRadius:17, backgroundColor:colors.primary, justifyContent:'center', alignItems:'center', marginRight:10},
  avatarText: {color:'#fff', fontSize:15, fontWeight:'700'},
  cardInfo: {flex:1},
  cardName: {color:colors.text, fontSize:14, fontWeight:'700'},
  cardSub: {color:colors.textSecondary, fontSize:12},
  cardCnic: {color:colors.textMuted, fontSize:11},
  statusBadge: {borderRadius:8, paddingHorizontal:8, paddingVertical:4},
  statusText: {fontSize:11, fontWeight:'700'},
  requestDate: {color:colors.textMuted, fontSize:11, marginBottom:8},
  detailsBox: {backgroundColor:colors.card, borderRadius:10, padding:10, marginBottom:8},
  detailKey: {color:colors.textMuted, fontSize:11, fontWeight:'700', textTransform:'uppercase', letterSpacing:0.5, marginTop:8},
  detailVal: {color:colors.text, fontSize:13, marginTop:2},
  actionRow: {flexDirection:'row', gap:8},
  rejectBtn: {flex:1, borderRadius:10, paddingVertical:8, alignItems:'center', borderWidth:1, borderColor:colors.error},
  rejectBtnText: {color:colors.error, fontWeight:'700', fontSize:13},
  approveBtn: {flex:2, backgroundColor:colors.primary, borderRadius:10, paddingVertical:8, alignItems:'center'},
  approveBtnText: {color:'#fff', fontWeight:'700', fontSize:13},
  infoRow: {flexDirection:'row', alignItems:'center', gap:10},
  pdfReady: {flexDirection:'row', alignItems:'center', gap:6},
  pdfReadyText: {color:colors.success, fontSize:12, fontWeight:'600'},
  viewBtn: {flexDirection:'row', alignItems:'center', gap:5, borderRadius:10, paddingVertical:8, paddingHorizontal:14, borderWidth:1, borderColor:colors.border},
  viewBtnText: {color:colors.text, fontWeight:'700', fontSize:12},
  certDocRow: {flexDirection:'row', alignItems:'center', justifyContent:'space-between', gap:8, backgroundColor:colors.card, borderRadius:10, borderWidth:1, borderColor:colors.border, padding:10, marginBottom:10},
  docBadge: {flexDirection:'row', alignItems:'center', gap:6, flex:1},
  docBadgeText: {color:colors.text, fontSize:12.5, fontWeight:'600'},
  deleteBtn: {flexDirection:'row', alignItems:'center', gap:5, borderRadius:10, paddingVertical:8, paddingHorizontal:14, borderWidth:1, borderColor:colors.error+'55'},
  deleteBtnText: {color:colors.error, fontWeight:'700', fontSize:12},
  rejectReason: {flex:1, color:colors.error, fontSize:12},
  checkbox: {width:32, height:32, borderRadius:8, borderWidth:2, borderColor:colors.border, alignItems:'center', justifyContent:'center', marginRight:8},
  checkboxOn: {backgroundColor:colors.primary, borderColor:colors.primary},
  rejectOverlay: {flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'center', padding:24},
  rejectCard: {backgroundColor:colors.surface, borderRadius:16, padding:20},
  rejectTitle: {color:colors.text, fontSize:18, fontWeight:'700', marginBottom:4},
  rejectSub: {color:colors.textSecondary, fontSize:13, marginBottom:16},
  rejectActions: {flexDirection:'row', gap:12, marginTop:8, justifyContent:'flex-end'},
  rejectCancel: {paddingVertical:10, paddingHorizontal:20, borderRadius:10, borderWidth:1, borderColor:colors.border},
  rejectCancelText: {color:colors.textSecondary, fontWeight:'700'},
  rejectConfirm: {backgroundColor:colors.error, paddingVertical:10, paddingHorizontal:20, borderRadius:10},
  rejectConfirmText: {color:'#fff', fontWeight:'700'},
  rejectInput: {borderWidth:1, borderColor:colors.border, borderRadius:10, padding:12, color:colors.text, minHeight:80, textAlignVertical:'top', marginBottom:4},
  modalOverlay: {flex:1, backgroundColor:'rgba(0,0,0,0.7)', justifyContent:'flex-end'},
  modalContent: {backgroundColor:colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, padding:24, maxHeight:'85%'},
  fieldLabel: {color:colors.textSecondary, fontSize:12, fontWeight:'600', marginBottom:6},
  notesInput: {backgroundColor:colors.card, borderRadius:10, borderWidth:1, borderColor:colors.border, color:colors.text, paddingHorizontal:14, paddingVertical:12, height:100, textAlignVertical:'top', marginBottom:12},
  modalHint: {color:colors.textMuted, fontSize:12, marginBottom:16},
});

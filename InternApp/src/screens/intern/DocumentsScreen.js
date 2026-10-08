import React, {useCallback, useState, useMemo} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {showToast} from '../../components/AppToast';
import {showConfirm} from '../../components/AppConfirm';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, RefreshControl, Image,
} from 'react-native';
import client from '../../api/client';
import {write} from '../../api/write';
import {useAppTheme} from '../../theme';
import ScreenBackground from '../../components/ScreenBackground';
import AppHeader from '../../components/AppHeader';
import RightSidebar from '../../components/RightSidebar';
import SwipeableModal from '../../components/SwipeableModal';
import GradientButton from '../../components/GradientButton';
import Icon from '../../components/Icon';
import Spinner from '../../components/Spinner';

const MAX_FILE_MB = 5;

const DOC_TYPES = {
  Cnic: {label: 'CNIC', icon: 'idCard', hint: 'Image (jpg/png) · max 5 MB'},
  UniversityId: {label: 'University ID (optional)', icon: 'gradCap', hint: 'Image (jpg/png) · max 5 MB'},
  Resume: {label: 'CV / Resume', icon: 'file', hint: 'PDF or image · max 5 MB'},
  Noc: {label: 'NOC (optional)', icon: 'file', hint: 'PDF or image · max 5 MB'},
  Report: {label: 'Internship Report', icon: 'file', hint: 'PDF or image · max 5 MB'},
};

const isImagePath = path => /\.(jpe?g|png)$/i.test(path || '');

export default function DocumentsScreen({navigation}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [docs, setDocs] = useState([]);
  const [issued, setIssued] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [picked, setPicked] = useState({});
  const [viewerUri, setViewerUri] = useState(null);
  const [sidebarVisible, setSidebarVisible] = useState(false);

  const fetchIssued = async () => {
    try {
      const [gatePasses, idCards, certs] = await Promise.all([
        client.get('/intern/gatepass'),
        client.get('/intern/idcard'),
        client.get('/intern/certificate'),
      ]);
      const rows = [
        ...gatePasses.data.filter(x => x.issued).map(x => ({kind: 'Gate Pass', icon: 'ticket', item: x})),
        ...idCards.data.filter(x => x.issued).map(x => ({kind: 'ID Card', icon: 'idCard', item: x})),
        ...certs.data.filter(x => x.issued).map(x => ({kind: 'Certificate', icon: 'certificate', item: x})),
      ];
      setIssued(rows);
    } catch {}
  };

  const fetchDocs = async () => {
    try {
      const res = await client.get('/intern/documents');
      setDocs(res.data);
    } catch {} finally { setLoading(false); setRefreshing(false); }
    fetchIssued();
  };

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const loadDocs = async () => {
        try {
          const res = await client.get('/intern/documents');
          if (!cancelled) setDocs(res.data);
        } catch {} finally { if (!cancelled) { setLoading(false); setRefreshing(false); } }
        if (!cancelled) fetchIssued();
      };
      loadDocs();
      return () => { cancelled = true; };
    }, [])
  );

  const activeDocs = docs.filter(d => !d.withdrawn && (d.status === 'Pending' || d.status === 'Approved'));
  const activeTypes = new Set(activeDocs.map(d => d.documentType));
  const latestOf = type => docs.find(d => d.documentType === type);

  const pickDocument = async type => {
    try {
      const { pick, types, keepLocalCopy } = require('@react-native-documents/picker');
      const allowsPdf = type => type === 'Resume' || type === 'Noc' || type === 'Report';
      const pickTypes = allowsPdf(type) ? [types.images, types.pdf] : [types.images];
      const [res] = await pick({type: pickTypes});

      const name = res.name || res.uri.split('/').pop() || `${type}.jpg`;
      const ext = name.split('.').pop().toLowerCase();
      const valid = allowsPdf(type)
        ? ['jpg', 'jpeg', 'png', 'pdf'].includes(ext)
        : ['jpg', 'jpeg', 'png'].includes(ext);
      if (!valid) {
        showToast(DOC_TYPES[type].hint, 'error');
        return;
      }
      if (res.size && res.size > MAX_FILE_MB * 1024 * 1024) {
        showToast(`Max ${MAX_FILE_MB} MB per file.`, 'error');
        return;
      }

      // Android pick() returns a content:// uri; copy it into app storage so the
      // multipart upload (BlobUtil) can read the file reliably.
      let uri = res.uri;
      try {
        const [copy] = await keepLocalCopy({
          files: [{uri: res.uri, fileName: name, convertVirtualFileToType: res.type || undefined}],
          destination: 'cachesDirectory',
        });
        if (copy && copy.status === 'success' && copy.localUri) uri = copy.localUri;
      } catch {}

      setPicked(p => ({...p, [type]: {uri, name, type: res.type}}));
    } catch (e) {
      const { isErrorWithCode, errorCodes } = require('@react-native-documents/picker');
      if (!(isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED)) showToast("Couldn't pick the file. Try again.", 'error');
    }
  };

  const viewDocument = doc => {
    if (isImagePath(doc.filePath)) {
      const {fileUrl} = require('../../api/fileClient');
      setViewerUri(fileUrl(doc.filePath));
    } else {
      const {openFileWithAuth} = require('../../api/fileClient');
      openFileWithAuth(doc.filePath).catch(() => showToast("Couldn't open the file. Try again.", 'error'));
    }
  };

  const openIssued = pdfPath => {
    const {openFileWithAuth} = require('../../api/fileClient');
    openFileWithAuth(pdfPath).catch(() => showToast("Couldn't open the file. Try again.", 'error'));
  };

  const submitUpload = async () => {
    const entries = Object.entries(picked).filter(([, v]) => v);
    if (entries.length === 0) return;
    setUploading(true);
    try {
      const fieldNames = {Cnic: 'CnicFile', UniversityId: 'UniversityIdFile', Resume: 'ResumeFile', Noc: 'NocFile', Report: 'ReportFile'};
      const {queued} = await write({
        kind: 'intern',
        label: 'Document upload',
        method: 'post',
        url: '/intern/documents',
        files: entries.map(([type, f]) => ({
          fieldName: fieldNames[type],
          fileName: f.name,
          filePath: f.uri,
          mimeType: f.type || (/\.pdf$/i.test(f.name) ? 'application/pdf' : 'image/jpeg'),
        })),
      });
      showToast(
        queued
          ? 'Documents saved locally — will submit when online.'
          : 'Documents submitted for approval.',
        queued ? 'info' : 'success',
      );
      setPicked({});
      setShowUploadModal(false);
      fetchDocs();
    } catch (e) {
      showToast(e.response?.data?.message || "Couldn't submit. Try again.", 'error');
    } finally { setUploading(false); }
  };

  const withdrawDoc = async doc => {
    const ok = await showConfirm({
      title: 'Withdraw document',
      message: `Withdraw your ${DOC_TYPES[doc.documentType]?.label || doc.documentType} from approval?`,
      confirmText: 'Withdraw',
      destructive: true,
    });
    if (!ok) return;
    try {
      const {queued} = await write({
        kind: 'intern',
        label: 'Withdraw document',
        method: 'post',
        url: `/intern/documents/${doc.id}/withdraw`,
      });
      showToast(
        queued ? 'Withdraw saved locally — will sync when online.' : 'Document withdrawn. You can re-upload.',
        queued ? 'info' : 'success',
      );
      fetchDocs();
    } catch (e) {
      showToast(e.response?.data?.message || "Couldn't withdraw. Try again.", 'error');
    }
  };

  const badge = doc => {
    if (doc.withdrawn) return {label: 'Withdrawn', color: colors.textMuted, icon: 'refresh'};
    const map = {
      Pending: {label: 'Pending', color: colors.warning, icon: 'clock'},
      Approved: {label: 'Approved', color: colors.success, icon: 'check'},
      Rejected: {label: 'Rejected', color: colors.error, icon: 'close'},
    };
    return map[doc.status] || {label: doc.status, color: colors.textMuted, icon: 'file'};
  };

  if (loading) return <Spinner style={styles.center} />;

  return (
    <ScreenBackground>
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchDocs();}} tintColor={colors.primary} />}>

      <AppHeader
        home
        right={(
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open navigation menu" id="documents-menu-btn" onPress={() => setSidebarVisible(true)} style={styles.menuBtn}><Icon name="menu" size={22} color="#fff" />
          </TouchableOpacity>
        )}
      />

      <RightSidebar
        visible={sidebarVisible}
        onClose={() => setSidebarVisible(false)}
        navigation={navigation}
      />

      <View style={styles.header}>
        <Text style={styles.subtitle}>CNIC, CV/Resume and optional University ID / NOC</Text>
      </View>

      <View style={styles.infoCard}>
        <View style={styles.infoRowInner}>
          <Icon name="info" size={16} color={colors.textAccent} />
          <Text style={styles.infoText}>Uploaded documents are reviewed and approved individually by the admin/mentor. Approved documents cannot be changed unless deleted by an admin or mentor.</Text>
        </View>
      </View>

      {Object.entries(DOC_TYPES).map(([type, meta]) => {
        const doc = latestOf(type);
        const b = doc ? badge(doc) : null;
        const canUpload = !activeTypes.has(type);
        const needsUpload = canUpload;
        return (
          <View key={type} style={styles.docCard}>
            <View style={styles.docRow}>
              <View style={styles.docIconBox}>
                <Icon name={meta.icon} size={26} color={colors.textAccent} />
              </View>
              <View style={styles.docInfo}>
                <Text style={styles.docLabel}>{meta.label}</Text>
                {doc ? (
                  <>
                    <Text style={styles.docDate}>Uploaded: {new Date(doc.uploadedAt).toLocaleDateString()}</Text>
                    {doc.status === 'Approved' && doc.approvedAt && (
                      <Text style={styles.docDate}>Approved: {new Date(doc.approvedAt).toLocaleDateString()}</Text>
                    )}
                  </>
                ) : (
                  <Text style={styles.docDate}>Not uploaded yet</Text>
                )}
              </View>
              {b && (
                <View style={[styles.badge, {backgroundColor: b.color + '22'}]}>
                  <Icon name={b.icon} size={12} color={b.color} />
                  <Text style={[styles.badgeText, {color: b.color}]}>{b.label}</Text>
                </View>
              )}
            </View>

            {doc?.status === 'Rejected' && doc.rejectionReason && (
              <View style={styles.rejectionBox}>
                <Text style={styles.rejectionText}>Reason: {doc.rejectionReason}</Text>
              </View>
            )}

            <View style={styles.actionsRow}>
              {doc && doc.filePath && (
                <TouchableOpacity id={`view-${type}`} style={styles.viewBtn} onPress={() => viewDocument(doc)}>
                  <Icon name="eye" size={14} color={colors.text} />
                  <Text style={styles.viewBtnText}>View</Text>
                </TouchableOpacity>
              )}
              {doc && doc.status === 'Pending' && !doc.withdrawn && (
                <TouchableOpacity id={`withdraw-${type}`} style={styles.withdrawBtn} onPress={() => withdrawDoc(doc)}>
                  <Icon name="undo" size={14} color={colors.warning} />
                  <Text style={styles.withdrawBtnText}>Withdraw</Text>
                </TouchableOpacity>
              )}
              {needsUpload && (
                <GradientButton
                  id={`upload-${type}`}
                  style={styles.uploadBtn}
                  onPress={() => setShowUploadModal(true)}
                  icon={<Icon name={doc && (doc.status === 'Rejected' || doc.withdrawn) ? 'refresh' : 'upload'} size={14} color="#fff" />}>
                  <Text style={styles.uploadBtnText}>
                    {doc && (doc.status === 'Rejected' || doc.withdrawn) ? 'Re-upload' : 'Upload'}
                  </Text>
                </GradientButton>
              )}
            </View>
          </View>
        );
      })}

      {/* Issued official documents */}
      {issued.length > 0 && (
        <View style={styles.issuedSection}>
          <Text style={styles.issuedTitle}>Official Documents</Text>
          <Text style={styles.issuedSub}>Issued by admin or mentor</Text>
          {issued.map(r => (
            <View key={`${r.kind}-${r.item.id}`} style={styles.issuedCard}>
              <View style={styles.issuedIconBox}>
                <Icon name={r.icon} size={22} color={colors.primary} />
              </View>
              <View style={styles.issuedInfo}>
                <Text style={styles.issuedLabel}>{r.kind}</Text>
                <Text style={styles.issuedDate}>
                  Issued: {r.item.approvedAt ? new Date(r.item.approvedAt).toLocaleDateString() : '—'}
                </Text>
              </View>
              <TouchableOpacity id={`issued-open-${r.kind}`} style={styles.issuedBtn} onPress={() => openIssued(r.item.pdfPath)}>
                <Icon name="eye" size={14} color={colors.text} />
                <Text style={styles.issuedBtnText}>View</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Upload Modal */}
      <SwipeableModal visible={showUploadModal} transparent overlayStyle={styles.modalOverlay} sheetStyle={styles.modalContent} onRequestClose={() => {setPicked({}); setShowUploadModal(false);}}>
        <Text style={styles.modalTitle}>Upload Documents</Text>
            <Text style={styles.modalSubtitle}>Only documents that need uploading are shown</Text>

            {Object.entries(DOC_TYPES).filter(([type]) => !activeTypes.has(type)).map(([type, meta]) => (
              <TouchableOpacity
                key={type}
                id={`pick-${type}`}
                style={[styles.uploadArea, picked[type] && styles.uploadAreaDone]}
                onPress={() => pickDocument(type)}>
                <View style={styles.uploadIconBox}>
                  <Icon name={picked[type] ? 'check' : meta.icon} size={26} color={picked[type] ? colors.success : colors.textSecondary} />
                </View>
                <Text style={styles.uploadLabel}>
                  {picked[type] ? `${meta.label} Ready (${picked[type].name})` : `Upload ${meta.label}`}
                </Text>
                <Text style={styles.uploadHint}>{meta.hint}</Text>
              </TouchableOpacity>
            ))}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => {setPicked({}); setShowUploadModal(false);}}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <GradientButton
                id="submit-documents"
                style={styles.createBtn}
                onPress={submitUpload}
                disabled={uploading || Object.values(picked).filter(Boolean).length === 0}
                loading={uploading}>
                <Text style={styles.createBtnText}>Submit</Text>
              </GradientButton>
            </View>
      </SwipeableModal>

      {/* Image Viewer Modal */}
      <Modal visible={!!viewerUri} transparent animationType="fade" onRequestClose={() => setViewerUri(null)}>
        <View style={styles.viewerOverlay}>
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerUri(null)}>
            <Icon name="close" size={16} color="#fff" />
          </TouchableOpacity>
          {viewerUri && <Image source={{uri: viewerUri}} style={styles.viewerImage} resizeMode="contain" />}
        </View>
      </Modal>
    </ScrollView>
    </ScreenBackground>
  );
}

const makeStyles = colors => StyleSheet.create({
  container: {flex:1},
  center: {flex:1, justifyContent:'center', alignItems:'center', backgroundColor:colors.background},
  header: {padding:20, paddingTop:12},
  subtitle: {color:colors.textMuted, fontSize:14, marginTop:4},
  menuBtn: {width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', justifyContent: 'center', alignItems: 'center'},
  infoCard: {marginHorizontal:20, marginBottom:8, backgroundColor:colors.primary+'15', borderRadius:12, padding:14},
  infoRowInner: {flexDirection:'row', alignItems:'flex-start', gap:8},
  infoText: {color:colors.textSecondary, fontSize:12, lineHeight:18, flex:1},
  docCard: {margin:20, marginTop:12, backgroundColor:colors.surface, borderRadius:16, padding:16, borderWidth:1, borderColor:colors.border},
  docRow: {flexDirection:'row', alignItems:'center'},
  docIconBox: {width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center', marginRight: 12},
  docInfo: {flex:1},
  docLabel: {color:colors.text, fontSize:16, fontWeight:'700'},
  docDate: {color:colors.textMuted, fontSize:12, marginTop:2},
  badge: {flexDirection:'row', alignItems:'center', gap:4, borderRadius:8, paddingHorizontal:10, paddingVertical:6},
  badgeText: {fontSize:12, fontWeight:'700'},
  rejectionBox: {backgroundColor:colors.error+'22', borderRadius:8, padding:12, marginTop:12},
  rejectionText: {color:colors.error, fontSize:13},
  actionsRow: {flexDirection:'row', gap:10, marginTop:14},
  viewBtn: {flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, backgroundColor:colors.card, borderRadius:10, paddingVertical:10, borderWidth:1, borderColor:colors.border},
  viewBtnText: {color:colors.text, fontWeight:'600'},
  withdrawBtn: {flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, backgroundColor:colors.warning+'22', borderRadius:10, paddingVertical:10, borderWidth:1, borderColor:colors.warning},
  withdrawBtnText: {color:colors.warning, fontWeight:'600'},
  uploadBtn: {flex:1, borderRadius:10, marginTop:2},
  uploadBtnText: {color:'#fff', fontWeight:'700'},
  // Issued official documents
  issuedSection: {marginHorizontal:20, marginBottom:8},
  issuedTitle: {color:colors.text, fontSize:16, fontWeight:'700', marginTop:16},
  issuedSub: {color:colors.textMuted, fontSize:12, marginBottom:10},
  issuedCard: {flexDirection:'row', alignItems:'center', backgroundColor:colors.surface, borderRadius:12, padding:12, borderWidth:1, borderColor:colors.border, marginBottom:8},
  issuedIconBox: {width:40, height:40, borderRadius:20, backgroundColor:colors.primary+'15', alignItems:'center', justifyContent:'center', marginRight:10},
  issuedInfo: {flex:1},
  issuedLabel: {color:colors.text, fontSize:14, fontWeight:'700'},
  issuedDate: {color:colors.textMuted, fontSize:12, marginTop:2},
  issuedBtn: {flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, backgroundColor:colors.card, borderRadius:10, paddingVertical:8, paddingHorizontal:12, borderWidth:1, borderColor:colors.border},
  issuedBtnText: {color:colors.text, fontWeight:'600', fontSize:13},
  // Modal
  modalOverlay: {flex:1, backgroundColor:'rgba(0,0,0,0.7)', justifyContent:'flex-end'},
  modalContent: {backgroundColor:colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, padding:24},
  modalTitle: {color:colors.text, fontSize:18, fontWeight:'700', marginBottom:4},
  modalSubtitle: {color:colors.textMuted, fontSize:13, marginBottom:20},
  uploadArea: {backgroundColor:colors.card, borderRadius:12, borderWidth:2, borderColor:colors.border, borderStyle:'dashed', padding:18, alignItems:'center', marginBottom:12},
  uploadAreaDone: {borderColor:colors.success, backgroundColor:colors.success+'11'},
  uploadIconBox: {width: 48, height: 48, borderRadius: 24, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', marginBottom: 6},
  uploadLabel: {color:colors.textSecondary, fontSize:14, fontWeight:'600', textAlign:'center'},
  uploadHint: {color:colors.textMuted, fontSize:12, marginTop:4},
  modalActions: {flexDirection:'row', gap:12, marginTop:8},
  cancelBtn: {flex:1, backgroundColor:colors.card, borderRadius:12, paddingVertical:14, alignItems:'center', borderWidth:1, borderColor:colors.border},
  cancelBtnText: {color:colors.textSecondary, fontWeight:'600'},
  createBtn: {flex:1, borderRadius:12},
  createBtnText: {color:'#fff', fontWeight:'700'},
  // Viewer
  viewerOverlay: {flex:1, backgroundColor:'rgba(0,0,0,0.9)', justifyContent:'center'},
  viewerClose: {position:'absolute', top:50, right:20, zIndex:1, backgroundColor:'rgba(255,255,255,0.15)', borderRadius:8, paddingHorizontal:14, paddingVertical:8},
  viewerImage: {width:'100%', height:'80%'},
});

import React, {useState, useEffect} from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, Modal, RefreshControl, Image,
} from 'react-native';
import client from '../../api/client';
import theme from '../../theme';
import {API_BASE_URL} from '../../config/constants';

const FILE_BASE = API_BASE_URL.replace('/api', '');
const MAX_FILE_MB = 5;

const DOC_TYPES = {
  Cnic: {label: 'CNIC', icon: '🪪', hint: 'Image (jpg/png) · max 5 MB'},
  UniversityId: {label: 'University ID', icon: '🎓', hint: 'Image (jpg/png) · max 5 MB'},
  Resume: {label: 'Resume', icon: '📄', hint: 'PDF or image · max 5 MB'},
};

const isImagePath = path => /\.(jpe?g|png)$/i.test(path || '');

export default function DocumentsScreen() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [picked, setPicked] = useState({});
  const [viewerUri, setViewerUri] = useState(null);

  const fetchDocs = async () => {
    try {
      const res = await client.get('/intern/documents');
      setDocs(res.data);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchDocs(); }, []);

  const activeDocs = docs.filter(d => !d.withdrawn && (d.status === 'Pending' || d.status === 'Approved'));
  const activeTypes = new Set(activeDocs.map(d => d.documentType));
  const latestOf = type => docs.find(d => d.documentType === type);

  const pickDocument = async type => {
    try {
      const { pick, types } = require('@react-native-documents/picker');
      const pickTypes = type === 'Resume' ? [types.images, types.pdf] : [types.images];
      const [res] = await pick({type: pickTypes});

      const name = res.name || res.uri.split('/').pop() || `${type}.jpg`;
      const ext = name.split('.').pop().toLowerCase();
      const valid = type === 'Resume'
        ? ['jpg', 'jpeg', 'png', 'pdf'].includes(ext)
        : ['jpg', 'jpeg', 'png'].includes(ext);
      if (!valid) {
        Alert.alert('Invalid file', DOC_TYPES[type].hint);
        return;
      }
      if (res.size && res.size > MAX_FILE_MB * 1024 * 1024) {
        Alert.alert('File too large', `Max ${MAX_FILE_MB} MB per file`);
        return;
      }
      setPicked(p => ({...p, [type]: {uri: res.uri, name}}));
    } catch (e) {
      const { isCancel } = require('@react-native-documents/picker');
      if (!isCancel(e)) Alert.alert('Error', 'Failed to pick document');
    }
  };

  const viewDocument = doc => {
    const url = `${FILE_BASE}/files/${doc.filePath}`;
    if (isImagePath(doc.filePath)) setViewerUri(url);
    else {
      const {Linking} = require('react-native');
      Linking.openURL(url);
    }
  };

  const submitUpload = async () => {
    const files = Object.entries(picked).filter(([, v]) => v);
    if (files.length === 0) return;
    setUploading(true);
    try {
      const formData = new FormData();
      const fieldNames = {Cnic: 'CnicFile', UniversityId: 'UniversityIdFile', Resume: 'ResumeFile'};
      files.forEach(([type, f]) => {
        formData.append(fieldNames[type], {
          uri: f.uri,
          type: /\.pdf$/i.test(f.name) ? 'application/pdf' : 'image/jpeg',
          name: f.name,
        });
      });
      await client.post('/intern/documents', formData, {
        headers: {'Content-Type': 'multipart/form-data'},
      });
      Alert.alert('Success', 'Documents submitted for approval');
      setPicked({});
      setShowUploadModal(false);
      fetchDocs();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Submission failed');
    } finally { setUploading(false); }
  };

  const withdrawDoc = async doc => {
    Alert.alert('Withdraw', `Withdraw your ${DOC_TYPES[doc.documentType]?.label || doc.documentType} from approval?`, [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Withdraw', style: 'destructive', onPress: async () => {
        try {
          await client.post(`/intern/documents/${doc.id}/withdraw`);
          Alert.alert('Withdrawn', 'Document withdrawn. You can re-upload.');
          fetchDocs();
        } catch (e) {
          Alert.alert('Error', e.response?.data?.message || 'Withdraw failed');
        }
      }},
    ]);
  };

  const badge = doc => {
    if (doc.withdrawn) return {label: 'Withdrawn', color: theme.colors.textMuted, icon: '🔄'};
    const map = {
      Pending: {label: 'Pending', color: theme.colors.warning, icon: '⏳'},
      Approved: {label: 'Approved', color: theme.colors.success, icon: '✅'},
      Rejected: {label: 'Rejected', color: theme.colors.error, icon: '❌'},
    };
    return map[doc.status] || {label: doc.status, color: theme.colors.textMuted, icon: '📄'};
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchDocs();}} tintColor={theme.colors.primary} />}>

      <View style={styles.header}>
        <Text style={styles.title}>Documents</Text>
        <Text style={styles.subtitle}>CNIC, University ID and Resume verification</Text>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoText}>📌 Uploaded documents are reviewed and approved individually by the admin/mentor. Approved documents cannot be changed unless deleted by an admin or mentor.</Text>
      </View>

      {Object.entries(DOC_TYPES).map(([type, meta]) => {
        const doc = latestOf(type);
        const b = doc ? badge(doc) : null;
        const canUpload = !activeTypes.has(type);
        const needsUpload = canUpload;
        return (
          <View key={type} style={styles.docCard}>
            <View style={styles.docRow}>
              <Text style={styles.docIcon}>{meta.icon}</Text>
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
                  <Text style={[styles.badgeText, {color: b.color}]}>{b.icon} {b.label}</Text>
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
                  <Text style={styles.viewBtnText}>👁 View</Text>
                </TouchableOpacity>
              )}
              {doc && doc.status === 'Pending' && !doc.withdrawn && (
                <TouchableOpacity id={`withdraw-${type}`} style={styles.withdrawBtn} onPress={() => withdrawDoc(doc)}>
                  <Text style={styles.withdrawBtnText}>↩ Withdraw</Text>
                </TouchableOpacity>
              )}
              {needsUpload && (
                <TouchableOpacity id={`upload-${type}`} style={styles.uploadBtn} onPress={() => setShowUploadModal(true)}>
                  <Text style={styles.uploadBtnText}>
                    {doc && (doc.status === 'Rejected' || doc.withdrawn) ? '↻ Re-upload' : '⬆ Upload'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      })}

      {/* Upload Modal */}
      <Modal visible={showUploadModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Upload Documents</Text>
            <Text style={styles.modalSubtitle}>Only documents that need uploading are shown</Text>

            {Object.entries(DOC_TYPES).filter(([type]) => !activeTypes.has(type)).map(([type, meta]) => (
              <TouchableOpacity
                key={type}
                id={`pick-${type}`}
                style={[styles.uploadArea, picked[type] && styles.uploadAreaDone]}
                onPress={() => pickDocument(type)}>
                <Text style={styles.uploadIcon}>{picked[type] ? '✅' : meta.icon}</Text>
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
              <TouchableOpacity id="submit-documents" style={styles.createBtn} onPress={submitUpload} disabled={uploading || Object.values(picked).filter(Boolean).length === 0}>
                {uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>Submit</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Image Viewer Modal */}
      <Modal visible={!!viewerUri} transparent animationType="fade" onRequestClose={() => setViewerUri(null)}>
        <View style={styles.viewerOverlay}>
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerUri(null)}>
            <Text style={styles.viewerCloseText}>✕ Close</Text>
          </TouchableOpacity>
          {viewerUri && <Image source={{uri: viewerUri}} style={styles.viewerImage} resizeMode="contain" />}
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex:1, backgroundColor:theme.colors.background},
  center: {flex:1, justifyContent:'center', alignItems:'center', backgroundColor:theme.colors.background},
  header: {padding:20, paddingTop:40},
  title: {color:theme.colors.text, fontSize:24, fontWeight:'700'},
  subtitle: {color:theme.colors.textMuted, fontSize:14, marginTop:4},
  infoCard: {marginHorizontal:20, marginBottom:8, backgroundColor:theme.colors.info+'15', borderRadius:12, padding:14},
  infoText: {color:theme.colors.textSecondary, fontSize:12, lineHeight:18},
  docCard: {margin:20, marginTop:12, backgroundColor:theme.colors.surface, borderRadius:16, padding:16, borderWidth:1, borderColor:theme.colors.border},
  docRow: {flexDirection:'row', alignItems:'center'},
  docIcon: {fontSize:30, marginRight:12},
  docInfo: {flex:1},
  docLabel: {color:theme.colors.text, fontSize:16, fontWeight:'700'},
  docDate: {color:theme.colors.textMuted, fontSize:12, marginTop:2},
  badge: {borderRadius:8, paddingHorizontal:10, paddingVertical:6},
  badgeText: {fontSize:12, fontWeight:'700'},
  rejectionBox: {backgroundColor:theme.colors.error+'22', borderRadius:8, padding:12, marginTop:12},
  rejectionText: {color:theme.colors.error, fontSize:13},
  actionsRow: {flexDirection:'row', gap:10, marginTop:14},
  viewBtn: {flex:1, backgroundColor:theme.colors.card, borderRadius:10, paddingVertical:10, alignItems:'center', borderWidth:1, borderColor:theme.colors.border},
  viewBtnText: {color:theme.colors.text, fontWeight:'600'},
  withdrawBtn: {flex:1, backgroundColor:theme.colors.warning+'22', borderRadius:10, paddingVertical:10, alignItems:'center', borderWidth:1, borderColor:theme.colors.warning},
  withdrawBtnText: {color:theme.colors.warning, fontWeight:'600'},
  uploadBtn: {flex:1, backgroundColor:theme.colors.primary, borderRadius:10, paddingVertical:10, alignItems:'center'},
  uploadBtnText: {color:'#fff', fontWeight:'700'},
  // Modal
  modalOverlay: {flex:1, backgroundColor:'rgba(0,0,0,0.7)', justifyContent:'flex-end'},
  modalContent: {backgroundColor:theme.colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, padding:24},
  modalTitle: {color:theme.colors.text, fontSize:18, fontWeight:'700', marginBottom:4},
  modalSubtitle: {color:theme.colors.textMuted, fontSize:13, marginBottom:20},
  uploadArea: {backgroundColor:theme.colors.card, borderRadius:12, borderWidth:2, borderColor:theme.colors.border, borderStyle:'dashed', padding:18, alignItems:'center', marginBottom:12},
  uploadAreaDone: {borderColor:theme.colors.success, backgroundColor:theme.colors.success+'11'},
  uploadIcon: {fontSize:30, marginBottom:6},
  uploadLabel: {color:theme.colors.textSecondary, fontSize:14, fontWeight:'600', textAlign:'center'},
  uploadHint: {color:theme.colors.textMuted, fontSize:12, marginTop:4},
  modalActions: {flexDirection:'row', gap:12, marginTop:8},
  cancelBtn: {flex:1, backgroundColor:theme.colors.card, borderRadius:12, paddingVertical:14, alignItems:'center', borderWidth:1, borderColor:theme.colors.border},
  cancelBtnText: {color:theme.colors.textSecondary, fontWeight:'600'},
  createBtn: {flex:1, backgroundColor:theme.colors.primary, borderRadius:12, paddingVertical:14, alignItems:'center'},
  createBtnText: {color:'#fff', fontWeight:'700'},
  // Viewer
  viewerOverlay: {flex:1, backgroundColor:'rgba(0,0,0,0.9)', justifyContent:'center'},
  viewerClose: {position:'absolute', top:50, right:20, zIndex:1, backgroundColor:'rgba(255,255,255,0.15)', borderRadius:8, paddingHorizontal:14, paddingVertical:8},
  viewerCloseText: {color:'#fff', fontWeight:'700'},
  viewerImage: {width:'100%', height:'80%'},
});

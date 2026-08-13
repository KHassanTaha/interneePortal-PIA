import React, {useState, useEffect} from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, RefreshControl, Modal, Image,
} from 'react-native';
import client from '../../api/client';
import theme from '../../theme';
import {API_BASE_URL} from '../../config/constants';

const FILE_BASE = API_BASE_URL.replace('/api', '');

const DOC_LABELS = {
  Cnic: 'CNIC',
  UniversityId: 'University ID',
  Resume: 'Resume',
};

const isImagePath = path => /\.(jpe?g|png)$/i.test(path || '');

const STATUS_TABS = [
  {key: 'Pending', label: 'Pending'},
  {key: 'Approved', label: 'Approved'},
  {key: 'Rejected', label: 'Rejected'},
];

export default function DocumentsApprovalScreen() {
  const [docs, setDocs] = useState([]);
  const [tab, setTab] = useState('Pending');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewerUri, setViewerUri] = useState(null);

  const fetchDocs = async () => {
    try {
      const res = await client.get(`/mentor/documents?status=${tab}`);
      setDocs(res.data);
    } catch { Alert.alert('Error', 'Failed to load documents'); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchDocs(); }, [tab]);

  const viewDocument = doc => {
    const url = `${FILE_BASE}/files/${doc.filePath}`;
    if (isImagePath(doc.filePath)) setViewerUri(url);
    else {
      const {Linking} = require('react-native');
      Linking.openURL(url);
    }
  };

  const handleApprove = doc => {
    Alert.alert('Confirm', `Approve ${DOC_LABELS[doc.documentType] || doc.documentType} for ${doc.internName}?`, [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Approve', onPress: async () => {
        try {
          await client.post(`/mentor/documents/${doc.id}/approve`);
          Alert.alert('✅ Approved', 'Document approved');
          fetchDocs();
        } catch (e) { Alert.alert('Error', e.response?.data?.message || 'Failed'); }
      }},
    ]);
  };

  const handleReject = doc => {
    Alert.prompt('Reject', `Reason for rejecting ${doc.internName}'s ${DOC_LABELS[doc.documentType] || doc.documentType}:`, async reason => {
      if (!reason) return;
      try {
        await client.post(`/mentor/documents/${doc.id}/reject`, {reason});
        Alert.alert('Rejected', 'Document rejected');
        fetchDocs();
      } catch { Alert.alert('Error', 'Failed to reject'); }
    });
  };

  const handleDelete = doc => {
    Alert.alert('Delete', `Delete ${DOC_LABELS[doc.documentType] || doc.documentType} for ${doc.internName}? This lets the intern re-upload.`, [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await client.delete(`/mentor/documents/${doc.id}`);
          Alert.alert('Deleted', 'Document deleted');
          fetchDocs();
        } catch { Alert.alert('Error', 'Failed to delete'); }
      }},
    ]);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        {STATUS_TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            id={`tab-${t.key}`}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            onPress={() => { setTab(t.key); setLoading(true); }}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={{paddingBottom: 100, flexGrow: 1}}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchDocs();}} tintColor={theme.colors.primary}/>}>
        {docs.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>📁</Text>
            <Text style={styles.emptyText}>No {tab.toLowerCase()} documents</Text>
          </View>
        ) : docs.map(item => (
          <View key={item.id} style={styles.requestCard}>
            <View style={styles.cardTop}>
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
                <Text style={styles.viewBtnText}>👁 View</Text>
              </TouchableOpacity>
              {item.status === 'Pending' && (
                <>
                  <TouchableOpacity id={`reject-${item.id}`} style={styles.rejectBtn} onPress={() => handleReject(item)}>
                    <Text style={styles.rejectBtnText}>✗ Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity id={`approve-${item.id}`} style={styles.approveBtn} onPress={() => handleApprove(item)}>
                    <Text style={styles.approveBtnText}>✓ Approve</Text>
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity id={`delete-${item.id}`} style={styles.deleteBtn} onPress={() => handleDelete(item)}>
                <Text style={styles.deleteBtnText}>🗑</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      <Modal visible={!!viewerUri} transparent animationType="fade" onRequestClose={() => setViewerUri(null)}>
        <View style={styles.viewerOverlay}>
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerUri(null)}>
            <Text style={styles.viewerCloseText}>✕ Close</Text>
          </TouchableOpacity>
          {viewerUri && <Image source={{uri: viewerUri}} style={styles.viewerImage} resizeMode="contain" />}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex:1, backgroundColor:theme.colors.background},
  center: {flex:1, justifyContent:'center', alignItems:'center', backgroundColor:theme.colors.background},
  tabs: {flexDirection:'row', backgroundColor:theme.colors.surface, borderBottomWidth:1, borderBottomColor:theme.colors.border, paddingTop:48},
  tab: {flex:1, paddingVertical:16, alignItems:'center'},
  tabActive: {borderBottomWidth:2, borderBottomColor:theme.colors.primary},
  tabText: {color:theme.colors.textMuted, fontSize:14, fontWeight:'600'},
  tabTextActive: {color:theme.colors.primary},
  emptyBox: {alignItems:'center', paddingVertical:60},
  emptyIcon: {fontSize:48, marginBottom:12},
  emptyText: {color:theme.colors.textSecondary, fontSize:16},
  requestCard: {backgroundColor:theme.colors.surface, margin:12, marginBottom:4, borderRadius:16, padding:16, borderWidth:1, borderColor:theme.colors.border},
  cardTop: {flexDirection:'row', alignItems:'center', marginBottom:12},
  avatarCircle: {width:48, height:48, borderRadius:24, backgroundColor:theme.colors.primary, justifyContent:'center', alignItems:'center', marginRight:12},
  avatarText: {color:'#fff', fontSize:20, fontWeight:'700'},
  cardInfo: {flex:1},
  cardName: {color:theme.colors.text, fontSize:16, fontWeight:'700'},
  cardSub: {color:theme.colors.textSecondary, fontSize:13},
  docType: {color:theme.colors.textMuted, fontSize:12, marginTop:2},
  requestDate: {color:theme.colors.textMuted, fontSize:12, marginBottom:12},
  rejectionBox: {backgroundColor:theme.colors.error+'22', borderRadius:8, padding:10, marginBottom:12},
  rejectionText: {color:theme.colors.error, fontSize:12},
  actionRow: {flexDirection:'row', gap:8},
  viewBtn: {flex:1, borderRadius:10, paddingVertical:10, alignItems:'center', borderWidth:1, borderColor:theme.colors.border},
  viewBtnText: {color:theme.colors.text, fontWeight:'700'},
  rejectBtn: {flex:1, borderRadius:10, paddingVertical:10, alignItems:'center', borderWidth:1, borderColor:theme.colors.error},
  rejectBtnText: {color:theme.colors.error, fontWeight:'700'},
  approveBtn: {flex:1.5, backgroundColor:theme.colors.primary, borderRadius:10, paddingVertical:10, alignItems:'center'},
  approveBtnText: {color:'#fff', fontWeight:'700', fontSize:13},
  deleteBtn: {width:44, borderRadius:10, alignItems:'center', justifyContent:'center', borderWidth:1, borderColor:theme.colors.error+'55'},
  deleteBtnText: {color:theme.colors.error, fontSize:16},
  viewerOverlay: {flex:1, backgroundColor:'rgba(0,0,0,0.9)', justifyContent:'center'},
  viewerClose: {position:'absolute', top:50, right:20, zIndex:1, backgroundColor:'rgba(255,255,255,0.15)', borderRadius:8, paddingHorizontal:14, paddingVertical:8},
  viewerCloseText: {color:'#fff', fontWeight:'700'},
  viewerImage: {width:'100%', height:'80%'},
});

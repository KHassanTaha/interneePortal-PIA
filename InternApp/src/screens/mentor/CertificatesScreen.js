import React, {useState, useEffect} from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, RefreshControl, Modal, TextInput,
} from 'react-native';
import client from '../../api/client';
import theme from '../../theme';

export default function MentorCertificatesScreen() {
  const [certs, setCerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [selectedCert, setSelectedCert] = useState(null);
  const [mentorNotes, setMentorNotes] = useState('');
  const [techStack, setTechStack] = useState('');
  const [internWork, setInternWork] = useState('');
  const [departmentHead, setDepartmentHead] = useState('');
  const [processing, setProcessing] = useState(false);
  const [activeStatus, setActiveStatus] = useState('Applied');

  const fetchCerts = async () => {
    try {
      const res = await client.get(`/mentor/certificates?status=${activeStatus}`);
      setCerts(res.data);
    } catch { Alert.alert('Error', 'Failed to load certificates'); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchCerts(); }, [activeStatus]);

  const approve = async () => {
    if (!selectedCert) return;
    if (!techStack.trim() || !internWork.trim()) {
      Alert.alert('Required', 'Tech Stack and Intern Work are required');
      return;
    }
    setProcessing(true);
    try {
      await client.post(`/mentor/certificates/${selectedCert.id}/approve`, {
        mentorNotes,
        techStack: techStack.trim(),
        internWork: internWork.trim(),
        departmentHeadName: departmentHead.trim() || null,
      });
      Alert.alert('✅ Approved', 'Certificate PDF generated and sent to intern');
      setShowApproveModal(false);
      setSelectedCert(null);
      fetchCerts();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Approval failed');
    } finally { setProcessing(false); }
  };

  const reject = async (cert) => {
    Alert.prompt('Rejection Reason', `Reason for rejecting ${cert.internName}'s certificate:`, async reason => {
      if (!reason) return;
      try {
        await client.post(`/mentor/certificates/${cert.id}/reject`, {reason});
        Alert.alert('Rejected', 'Certificate request rejected');
        fetchCerts();
      } catch { Alert.alert('Error', 'Failed to reject'); }
    });
  };

  const statuses = ['Applied', 'Approved', 'Rejected'];
  const statusColors = {Applied: theme.colors.info, Approved: theme.colors.success, Rejected: theme.colors.error};

  return (
    <View style={styles.container}>
      {/* Status Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{paddingHorizontal:16}}>
        {statuses.map(s => (
          <TouchableOpacity
            key={s}
            id={`cert-filter-${s.toLowerCase()}`}
            style={[styles.filterChip, activeStatus === s && {backgroundColor:statusColors[s]+'33', borderColor:statusColors[s]}]}
            onPress={() => {setActiveStatus(s); setLoading(true);}}>
            <Text style={[styles.filterText, activeStatus === s && {color:statusColors[s], fontWeight:'700'}]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{paddingBottom: 100, flexGrow: 1}}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchCerts();}} tintColor={theme.colors.primary}/>}>
          {certs.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyText}>No {activeStatus.toLowerCase()} certificates</Text>
            </View>
          ) : certs.map(cert => (
            <View key={cert.id} style={styles.certCard}>
              <View style={styles.certHeader}>
                <View>
                  <Text style={styles.certName}>{cert.internName}</Text>
                  <Text style={styles.certDept}>{cert.department}</Text>
                  <Text style={styles.certDate}>Applied: {new Date(cert.appliedAt).toLocaleDateString()}</Text>
                </View>
                <View style={[styles.statusBadge, {backgroundColor: (statusColors[cert.status]||theme.colors.text)+'22'}]}>
                  <Text style={[styles.statusText, {color: statusColors[cert.status]||theme.colors.text}]}>{cert.status}</Text>
                </View>
              </View>

              <View style={styles.detailsBox}>
                <Text style={styles.detailKey}>Project</Text>
                <Text style={styles.detailVal}>{cert.projectName}</Text>
                <Text style={styles.detailKey}>Technologies</Text>
                <Text style={styles.detailVal}>{cert.languagesUsed}</Text>
                <Text style={styles.detailKey}>Outcomes</Text>
                <Text style={styles.detailVal}>{cert.projectOutcomes}</Text>
              </View>

              {cert.status === 'Applied' && (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    id={`reject-cert-${cert.id}`}
                    style={styles.rejectBtn}
                    onPress={() => reject(cert)}>
                    <Text style={styles.rejectBtnText}>✗ Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    id={`approve-cert-${cert.id}`}
                    style={styles.approveBtn}
                    onPress={() => { setSelectedCert(cert); setMentorNotes(''); setTechStack(''); setInternWork(''); setDepartmentHead(''); setShowApproveModal(true); }}>
                    <Text style={styles.approveBtnText}>✓ Approve</Text>
                  </TouchableOpacity>
                </View>
              )}
              {cert.pdfPath && (
                <Text style={styles.pdfReady}>📥 PDF Ready for Download</Text>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Approve Modal */}
      <Modal visible={showApproveModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>Approve Certificate</Text>
              <Text style={styles.modalFor}>For: {selectedCert?.internName}</Text>
            <Text style={styles.fieldLabel}>Tech Stack *</Text>
            <TextInput
              id="mentor-cert-techstack"
              style={styles.notesInput}
              placeholder="e.g. C#, .NET, SQL Server, React"
              placeholderTextColor={theme.colors.textMuted}
              value={techStack}
              onChangeText={setTechStack}
            />
            <Text style={styles.fieldLabel}>Intern Work *</Text>
            <TextInput
              id="mentor-cert-work"
              style={styles.notesInput}
              placeholder="Describe the intern's work during the internship..."
              placeholderTextColor={theme.colors.textMuted}
              multiline numberOfLines={3}
              value={internWork}
              onChangeText={setInternWork}
            />
            <Text style={styles.fieldLabel}>Department Head Name</Text>
            <TextInput
              id="mentor-cert-depthead"
              style={styles.notesInput}
              placeholder="e.g. Mr. Junaid Raza"
              placeholderTextColor={theme.colors.textMuted}
              value={departmentHead}
              onChangeText={setDepartmentHead}
            />
            <Text style={styles.fieldLabel}>Additional Mentor Notes (Optional)</Text>
            <TextInput
              id="mentor-cert-notes"
              style={styles.notesInput}
              placeholder="Add any additional comments to the certificate..."
              placeholderTextColor={theme.colors.textMuted}
              multiline numberOfLines={3}
              value={mentorNotes}
              onChangeText={setMentorNotes}
            />
            <Text style={styles.modalHint}>Approving will generate the official PIA internship certificate PDF.</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowApproveModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity id="confirm-approve-cert" style={styles.createBtn} onPress={approve} disabled={processing}>
                {processing ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>Generate Certificate</Text>}
              </TouchableOpacity>
            </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex:1, backgroundColor:theme.colors.background},
  center: {flex:1, justifyContent:'center', alignItems:'center'},
  filterRow:{maxHeight:52, paddingVertical:8, marginTop:48},
  filterChip: {paddingHorizontal:16, paddingVertical:6, backgroundColor:theme.colors.card, borderRadius:20, marginRight:8, borderWidth:1, borderColor:theme.colors.border},
  filterText: {color:theme.colors.textSecondary, fontSize:13},
  emptyBox: {alignItems:'center', paddingVertical:60},
  emptyIcon: {fontSize:48, marginBottom:12},
  emptyText: {color:theme.colors.textSecondary, fontSize:16},
  certCard: {backgroundColor:theme.colors.surface, margin:12, marginBottom:4, borderRadius:16, padding:16, borderWidth:1, borderColor:theme.colors.border},
  certHeader: {flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12},
  certName: {color:theme.colors.text, fontSize:16, fontWeight:'700'},
  certDept: {color:theme.colors.textSecondary, fontSize:13},
  certDate: {color:theme.colors.textMuted, fontSize:12},
  statusBadge: {borderRadius:8, paddingHorizontal:8, paddingVertical:4},
  statusText: {fontSize:11, fontWeight:'700'},
  detailsBox: {backgroundColor:theme.colors.card, borderRadius:10, padding:12, marginBottom:12},
  detailKey: {color:theme.colors.textMuted, fontSize:11, fontWeight:'700', textTransform:'uppercase', letterSpacing:0.5, marginTop:8},
  detailVal: {color:theme.colors.text, fontSize:13, marginTop:2},
  actionRow: {flexDirection:'row', gap:8},
  rejectBtn: {flex:1, borderRadius:10, paddingVertical:10, alignItems:'center', borderWidth:1, borderColor:theme.colors.error},
  rejectBtnText: {color:theme.colors.error, fontWeight:'700'},
  approveBtn: {flex:1, backgroundColor:theme.colors.primary, borderRadius:10, paddingVertical:10, alignItems:'center'},
  approveBtnText: {color:'#fff', fontWeight:'700'},
  pdfReady: {color:theme.colors.success, fontSize:12, marginTop:8},
  // Modal
  modalOverlay: {flex:1, backgroundColor:'rgba(0,0,0,0.7)', justifyContent:'flex-end'},
  modalContent: {backgroundColor:theme.colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, padding:24},
  modalTitle: {color:theme.colors.text, fontSize:18, fontWeight:'700'},
  modalFor: {color:theme.colors.textSecondary, fontSize:14, marginBottom:16},
  fieldLabel: {color:theme.colors.textSecondary, fontSize:12, fontWeight:'600', marginBottom:6},
  notesInput: {backgroundColor:theme.colors.card, borderRadius:10, borderWidth:1, borderColor:theme.colors.border, color:theme.colors.text, paddingHorizontal:14, paddingVertical:12, height:100, textAlignVertical:'top', marginBottom:12},
  modalHint: {color:theme.colors.textMuted, fontSize:12, marginBottom:16},
  modalActions: {flexDirection:'row', gap:12},
  cancelBtn: {flex:1, backgroundColor:theme.colors.card, borderRadius:12, paddingVertical:14, alignItems:'center', borderWidth:1, borderColor:theme.colors.border},
  cancelBtnText: {color:theme.colors.textSecondary, fontWeight:'600'},
  createBtn: {flex:1, backgroundColor:theme.colors.primary, borderRadius:12, paddingVertical:14, alignItems:'center'},
  createBtnText: {color:'#fff', fontWeight:'700', fontSize:12},
});

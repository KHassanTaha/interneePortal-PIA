import React, {useState, useEffect} from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, TextInput, Modal, RefreshControl,
} from 'react-native';
import client from '../../api/client';
import {API_BASE_URL} from '../../config/constants';
import theme from '../../theme';

export default function CertificateScreen() {
  const [cert, setCert] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applying, setApplying] = useState(false);
  const [form, setForm] = useState({projectName:'', projectOutcomes:'', languagesUsed:'', additionalNotes:''});

  const fetchCertificate = async () => {
    try {
      const res = await client.get('/intern/certificate');
      setCert(res.data);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchCertificate(); }, []);

  const applyCertificate = async () => {
    if (!form.projectName || !form.projectOutcomes || !form.languagesUsed) {
      Alert.alert('Required', 'Please fill Project Name, Outcomes, and Languages'); return;
    }
    setApplying(true);
    try {
      await client.post('/intern/certificate', form);
      Alert.alert('Success', 'Certificate application submitted! Awaiting mentor approval.');
      setShowApplyModal(false);
      fetchCertificate();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Application failed');
    } finally { setApplying(false); }
  };

  const downloadPdf = () => {
    if (!cert?.pdfPath) { Alert.alert('Not Ready', 'Certificate PDF not yet generated'); return; }
    const {Linking} = require('react-native');
    const url = `${API_BASE_URL.replace('/api', '')}/files/${cert.pdfPath}`;
    Linking.openURL(url);
  };

  const statusConfig = {
    Applied: {color: theme.colors.info, icon: '📝', label: 'Application Submitted'},
    UnderReview: {color: theme.colors.warning, icon: '🔍', label: 'Under Review'},
    Approved: {color: theme.colors.success, icon: '🎓', label: 'Certificate Ready'},
    Rejected: {color: theme.colors.error, icon: '❌', label: 'Rejected'},
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchCertificate();}} tintColor={theme.colors.primary} />}>

      <View style={styles.header}>
        <Text style={styles.title}>Internship Certificate</Text>
        <Text style={styles.subtitle}>Official PIA completion certificate</Text>
      </View>

      {!cert ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>🎓</Text>
          <Text style={styles.emptyTitle}>Apply for Certificate</Text>
          <Text style={styles.emptyDesc}>
            Once your internship is complete, apply for your official internship certificate from PIA
          </Text>
          <TouchableOpacity id="apply-certificate-btn" style={styles.applyBtn} onPress={() => setShowApplyModal(true)}>
            <Text style={styles.applyBtnText}>Apply Now</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.statusCard}>
          <Text style={styles.statusIcon}>{statusConfig[cert.status]?.icon ?? '📄'}</Text>
          <Text style={[styles.statusLabel, {color: statusConfig[cert.status]?.color ?? theme.colors.text}]}>
            {statusConfig[cert.status]?.label ?? cert.status}
          </Text>
          <Text style={styles.statusDate}>Applied: {new Date(cert.appliedAt).toLocaleDateString()}</Text>

          <View style={styles.detailsBox}>
            <Text style={styles.detailLabel}>Project</Text>
            <Text style={styles.detailValue}>{cert.projectName}</Text>
            <Text style={styles.detailLabel}>Technologies Used</Text>
            <Text style={styles.detailValue}>{cert.languagesUsed}</Text>
            <Text style={styles.detailLabel}>Outcomes</Text>
            <Text style={styles.detailValue}>{cert.projectOutcomes}</Text>
            {cert.status === 'Approved' && (
              <>
                <Text style={styles.detailLabel}>Tech Stack (as verified)</Text>
                <Text style={styles.detailValue}>{cert.techStack}</Text>
                <Text style={styles.detailLabel}>Intern Work</Text>
                <Text style={styles.detailValue}>{cert.internWork}</Text>
                {cert.departmentHeadName ? (
                  <>
                    <Text style={styles.detailLabel}>Department Head</Text>
                    <Text style={styles.detailValue}>{cert.departmentHeadName}</Text>
                  </>
                ) : null}
              </>
            )}
          </View>

          {cert.rejectionReason && (
            <View style={styles.rejectionBox}>
              <Text style={styles.rejectionText}>Reason: {cert.rejectionReason}</Text>
            </View>
          )}

          {cert.status === 'Approved' && cert.pdfPath && (
            <TouchableOpacity id="download-certificate-pdf" style={styles.downloadBtn} onPress={downloadPdf}>
              <Text style={styles.downloadBtnText}>📥 Download Certificate PDF</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Apply Modal */}
      <Modal visible={showApplyModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Certificate Application</Text>
              <Text style={styles.modalSubtitle}>This information will appear on your official certificate</Text>

              {[
                {key:'projectName', label:'Project Name *', placeholder:'e.g. PIA IT Workshop'},
                {key:'languagesUsed', label:'Technologies / Languages Used *', placeholder:'e.g. HTML, CSS, JavaScript, .NET, SQL Server'},
                {key:'projectOutcomes', label:'Project Outcomes *', placeholder:'Describe what you built and achieved...', multiline: true},
                {key:'additionalNotes', label:'Additional Notes', placeholder:'Any other information...', multiline: true},
              ].map(f => (
                <View key={f.key} style={styles.formField}>
                  <Text style={styles.fieldLabel}>{f.label}</Text>
                  <TextInput
                    id={`cert-${f.key}`}
                    style={[styles.fieldInput, f.multiline && styles.textArea]}
                    placeholder={f.placeholder}
                    placeholderTextColor={theme.colors.textMuted}
                    multiline={f.multiline}
                    numberOfLines={f.multiline ? 4 : 1}
                    value={form[f.key]}
                    onChangeText={v => setForm(p => ({...p, [f.key]: v}))}
                  />
                </View>
              ))}

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowApplyModal(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity id="submit-certificate" style={styles.createBtn} onPress={applyCertificate} disabled={applying}>
                  {applying ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>Submit</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
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
  emptyCard: {margin:20, backgroundColor:theme.colors.surface, borderRadius:20, padding:32, alignItems:'center', borderWidth:1, borderColor:theme.colors.border},
  emptyIcon: {fontSize:56, marginBottom:12},
  emptyTitle: {color:theme.colors.text, fontSize:18, fontWeight:'700'},
  emptyDesc: {color:theme.colors.textSecondary, fontSize:14, textAlign:'center', marginTop:8, marginBottom:24},
  applyBtn: {backgroundColor:theme.colors.primary, borderRadius:12, paddingHorizontal:24, paddingVertical:12},
  applyBtnText: {color:'#fff', fontWeight:'700', fontSize:15},
  statusCard: {margin:20, backgroundColor:theme.colors.surface, borderRadius:20, padding:24, alignItems:'center', borderWidth:1, borderColor:theme.colors.border},
  statusIcon: {fontSize:56, marginBottom:8},
  statusLabel: {fontSize:20, fontWeight:'700', marginBottom:4},
  statusDate: {color:theme.colors.textMuted, fontSize:12},
  detailsBox: {width:'100%', backgroundColor:theme.colors.card, borderRadius:12, padding:16, marginTop:16},
  detailLabel: {color:theme.colors.textMuted, fontSize:11, fontWeight:'700', textTransform:'uppercase', letterSpacing:1, marginTop:12},
  detailValue: {color:theme.colors.text, fontSize:14, marginTop:4},
  rejectionBox: {backgroundColor:theme.colors.error+'22', borderRadius:8, padding:12, marginTop:12, width:'100%'},
  rejectionText: {color:theme.colors.error, fontSize:13},
  downloadBtn: {backgroundColor:theme.colors.success, borderRadius:12, paddingHorizontal:24, paddingVertical:12, marginTop:20, width:'100%', alignItems:'center'},
  downloadBtnText: {color:'#fff', fontWeight:'700', fontSize:15},
  // Modal
  modalOverlay: {flex:1, backgroundColor:'rgba(0,0,0,0.7)'},
  modalContent: {backgroundColor:theme.colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, padding:24, marginTop:'auto'},
  modalTitle: {color:theme.colors.text, fontSize:18, fontWeight:'700', marginBottom:4},
  modalSubtitle: {color:theme.colors.textMuted, fontSize:13, marginBottom:20},
  formField: {marginBottom:14},
  fieldLabel: {color:theme.colors.textSecondary, fontSize:12, fontWeight:'600', marginBottom:6},
  fieldInput: {backgroundColor:theme.colors.card, borderRadius:10, borderWidth:1, borderColor:theme.colors.border, color:theme.colors.text, paddingHorizontal:14, paddingVertical:12, fontSize:14},
  textArea: {height:100, textAlignVertical:'top'},
  modalActions: {flexDirection:'row', gap:12, marginTop:8},
  cancelBtn: {flex:1, backgroundColor:theme.colors.card, borderRadius:12, paddingVertical:14, alignItems:'center', borderWidth:1, borderColor:theme.colors.border},
  cancelBtnText: {color:theme.colors.textSecondary, fontWeight:'600'},
  createBtn: {flex:1, backgroundColor:theme.colors.primary, borderRadius:12, paddingVertical:14, alignItems:'center'},
  createBtnText: {color:'#fff', fontWeight:'700'},
});

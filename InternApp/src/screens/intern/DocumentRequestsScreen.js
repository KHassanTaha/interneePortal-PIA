import React, {useCallback, useState, useMemo} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {showToast} from '../../components/AppToast';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, RefreshControl, Modal, TextInput,
} from 'react-native';
import client from '../../api/client';
import {write} from '../../api/write';
import {useAppTheme} from '../../theme';
import ScreenBackground from '../../components/ScreenBackground';
import AppHeader from '../../components/AppHeader';
import RightSidebar from '../../components/RightSidebar';
import GradientButton from '../../components/GradientButton';
import Icon from '../../components/Icon';
import Spinner from '../../components/Spinner';
import SwipeableModal from '../../components/SwipeableModal';
import Pdf from 'react-native-pdf';
import ReactNativeBlobUtil from 'react-native-blob-util';
import CenteredModalCard from '../../components/CenteredModalCard';

const SECTIONS = [
  {key: 'gatePass', title: 'Gate Pass', icon: 'ticket', subtitle: 'Entry permission at PIA Head Office', endpoint: '/intern/gatepass'},
  {key: 'idCard', title: 'ID Card', icon: 'idCard', subtitle: 'Official company identification', endpoint: '/intern/idcard'},
  {key: 'certificate', title: 'Certificate', icon: 'certificate', subtitle: 'Internship completion certificate', endpoint: '/intern/certificate'},
];

const ACTIVE_STATUSES = ['Pending', 'UnderReview', 'Approved'];

export default function DocumentRequestsScreen({navigation}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [faceApproved, setFaceApproved] = useState(null);
  const [cnicApproved, setCnicApproved] = useState(null);
  const [cvApproved, setCvApproved] = useState(null);
  const [reportApproved, setReportApproved] = useState(null);
  const [requests, setRequests] = useState({gatePass: [], idCard: [], certificate: []});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedForm, setExpandedForm] = useState(null);
  const [submitting, setSubmitting] = useState(null);
  const [certForm, setCertForm] = useState({projectName: '', languagesUsed: '', projectOutcomes: '', additionalNotes: ''});
  const [highlightTaskId, setHighlightTaskId] = useState(null);
  const [completedTasks, setCompletedTasks] = useState([]);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [pdfPath, setPdfPath] = useState(null);
  const [viewerTitle, setViewerTitle] = useState('');
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [showEligibilityModal, setShowEligibilityModal] = useState(false);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [certEligibility, setCertEligibility] = useState(null);

  const handleNewCertificate = async () => {
    setExpandedForm(null);
    setShowEligibilityModal(true);
    setEligibilityLoading(true);
    setCertEligibility(null);
    try {
      const res = await client.get('/intern/certificate/eligibility');
      setCertEligibility(res.data);
    } catch {
      showToast("Couldn't check eligibility. Try again.", 'error');
    } finally { setEligibilityLoading(false); }
    try {
      const tasksRes = await client.get('/intern/tasks?status=Completed');
      setCompletedTasks(tasksRes.data);
    } catch {}
  };

  const eligCheck = (label, ok, text) => (
    <View style={styles.eligRow}>
      <Icon name={ok ? 'check' : 'close'} size={15} color={ok ? colors.success : colors.error} />
      <View style={styles.eligRowInfo}>
        <Text style={styles.eligRowLabel}>{label}</Text>
        <Text style={styles.eligRowText}>{text}</Text>
      </View>
    </View>
  );

  const fetchAll = async () => {
    try {
      const [gp, ic, cf, pr] = await Promise.all([
        client.get('/intern/gatepass'),
        client.get('/intern/idcard'),
        client.get('/intern/certificate'),
        client.get('/intern/profile'),
      ]);
      setRequests({gatePass: gp.data, idCard: ic.data, certificate: cf.data});
      setFaceApproved(pr.data.faceEnrollmentStatus === 'Approved');
      setCnicApproved(!!pr.data.cnicApproved);
      setCvApproved(!!pr.data.cvApproved);
      setReportApproved(!!pr.data.reportApproved);
    } catch { showToast("Couldn't load your requests. Pull to refresh.", 'error'); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const loadAll = async () => {
        try {
          const [gp, ic, cf, pr] = await Promise.all([
            client.get('/intern/gatepass'),
            client.get('/intern/idcard'),
            client.get('/intern/certificate'),
            client.get('/intern/profile'),
          ]);
          if (!cancelled) {
            setRequests({gatePass: gp.data, idCard: ic.data, certificate: cf.data});
            setFaceApproved(pr.data.faceEnrollmentStatus === 'Approved');
            setCnicApproved(!!pr.data.cnicApproved);
            setCvApproved(!!pr.data.cvApproved);
            setReportApproved(!!pr.data.reportApproved);
          }
        } catch { if (!cancelled) showToast("Couldn't load your requests. Pull to refresh.", 'error'); }
        finally { if (!cancelled) { setLoading(false); setRefreshing(false); } }
      };
      loadAll();
      return () => { cancelled = true; };
    }, [])
  );

  const visibleRequests = list => list.filter(item => {
    if (item.status !== 'Rejected') return true;
    const ts = new Date(item.requestedAt || item.appliedAt).getTime();
    return !list.some(other => other.id !== item.id && new Date(other.requestedAt || other.appliedAt).getTime() > ts);
  });

  const badge = item => {
    if (item.status === 'Rejected') return {label: 'Rejected', color: colors.error, icon: 'close'};
    if (item.status === 'Approved' && item.issued) return {label: 'Approved', color: colors.success, icon: 'check'};
    if (item.status === 'Approved') return {label: 'Approved', color: colors.warning, icon: 'clock'};
    if (item.status === 'UnderReview') return {label: 'Under Review', color: colors.warning, icon: 'search'};
    return {label: 'Pending', color: colors.warning, icon: 'clock'};
  };

  const activeCount = list => list.filter(i => ACTIVE_STATUSES.includes(i.status)).length;

  const openPdf = async (item, title) => {
    if (!item.pdfPath) { showToast('PDF not generated yet. Try again later.', 'error'); return; }
    const {fetchFileLocal} = require('../../api/fileClient');
    setViewerTitle(title);
    try {
      const local = await fetchFileLocal(item.pdfPath);
      setPdfPath(local);
      setViewerVisible(true);
    } catch {
      showToast("Couldn't load the PDF. Try again.", 'error');
    }
  };

  const downloadPdf = item => {
    if (!item.pdfPath) { showToast('PDF not generated yet. Try again later.', 'error'); return; }
    const {openFileWithAuth} = require('../../api/fileClient');
    openFileWithAuth(item.pdfPath).catch(() => showToast("Couldn't download the PDF. Try again.", 'error'));
  };

  const closeViewer = () => {
    setViewerVisible(false);
    if (pdfPath) { ReactNativeBlobUtil.fs.unlink(pdfPath).catch(() => {}); setPdfPath(null); }
  };

  const submitRequest = async (section) => {
    if (faceApproved === false) {
      showToast('Your face enrollment must be approved before requesting official documents.', 'error');
      return;
    }
    if (section.key !== 'certificate' && (cnicApproved === false || cvApproved === false)) {
      showToast('Your CNIC and CV/Resume must be approved before requesting official documents.', 'error');
      return;
    }
    setSubmitting(section.key);
    try {
      if (section.key === 'certificate') {
        if (!certForm.projectName || !certForm.languagesUsed || !certForm.projectOutcomes) {
          showToast('Fill in Project Name, Languages, and Outcomes.', 'error');
          return;
        }
        if (reportApproved === false) {
          showToast('Upload and get approval for your internship report first.', 'error');
          return;
        }
        if (!highlightTaskId) {
          showToast('Select one completed task as your highlight.', 'error');
          return;
        }
      }
      const queued =
        section.key === 'certificate'
          ? (
              await write({
                kind: 'intern',
                label: 'Certificate application',
                method: 'post',
                url: '/intern/certificate',
                body: {...certForm, highlightTaskId},
              })
            ).queued
          : (await write({kind: 'intern', label: `${section.title} request`, method: 'post', url: section.endpoint})).queued;

      showToast(
        queued
          ? `${section.title} request saved locally — will submit when online.`
          : section.key === 'certificate'
            ? 'Certificate application submitted. Awaiting mentor approval.'
            : `${section.title} request submitted. Awaiting approval.`,
        queued ? 'info' : 'success',
      );
      if (section.key === 'certificate') {
        setCertForm({projectName: '', languagesUsed: '', projectOutcomes: '', additionalNotes: ''});
      }
      setExpandedForm(null);
      fetchAll();
    } catch (e) {
      showToast(e.response?.data?.message || "Couldn't submit. Try again.", 'error');
    } finally { setSubmitting(null); }
  };

  if (loading) return <Spinner style={styles.center} />;

  return (
    <ScreenBackground>
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchAll();}} tintColor={colors.primary} />}>

      <AppHeader
        home
        right={(
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open navigation menu" id="docreq-menu-btn" onPress={() => setSidebarVisible(true)} style={styles.menuBtn}><Icon name="menu" size={22} color="#fff" />
          </TouchableOpacity>
        )}
      />

      <RightSidebar
        visible={sidebarVisible}
        onClose={() => setSidebarVisible(false)}
        navigation={navigation}
      />

      <View style={styles.header}>
        <Text style={styles.subtitle}>Gate pass, ID card and certificate requests</Text>
      </View>

      {cnicApproved === false && (
        <View id="docreq-cnic-gate" style={styles.gateBanner}>
          <View style={styles.gateBannerIcon}><Icon name="lock" size={16} color={colors.warning} /></View>
          <Text style={styles.gateBannerText}>
            Your CNIC must be approved before you can request official documents.
          </Text>
          <TouchableOpacity id="docreq-cnic-goto" style={styles.gateBannerBtn} onPress={() => navigation.navigate('Documents')}>
            <Text style={styles.gateBannerBtnText}>Upload CNIC</Text>
          </TouchableOpacity>
        </View>
      )}

      {cvApproved === false && (
        <View id="docreq-cv-gate" style={styles.gateBanner}>
          <View style={styles.gateBannerIcon}><Icon name="lock" size={16} color={colors.warning} /></View>
          <Text style={styles.gateBannerText}>
            Your CV/Resume must be approved before you can request official documents.
          </Text>
          <TouchableOpacity id="docreq-cv-goto" style={styles.gateBannerBtn} onPress={() => navigation.navigate('Documents')}>
            <Text style={styles.gateBannerBtnText}>Upload CV/Resume</Text>
          </TouchableOpacity>
        </View>
      )}

      {faceApproved === false && (
        <View id="docreq-face-gate" style={styles.gateBanner}>
          <View style={styles.gateBannerIcon}><Icon name="lock" size={16} color={colors.warning} /></View>
          <Text style={styles.gateBannerText}>
            Your face enrollment must be approved before you can request official documents.
          </Text>
          <TouchableOpacity id="docreq-face-goto" style={styles.gateBannerBtn} onPress={() => navigation.navigate('FaceEnroll')}>
            <Text style={styles.gateBannerBtnText}>Enroll Face</Text>
          </TouchableOpacity>
        </View>
      )}

      {SECTIONS.map(section => {
        const list = requests[section.key] || [];
        const hasActive = activeCount(list) > 0;
        const canRequest = !hasActive;
        const formOpen = expandedForm === section.key;
        return (
          <View key={section.key} style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconBox}>
                <Icon name={section.icon} size={20} color={colors.textAccent} />
              </View>
              <View style={styles.sectionInfo}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <Text style={styles.sectionSubtitle}>{section.subtitle}</Text>
              </View>
              {canRequest && !formOpen && (section.key === 'certificate' || (faceApproved !== false && cnicApproved !== false && cvApproved !== false)) && (
                <GradientButton
                  id={`new-${section.key}-btn`}
                  style={styles.newBtn}
                  onPress={() => section.key === 'certificate' ? handleNewCertificate() : setExpandedForm(section.key)}
                  icon={<Icon name="plus" size={15} color="#fff" />}>
                  <Text style={styles.newBtnText}>New</Text>
                </GradientButton>
              )}
            </View>

            {formOpen && (
              <View style={styles.formBox}>
                {section.key === 'certificate' ? (
                  <>
                    <Text style={styles.formNote}>This information will appear on your official certificate.</Text>
                    {[
                      {key: 'projectName', label: 'Project Name *', placeholder: 'e.g. PIA IT Workshop'},
                      {key: 'languagesUsed', label: 'Technologies / Languages Used *', placeholder: 'e.g. HTML, CSS, JavaScript, .NET'},
                      {key: 'projectOutcomes', label: 'Project Outcomes *', placeholder: 'Describe what you built and achieved...', multiline: true},
                      {key: 'additionalNotes', label: 'Additional Notes', placeholder: 'Any other information...', multiline: true},
                    ].map(f => (
                      <View key={f.key} style={styles.formField}>
                        <Text style={styles.fieldLabel}>{f.label}</Text>
                        <TextInput
                          id={`cert-${f.key}`}
                          style={[styles.fieldInput, f.multiline && styles.textArea]}
                          placeholder={f.placeholder}
                          placeholderTextColor={colors.textMuted}
                          multiline={f.multiline}
                          numberOfLines={f.multiline ? 4 : 1}
                          value={certForm[f.key]}
                          onChangeText={v => setCertForm(p => ({...p, [f.key]: v}))}
                        />
                      </View>
                    ))}

                    <View style={[styles.reportStatus, {borderColor: reportApproved ? colors.success + '55' : colors.warning + '55'}]}>
                      <Icon name={reportApproved ? 'check' : 'clock'} size={16} color={reportApproved ? colors.success : colors.warning} />
                      <Text style={styles.reportStatusText}>
                        {reportApproved
                          ? 'Internship report approved'
                          : 'Upload and get your internship report approved in Documents before applying.'}
                      </Text>
                      <TouchableOpacity id="cert-goto-documents" style={styles.reportStatusBtn} onPress={() => navigation.navigate('Documents')}>
                        <Text style={styles.reportStatusBtnText}>{reportApproved ? 'View' : 'Upload'}</Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.fieldLabel}>Highlight Task *</Text>
                    {completedTasks.length === 0 ? (
                      <Text style={styles.noTasksText}>No completed tasks yet. Complete a task to feature it on your certificate.</Text>
                    ) : (
                      completedTasks.map(t => {
                        const selected = highlightTaskId === t.id;
                        return (
                          <TouchableOpacity
                            key={t.id}
                            id={`highlight-task-${t.id}`}
                            style={[styles.taskRow, selected && styles.taskRowSelected]}
                            onPress={() => setHighlightTaskId(t.id)}>
                            <Icon name={selected ? 'check' : 'list'} size={16} color={selected ? colors.success : colors.textMuted} />
                            <Text style={[styles.taskRowTitle, {color: selected ? colors.success : colors.text}]} numberOfLines={1}>{t.title}</Text>
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </>
                ) : (
                  <Text style={styles.formNote}>
                    Your approved CNIC and CV/Resume documents are used automatically for the {section.title.toLowerCase()}.
                  </Text>
                )}

                <View style={styles.formActions}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setExpandedForm(null)}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <GradientButton
                    id={`submit-${section.key}`}
                    style={styles.submitBtn}
                    onPress={() => submitRequest(section)}
                    disabled={submitting !== null}
                    loading={submitting === section.key}>
                    <Text style={styles.submitBtnText}>Submit</Text>
                  </GradientButton>
                </View>
              </View>
            )}

            {list.length === 0 && !formOpen ? (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyText}>No {section.title.toLowerCase()} requests yet.</Text>
              </View>
            ) : (
              visibleRequests(list).map(item => {
                const b = badge(item);
                return (
                  <View key={item.id} style={styles.requestRow}>
                    <View style={styles.requestTop}>
                      <Text style={styles.requestDate}>{new Date(item.requestedAt || item.appliedAt).toLocaleDateString()}</Text>
                      <View style={[styles.badge, {backgroundColor: b.color + '22'}]}>
                        <Icon name={b.icon} size={11} color={b.color} />
                        <Text style={[styles.badgeText, {color: b.color}]}>{b.label}</Text>
                      </View>
                    </View>
                    {item.status === 'Rejected' && item.rejectionReason && (
                      <View style={styles.rejectionBox}>
                        <Text style={styles.rejectionText}>Reason: {item.rejectionReason}</Text>
                      </View>
                    )}
                    {item.pdfPath && (
                      <View style={styles.pdfRow}>
                        <TouchableOpacity
                          id={`view-${section.key}-${item.id}`}
                          style={[styles.pdfBtn, {backgroundColor: colors.primary}]}
                          onPress={() => openPdf(item, `${section.title} PDF`)}>
                          <Icon name="eye" size={14} color="#fff" />
                          <Text style={styles.pdfBtnText}>View PDF</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          id={`download-${section.key}-${item.id}`}
                          style={[styles.pdfBtn, {backgroundColor: colors.success}]}
                          onPress={() => downloadPdf(item)}>
                          <Icon name="download" size={14} color="#fff" />
                          <Text style={styles.pdfBtnText}>Download</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        );
      })}

      {/* Certificate eligibility modal (#19) */}
      <Modal visible={showEligibilityModal} transparent animationType="fade" onRequestClose={() => setShowEligibilityModal(false)}>
        <View style={styles.modalOverlay}>
          <CenteredModalCard style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Certificate Eligibility</Text>
              <TouchableOpacity id="close-eligibility-modal" onPress={() => setShowEligibilityModal(false)}>
                <Icon name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            {eligibilityLoading ? (
              <View style={styles.centerPad}><ActivityIndicator size="large" color={colors.textAccent} /></View>
            ) : certEligibility ? (
              <>
                <View style={[styles.eligBanner, {backgroundColor: (certEligibility.eligible ? colors.success : colors.error) + '22'}]}>
                  <Icon name={certEligibility.eligible ? 'check' : 'close'} size={20} color={certEligibility.eligible ? colors.success : colors.error} />
                  <Text style={[styles.eligBannerText, {color: certEligibility.eligible ? colors.success : colors.error}]}>
                    {certEligibility.eligible ? 'You are eligible for a certificate!' : "You're not eligible yet."}
                  </Text>
                </View>
                <View style={styles.eligRows}>
                  {eligCheck('Internship period', certEligibility.endDatePassed, certEligibility.endDatePassed ? 'Completed' : 'Still in progress')}
                  {eligCheck('Attendance', certEligibility.percentage >= certEligibility.thresholdPct, `${certEligibility.percentage.toFixed(1)}% (need ${certEligibility.thresholdPct}%)`)}
                  {eligCheck('Tasks completed', certEligibility.taskPct >= certEligibility.taskThresholdPct, `${certEligibility.taskCompleted}/${certEligibility.taskTotal} (${certEligibility.taskPct.toFixed(1)}%, need ${certEligibility.taskThresholdPct}%)`)}
                  {eligCheck('Internship report', !!certEligibility.reportApproved, certEligibility.reportApproved ? 'Approved' : 'Upload and get your internship report approved')}
                  {eligCheck('Highlight task', (certEligibility.completedTasks || 0) > 0, `You have ${certEligibility.completedTasks || 0} completed task(s) to choose from`)}
                </View>
                {certEligibility.eligible ? (
                  <GradientButton id="cert-continue-form" style={styles.eligBtn} onPress={() => { setShowEligibilityModal(false); setExpandedForm('certificate'); }}>
                    <Text style={styles.submitBtnText}>Continue to Application</Text>
                  </GradientButton>
                ) : (
                  <TouchableOpacity id="elig-close-btn" style={styles.eligCloseBtn} onPress={() => setShowEligibilityModal(false)}>
                    <Text style={styles.eligCloseText}>Close</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : null}
          </CenteredModalCard>
        </View>
      </Modal>

      {/* PDF viewer */}
      <SwipeableModal visible={viewerVisible} onRequestClose={closeViewer} sheetStyle={styles.viewerContainer}>
          <View style={styles.viewerHeader}>
            <Text style={styles.viewerTitle}>{viewerTitle}</Text>
            <TouchableOpacity id="close-pdf-viewer" style={styles.viewerClose} onPress={closeViewer}>
              <Icon name="close" size={16} color={colors.error} />
            </TouchableOpacity>
          </View>
          {pdfPath ? (
            <Pdf
              source={{uri: pdfPath}}
              style={styles.pdfView}
              onError={(e) => showToast(`Couldn't render the PDF: ${e.message}`, 'error')}
            />
          ) : null}
      </SwipeableModal>
    </ScrollView>
    </ScreenBackground>
  );
}

const makeStyles = colors => StyleSheet.create({
  container: {flex: 1},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background},
  header: {padding: 20, paddingTop: 12},
  subtitle: {color: colors.textMuted, fontSize: 14, marginTop: 4},
  menuBtn: {width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', justifyContent: 'center', alignItems: 'center'},
  sectionCard: {marginHorizontal: 16, marginBottom: 14, backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border},
  sectionHeader: {flexDirection: 'row', alignItems: 'center'},
  sectionIconBox: {width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center', marginRight: 12},
  sectionInfo: {flex: 1},
  sectionTitle: {color: colors.text, fontSize: 16, fontWeight: '700'},
  sectionSubtitle: {color: colors.textMuted, fontSize: 12, marginTop: 2},
  newBtn: {flexDirection: 'row', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9},
  newBtnText: {color: '#fff', fontWeight: '700', fontSize: 13},
  gateBanner: {flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 14, backgroundColor: colors.warning + '18', borderWidth: 1, borderColor: colors.warning + '55', borderRadius: 12, padding: 12},
  gateBannerIcon: {width: 28, height: 28, borderRadius: 14, backgroundColor: colors.warning + '22', justifyContent: 'center', alignItems: 'center'},
  gateBannerText: {flex: 1, color: colors.text, fontSize: 12.5, fontWeight: '600', lineHeight: 17},
  gateBannerBtn: {backgroundColor: colors.warning, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8},
  gateBannerBtnText: {color: '#fff', fontSize: 12, fontWeight: '700'},
  formBox: {backgroundColor: colors.card, borderRadius: 12, padding: 14, marginTop: 12, borderWidth: 1, borderColor: colors.border},
  formNote: {color: colors.textSecondary, fontSize: 13, marginBottom: 12, lineHeight: 18},
  formField: {marginBottom: 12},
  fieldLabel: {color: colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 6},
  fieldInput: {backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14},
  textArea: {height: 90, textAlignVertical: 'top'},
  reportStatus: {flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 12},
  reportStatusText: {flex: 1, color: colors.textSecondary, fontSize: 12.5, lineHeight: 17},
  reportStatusBtn: {backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8},
  reportStatusBtnText: {color: '#fff', fontSize: 12, fontWeight: '700'},
  noTasksText: {color: colors.textMuted, fontSize: 12.5, marginBottom: 12},
  taskRow: {flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 11, marginBottom: 8},
  taskRowSelected: {borderColor: colors.success, backgroundColor: colors.success + '11'},
  taskRowTitle: {flex: 1, fontSize: 13.5, fontWeight: '600'},
  formActions: {flexDirection: 'row', gap: 12, marginTop: 4},
  cancelBtn: {flex: 1, backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border},
  cancelBtnText: {color: colors.textSecondary, fontWeight: '600'},
  submitBtn: {flex: 1, borderRadius: 12},
  submitBtnText: {color: '#fff', fontWeight: '700'},
  emptyRow: {paddingVertical: 14, alignItems: 'center'},
  emptyText: {color: colors.textMuted, fontSize: 13},
  requestRow: {borderTopWidth: 1, borderTopColor: colors.border, marginTop: 12, paddingTop: 12},
  requestTop: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  requestDate: {color: colors.textMuted, fontSize: 12},
  badge: {flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4},
  badgeText: {fontSize: 11, fontWeight: '700'},
  rejectionBox: {backgroundColor: colors.error + '22', borderRadius: 8, padding: 10, marginTop: 8},
  rejectionText: {color: colors.error, fontSize: 12},
  pdfRow: {flexDirection: 'row', gap: 10, marginTop: 10},
  pdfBtn: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, flex: 1, borderRadius: 10, paddingVertical: 10},
  pdfBtnText: {color: '#fff', fontWeight: '700', fontSize: 13},
  viewerContainer: {flex: 1, backgroundColor: '#000'},
  viewerHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: colors.surface},
  viewerTitle: {color: colors.text, fontSize: 16, fontWeight: '700'},
  viewerClose: {backgroundColor: colors.card, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8},
  pdfView: {flex: 1},
  modalOverlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24},
  modalCard: {backgroundColor: colors.surface, borderRadius: 18, padding: 20, borderWidth: 1, borderColor: colors.border},
  modalHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16},
  modalTitle: {color: colors.text, fontSize: 18, fontWeight: '700'},
  centerPad: {paddingVertical: 32, alignItems: 'center'},
  eligBanner: {flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 12, marginBottom: 12},
  eligBannerText: {flex: 1, fontSize: 14, fontWeight: '700'},
  eligRows: {gap: 10, marginBottom: 16},
  eligRow: {flexDirection: 'row', alignItems: 'flex-start', gap: 8},
  eligRowInfo: {flex: 1},
  eligRowLabel: {color: colors.text, fontSize: 13, fontWeight: '600'},
  eligRowText: {color: colors.textMuted, fontSize: 12, marginTop: 1},
  eligBtn: {borderRadius: 12},
  eligCloseBtn: {backgroundColor: colors.card, borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: colors.border},
  eligCloseText: {color: colors.textSecondary, fontWeight: '600'},
});
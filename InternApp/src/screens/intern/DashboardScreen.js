import React, {useCallback, useState, useMemo, useEffect} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {showToast} from '../../components/AppToast';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator, Switch,
} from 'react-native';
import {useDispatch, useSelector} from 'react-redux';
import client from '../../api/client';
import {useAppTheme} from '../../theme';
import ScreenBackground from '../../components/ScreenBackground';
import {fmtDate} from '../../utils/dates';
import RightSidebar from '../../components/RightSidebar';
import AppHeader from '../../components/AppHeader';
import Icon from '../../components/Icon';
import Spinner from '../../components/Spinner';
import GradientButton from '../../components/GradientButton';
import {effectiveFaceStatus} from '../../utils/debug';
import {
  setSimulateLocation,
  setSimulateFace,
  setSimulateDocsUploaded,
} from '../../store/slices/debugSlice';

const TRANSFER_COLORS = {Pending: '#f59e0b', Endorsed: '#3b82f6', InternAccepted: '#8b5cf6', Finalised: '#22c55e', Rejected: '#ef4444'};
const SHIFT_COLORS = {Pending: '#f59e0b', Accepted: '#22c55e', Rejected: '#ef4444'};

export default function InternDashboard({navigation}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dispatch = useDispatch();
  const debug = useSelector(s => s.debug);
  const device = useSelector(s => s.auth.device);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [devices, setDevices] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [allSetDismissed, setAllSetDismissed] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('deviceBannerDismissed').then(v => setBannerDismissed(v === '1'));
    AsyncStorage.getItem('allSetBannerDismissed').then(v => setAllSetDismissed(v === '1'));
  }, []);

  const fetchDashboard = async () => {
    try {
      const [dashRes, devRes] = await Promise.all([
        client.get('/intern/dashboard'),
        client.get('/intern/devices'),
      ]);
      setDashboard(dashRes.data);
      setDevices(devRes.data);
    } catch { showToast("Couldn't load the dashboard. Check your connection and pull to refresh.", 'error'); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const fetchData = async () => {
        try {
          const [dashRes, devRes] = await Promise.all([
            client.get('/intern/dashboard'),
            client.get('/intern/devices'),
          ]);
          if (!cancelled) {
            setDashboard(dashRes.data);
            setDevices(devRes.data);
          }
        } catch { if (!cancelled) showToast("Couldn't load the dashboard. Check your connection and pull to refresh.", 'error'); }
        finally { if (!cancelled) { setLoading(false); setRefreshing(false); } }
      };
      fetchData();
      return () => { cancelled = true; };
    }, [])
  );

  const respondTransfer = async (id, action) => {
    setActionLoading(id);
    try {
      await client.post(`/intern/transfers/${id}/${action}`, {reason: 'Rejected by intern'});
      showToast(action === 'accept' ? 'Transfer accepted.' : 'Transfer rejected.', 'success');
      fetchDashboard();
    } catch (e) { showToast(e.response?.data?.message || 'Failed.', 'error'); }
    finally { setActionLoading(null); }
  };

  const respondShiftChange = async (id, action) => {
    setActionLoading(id);
    try {
      await client.post(`/intern/shift-change/${id}/${action}`, action === 'reject' ? {reason: 'Rejected by intern'} : {});
      showToast(action === 'accept' ? 'Shift change accepted.' : 'Shift change rejected.', 'success');
      fetchDashboard();
    } catch (e) { showToast(e.response?.data?.message || 'Failed.', 'error'); }
    finally { setActionLoading(null); }
  };

  if (loading) return <Spinner style={styles.center} />;

  const d = dashboard;
  const attendanceColor = d?.todayAttendance?.status === 'Present' ? colors.success :
    d?.todayAttendance?.status === 'Absent' ? colors.error : colors.textMuted;

  const progress = d ? (() => {
    const s = new Date(d.startDate);
    const e = new Date(d.endDate);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
    return Math.min(100, Math.max(0, ((new Date() - s) / (e - s)) * 100));
  })() : 0;

  const taskStatusColors = {Pending: colors.warning, InProgress: colors.accent, Completed: colors.success, Overdue: colors.error};
  const taskStats = d?.taskStats || {pending: 0, inProgress: 0, completed: 0, total: 0};
  const att = d?.attendanceStats || {present: 0, absent: 0, pendingReview: 0, total: 0, rate: 0};
  const recentTasks = d?.recentTasks || [];

  const faceStatus = effectiveFaceStatus(d, debug);
  const docsUploaded = debug.simulateDocsUploaded === 'off'
    ? d?.requiredDocsUploaded === true
    : debug.simulateDocsUploaded === 'uploaded';

  const ob = d?.onboarding;
  const faceHelp = ob?.faceEnrollmentStatus === 'Pending' ? 'Under review by your admin/mentor'
    : ob?.faceEnrollmentStatus === 'Rejected' ? 'Rejected — review and resubmit'
    : ob?.faceEnrollmentStatus === 'Approved' ? 'Verified' : 'Enroll your face profile';
  const stepStates = [
    true,
    !!ob?.docsApproved,
    ob?.faceEnrollmentStatus === 'Approved',
  ];
  const steps = [
    {key: 'account', label: 'Account created', help: 'Created by your admin or mentor'},
    {key: 'docs', label: 'CNIC & CV/Resume approved', help: 'Uploaded in the Documents section'},
    {key: 'face', label: 'Face profile approved', help: faceHelp},
  ].map((s, i) => ({...s, done: stepStates[i], current: !stepStates[i] && (i === 0 || stepStates[i - 1])}));
  const nextCta = (() => {
    if (steps[1].current) return {screen: 'Documents', label: 'Upload documents'};
    if (steps[2].current) return {screen: 'FaceEnroll', label: 'Enroll face'};
    return null;
  })();

  const faceChips = ['off', 'enrolled', 'notEnrolled'];
  const docsChips = ['off', 'uploaded', 'notUploaded'];

  return (
    <ScreenBackground>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchDashboard();}} tintColor={colors.primary} />}>

      {/* Header */}
      <AppHeader
        title="Home"
        right={(
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open navigation menu" id="intern-menu-btn" onPress={() => setSidebarVisible(true)} style={styles.menuBtn}><Icon name="menu" size={22} color="#fff" />
          </TouchableOpacity>
        )}
      />

      <RightSidebar
        visible={sidebarVisible}
        onClose={() => setSidebarVisible(false)}
        navigation={navigation}
      />

      <View style={styles.greetingBox}>
        <Text style={styles.greeting}>Hello, {d?.fullName?.split(' ')[0]}</Text>
        <Text style={styles.dept}>{d?.department} • {d?.mentorName}</Text>
      </View>

      {device?.deviceHash && !bannerDismissed && (
        <View id="device-bound-banner" style={styles.boundBanner}>
          <Icon name="key" size={16} color={colors.textAccent} />
          <Text style={styles.boundBannerText}>
            You're signed in on this device. Signing in from any other device is blocked until you log out here first.
          </Text>
          <TouchableOpacity
            id="dismiss-device-bound-banner"
            onPress={() => { setBannerDismissed(true); AsyncStorage.setItem('deviceBannerDismissed', '1'); }}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <Icon name="close" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {/* Onboarding checklist */}
      {!!ob && !(ob.ready && allSetDismissed) && (
        <View id="onboarding-card" style={styles.obCard}>
          {ob.ready ? (
            <View style={styles.obReadyRow}>
              <View style={styles.obReadyIcon}><Icon name="check" size={18} color={colors.success} /></View>
              <View style={styles.obReadyTextWrap}>
                <Text style={styles.obReadyTitle}>You're all set</Text>
                <Text style={styles.obReadySub}>Attendance, official documents and all other features are active.</Text>
              </View>
              <TouchableOpacity
                id="dismiss-all-set"
                onPress={() => { setAllSetDismissed(true); AsyncStorage.setItem('allSetBannerDismissed', '1'); }}
                hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                <Icon name="close" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.obTitle}>Complete your onboarding</Text>
              {steps.map((s, i) => (
                <View key={s.key} style={styles.obStep}>
                  <View style={[
                    styles.obBadge,
                    s.done ? styles.obBadgeDone :
                    s.current ? styles.obBadgeCurrent : styles.obBadgeNext,
                  ]}>
                    {s.done
                      ? <Icon name="check" size={12} color="#fff" />
                      : <Text style={[styles.obBadgeNum, s.current && {color: '#fff'}]}>{i + 1}</Text>}
                  </View>
                  <View style={styles.obStepText}>
                    <Text style={[styles.obStepLabel, s.current && {color: colors.textAccent, fontWeight: '700'}]}>{s.label}</Text>
                    <Text style={styles.obStepHelp}>{s.help}</Text>
                  </View>
                </View>
              ))}
              {nextCta && (
                <GradientButton
                  id="onboarding-cta"
                  style={styles.obCta}
                  onPress={() => navigation.navigate(nextCta.screen)}>
                  <Text style={styles.obCtaText}>{nextCta.label}</Text>
                </GradientButton>
              )}
            </>
          )}
        </View>
      )}

      {/* Debug Controls (temporary — removed later) */}
      <View style={styles.debugCard}>
        <View style={styles.debugHeader}>
          <Icon name="settings" size={16} color={colors.textAccentAlt} />
          <Text style={[styles.debugTitle, {color: colors.textAccentAlt}]}>Debug Controls</Text>
        </View>
        <View style={styles.debugToggleRow}>
          <Text style={styles.debugLabel}>Simulate Office Location</Text>
          <Switch
            value={debug.simulateLocation}
            onValueChange={v => dispatch(setSimulateLocation(v))}
            trackColor={{true: colors.primary, false: colors.border}}
            thumbColor={colors.surface}
          />
        </View>
        <View style={styles.debugToggleRow}>
          <Text style={styles.debugLabel}>Simulate Face</Text>
          <View style={styles.debugChips}>
            {faceChips.map(c => (
              <TouchableOpacity
                key={c}
                onPress={() => dispatch(setSimulateFace(c))}
                style={[styles.debugChip, debug.simulateFace === c && {backgroundColor: colors.primary + '22', borderColor: colors.primary}]}>
                <Text style={[styles.debugChipText, {color: debug.simulateFace === c ? colors.primary : colors.textMuted}]}>
                  {c === 'off' ? 'Real' : c === 'enrolled' ? 'Enrolled' : 'Not Enrolled'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={styles.debugToggleRow}>
          <Text style={styles.debugLabel}>Simulate Documents</Text>
          <View style={styles.debugChips}>
            {docsChips.map(c => (
              <TouchableOpacity
                key={c}
                onPress={() => dispatch(setSimulateDocsUploaded(c))}
                style={[styles.debugChip, debug.simulateDocsUploaded === c && {backgroundColor: colors.primary + '22', borderColor: colors.primary}]}>
                <Text style={[styles.debugChipText, {color: debug.simulateDocsUploaded === c ? colors.primary : colors.textMuted}]}>
                  {c === 'off' ? 'Real' : c === 'uploaded' ? 'Uploaded' : 'Not Uploaded'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={styles.debugStatusRow}>
          <Icon name="info" size={12} color={colors.textMuted} />
          <Text style={styles.debugStatus}>Face: {faceStatus} • Documents: {docsUploaded ? 'uploaded' : 'not uploaded'}</Text>
        </View>
      </View>

      {/* Open transfer request — only when present */}
      {d?.activeTransfer ? (
        <View style={styles.requestCard}>
          <View style={styles.requestHeader}>
            <Text style={styles.requestTitle}>Transfer Request</Text>
            <View style={[styles.requestBadge, {backgroundColor: (TRANSFER_COLORS[d.activeTransfer.status] || colors.text) + '22'}]}>
              <Text style={[styles.requestBadgeText, {color: TRANSFER_COLORS[d.activeTransfer.status] || colors.text}]}>{d.activeTransfer.status}</Text>
            </View>
          </View>
          <Text style={styles.requestSub}>Initiated by {d.activeTransfer.initiatedBy}</Text>
          <View style={styles.requestFlow}>
            <View style={styles.requestFlowNode}><Text style={styles.requestFlowLabel}>From</Text><Text style={styles.requestFlowValue}>{d.activeTransfer.fromMentor}</Text></View>
            <Icon name="transfer" size={16} color={colors.textAccent} />
            <View style={styles.requestFlowNode}><Text style={styles.requestFlowLabel}>To</Text><Text style={styles.requestFlowValue}>{d.activeTransfer.toMentor}</Text></View>
          </View>
          {d.activeTransfer.notes ? <Text style={styles.requestNote}>Note: {d.activeTransfer.notes}</Text> : null}
          {d.activeTransfer.status === 'Endorsed' && (
            <View style={styles.requestActions}>
              <TouchableOpacity
                id="accept-transfer-shortcut"
                style={[styles.requestAcceptBtn, actionLoading === d.activeTransfer.id && {opacity: 0.6}]}
                disabled={actionLoading === d.activeTransfer.id}
                onPress={() => respondTransfer(d.activeTransfer.id, 'accept')}>
                <Icon name="check" size={14} color={colors.success} /><Text style={styles.requestAcceptText}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                id="reject-transfer-shortcut"
                style={[styles.requestRejectBtn, actionLoading === d.activeTransfer.id && {opacity: 0.6}]}
                disabled={actionLoading === d.activeTransfer.id}
                onPress={() => respondTransfer(d.activeTransfer.id, 'reject')}>
                <Icon name="close" size={14} color={colors.error} /><Text style={styles.requestRejectText}>Reject</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : null}

      {/* Open shift-change request — only when present */}
      {d?.activeShiftChange ? (
        <View style={styles.requestCard}>
          <View style={styles.requestHeader}>
            <Text style={styles.requestTitle}>Shift Change Request</Text>
            <View style={[styles.requestBadge, {backgroundColor: (SHIFT_COLORS[d.activeShiftChange.status] || colors.text) + '22'}]}>
              <Text style={[styles.requestBadgeText, {color: SHIFT_COLORS[d.activeShiftChange.status] || colors.text}]}>{d.activeShiftChange.status}</Text>
            </View>
          </View>
          <Text style={styles.requestSub}>{d.activeShiftChange.fromShift} → {d.activeShiftChange.toShift}</Text>
          {d.activeShiftChange.notes ? <Text style={styles.requestNote}>Note: {d.activeShiftChange.notes}</Text> : null}
          {d.activeShiftChange.status === 'Pending' && (
            <View style={styles.requestActions}>
              <TouchableOpacity
                id="accept-shiftchange-shortcut"
                style={[styles.requestAcceptBtn, actionLoading === d.activeShiftChange.id && {opacity: 0.6}]}
                disabled={actionLoading === d.activeShiftChange.id}
                onPress={() => respondShiftChange(d.activeShiftChange.id, 'accept')}>
                <Icon name="check" size={14} color={colors.success} /><Text style={styles.requestAcceptText}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                id="reject-shiftchange-shortcut"
                style={[styles.requestRejectBtn, actionLoading === d.activeShiftChange.id && {opacity: 0.6}]}
                disabled={actionLoading === d.activeShiftChange.id}
                onPress={() => respondShiftChange(d.activeShiftChange.id, 'reject')}>
                <Icon name="close" size={14} color={colors.error} /><Text style={styles.requestRejectText}>Reject</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : null}

      {faceStatus === 'Pending' && (
        <View style={[styles.faceBanner, {borderColor: colors.warning}]}>
          <View style={styles.faceBannerRow}>
            <Icon name="clock" size={18} color={colors.warning} />
            <Text style={[styles.faceBannerTitle, {color: colors.warning}]}>Face Enrollment Under Review</Text>
          </View>
          <Text style={styles.faceBannerText}>
            Your face profile is awaiting verification by the admin or your mentor. You cannot mark attendance until it is approved.
          </Text>
        </View>
      )}

      {faceStatus === 'NotEnrolled' || faceStatus === 'Rejected' ? (
        <View style={styles.faceBanner}>
          <View style={styles.faceBannerRow}>
            <Icon name="alert" size={18} color={colors.warning} />
            <Text style={[styles.faceBannerTitle, {color: colors.warning}]}>{faceStatus === 'Rejected' ? 'Face Enrollment Rejected' : 'First-Login Action Required'}</Text>
          </View>
          <Text style={styles.faceBannerText}>
            {faceStatus === 'Rejected'
              ? `Your face profile was rejected${d?.faceRejectedReason ? `: ${d.faceRejectedReason}` : ''}. Please re-submit it for verification.`
              : 'You must register your face profile before you can mark attendance.'}
          </Text>
          <GradientButton
            id="register-face-btn"
            style={styles.faceBannerBtn}
            onPress={() => navigation.navigate('FaceEnroll')}>
            <Icon name="camera" size={16} color="#fff" />
            <Text style={styles.faceBannerBtnText}>{faceStatus === 'Rejected' ? 'Retry Face Registration' : 'Register Face Profile Now'}</Text>
          </GradientButton>
        </View>
      ) : null}

      {devices && (!devices.laptop || !devices.phone) && (
        <View style={[styles.faceBanner, {borderColor: colors.error}]}>
          <View style={styles.faceBannerRow}>
            <Icon name="key" size={18} color={colors.error} />
            <Text style={[styles.faceBannerTitle, {color: colors.error}]}>Device MAC Required</Text>
          </View>
          <Text style={styles.faceBannerText}>
            {!devices.laptop && !devices.phone
              ? 'MAC addresses are verified only from the Wi-Fi network you attend on. Add your laptop and phone MACs in your Profile.'
              : !devices.laptop
                ? 'MAC addresses are verified only from the Wi-Fi network you attend on. Add your laptop MAC in your Profile.'
                : 'MAC addresses are verified only from the Wi-Fi network you attend on. Add your phone MAC in your Profile.'}
          </Text>
          <GradientButton
            id="add-mac-btn"
            style={styles.faceBannerBtn}
            onPress={() => navigation.navigate('Profile', {macEdit: true})}>
            <Icon name="key" size={16} color="#fff" />
            <Text style={styles.faceBannerBtnText}>Add MAC Addresses</Text>
          </GradientButton>
        </View>
      )}

      {/* Internship Progress */}
      <View style={styles.progressCard}>
        <View style={styles.progressHeader}>
          <Text style={styles.cardTitle}>Internship Progress</Text>
          <Text style={styles.progressDays}>{d?.daysLeft} days left</Text>
        </View>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, {width: `${progress}%`}]} />
        </View>
        <View style={styles.progressDates}>
          <Text style={styles.progressDate}>{d?.startDate ? fmtDate(d.startDate) : ''}</Text>
          <Text style={styles.progressDate}>{d?.endDate ? fmtDate(d.endDate) : ''}</Text>
        </View>
      </View>

      {/* Today's Attendance */}
      <View style={[styles.card, {borderLeftWidth: 4, borderLeftColor: attendanceColor}]}>
        <Text style={styles.cardTitle}>Today's Attendance</Text>
        <Text style={[styles.attendanceStatus, {color: attendanceColor}]}>
          {d?.todayAttendance?.marked ? d?.todayAttendance?.status : 'Not Marked Yet'}
        </Text>
        {d?.todayAttendance?.time && (
          <View style={styles.attendanceTimeRow}>
            <Icon name="clock" size={13} color={colors.textMuted} />
            <Text style={styles.attendanceTime}>Checked in {new Date(d.todayAttendance.time).toLocaleTimeString()}</Text>
          </View>
        )}
        {d?.todayAttendance?.departureTime && (
          <View style={styles.attendanceTimeRow}>
            <Icon name="check" size={13} color={colors.success} />
            <Text style={styles.attendanceTime}>Checked out {new Date(d.todayAttendance.departureTime).toLocaleTimeString()}</Text>
          </View>
        )}
        {!d?.todayAttendance?.marked ? (
          <GradientButton
            id="mark-attendance-shortcut"
            style={[styles.markBtn, {width: '100%'}]}
            onPress={() => navigation.navigate('Attendance', {autoStart: true})}>
            <Icon name="mapPin" size={16} color="#fff" />
            <Text style={styles.markBtnText}>Mark Now</Text>
          </GradientButton>
        ) : (
          <View style={styles.attBtnRow}>
            <GradientButton
              id="view-attendance-btn"
              style={[styles.markBtn, styles.attBtnFlex]}
              onPress={() => navigation.navigate('Attendance')}>
              <Icon name="list" size={16} color="#fff" />
              <Text style={styles.markBtnText}>View Attendance</Text>
            </GradientButton>
            {!d?.todayAttendance?.departureTime && (
              <GradientButton
                id="checkout-shortcut"
                style={[styles.markBtn, styles.attBtnFlex]}
                onPress={() => navigation.navigate('Attendance', {autoCheckout: true})}>
                <Icon name="logout" size={16} color="#fff" />
                <Text style={styles.markBtnText}>Check Out</Text>
              </GradientButton>
            )}
          </View>
        )}
      </View>

      {/* My Details */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>My Details</Text>
        <View style={styles.detailRow}>
          <Icon name="building" size={14} color={colors.textMuted} />
          <Text style={styles.detailLabel}>Department</Text>
          <Text style={styles.detailValue}>{d?.department || '—'}</Text>
        </View>
        {d?.shift && (
          <View style={styles.detailRow}>
            <Icon name="clock" size={14} color={colors.textMuted} />
            <Text style={styles.detailLabel}>Shift</Text>
            <Text style={styles.detailValue}>{d.shift.name} ({d.shift.startTime}–{d.shift.endTime})</Text>
          </View>
        )}
        <View style={styles.detailRow}>
          <Icon name="calendar" size={14} color={colors.textMuted} />
          <Text style={styles.detailLabel}>Leave Days</Text>
          <Text style={styles.detailValue}>{d?.remainingLeaveDays ?? 0} of {d?.allowedLeaveDays ?? 0} remaining</Text>
        </View>
        {d?.mentor && (
          <>
            <View style={styles.detailRow}>
              <Icon name="user" size={14} color={colors.textMuted} />
              <Text style={styles.detailLabel}>Mentor</Text>
              <Text style={styles.detailValue}>{d.mentor.name}{d.mentor.designation ? ` (${d.mentor.designation})` : ''}</Text>
            </View>
            {d.mentor.phone && (
              <View style={styles.detailRow}>
                <Icon name="briefcase" size={14} color={colors.textMuted} />
                <Text style={styles.detailLabel}>Phone</Text>
                <Text style={styles.detailValue}>{d.mentor.phone}</Text>
              </View>
            )}
            {d.mentor.email && (
              <View style={styles.detailRow}>
                <Icon name="idCard" size={14} color={colors.textMuted} />
                <Text style={styles.detailLabel}>Email</Text>
                <Text style={styles.detailValue}>{d.mentor.email}</Text>
              </View>
            )}
          </>
        )}
      </View>

      {/* My Tasks */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>My Tasks</Text>
          <TouchableOpacity onPress={() => navigation.navigate('MyTasks')}>
            <Text style={styles.seeAll}>{taskStats.pending} pending · See All</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.tasksRow}>
          <View style={styles.taskStatBox}>
            <Text style={styles.taskStatValue}>{taskStats.pending}</Text>
            <Text style={styles.taskStatLabel}>Pending</Text>
          </View>
          <View style={styles.taskStatBox}>
            <Text style={[styles.taskStatValue, {color: colors.textAccentAlt}]}>{taskStats.inProgress}</Text>
            <Text style={styles.taskStatLabel}>In Progress</Text>
          </View>
          <View style={styles.taskStatBox}>
            <Text style={[styles.taskStatValue, {color: colors.success}]}>{taskStats.completed}</Text>
            <Text style={styles.taskStatLabel}>Completed</Text>
          </View>
        </View>
        {recentTasks.length === 0 ? (
          <Text style={styles.emptyText}>No tasks assigned yet.</Text>
        ) : recentTasks.map(t => {
          const tc = taskStatusColors[t.status] || colors.textMuted;
          return (
            <View key={t.id} style={styles.taskRow}>
              <View style={[styles.taskDot, {backgroundColor: tc}]} />
              <View style={styles.taskInfo}>
                <Text style={styles.taskTitle}>{t.title}</Text>
                {t.deadline && (
                  <View style={styles.taskDeadlineRow}>
                    <Icon name="calendar" size={11} color={colors.textMuted} />
                    <Text style={styles.taskDeadline}>Due {fmtDate(t.deadline)}</Text>
                  </View>
                )}
              </View>
              <View style={[styles.taskBadge, {backgroundColor: tc + '22'}]}>
                <Text style={[styles.taskBadgeText, {color: tc}]}>{t.status}</Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* Attendance Stats */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Attendance This Month</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Attendance')}>
            <Text style={styles.seeAll}>{att.rate}% present · See All</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.attStatsRow}>
          <View style={styles.attStatBox}>
            <Text style={[styles.attStatValue, {color: colors.success}]}>{att.present}</Text>
            <Text style={styles.attStatLabel}>Present</Text>
          </View>
          <View style={styles.attStatBox}>
            <Text style={[styles.attStatValue, {color: colors.error}]}>{att.absent}</Text>
            <Text style={styles.attStatLabel}>Absent</Text>
          </View>
          <View style={styles.attStatBox}>
            <Text style={[styles.attStatValue, {color: colors.warning}]}>{att.pendingReview}</Text>
            <Text style={styles.attStatLabel}>Pending Review</Text>
          </View>
        </View>
      </View>

      {/* Transfers report */}
      {d?.transferStats && (
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>My Transfers</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Transfers')}>
              <Text style={styles.seeAll}>{d.transferStats.total} total · See All</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.attStatsRow}>
            <View style={styles.attStatBox}>
              <Text style={[styles.attStatValue, {color: colors.warning}]}>{d.transferStats.active}</Text>
              <Text style={styles.attStatLabel}>Active</Text>
            </View>
            <View style={styles.attStatBox}>
              <Text style={[styles.attStatValue, {color: colors.success}]}>{d.transferStats.finalised}</Text>
              <Text style={styles.attStatLabel}>Finalised</Text>
            </View>
            <View style={styles.attStatBox}>
              <Text style={[styles.attStatValue, {color: colors.error}]}>{d.transferStats.rejected}</Text>
              <Text style={styles.attStatLabel}>Rejected</Text>
            </View>
          </View>
        </View>
      )}

    </ScrollView>
    </ScreenBackground>
  );
}

const makeStyles = colors => StyleSheet.create({
  container: {flex: 1},
  scrollContent: {paddingBottom: 24},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background},
  menuBtn: {width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', justifyContent: 'center', alignItems: 'center'},
  greetingBox: {padding: 20, paddingBottom: 8},
  greeting: {color: colors.text, fontSize: 22, fontWeight: '700'},
  dept: {color: colors.textMuted, fontSize: 13, marginTop: 4},
  boundBanner: {flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 4, marginBottom: 8, backgroundColor: colors.primary + '12', borderWidth: 1, borderColor: colors.primary + '44', borderRadius: 12, padding: 12},
  boundBannerText: {flex: 1, color: colors.text, fontSize: 12.5, fontWeight: '600', lineHeight: 18},
  obCard: {marginHorizontal: 16, marginTop: 8, marginBottom: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16},
  obTitle: {fontSize: 14, fontWeight: '800', color: colors.text, marginBottom: 12},
  obStep: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6},
  obBadge: {width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center'},
  obBadgeDone: {backgroundColor: colors.success},
  obBadgeCurrent: {backgroundColor: colors.primary, borderWidth: 2, borderColor: colors.primary + '55'},
  obBadgeNext: {backgroundColor: colors.border},
  obBadgeNum: {fontSize: 12, fontWeight: '800', color: colors.textMuted},
  obStepText: {flex: 1},
  obStepLabel: {fontSize: 13.5, color: colors.text},
  obStepHelp: {fontSize: 12, color: colors.textMuted, marginTop: 1},
  obCta: {marginTop: 12},
  obCtaText: {color: '#fff', fontSize: 15, fontWeight: '700'},
  obReadyRow: {flexDirection: 'row', alignItems: 'center', gap: 12},
  obReadyIcon: {width: 34, height: 34, borderRadius: 17, backgroundColor: colors.success + '22', justifyContent: 'center', alignItems: 'center'},
  obReadyTextWrap: {flex: 1},
  obReadyTitle: {fontSize: 14.5, fontWeight: '800', color: colors.text},
  obReadySub: {fontSize: 12.5, color: colors.textMuted, marginTop: 2, lineHeight: 17},
  debugCard: {backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 12, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border},
  debugHeader: {flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10},
  debugTitle: {fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6},
  debugToggleRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 12},
  debugLabel: {color: colors.text, fontSize: 13, fontWeight: '600', flex: 1},
  debugChips: {flexDirection: 'row', gap: 6},
  debugChip: {borderRadius: 8, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 6},
  debugChipText: {fontSize: 11, fontWeight: '700'},
  debugStatusRow: {flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2},
  debugStatus: {color: colors.textMuted, fontSize: 12},
  requestCard: {backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 12, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border},
  requestHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4},
  requestTitle: {color: colors.text, fontSize: 15, fontWeight: '700'},
  requestBadge: {borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4},
  requestBadgeText: {fontSize: 11, fontWeight: '700'},
  requestSub: {color: colors.textMuted, fontSize: 12, marginBottom: 8},
  requestFlow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 10, padding: 12, marginBottom: 8},
  requestFlowNode: {alignItems: 'center'},
  requestFlowLabel: {color: colors.textMuted, fontSize: 10, fontWeight: '600', textTransform: 'uppercase'},
  requestFlowValue: {color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 2},
  requestNote: {color: colors.textSecondary, fontSize: 12, fontStyle: 'italic', marginBottom: 4},
  requestActions: {flexDirection: 'row', gap: 10, marginTop: 4},
  requestAcceptBtn: {flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingVertical: 10, backgroundColor: colors.success + '18', borderWidth: 1, borderColor: colors.success + '44'},
  requestAcceptText: {color: colors.success, fontWeight: '700', fontSize: 13},
  requestRejectBtn: {flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingVertical: 10, backgroundColor: colors.error + '18', borderWidth: 1, borderColor: colors.error + '44'},
  requestRejectText: {color: colors.error, fontWeight: '700', fontSize: 13},
  faceBanner: {backgroundColor: colors.warning + '22', margin: 16, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.warning},
  faceBannerRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  faceBannerTitle: {fontWeight: '700', fontSize: 15},
  faceBannerText: {color: colors.textSecondary, fontSize: 13, marginTop: 4, marginBottom: 10},
  faceBannerBtn: {marginTop: 6, width: '100%'},
  faceBannerBtnText: {color: '#fff', fontWeight: '700', fontSize: 14},
  progressCard: {backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 12, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border},
  progressHeader: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12},
  progressDays: {color: colors.textAccent, fontSize: 14, fontWeight: '600'},
  progressBar: {height: 8, backgroundColor: colors.card, borderRadius: 4, overflow: 'hidden'},
  progressFill: {height: '100%', backgroundColor: colors.primary, borderRadius: 4},
  progressDates: {flexDirection: 'row', justifyContent: 'space-between', marginTop: 8},
  progressDate: {color: colors.textMuted, fontSize: 11},
  card: {backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 12, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border},
  cardTitle: {color: colors.text, fontSize: 15, fontWeight: '700'},
  cardHeaderRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12},
  seeAll: {color: colors.textAccent, fontSize: 12, fontWeight: '600'},
  detailRow: {flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8},
  detailLabel: {color: colors.textMuted, fontSize: 13, flex: 1},
  detailValue: {color: colors.text, fontSize: 13, fontWeight: '600', flex: 1.3, textAlign: 'right'},
  attendanceStatus: {fontSize: 22, fontWeight: '800', marginTop: 4},
  attendanceTimeRow: {flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4},
  attendanceTime: {color: colors.textMuted, fontSize: 12},
  markBtn: {marginTop: 12},
  markBtnText: {color: '#fff', fontWeight: '700'},
  attBtnRow: {flexDirection: 'row', gap: 10},
  attBtnFlex: {flex: 1},
  tasksRow: {flexDirection: 'row', gap: 8, marginBottom: 12},
  taskStatBox: {flex: 1, backgroundColor: colors.card, borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border},
  taskStatValue: {color: colors.text, fontSize: 18, fontWeight: '800'},
  taskStatLabel: {color: colors.textMuted, fontSize: 11, marginTop: 2},
  emptyText: {color: colors.textMuted, fontSize: 13},
  taskRow: {flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border},
  taskDot: {width: 8, height: 8, borderRadius: 4, marginRight: 10},
  taskInfo: {flex: 1},
  taskTitle: {color: colors.text, fontSize: 14, fontWeight: '600'},
  taskDeadlineRow: {flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3},
  taskDeadline: {color: colors.textMuted, fontSize: 11},
  taskBadge: {borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4},
  taskBadgeText: {fontSize: 11, fontWeight: '700'},
  attStatsRow: {flexDirection: 'row', gap: 8},
  attStatBox: {flex: 1, backgroundColor: colors.card, borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border},
  attStatValue: {color: colors.text, fontSize: 18, fontWeight: '800'},
  attStatLabel: {color: colors.textMuted, fontSize: 11, marginTop: 2, textAlign: 'center'},
});
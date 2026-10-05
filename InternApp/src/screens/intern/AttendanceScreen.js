import React, {useState, useEffect, useRef, useMemo, useCallback} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, Switch, Image, Modal,
  ActivityIndicator, Animated, Vibration, Platform, PermissionsAndroid, ScrollView, RefreshControl,
} from 'react-native';
import {Camera, useCameraDevice, VisionCamera, CommonResolutions} from 'react-native-vision-camera';
import Geolocation from '@react-native-community/geolocation';
import client from '../../api/client';
import {fileUrl} from '../../api/fileClient';
import {write} from '../../api/write';
import {useConnectivity} from '../../sync/connectivity';
import {showToast} from '../../components/AppToast';
import {useAppTheme} from '../../theme';
import ScreenBackground from '../../components/ScreenBackground';
import AppHeader from '../../components/AppHeader';
import RightSidebar from '../../components/RightSidebar';
import GradientButton from '../../components/GradientButton';
import EndOfListMarker from '../../components/EndOfListMarker';
import {useSelector, useDispatch} from 'react-redux';
import Icon from '../../components/Icon';
import {imageUriToBase64, toFileUri, evaluateFaceLiveness} from '../../utils/faceUtils';
import {effectiveFaceStatus} from '../../utils/debug';
import {setSimulateLocation} from '../../store/slices/debugSlice';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function AttendanceScreen({navigation, route}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dispatch = useDispatch();
  const {profile} = useSelector(s => s.auth);
  const debug = useSelector(s => s.debug);
  const {isOnline} = useConnectivity();
  const faceStatus = effectiveFaceStatus(profile, debug);
  const testMode = debug.simulateLocation;

  // States: 'IDLE' | 'STARTING' | 'FACE_CHECKING' | 'FACE_VERIFIED' | 'LOCATION_CHECKING' | 'LOCATION_VERIFIED' | 'FINALIZING' | 'SUCCESS' | 'FAILED' | 'FACE_NOT_REGISTERED' | 'CUTOFF_ABSENT' | 'ALREADY_MARKED'
  const [statusState, setStatusState] = useState('IDLE');
  const [sessionId, setSessionId] = useState(null);
  const [deptInfo, setDeptInfo] = useState(null);

  // Face & Liveness challenge states (challenges are issued by the server)
  const [serverChallenges, setServerChallenges] = useState([]);
  const [currentChallenge, setCurrentChallenge] = useState(0);
  const [livenessPassed, setLivenessPassed] = useState(false);
  const [scanningFace, setScanningFace] = useState(false);

  // GPS states
  const [distanceMeters, setDistanceMeters] = useState(null);
  const [locationVerified, setLocationVerified] = useState(false);

  const [errorMessage, setErrorMessage] = useState('');
  const [resultData, setResultData] = useState(null);
  const [loading, setLoading] = useState(false);

  // History
  const [records, setRecords] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [historyMonth, setHistoryMonth] = useState(() => ({month: new Date().getMonth() + 1, year: new Date().getFullYear()}));
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutMode, setCheckoutMode] = useState(false);
  const [subtab, setSubtab] = useState('attendance');
  const [viewerUri, setViewerUri] = useState(null);

  // Leaves (merged into this page — #14)
  const [leaves, setLeaves] = useState([]);
  const [leaveStartDate, setLeaveStartDate] = useState('');
  const [leaveEndDate, setLeaveEndDate] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [submittingLeave, setSubmittingLeave] = useState(false);

  const cameraRef = useRef(null);
  const autoStartedRef = useRef(false);
  const scanBeamAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const frontCamera = useCameraDevice('front');
  const backCamera = useCameraDevice('back');
  const device = frontCamera ?? backCamera;
  const [permGranted, setPermGranted] = useState(false);
  const [photoOutput, setPhotoOutput] = useState(null);

  // Liveness state carried across the two still frames of each challenge
  // (blink detection needs closed → open across consecutive frames).
  const eyeStateRef = useRef({eyesClosedDetected: false});
  const serverChallengesRef = useRef([]);

  const ensureCamera = useCallback(async () => {
    try {
      const status = await VisionCamera.requestCameraPermission();
      const granted = status === 'authorized' || status === true;
      setPermGranted(granted);
      if (granted && !photoOutput) {
        const out = VisionCamera.createPhotoOutput({
          targetResolution: CommonResolutions.UHD_4_3,
          containerFormat: 'jpeg',
          quality: 0.9,
          qualityPrioritization: 'balanced',
        });
        setPhotoOutput(out);
      }
    } catch (e) {
      setPermGranted(false);
    }
  }, [photoOutput]);

  useEffect(() => {
    if (statusState === 'FACE_CHECKING') {
      let cancelled = false;
      const initCamera = async () => {
        try {
          const status = await VisionCamera.requestCameraPermission();
          const granted = status === 'authorized' || status === true;
          if (!cancelled) {
            setPermGranted(granted);
            if (granted && !photoOutput) {
              const out = VisionCamera.createPhotoOutput({
                targetResolution: CommonResolutions.UHD_4_3,
                containerFormat: 'jpeg',
                quality: 0.9,
                qualityPrioritization: 'balanced',
              });
              setPhotoOutput(out);
            }
          }
        } catch (e) {
          if (!cancelled) setPermGranted(false);
        }
      };
      initCamera();
      return () => { cancelled = true; };
    }
  }, [statusState, ensureCamera, photoOutput]);

  useEffect(() => {
    let cancelled = false;
    const checkInitialStatus = async () => {
      try {
        const res = await client.get('/intern/attendance');
        const today = new Date().toDateString();
        const todayRecord = res.data.find(a => new Date(a.timestamp).toDateString() === today);
        if (!cancelled) {
          if (todayRecord) {
            setResultData(todayRecord);
            setStatusState('ALREADY_MARKED');
          } else {
            setStatusState('IDLE');
          }
        }
      } catch {}
    };
    checkInitialStatus();
    Animated.timing(fadeAnim, {toValue: 1, duration: 600, useNativeDriver: true}).start();
    return () => { cancelled = true; };
  }, [fadeAnim]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      let timeoutId;
      const loadData = async () => {
        try {
          const res = await client.get('/intern/attendance');
          const today = new Date().toDateString();
          const todayRecord = res.data.find(a => new Date(a.timestamp).toDateString() === today);
          if (!cancelled) {
            if (todayRecord) {
              setResultData(todayRecord);
              setStatusState('ALREADY_MARKED');
            } else {
              setStatusState('IDLE');
            }
            if (route.params?.autoStart && !autoStartedRef.current) {
              autoStartedRef.current = true;
              timeoutId = setTimeout(() => startAttendanceSession(), 600);
            }
          }
        } catch {}

        try {
          const res = await client.get(`/intern/attendance?month=${historyMonth.month}&year=${historyMonth.year}`);
          if (!cancelled) setRecords(res.data);
        } catch { if (!cancelled) showToast("Couldn't load attendance history. Pull to refresh.", 'error'); }
        finally { if (!cancelled) { setHistoryLoading(false); setRefreshing(false); } }

        try {
          const res = await client.get('/intern/leaves');
          if (!cancelled) setLeaves(res.data);
        } catch {}
      };
      loadData();
      return () => { cancelled = true; if (timeoutId) clearTimeout(timeoutId); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [historyMonth])
  );

  const checkInitialStatus = async () => {
    try {
      const res = await client.get('/intern/attendance');
      const today = new Date().toDateString();
      const todayRecord = res.data.find(a => new Date(a.timestamp).toDateString() === today);
      if (todayRecord) {
        setResultData(todayRecord);
        setStatusState('ALREADY_MARKED');
      } else {
        setStatusState('IDLE');
      }
    } catch {}
  };

  const startCheckoutSession = async () => {
    setCheckingOut(true);
    const ok = await requestPermissions();
    if (!ok) {
      setCheckingOut(false);
      showToast('Camera and Location permissions are required for secure check-out.', 'error');
      return;
    }

    if (!isOnline) {
      setCheckingOut(false);
      showToast('Check-out requires an internet connection.', 'error');
      return;
    }

    try {
      const res = await write({kind: 'intern', label: 'Check-out', method: 'post', url: '/attendance/checkout/start', requiresOnline: true});
      const rr = res.res;
      setSessionId(rr.data.sessionId);
      setDeptInfo(rr.data);
      setCheckoutMode(true);
      setServerChallenges(rr.data.challenges || []);
      serverChallengesRef.current = rr.data.challenges || [];
      setCurrentChallenge(0);
      setLivenessPassed(false);

      const locOk = await runLocationCheck(rr.data.sessionId);
      if (!locOk) {
        setStatusState('FAILED');
        return;
      }
      setLocationVerified(true);
      setStatusState('FACE_CHECKING');
    } catch (e) {
      if (e.__offline) {
        showToast('Check-out requires an internet connection.', 'error');
        return;
      }
      const code = e.response?.data?.code;
      const msg = e.response?.data?.message || 'Checkout failed. Could not start verification.';
      if (code === 'ALREADY_CHECKED_OUT') {
        showToast(msg, 'info');
        fetchHistory();
      } else if (code === 'ATTENDANCE_NOT_MARKED') {
        showToast(msg, 'error');
      } else {
        showToast(msg, 'error');
      }
    } finally {
      setCheckingOut(false);
    }
  };

  const fetchLeaves = async () => {
    try {
      const res = await client.get('/intern/leaves');
      setLeaves(res.data);
    } catch {}
  };

  const parseDate = s => {
    const parts = s.split(/[/-]/);
    if (parts.length < 3) return null;
    const [y, m, d] = parts.map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  };

  const submitLeave = async () => {
    const sd = parseDate(leaveStartDate);
    const ed = parseDate(leaveEndDate);
    if (!sd || !ed) return showToast('Enter dates as YYYY-MM-DD.', 'error');
    if (ed < sd) return showToast('End date cannot be before start date.', 'error');
    if (!leaveReason.trim()) return showToast('Please provide a reason.', 'error');
    setSubmittingLeave(true);
    try {
      const {queued} = await write({
        kind: 'intern',
        label: 'Leave application',
        method: 'post',
        url: '/intern/leaves',
        body: {startDate: sd.toISOString(), endDate: ed.toISOString(), reason: leaveReason.trim()},
      });
      showToast(
        queued
          ? 'Leave saved locally — will submit when online.'
          : 'Leave application submitted.',
        queued ? 'info' : 'success',
      );
      setLeaveStartDate(''); setLeaveEndDate(''); setLeaveReason('');
      fetchLeaves();
    } catch (e) {
      showToast(e.response?.data?.message || "Couldn't submit. Try again.", 'error');
    } finally { setSubmittingLeave(false); }
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await client.get(`/intern/attendance?month=${historyMonth.month}&year=${historyMonth.year}`);
      setRecords(res.data);
    } catch { showToast("Couldn't load attendance history. Pull to refresh.", 'error'); }
    finally { setHistoryLoading(false); setRefreshing(false); }
  };

  const isCurrentMonth = () =>
    historyMonth.month === new Date().getMonth() + 1 &&
    historyMonth.year === new Date().getFullYear();

  const changeMonth = (dir) => {
    let {month, year} = historyMonth;
    month += dir;
    if (month === 0) { month = 12; year -= 1; }
    if (month === 13) { month = 1; year += 1; }
    const now = new Date();
    const target = new Date(year, month - 1, 1);
    if (target > new Date(now.getFullYear(), now.getMonth(), 1)) return;
    const start = profile?.startDate ? new Date(profile.startDate) : null;
    if (start && new Date(start.getFullYear(), start.getMonth(), 1) > target) return;
    setHistoryMonth({month, year});
  };

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.CAMERA,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        ]);
        return (
          granted[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED &&
          granted[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED
        );
      } catch { return false; }
    }
    return true;
  };

  // ─── STEP 1: START SESSION ──────────────────────────────────────────────────
  const startAttendanceSession = async () => {
    setLoading(true);
    setErrorMessage('');
    setCheckoutMode(false);
    const ok = await requestPermissions();
    if (!ok) {
      setLoading(false);
      showToast('Camera and Location permissions are required for secure attendance.', 'error');
      return;
    }

    if (!isOnline) {
      setLoading(false);
      setStatusState('FAILED');
      setErrorMessage('Attendance requires an internet connection.');
      return;
    }

    try {
      const res = await write({kind: 'intern', label: 'Attendance', method: 'post', url: '/attendance/start', requiresOnline: true});
      const rr = res.res;
      setSessionId(rr.data.sessionId);
      setDeptInfo(rr.data);

      const preCheckOk = await runLocationCheck(rr.data.sessionId);
      if (!preCheckOk) {
        setStatusState('FAILED');
        return;
      }
      setLocationVerified(true);

      setStatusState('FACE_CHECKING');
      const issued = rr.data.challenges || [];
      setServerChallenges(issued);
      serverChallengesRef.current = issued;
      setCurrentChallenge(0);
      setLivenessPassed(false);
    } catch (e) {
      if (e.__offline) {
        setStatusState('FAILED');
        setErrorMessage('Attendance requires an internet connection.');
        return;
      }
      const code = e.response?.data?.code;
      const msg = e.response?.data?.message || 'Failed to start attendance session';
      setErrorMessage(msg);

      if (code === 'FACE_NOT_REGISTERED') {
        setStatusState('FACE_NOT_REGISTERED');
      } else if (code === 'ATTENDANCE_WINDOW_CLOSED') {
        setStatusState('CUTOFF_ABSENT');
      } else if (code === 'ATTENDANCE_ALREADY_MARKED') {
        setStatusState('ALREADY_MARKED');
      } else {
        setStatusState('FAILED');
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── STEP 2: ACTIVE LIVENESS + SERVER-SIDE FACE VERIFICATION ─────────────
  // Each server-issued challenge is confirmed on-device with ML Kit across two
  // still frames 450ms apart (a real motion check, not a static photo). Once
  // every challenge is confirmed (blink / head-turn / smile), a real selfie is
  // captured and shipped as base64; the server re-derives the FaceNet embedding,
  // runs passive anti-spoof, compares 1:1, and checks the challenge echo. This
  // makes replaying a video or a printed photo impossible.
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const runFaceAndLivenessCheck = async () => {
    if (!sessionId) return;
    if (!permGranted || !device || !photoOutput) {
      setErrorMessage('Camera permission required. Please allow camera access and retry.');
      setStatusState('FAILED');
      return;
    }
    if (!serverChallengesRef.current.length) {
      setErrorMessage('No liveness challenges were issued. Please try again.');
      setStatusState('FAILED');
      return;
    }

    const challenges = serverChallengesRef.current;
    setScanningFace(true);
    setLivenessPassed(false);
    startScanBeam();

    try {
      // Lazy-require the ML Kit detector so its native hybrid factory does not
      // initialize as part of the boot module graph.
      const faceDetectorModule = require('react-native-vision-camera-face-detector');
      console.log('[liveness] face detector module loaded');
      const imageFaceDetector = faceDetectorModule.createImageFaceDetector({
        performanceMode: 'fast',
        runLandmarks: true,
        runContours: false,
        runClassifications: true,
        minFaceSize: 0.15,
      });
      console.log('[liveness] image face detector created');

      const results = [];
      let faceImage = null;

      for (let i = 0; i < challenges.length; i++) {
        setCurrentChallenge(i);
        eyeStateRef.current = {eyesClosedDetected: false};

        // Frame 1 + Frame 2 (real dynamic movement check)
        const photo1 = await photoOutput.capturePhotoToFile({flashMode: 'off'}, {});
        console.log('[liveness] photo1 captured:', photo1.filePath);
        const uri1 = toFileUri(photo1.filePath);
        const faces1 = await imageFaceDetector.detectFaces(uri1);
        console.log('[liveness] faces1 detected:', faces1 ? faces1.length : 0);
        if (!faces1 || faces1.length === 0) {
          setScanningFace(false);
          setErrorMessage(`No face detected for challenge "${challenges[i].label}". Please keep your face clearly visible and retry.`);
          setStatusState('FAILED');
          return;
        }

        await sleep(450);

        const photo2 = await photoOutput.capturePhotoToFile({flashMode: 'off'}, {});
        console.log('[liveness] photo2 captured:', photo2.filePath);
        const uri2 = toFileUri(photo2.filePath);
        const faces2 = await imageFaceDetector.detectFaces(uri2);
        console.log('[liveness] faces2 detected:', faces2 ? faces2.length : 0);
        if (!faces2 || faces2.length === 0) {
          setScanningFace(false);
          setErrorMessage(`No face detected for challenge "${challenges[i].label}". Please keep your face clearly visible and retry.`);
          setStatusState('FAILED');
          return;
        }

        const passed = evaluateFaceLiveness(faces1[0], challenges[i].id, eyeStateRef) ||
                       evaluateFaceLiveness(faces2[0], challenges[i].id, eyeStateRef);
        if (!passed) {
          setScanningFace(false);
          setErrorMessage(`Live motion not detected for "${challenges[i].label}". Static photos and screen replays are not permitted. Please try again.`);
          setStatusState('FAILED');
          return;
        }

        results.push(true);
      }

      // After all challenges pass, capture a clean neutral frontal selfie.
      // The last challenge frame may be a turned/blurred face (head-turns),
      // which the server-side matcher cannot compare against a frontal enrollment.
      await sleep(800);
      const finalPhoto = await photoOutput.capturePhotoToFile({flashMode: 'off'}, {});
      const finalUri = toFileUri(finalPhoto.filePath);
      const finalFaces = await imageFaceDetector.detectFaces(finalUri);
      if (!finalFaces || finalFaces.length === 0) {
        setScanningFace(false);
        setErrorMessage('Face not clearly visible in the final photo. Please look straight at the camera and retry.');
        setStatusState('FAILED');
        return;
      }
      faceImage = await imageUriToBase64(finalUri);

      setLivenessPassed(true);
      Vibration.vibrate([0, 100, 100, 100]);
      setScanningFace(false);

      try {
        const res = await client.post(`/attendance/${sessionId}/face/verify`, {
          faceImage,
          livenessVerified: true,
          challengeIds: challenges.map(c => c.id),
          challengeResults: results,
        });

        if (res.data.faceVerified) {
          setStatusState('FACE_VERIFIED');
          setTimeout(() => {
            runLocationVerification(sessionId);
          }, 600);
        } else {
          const msg = res.data.message || 'Face does not match the registered profile.';
          setErrorMessage(msg);
          setStatusState('FAILED');
        }
      } catch (e) {
        const msg = e.response?.data?.message || 'Face verification failed: scanned face does not match account owner profile!';
        setErrorMessage(msg);
        setStatusState('FAILED');
      }
    } catch (e) {
      console.error('liveness/face check failed:', e);
      setScanningFace(false);
      const detail = e?.message || (typeof e === 'string' ? e : 'unknown error');
      setErrorMessage(`Could not complete the liveness check or capture photo. (${detail})`);
      setStatusState('FAILED');
    }
  };

  const startScanBeam = () => {
    scanBeamAnim.setValue(0);
    Animated.timing(scanBeamAnim, {toValue: 220, duration: 1200, useNativeDriver: true}).start();
  };

  // ─── STEP 3: GPS GEOFENCE LOCATION VERIFICATION ────────────────────────────
  const runLocationCheck = async (currentSessionId) => {
    const activeSession = currentSessionId || sessionId;
    if (!activeSession) return false;
    setStatusState('LOCATION_CHECKING');

    const tryFetchPosition = (highAccuracy) => {
      return new Promise((resolve, reject) => {
        Geolocation.getCurrentPosition(
          pos => resolve(pos),
          err => reject(err),
          { enableHighAccuracy: highAccuracy, timeout: 12000, maximumAge: 60000 }
        );
      });
    };

    try {
      let latitude, longitude, accuracy;

      if (testMode && deptInfo?.departmentLatitude) {
        // Dev/test mode: report the office geofence centre so attendance can
        // be exercised from anywhere during testing.
        latitude = deptInfo.departmentLatitude;
        longitude = deptInfo.departmentLongitude;
        accuracy = 5.0;
      } else {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {title: 'Location access', message: 'Attendance requires your current location', buttonPositive: 'OK'},
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          throw new Error('Location permission denied');
        }

        let pos;
        try {
          pos = await tryFetchPosition(false);
        } catch {
          pos = await tryFetchPosition(true);
        }

        ({latitude, longitude, accuracy} = pos.coords);
      }

      const res = await client.post(`/attendance/${activeSession}/location`, {
        latitude,
        longitude,
        gpsAccuracy: accuracy || 10.0,
      });

      setDistanceMeters(res.data.distanceMeters);
      return true;
    } catch (err) {
      const msg = err.response?.data?.message || 'GPS location verification failed: could not get a location fix';
      setErrorMessage(msg);
      return false;
    }
  };

  const runLocationVerification = async (currentSessionId) => {
    const activeSession = currentSessionId || sessionId;
    const ok = await runLocationCheck(activeSession);
    if (!ok) {
      setStatusState('FAILED');
      return;
    }
    setLocationVerified(true);
    setStatusState('LOCATION_VERIFIED');

    setTimeout(() => {
      finalizeAttendance(activeSession);
    }, 600);
  };

  // ─── STEP 4: FINAL ATTENDANCE COMPLETION ────────────────────────────────────
  const finalizeAttendance = async (currentSessionId) => {
    const activeSession = currentSessionId || sessionId;
    if (!activeSession) return;
    setStatusState('FINALIZING');

    try {
      const res = await client.post(checkoutMode ? `/attendance/checkout/${activeSession}/complete` : `/attendance/${activeSession}/complete`);
      setResultData(res.data);
      setStatusState('SUCCESS');
      Vibration.vibrate(300);
      fetchHistory();
    } catch (e) {
      const msg = e.response?.data?.message || 'Failed to complete attendance';
      setErrorMessage(msg);
      setStatusState('FAILED');
    }
  };

  const goBackToOverview = async () => {
    setStatusState('IDLE');
    setCheckoutMode(false);
    await checkInitialStatus();
    fetchHistory();
  };

  const statusBadge = status => {
    const map = {
      Present: {color: colors.success, icon: 'check'},
      Absent: {color: colors.error, icon: 'close'},
      PendingReview: {color: colors.warning, icon: 'clock'},
    };
    return map[status] || {color: colors.textMuted, icon: 'clock'};
  };

  const isFlowActive = ['FACE_CHECKING', 'FACE_VERIFIED', 'LOCATION_CHECKING', 'LOCATION_VERIFIED', 'FINALIZING'].includes(statusState);

  return (
    <ScreenBackground>
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchHistory();}} tintColor={colors.primary} />}>

        <AppHeader
          home
          right={(
            <TouchableOpacity id="attendance-menu-btn" onPress={() => setSidebarVisible(true)} style={styles.menuBtn}>
              <Icon name="menu" size={22} color="#fff" />
            </TouchableOpacity>
          )}
        />

        <RightSidebar
          visible={sidebarVisible}
          onClose={() => setSidebarVisible(false)}
          navigation={navigation}
        />

        <View style={styles.pageHeader}>
          <Text style={styles.pageSubtitle}>Mark attendance, review history and apply for leave</Text>
        </View>

        <View style={styles.subtabRow}>
          {[['attendance', 'Attendance'], ['leaves', 'Leaves']].map(([key, label]) => (
            <TouchableOpacity
              key={key}
              id={`atta-subtab-${key}`}
              style={[styles.subtabBtn, subtab === key && styles.subtabBtnActive]}
              onPress={() => setSubtab(key)}>
              <Text style={[styles.subtabText, subtab === key && styles.subtabTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {subtab === 'attendance' && (
        <>
        {/* ─── Face Profile Card ─────────────────────────────────────────── */}
        <View style={styles.faceCard}>
          <View style={[styles.faceIconBox, {backgroundColor: (faceStatus === 'Approved' ? colors.success : faceStatus === 'Rejected' ? colors.error : colors.warning) + '22'}]}>
            <Icon name="user" size={22} color={faceStatus === 'Approved' ? colors.success : faceStatus === 'Rejected' ? colors.error : colors.warning} />
          </View>
          <View style={styles.faceInfo}>
            <Text style={styles.faceLabel}>Face Profile</Text>
            <Text style={[styles.faceStatus, {color: faceStatus === 'Approved' ? colors.success : faceStatus === 'Rejected' ? colors.error : colors.warning}]}>
              {faceStatus === 'Approved' ? 'Registered' : faceStatus === 'Pending' ? 'Under review' : faceStatus === 'Rejected' ? 'Rejected' : 'Not set'}
            </Text>
            {faceStatus === 'Rejected' && profile?.faceRejectedReason && (
              <Text style={styles.faceRejectText}>Reason: {profile.faceRejectedReason}</Text>
            )}
          </View>
          {faceStatus === 'Approved' ? (
            <TouchableOpacity
              id="face-card-edit-btn"
              style={[styles.faceAction, {backgroundColor: colors.success}]}
              onPress={() => navigation.navigate('FaceEnroll')}>
              <Icon name="pencil" size={15} color="#fff" />
              <Text style={styles.faceActionText}>Edit</Text>
            </TouchableOpacity>
          ) : faceStatus === 'Rejected' ? (
            <TouchableOpacity
              id="face-card-retry-btn"
              style={[styles.faceAction, {backgroundColor: colors.primary}]}
              onPress={() => navigation.navigate('FaceEnroll')}>
              <Icon name="camera" size={15} color="#fff" />
              <Text style={styles.faceActionText}>Retry</Text>
            </TouchableOpacity>
          ) : faceStatus === 'NotEnrolled' ? (
            <TouchableOpacity
              id="face-card-register-btn"
              style={[styles.faceAction, {backgroundColor: colors.primary}]}
              onPress={() => navigation.navigate('FaceEnroll')}>
              <Icon name="camera" size={15} color="#fff" />
              <Text style={styles.faceActionText}>Register</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.faceAction, {backgroundColor: colors.warning + '22', borderWidth: 1, borderColor: colors.warning}]}>
              <Icon name="clock" size={15} color={colors.warning} />
              <Text style={[styles.faceActionText, {color: colors.warning}]}>Review</Text>
            </View>
          )}
        </View>

        {/* ─── Mark Attendance Card ──────────────────────────────────────── */}
        <View style={styles.attendanceCard}>
          {statusState === 'IDLE' && (
            <View style={styles.idleBox}>
              <Animated.View style={[styles.gpsCircle, {opacity: fadeAnim}]}>
                <Icon name="mapPin" size={40} color={colors.textAccent} />
              </Animated.View>
              <Text style={styles.stepTitle}>Ready to Mark Attendance</Text>
              {!isOnline ? (
                <Text style={[styles.stepDesc, {color: colors.warning, textAlign: 'center'}]}>
                  Requires an internet connection. Reconnect to mark your attendance.
                </Text>
              ) : (
              <Text style={styles.stepDesc}>
                Department: <Text style={{fontWeight: '700', color: colors.textAccent}}>{profile?.department || deptInfo?.departmentName || 'ERP / Cyber'}</Text> (Max 100m radius)
              </Text>
              )}
              <View style={styles.testModeRow}>
                <View style={{flex: 1}}>
                  <Text style={styles.testModeLabel}>Simulate Office Location</Text>
                  <Text style={styles.testModeHint}>Reports office location so attendance works from anywhere</Text>
                </View>
                <Switch
                  value={debug.simulateLocation}
                  onValueChange={v => dispatch(setSimulateLocation(v))}
                  trackColor={{false: colors.border, true: colors.primary}}
                  thumbColor="#fff"
                />
              </View>
              <GradientButton
                id="start-attendance-btn"
                onPress={startAttendanceSession}
                disabled={loading || !isOnline}
                loading={loading}
                icon={<Icon name="mapPin" size={18} color="#fff" />}>
                <Text style={styles.primaryBtnText}>Mark Attendance Now</Text>
              </GradientButton>
            </View>
          )}

          {statusState === 'FACE_CHECKING' && (
            <View style={styles.flowBox}>
              <Text style={styles.stepTitle}>Step 1: Face Verification</Text>
              <Text style={styles.stepDesc}>Verifying identity against registered face profile</Text>

              <View style={styles.cameraFrame}>
                {permGranted && device && photoOutput ? (
                  <Camera
                    ref={cameraRef}
                    style={styles.camera}
                    device={device}
                    isActive={true}
                    outputs={[photoOutput]}
                  />
                ) : (
                  <View style={styles.noCameraBox}><Icon name="user" size={28} color={colors.textSecondary} /></View>
                )}

                {scanningFace && (
                  <Animated.View style={[styles.scanBeam, {transform: [{translateY: scanBeamAnim}]}]} />
                )}

                <View style={styles.challengeOverlay}>
                  <Text style={styles.challengeText}>
                    {scanningFace
                      ? `Challenge ${currentChallenge + 1}: ${serverChallenges[currentChallenge]?.label ?? 'Follow the prompt'}`
                      : 'Position face inside frame'}
                  </Text>
                </View>
              </View>

              <View style={styles.hintsBox}>
                {serverChallenges.map((c, i) => (
                  <Text key={c.id} style={[styles.hintItem, (i < currentChallenge || livenessPassed) && styles.hintDone]}>
                    {(i < currentChallenge || livenessPassed) ? 'Done' : `${i + 1}.`} {c.label}
                  </Text>
                ))}
              </View>

              <GradientButton
                id="run-face-check-btn"
                onPress={runFaceAndLivenessCheck}
                disabled={scanningFace}
                loading={scanningFace}
                icon={<Icon name="camera" size={18} color="#fff" />}>
                <Text style={styles.primaryBtnText}>Verify Face & Proceed</Text>
              </GradientButton>
            </View>
          )}

          {(statusState === 'FACE_VERIFIED' || statusState === 'LOCATION_CHECKING' || statusState === 'LOCATION_VERIFIED' || statusState === 'FINALIZING') && (
            <View style={styles.flowBox}>
              <Text style={styles.stepTitle}>
                {statusState === 'LOCATION_VERIFIED' || statusState === 'FINALIZING'
                  ? 'Step 3: Finalizing Attendance'
                  : 'Step 2: Department Geofence Check'}
              </Text>
              <Text style={styles.stepDesc}>
                {statusState === 'LOCATION_VERIFIED' || statusState === 'FINALIZING'
                  ? 'Recording PRESENT status in database...'
                  : 'Verifying physical coordinates against department 100m radius...'}
              </Text>
              <ActivityIndicator size="large" color={statusState === 'FINALIZING' ? colors.success : colors.primary} style={{marginVertical: 24}} />
              <Text style={styles.infoText}>
                {statusState === 'LOCATION_VERIFIED' || statusState === 'FINALIZING'
                  ? 'Writing attendance record...'
                  : 'Fetching GPS location...'}
              </Text>
            </View>
          )}

          {statusState === 'SUCCESS' && (
            <View style={styles.resultBox}>
              <View style={[styles.resultIconBox, {backgroundColor: colors.success + '22'}]}>
                <Icon name="check" size={36} color={colors.success} />
              </View>
              <Text style={[styles.resultTitle, {color: colors.success}]}>{checkoutMode ? 'CHECKED OUT' : 'PRESENT'}</Text>
              <Text style={styles.resultMsg}>{checkoutMode ? 'Checked out successfully!' : 'Attendance marked successfully!'}</Text>
              <View style={styles.badgeCard}>
                <View style={styles.badgeRow}>
                  <Icon name="building" size={15} color={colors.textMuted} />
                  <Text style={styles.badgeText}>Department: {resultData?.departmentName || profile?.department}</Text>
                </View>
                <View style={styles.badgeRow}>
                  <Icon name="mapPin" size={15} color={colors.textMuted} />
                  <Text style={styles.badgeText}>Geofence Distance: {resultData?.distanceMeters ?? 0}m (Max 100m)</Text>
                </View>
                <View style={styles.badgeRow}>
                  <Icon name="user" size={15} color={colors.textMuted} />
                  <Text style={styles.badgeText}>ArcFace 1:1 Identity Verification: Passed</Text>
                </View>
                <View style={styles.badgeRow}>
                  <Icon name="clock" size={15} color={colors.textMuted} />
                  <Text style={styles.badgeText}>Official Timestamp: {new Date().toLocaleTimeString()}</Text>
                </View>
              </View>
              <GradientButton id="attendance-done-btn" style={{width: '100%'}} onPress={goBackToOverview}>
                <Text style={styles.primaryBtnText}>Done</Text>
              </GradientButton>
            </View>
          )}

          {statusState === 'FAILED' && (
            <View style={styles.resultBox}>
              <View style={[styles.resultIconBox, {backgroundColor: colors.error + '22'}]}>
                <Icon name="close" size={36} color={colors.error} />
              </View>
              <Text style={[styles.resultTitle, {color: colors.error}]}>Attendance Rejected</Text>
              <Text style={styles.resultMsg}>{errorMessage}</Text>
              <GradientButton
                id="retry-attendance-btn"
                style={{width: '100%'}}
                onPress={startAttendanceSession}
                icon={<Icon name="refresh" size={18} color="#fff" />}>
                <Text style={styles.primaryBtnText}>Try Again</Text>
              </GradientButton>
            </View>
          )}

          {statusState === 'CUTOFF_ABSENT' && (
            <View style={styles.resultBox}>
              <View style={[styles.resultIconBox, {backgroundColor: colors.error + '22'}]}>
                <Icon name="close" size={36} color={colors.error} />
              </View>
              <Text style={[styles.resultTitle, {color: colors.error}]}>ABSENT</Text>
              <Text style={styles.resultMsg}>
                {errorMessage || 'Attendance window closed after 1:00 PM. Automatically marked ABSENT for today.'}
              </Text>
              <View style={[styles.badgeCard, {borderColor: colors.error}]}>
                <View style={styles.badgeRow}>
                  <Icon name="clock" size={15} color={colors.error} />
                  <Text style={[styles.badgeText, {color: colors.error}]}>Cut-off Time: 1:00 PM PKT</Text>
                </View>
                <Text style={styles.badgeText}>Attendance must be marked before 1:00 PM every working day.</Text>
              </View>
              <GradientButton id="attendance-done-btn" style={{width: '100%'}} onPress={goBackToOverview}>
                <Text style={styles.primaryBtnText}>Done</Text>
              </GradientButton>
            </View>
          )}

          {statusState === 'ALREADY_MARKED' && (
            <View style={styles.resultBox}>
              <View style={[styles.resultIconBox, {backgroundColor: colors.success + '22'}]}>
                <Icon name="check" size={36} color={colors.success} />
              </View>
              <Text style={[styles.resultTitle, {color: colors.success}]}>ATTENDANCE RECORDED</Text>
              <Text style={styles.resultMsg}>You have already marked attendance for today.</Text>
              <View style={styles.badgeCard}>
                <View style={styles.badgeRow}>
                  <Icon name="calendar" size={15} color={colors.textMuted} />
                  <Text style={styles.badgeText}>Status: {resultData?.status || 'Present'}</Text>
                </View>
                <View style={styles.badgeRow}>
                  <Icon name="clock" size={15} color={colors.textMuted} />
                  <Text style={styles.badgeText}>Time: {new Date(resultData?.timestamp || Date.now()).toLocaleTimeString()}</Text>
                </View>
                {resultData?.departureTime && (
                  <View style={styles.badgeRow}>
                    <Icon name="clock" size={15} color={colors.textMuted} />
                    <Text style={styles.badgeText}>Checkout: {new Date(resultData.departureTime).toLocaleTimeString()}</Text>
                  </View>
                )}
              </View>
              {!resultData?.departureTime && (
                <TouchableOpacity style={[styles.checkoutBtn, (checkingOut || !isOnline) && {opacity:0.6}]} onPress={startCheckoutSession} disabled={checkingOut || !isOnline}>
                  {checkingOut ? <ActivityIndicator color="#fff" size="small" /> : <><Icon name="logout" size={16} color="#fff" /><Text style={styles.checkoutBtnText}>{!isOnline ? 'Requires internet' : 'Check Out'}</Text></>}
                </TouchableOpacity>
              )}
            </View>
          )}

          {statusState === 'FACE_NOT_REGISTERED' && (
            <View style={styles.resultBox}>
              <View style={[styles.resultIconBox, {backgroundColor: colors.warning + '22'}]}>
                <Icon name="alert" size={36} color={colors.warning} />
              </View>
              <Text style={[styles.resultTitle, {color: colors.warning}]}>Face Setup Required</Text>
              <Text style={styles.resultMsg}>You must register your face profile before marking attendance.</Text>
              <GradientButton
                id="nav-face-reg-btn"
                style={{width: '100%'}}
                onPress={() => navigation.navigate('FaceEnroll')}
                icon={<Icon name="camera" size={18} color="#fff" />}>
                <Text style={styles.primaryBtnText}>Register Face Profile Now</Text>
              </GradientButton>
            </View>
          )}
        </View>

        {/* ─── Attendance History ────────────────────────────────────────── */}
        <View style={styles.historyCard}>
          <View style={styles.historyHeader}>
            <TouchableOpacity
              id="history-prev"
              style={styles.monthBtn}
              onPress={() => changeMonth(-1)}>
              <Icon name="back" size={18} color={colors.textAccent} />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>{MONTHS[historyMonth.month - 1]} {historyMonth.year}</Text>
            <TouchableOpacity
              id="history-next"
              style={[styles.monthBtn, isCurrentMonth() && styles.monthBtnDisabled]}
              onPress={() => changeMonth(1)}
              disabled={isCurrentMonth()}>
              <Icon name="chevronRight" size={18} color={isCurrentMonth() ? colors.textMuted : colors.primary} />
            </TouchableOpacity>
          </View>

          {historyLoading ? (
            <View style={styles.historyEmpty}>
              <ActivityIndicator color={colors.textAccent} />
            </View>
          ) : records.length === 0 ? (
            <View style={styles.historyEmpty}>
              <Icon name="calendar" size={28} color={colors.textMuted} />
              <Text style={styles.historyEmptyText}>No attendance records this month.</Text>
            </View>
          ) : (
            <>
            <View style={styles.table}>
              <View style={styles.tableHead}>
                <Text style={[styles.tableHeadCell, styles.colDate]}>Date</Text>
                <Text style={[styles.tableHeadCell, styles.colTime]}>In</Text>
                <Text style={[styles.tableHeadCell, styles.colTime]}>Out</Text>
                <Text style={[styles.tableHeadCell, styles.colStatus]}>Status</Text>
              </View>
              {records.map(r => {
                const badge = statusBadge(r.status);
                const outTime = r.departureTime || r.outTime;
                return (
                  <View key={r.id} style={styles.tableRow}>
                    <Text style={[styles.tableCell, styles.colDate]}>{new Date(r.timestamp).toLocaleDateString()}</Text>
                    <Text style={[styles.tableCell, styles.colTime]}>
                      {r.checkInPhotoPath ? (
                        <TouchableOpacity id={`att-in-${r.id}`} onPress={() => setViewerUri(fileUrl(r.checkInPhotoPath))}>
                          <Image source={{uri: fileUrl(r.checkInPhotoPath)}} style={styles.tableThumb} />
                        </TouchableOpacity>
                      ) : new Date(r.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                    </Text>
                    <Text style={[styles.tableCell, styles.colTime]}>
                      {outTime ? (
                        r.checkOutPhotoPath ? (
                          <TouchableOpacity id={`att-out-${r.id}`} onPress={() => setViewerUri(fileUrl(r.checkOutPhotoPath))}>
                            <Image source={{uri: fileUrl(r.checkOutPhotoPath)}} style={styles.tableThumb} />
                          </TouchableOpacity>
                        ) : new Date(outTime).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})
                      ) : '—'}
                    </Text>
                    <View style={[styles.tableCell, styles.colStatus]}>
                      <View style={[styles.rowBadge, {backgroundColor: badge.color + '22'}]}>
                        <Icon name={badge.icon} size={11} color={badge.color} />
                        <Text style={[styles.rowBadgeText, {color: badge.color}]}>{r.status}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
            <EndOfListMarker />
            </>
          )}
        </View>
        </>
        )}

        {subtab === 'leaves' && (
        <>
        {/* ─── Apply for Leave (#14) ────────────────────────────────────── */}
        <View style={styles.leaveCardSection}>
          <Text style={styles.leaveSectionTitle}>Apply for Leave</Text>
          <Text style={styles.leaveHint}>Submit a leave request to your mentor for approval</Text>

          <Text style={styles.formLabel}>Start Date (YYYY-MM-DD)</Text>
          <TextInput style={styles.input} value={leaveStartDate} onChangeText={setLeaveStartDate} placeholder="2026-09-01" placeholderTextColor={colors.textMuted} />

          <Text style={styles.formLabel}>End Date (YYYY-MM-DD)</Text>
          <TextInput style={styles.input} value={leaveEndDate} onChangeText={setLeaveEndDate} placeholder="2026-09-03" placeholderTextColor={colors.textMuted} />

          <Text style={styles.formLabel}>Reason</Text>
          <TextInput style={[styles.input, styles.inputMultiline]} value={leaveReason} onChangeText={setLeaveReason} placeholder="Why do you need leave?" placeholderTextColor={colors.textMuted} multiline numberOfLines={3} />

          <TouchableOpacity id="apply-leave-btn" style={[styles.submitBtn, submittingLeave && {opacity: 0.6}]} onPress={submitLeave} disabled={submittingLeave}>
            {submittingLeave ? <ActivityIndicator size="small" color="#fff" /> : <><Icon name="calendar" size={18} color="#fff" /><Text style={styles.submitBtnText}>Submit Request</Text></>}
          </TouchableOpacity>
        </View>

        {/* ─── My Leave Requests (#14) ───────────────────────────────────── */}
        <View style={styles.historyCard}>
          <Text style={styles.leaveSectionTitle}>My Leave Requests</Text>
          {leaves.length === 0 && (
            <View style={styles.historyEmpty}>
              <Icon name="calendar" size={28} color={colors.textMuted} />
              <Text style={styles.historyEmptyText}>No leave requests yet</Text>
            </View>
          )}
          {leaves.map(l => {
            const badgeColor = {Pending: colors.warning, Approved: colors.success, Rejected: colors.error}[l.status] || colors.textMuted;
            return (
              <View key={l.id} style={styles.leaveCard}>
                <View style={styles.leaveRow}>
                  <Text style={styles.leaveDates}>{new Date(l.startDate).toLocaleDateString()} – {new Date(l.endDate).toLocaleDateString()}</Text>
                  <Text style={[styles.leaveBadge, {color: badgeColor}]}>{l.status}</Text>
                </View>
                <Text style={styles.leaveReason}>{l.reason}</Text>
                {l.rejectionReason && <Text style={styles.leaveRejectReason}>Rejection reason: {l.rejectionReason}</Text>}
                <Text style={styles.leaveDate}>Applied {new Date(l.createdAt).toLocaleDateString()}</Text>
              </View>
            );
          })}
        </View>
        </>
        )}

      </ScrollView>

      <Modal visible={viewerUri !== null} transparent animationType="fade" onRequestClose={() => setViewerUri(null)}>
        <View style={styles.viewerOverlay}>
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerUri(null)}>
            <Icon name="close" size={22} color="#fff" />
          </TouchableOpacity>
          {viewerUri && <Image source={{uri: viewerUri}} style={styles.viewerImage} resizeMode="contain" />}
        </View>
      </Modal>
    </ScreenBackground>
  );
}

const makeStyles = colors => StyleSheet.create({
  container: {flex: 1},
  menuBtn: {width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', justifyContent: 'center', alignItems: 'center'},
  pageHeader: {paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8},
  pageSubtitle: {color: colors.textMuted, fontSize: 13, marginTop: 3},
  subtabRow: {flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 12},
  subtabBtn: {flex: 1, borderRadius: 12, paddingVertical: 11, alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border},
  subtabBtnActive: {backgroundColor: colors.primary + '22', borderColor: colors.primary},
  subtabText: {color: colors.textSecondary, fontWeight: '600', fontSize: 14},
  subtabTextActive: {color: colors.textAccent, fontWeight: '700'},

  // Face card
  faceCard: {flexDirection: 'row', alignItems: 'center', marginTop: 12, marginHorizontal: 16, marginBottom: 12, backgroundColor: colors.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.border},
  faceIconBox: {width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', marginRight: 12},
  faceInfo: {flex: 1},
  faceLabel: {color: colors.text, fontSize: 14, fontWeight: '700'},
  faceStatus: {fontSize: 12, fontWeight: '600', marginTop: 2},
  faceRejectText: {fontSize: 11, color: colors.error, marginTop: 2},
  faceAction: {flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9},
  faceActionText: {color: '#fff', fontSize: 14, fontWeight: '700'},

  // Mark attendance card
  attendanceCard: {marginHorizontal: 16, marginBottom: 12, backgroundColor: colors.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.border},
  idleBox: {alignItems: 'center'},
  gpsCircle: {width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary + '22', justifyContent: 'center', alignItems: 'center', marginBottom: 12},
  stepTitle: {color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 5, textAlign: 'center'},
  stepDesc: {color: colors.textSecondary, fontSize: 12, textAlign: 'center', marginBottom: 14},
  testModeRow: {flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%', backgroundColor: colors.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 16},
  testModeLabel: {color: colors.text, fontSize: 14, fontWeight: '700'},
  testModeHint: {color: colors.textMuted, fontSize: 11, marginTop: 2},
  flowBox: {alignItems: 'center'},
  cameraFrame: {width: '100%', height: 240, borderRadius: 16, overflow: 'hidden', borderWidth: 3, borderColor: colors.primary, marginVertical: 14, position: 'relative', backgroundColor: '#0f172a'},
  camera: {flex: 1},
  noCameraBox: {flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.card},
  scanBeam: {position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 1, shadowRadius: 8, elevation: 4},
  challengeOverlay: {position: 'absolute', bottom: 10, left: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, alignItems: 'center'},
  challengeText: {color: '#fff', fontSize: 12, fontWeight: '700'},
  hintsBox: {width: '100%', flexDirection: 'row', justifyContent: 'space-around', marginVertical: 12},
  hintItem: {color: colors.textSecondary, fontSize: 12, fontWeight: '600'},
  hintDone: {color: colors.success, fontWeight: '700'},
  primaryBtnText: {color: '#fff', fontSize: 14, fontWeight: '700'},
  infoText: {color: colors.textSecondary, fontSize: 13, fontWeight: '600'},
  resultBox: {alignItems: 'center'},
  resultIconBox: {width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', marginBottom: 12},
  resultTitle: {fontSize: 24, fontWeight: '800', marginBottom: 6},
  resultMsg: {color: colors.textSecondary, fontSize: 14, textAlign: 'center', marginBottom: 18},
  badgeCard: {width: '100%', backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 16, gap: 8},
  badgeRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  badgeText: {color: colors.text, fontSize: 13, fontWeight: '600'},

  // History
  historyCard: {marginHorizontal: 16, marginBottom: 24, backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border},
  historyHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12},
  monthBtn: {width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border},
  monthBtnDisabled: {opacity: 0.4},
  monthLabel: {color: colors.text, fontSize: 15, fontWeight: '700'},
  historyEmpty: {alignItems: 'center', paddingVertical: 28, gap: 8},
  historyEmptyText: {color: colors.textMuted, fontSize: 13},
  table: {borderWidth: 1, borderColor: colors.border, borderRadius: 10, overflow: 'hidden'},
  tableHead: {flexDirection: 'row', backgroundColor: colors.card, paddingVertical: 10, paddingHorizontal: 12},
  tableHeadCell: {color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5},
  tableRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: colors.border},
  tableCell: {fontSize: 13, color: colors.text},
  tableThumb: {width: 30, height: 30, borderRadius: 7, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card},
  colDate: {flex: 1.4},
  colTime: {flex: 1},
  colStatus: {flex: 1.2, alignItems: 'flex-start'},
  viewerOverlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center'},
  viewerClose: {position: 'absolute', top: 50, right: 20, zIndex: 1, padding: 8},
  viewerImage: {width: '100%', height: '78%'},
  rowBadge: {flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4},
  rowBadgeText: {fontSize: 11, fontWeight: '700'},
  checkoutBtn: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, marginTop: 12, width: '100%'},
  checkoutBtnText: {color: '#fff', fontSize: 14, fontWeight: '700'},

  // Leaves (#14)
  leaveCardSection: {marginHorizontal: 16, marginBottom: 12, backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border},
  leaveSectionTitle: {color: colors.text, fontSize: 15, fontWeight: '700', marginBottom: 3},
  leaveHint: {color: colors.textMuted, fontSize: 12, marginBottom: 10},
  formLabel: {fontSize: 12, fontWeight: '600', color: colors.textMuted, marginBottom: 4, marginTop: 8},
  input: {backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, fontSize: 14, color: colors.text, marginBottom: 4},
  inputMultiline: {minHeight: 72, textAlignVertical: 'top'},
  submitBtn: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 13, marginTop: 10},
  submitBtnText: {fontSize: 15, fontWeight: '600', color: '#fff'},
  leaveCard: {backgroundColor: colors.card, borderRadius: 12, padding: 14, marginTop: 10, borderWidth: 1, borderColor: colors.border},
  leaveRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  leaveDates: {fontSize: 14, fontWeight: '600', color: colors.text, flex: 1},
  leaveBadge: {fontSize: 12, fontWeight: '700'},
  leaveReason: {fontSize: 13, color: colors.text, marginTop: 6},
  leaveRejectReason: {fontSize: 12, color: colors.error, marginTop: 4},
  leaveDate: {fontSize: 11, color: colors.textMuted, marginTop: 6},
});
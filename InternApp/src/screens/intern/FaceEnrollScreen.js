import React, {useState, useRef, useMemo, useEffect, useCallback} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated,
} from 'react-native';
import {Camera, useCameraDevice, VisionCamera, CommonResolutions} from 'react-native-vision-camera';
import client, {clearTokens} from '../../api/client';
import {showToast} from '../../components/AppToast';
import {useDispatch, useSelector} from 'react-redux';
import {setCredentials, logout} from '../../store/slices/authSlice';
import {imageUriToBase64, toFileUri} from '../../utils/faceUtils';
import {useAppTheme} from '../../theme';
import ScreenBackground from '../../components/ScreenBackground';
import Icon from '../../components/Icon';
import BackButton from '../../components/BackButton';
import {effectiveFaceStatus} from '../../utils/debug';

export default function FaceEnrollScreen({navigation}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dispatch = useDispatch();
  const {user, role, profile} = useSelector(s => s.auth);
  const debug = useSelector(s => s.debug);
  const [step, setStep] = useState('instructions'); // 'instructions' | 'scanning' | 'done'
  const [enrolling, setEnrolling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState('Position your face inside the circle');
  const [checking, setChecking] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const cameraRef = useRef(null);
  const frontCamera = useCameraDevice('front');
  const backCamera = useCameraDevice('back');
  const device = frontCamera ?? backCamera;
  const [permGranted, setPermGranted] = useState(false);
  const [photoOutput, setPhotoOutput] = useState(null);

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
    if (step === 'scanning') {
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
  }, [step, ensureCamera, photoOutput]);
  const scanBeamAnim = useRef(new Animated.Value(0)).current;

  const enrollmentStatus = effectiveFaceStatus(profile, debug);
  const statusBlocked = !retrying && ['Pending', 'Rejected'].includes(enrollmentStatus);
  const docsBlocked = profile?.docsApproved === false && !['Approved', 'Pending'].includes(enrollmentStatus);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await client.get('/intern/profile');
        if (!cancelled) dispatch(setCredentials({user, role, profile: res.data}));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [dispatch, user, role]);

  const onBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.replace('InternTabs');
  };

  const startScanBeam = () => {
    scanBeamAnim.setValue(0);
    Animated.timing(scanBeamAnim, {toValue: 240, duration: 1200, useNativeDriver: true}).start();
  };

  const startEnrollment = () => {
    setStep('scanning');
    setProgress(0);
    setEnrolling(false);
    setStatusMsg('Position your face inside the guide frame');
    startScanBeam();
  };

  const captureAndRegisterFace = async () => {
    if (enrolling) return;
    setEnrolling(true);
    setStatusMsg('Capturing facial image...');
    setProgress(30);

    try {
      if (!permGranted || !device || !photoOutput) throw new Error('Camera not ready. Grant camera permission and retry.');
      const photoFile = await photoOutput.capturePhotoToFile({ flashMode: 'off' }, {});
      const faceImage = await imageUriToBase64(toFileUri(photoFile.filePath));

      setProgress(75);
      setStatusMsg('Submitting face profile for verification...');

      // Server re-derives the ArcFace embedding and runs passive anti-spoof.
      await client.post('/intern/face/enroll', { faceImage });

      setProgress(100);
      setStep('done');

      dispatch(setCredentials({
        user,
        role,
        profile: {...profile, faceEnrolled: false, faceEnrollmentStatus: 'Pending', faceRejectedReason: null},
      }));
      setRetrying(false);
    } catch (e) {
      const msg = e.response?.data?.message || e.message || 'Enrollment failed, please try again';
      showToast(msg, 'error');
      setStep('instructions');
    } finally {
      setEnrolling(false);
    }
  };

  const checkStatus = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const res = await client.get('/intern/profile');
      dispatch(setCredentials({user, role, profile: res.data}));
      if (res.data.faceEnrollmentStatus === 'Approved') {
        showToast('Face enrollment approved', 'success');
        continueToApp();
      } else {
        showToast('Still awaiting verification', 'info');
      }
    } catch {
      showToast("Couldn't check status. Try again.", 'error');
    } finally {
      setChecking(false);
    }
  };

  const continueToApp = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.replace('InternTabs');
  };

  const handleLogout = async () => {
    const {getRefreshToken} = require('../../api/tokenStore');
    const refreshToken = await getRefreshToken();
    try { await client.post('/auth/logout', {refreshToken}); } catch {}
    await AsyncStorage.removeItem('user');
    clearTokens();
    dispatch(logout());
  };

  if (enrollmentStatus === 'Approved') {
    return (
      <ScreenBackground style={styles.statusContainer}>
        <View style={styles.floatBack}>{navigation.canGoBack() && <BackButton id="face-approved-back" onPress={onBack} />}</View>
        <View style={[styles.iconBox, {backgroundColor: colors.success + '22'}]}>
          <Icon name="user" size={44} color={colors.success} />
        </View>
        <Text style={styles.doneTitle}>Face Already Registered</Text>
        <Text style={styles.doneSubtitle}>
          Your face is already enrolled and approved. To update it, ask your admin to remove the current enrollment first.
        </Text>
        <TouchableOpacity id="face-approved-home" style={styles.primaryBtn} onPress={onBack}>
          <Icon name="home" size={18} color="#fff" />
          <Text style={styles.primaryBtnText}>Go to Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Icon name="logout" size={16} color={colors.textMuted} />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </ScreenBackground>
    );
  }

  if (enrollmentStatus === 'Pending' && statusBlocked) {
    return (
      <ScreenBackground style={styles.statusContainer}>
        <View style={styles.floatBack}>{navigation.canGoBack() && <BackButton id="face-pending-back" onPress={onBack} />}</View>
        <View style={[styles.iconBox, {backgroundColor: colors.warning + '22'}]}>
          <Icon name="clock" size={44} color={colors.warning} />
        </View>
        <Text style={styles.doneTitle}>Face Enrollment Under Review</Text>
        <Text style={styles.doneSubtitle}>
          Your face profile has been submitted and is awaiting verification by the admin or your mentor.
          You will be able to mark attendance once it is approved.
        </Text>
        <TouchableOpacity id="face-status-check" style={styles.primaryBtn} onPress={checkStatus} disabled={checking}>
          {checking ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="refresh" size={18} color="#fff" />}
          <Text style={styles.primaryBtnText}>Check Status</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Icon name="logout" size={16} color={colors.textMuted} />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </ScreenBackground>
    );
  }

  if (docsBlocked) {
    return (
      <ScreenBackground style={styles.statusContainer}>
        <View style={styles.floatBack}>{navigation.canGoBack() && <BackButton id="face-docs-blocked-back" onPress={onBack} />}</View>
        <View style={[styles.iconBox, {backgroundColor: colors.warning + '22'}]}>
          <Icon name="folder" size={44} color={colors.warning} />
        </View>
        <Text style={styles.doneTitle}>Verify Your Documents First</Text>
        <Text style={styles.doneSubtitle}>
          Your CNIC and CV/Resume must be uploaded and approved in the Documents section before you can enroll your face.
        </Text>
        <TouchableOpacity id="face-docs-goto-docs" style={styles.primaryBtn} onPress={() => navigation.navigate('InternTabs', {screen: 'Documents'})}>
          <Icon name="upload" size={18} color="#fff" />
          <Text style={styles.primaryBtnText}>Go to Documents</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Icon name="logout" size={16} color={colors.textMuted} />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </ScreenBackground>
    );
  }

  if (enrollmentStatus === 'Rejected' && statusBlocked) {
    return (
      <ScreenBackground style={styles.statusContainer}>
        <View style={styles.floatBack}>{navigation.canGoBack() && <BackButton id="face-rejected-back" onPress={onBack} />}</View>
        <View style={[styles.iconBox, {backgroundColor: colors.error + '22'}]}>
          <Icon name="close" size={44} color={colors.error} />
        </View>
        <Text style={styles.doneTitle}>Face Enrollment Rejected</Text>
        {profile?.faceRejectedReason ? (
          <Text style={styles.rejectReason}>Reason: {profile.faceRejectedReason}</Text>
        ) : (
          <Text style={styles.doneSubtitle}>Your face profile was rejected. Please retry with a clearer photo and better lighting.</Text>
        )}
        <TouchableOpacity id="face-reject-retry" style={styles.primaryBtn} onPress={() => {setRetrying(true); setStep('instructions');}}>
          <Icon name="camera" size={18} color="#fff" />
          <Text style={styles.primaryBtnText}>Retry Face Enrollment</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Icon name="logout" size={16} color={colors.textMuted} />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </ScreenBackground>
    );
  }

  if (step === 'instructions') {
    return (
      <ScreenBackground style={styles.container}>
        <View style={styles.floatBack}>{navigation.canGoBack() && <BackButton id="face-instr-back" onPress={onBack} />}</View>
        <View style={styles.iconBox}>
          <Icon name="user" size={40} color={colors.textAccent} />
        </View>
        <Text style={styles.title}>Face Profile Setup</Text>
        <Text style={styles.subtitle}>
          Register your 512-dimensional ArcFace face embedding for attendance verification.
          {enrollmentStatus === 'Approved' ? ' Your updated profile will require verification again.' : ''}
        </Text>
        <View style={styles.tipsList}>
          {[
            'Ensure clear lighting on your face',
            'Look directly into the front camera',
            'Keep a natural neutral expression',
            'Quick 1-click registration setup',
          ].map((tip, i) => (
            <Text key={i} style={styles.tip}>{i + 1}. {tip}</Text>
          ))}
        </View>
        <TouchableOpacity id="start-face-enroll-btn" style={styles.startBtn} onPress={startEnrollment}>
          <Text style={styles.startBtnText}>Start Face Setup</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Icon name="logout" size={16} color={colors.textMuted} />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </ScreenBackground>
    );
  }

  if (step === 'scanning') {
    return (
      <ScreenBackground style={styles.container}>
        <View style={styles.floatBack}>{navigation.canGoBack() && <BackButton id="face-scan-back" onPress={onBack} />}</View>
        <Text style={styles.title}>Face Registration</Text>
        <Text style={styles.subtitle}>{statusMsg}</Text>

        <View style={[styles.cameraFrame, {borderColor: enrolling ? colors.success : colors.primary}]}>
          {permGranted && device && photoOutput ? (
            <Camera
              ref={cameraRef}
              style={styles.camera}
              device={device}
              isActive={true}
              outputs={[photoOutput]}
            />
          ) : (
            <View style={styles.noCam}>
              <Icon name="user" size={28} color={colors.textSecondary} />
              <Text style={[styles.subtitle, {marginTop: 8}]}>Camera permission required. Please allow camera access.</Text>
            </View>
          )}

          <Animated.View style={[styles.scanBeam, {transform: [{translateY: scanBeamAnim}]}]} />

          <View style={styles.cameraOverlay}>
            <View style={[styles.faceGuide, {borderColor: enrolling ? colors.success : colors.pending}]} />
          </View>
        </View>

        {!enrolling ? (
          <TouchableOpacity
            id="capture-face-btn"
            style={styles.primaryBtn}
            onPress={captureAndRegisterFace}>
            <Icon name="camera" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>Capture & Register Face Profile</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={colors.textAccent} />
            <Text style={styles.loadingText}>{statusMsg}</Text>
            <Text style={styles.progressText}>{progress}% Complete</Text>
          </View>
        )}
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground style={styles.doneContainer}>
      <View style={styles.floatBack}>{navigation.canGoBack() && <BackButton id="face-done-back" onPress={onBack} />}</View>
      <View style={[styles.iconBox, {backgroundColor: colors.warning + '22'}]}>
        <Icon name="clock" size={48} color={colors.warning} />
      </View>
      <Text style={styles.doneTitle}>Face Submitted for Verification!</Text>
      <Text style={styles.doneSubtitle}>Your face profile has been submitted. The admin or your mentor will verify it before you can mark attendance.</Text>
      <TouchableOpacity id="face-done-continue" style={styles.primaryBtn} onPress={continueToApp}>
        <Text style={styles.primaryBtnText}>Continue</Text>
      </TouchableOpacity>
    </ScreenBackground>
  );
}

const makeStyles = colors => StyleSheet.create({
  container: {flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center'},
  statusContainer: {flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 8},
  floatBack: {position: 'absolute', top: 56, left: 16, zIndex: 10},
  iconBox: {width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primary + '33', justifyContent: 'center', alignItems: 'center', marginBottom: 16},
  title: {color: colors.text, fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 8},
  subtitle: {color: colors.textSecondary, fontSize: 13, textAlign: 'center', marginBottom: 24},
  tipsList: {width: '100%', backgroundColor: colors.surface, borderRadius: 16, padding: 20, marginBottom: 28, borderWidth: 1, borderColor: colors.border},
  tip: {color: colors.textSecondary, fontSize: 13, marginBottom: 8},
  startBtn: {backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 36, shadowColor: colors.primary, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6},
  startBtnText: {color: '#fff', fontSize: 15, fontWeight: '700'},
  cameraFrame: {width: 240, height: 280, borderRadius: 24, overflow: 'hidden', borderWidth: 3, borderColor: colors.primary, marginBottom: 24, position: 'relative', backgroundColor: '#0f172a'},
  camera: {flex: 1},
  noCam: {flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.card},
  scanBeam: {position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 1, shadowRadius: 10, elevation: 5},
  cameraOverlay: {position: 'absolute', inset: 0, justifyContent: 'center', alignItems: 'center'},
  faceGuide: {width: 150, height: 180, borderRadius: 75, borderWidth: 2, borderColor: colors.primary, borderStyle: 'dashed'},
  primaryBtn: {width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 16, shadowColor: colors.primary, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4},
  primaryBtnText: {color: '#fff', fontSize: 15, fontWeight: '700'},
  logoutBtn: {flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 16, marginTop: 8},
  logoutText: {color: colors.textMuted, fontSize: 14, fontWeight: '600'},
  loadingBox: {alignItems: 'center', gap: 12},
  loadingText: {color: colors.textSecondary, fontSize: 13, textAlign: 'center'},
  progressText: {color: colors.textAccent, fontSize: 16, fontWeight: '800'},
  doneContainer: {flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 8},
  doneTitle: {color: colors.text, fontSize: 26, fontWeight: '800', textAlign: 'center'},
  doneSubtitle: {color: colors.textSecondary, fontSize: 14, textAlign: 'center', marginTop: 8},
  rejectReason: {color: colors.error, fontSize: 14, textAlign: 'center', marginTop: 8, fontWeight: '600'},
});
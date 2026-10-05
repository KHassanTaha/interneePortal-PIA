import React, {useCallback, useState, useMemo} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput, RefreshControl, Modal,
} from 'react-native';
import client from '../../api/client';
import {write} from '../../api/write';
import {fileUrl} from '../../api/fileClient';
import {showToast} from '../../components/AppToast';
import {useAppTheme} from '../../theme';
import ScreenBackground from '../../components/ScreenBackground';
import {safePeriod} from '../../utils/dates';
import AppHeader from '../../components/AppHeader';
import RightSidebar from '../../components/RightSidebar';
import GradientButton from '../../components/GradientButton';
import Icon from '../../components/Icon';
import Spinner from '../../components/Spinner';
import PasswordInput from '../../components/PasswordInput';
import CenteredModalCard from '../../components/CenteredModalCard';

export default function ProfileScreen({navigation, route}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Complete Profile
  const [gender, setGender] = useState(null);
  const [university, setUniversity] = useState('');
  const [degree, setDegree] = useState('');
  const [saving, setSaving] = useState(false);

  // Change Password
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showPwModal, setShowPwModal] = useState(false);
  const [devices, setDevices] = useState(null);
  const [editingMacs, setEditingMacs] = useState(false);
  const [macLaptop, setMacLaptop] = useState('');
  const [macPhone, setMacPhone] = useState('');
  const [macSaving, setMacSaving] = useState(false);

  const startEditMacs = () => {
    setMacLaptop(devices?.laptop || '');
    setMacPhone(devices?.phone || '');
    setEditingMacs(true);
  };

  const saveMacs = async () => {
    setMacSaving(true);
    try {
      const {queued, res} = await write({
        kind: 'intern',
        label: 'Device MACs update',
        method: 'put',
        url: '/intern/devices',
        body: {laptopMac: macLaptop.trim(), phoneMac: macPhone.trim()},
      });
      if (!queued) setDevices(res.data);
      setEditingMacs(false);
      showToast(
        queued ? 'Devices saved locally — will sync when online.' : 'Devices updated.',
        queued ? 'info' : 'success',
      );
    } catch (e) {
      showToast(e.response?.data?.message || "Couldn't save devices.", 'error');
    } finally { setMacSaving(false); }
  };

  const fetchProfile = async () => {
    try {
      const [profileRes, devRes] = await Promise.all([
        client.get('/intern/profile'),
        client.get('/intern/devices'),
      ]);
      setProfile(profileRes.data);
      setGender(profileRes.data.gender ?? null);
      setUniversity(profileRes.data.university || '');
      setDegree(profileRes.data.degree || '');
      setDevices(devRes.data);
      if (route.params?.macEdit) {
        setMacLaptop(devRes.data.laptop || '');
        setMacPhone(devRes.data.phone || '');
        setEditingMacs(true);
        navigation.setParams({macEdit: false});
      }
    } catch { showToast("Couldn't load your profile. Pull to refresh.", 'error'); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const loadProfile = async () => {
        try {
          const [profileRes, devRes] = await Promise.all([
            client.get('/intern/profile'),
            client.get('/intern/devices'),
          ]);
          if (!cancelled) {
            setProfile(profileRes.data);
            setGender(profileRes.data.gender ?? null);
            setUniversity(profileRes.data.university || '');
            setDegree(profileRes.data.degree || '');
            setDevices(devRes.data);
            if (route.params?.macEdit) {
              setMacLaptop(devRes.data.laptop || '');
              setMacPhone(devRes.data.phone || '');
              setEditingMacs(true);
              navigation.setParams({macEdit: false});
            }
          }
        } catch { if (!cancelled) showToast("Couldn't load your profile. Pull to refresh.", 'error'); }
        finally { if (!cancelled) { setLoading(false); setRefreshing(false); } }
      };
      loadProfile();
      return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const saveProfile = async () => {
    setSaving(true);
    try {
      const {queued} = await write({
        kind: 'intern',
        label: 'Profile update',
        method: 'put',
        url: '/intern/profile',
        body: {university, degree, gender},
      });
      showToast(
        queued ? 'Profile saved locally — will sync when online.' : 'Profile updated.',
        queued ? 'info' : 'success',
      );
      fetchProfile();
    } catch (e) {
      showToast(e.response?.data?.message || "Couldn't save your profile. Try again.", 'error');
    } finally { setSaving(false); }
  };

  const changePassword = async () => {
    if (!currentPw) { showToast('Enter your current password.', 'error'); return false; }
    if (!newPw || newPw.length < 6) { showToast('Password must be at least 6 characters.', 'error'); return false; }
    if (newPw !== confirmPw) { showToast('Passwords do not match.', 'error'); return false; }
    setChangingPw(true);
    try {
      await write({
        kind: 'intern',
        label: 'Change password',
        method: 'post',
        url: '/auth/change-password',
        body: {currentPassword: currentPw, newPassword: newPw},
        requiresOnline: true,
      });
      setProfile((p) => p ? {...p, mustChangePassword: false} : p);
      showToast('Password changed.', 'success');
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      return true;
    } catch (e) {
      showToast(
        e.response?.data?.message ||
          (e.__offline
            ? 'Password change requires an internet connection.'
            : "Couldn't change your password. Try again."),
        'error',
      );
      return false;
    } finally { setChangingPw(false); }
  };

  if (loading) return <Spinner style={styles.center} />;

  const faceStatus = profile?.faceEnrollmentStatus ?? (profile?.faceEnrolled ? 'Approved' : 'NotEnrolled');

  const infoRows = [
    {label: 'RegNo', value: profile?.regNo, icon: 'idCard'},
    {label: 'Username', value: profile?.username, icon: 'user'},
    {label: 'CNIC', value: profile?.cnic, icon: 'idCard'},
    {label: 'Gender', value: profile?.gender === 1 ? 'Female' : profile?.gender === 0 ? 'Male' : '', icon: 'user'},
    {label: 'Department', value: profile?.department, icon: 'building'},
    {label: 'University', value: profile?.university, icon: 'building'},
    {label: 'Degree', value: profile?.degree, icon: 'gradCap'},
    {label: 'Mentor', value: profile?.mentorName, icon: 'users'},
    {label: 'Internship', value: profile ? safePeriod(profile.startDate, profile.endDate) : '', icon: 'calendar'},
    {label: 'Face Status', value: faceStatus === 'Approved' ? 'Registered' : faceStatus === 'Pending' ? 'Under review' : faceStatus === 'Rejected' ? 'Rejected' : 'Not set', icon: 'user'},
  ];

  const quickActions = [
    {key: 'Attendance', label: 'Attendance', icon: 'clock', count: profile?.presentDays ?? null, countLabel: 'days present', route: 'Attendance'},
    {key: 'Docs', label: 'Documents', icon: 'file', count: profile?.docsApprovedCount ?? null, countLabel: 'approved', route: 'Documents'},
    {key: 'Face', label: 'Face', icon: 'camera', count: faceStatus === 'Approved' ? 'OK' : faceStatus === 'Pending' ? 'Review' : 'Set up', route: 'FaceEnroll'},
    {key: 'Tasks', label: 'Tasks', icon: 'clipboard', count: profile?.tasksActiveCount ?? null, countLabel: 'pending', route: 'MyTasks'},
  ];

  const quickLinks = [
    {key: 'Documents', label: 'Upload Documents', icon: 'upload', desc: 'Submit CNIC, CV/Resume and optional University ID / NOC for verification'},
    {key: 'DocumentRequests', label: 'Request Documents', icon: 'ticket', desc: 'Apply for gate pass, ID card or certificate'},
    {key: 'Transfers', label: 'My Transfers', icon: 'transfer', desc: 'View your transfer requests and status history'},
    {key: 'ChangePassword', label: 'Change Password', icon: 'key', desc: 'Update your login password'},
    {key: 'FaceEnroll', label: 'Register Face', icon: 'camera', desc: 'Set up or update your face profile for attendance'},
  ];

  return (
    <ScreenBackground>
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchProfile();}} tintColor={colors.primary} />}>

      <AppHeader
        home
        right={(
          <TouchableOpacity id="profile-menu-btn" onPress={() => setSidebarVisible(true)} style={styles.menuBtn}>
            <Icon name="menu" size={22} color="#fff" />
          </TouchableOpacity>
        )}
      />

      <RightSidebar
        visible={sidebarVisible}
        onClose={() => setSidebarVisible(false)}
        navigation={navigation}
      />

      <View style={styles.header}>
        <Text style={styles.subtitle}>Your account and personal details</Text>
      </View>

      {profile?.mustChangePassword && (
        <View style={styles.pwBanner}>
          <Icon name="alert" size={16} color={colors.warning} />
          <Text style={styles.pwBannerText}>
            Please change your temporary password to keep your account secure.
          </Text>
        </View>
      )}

      {/* Read-only info card */}
      <View style={styles.infoCard}>
        {profile?.facePhotoThumbPath || profile?.facePhotoPath ? (
          <Image source={{uri: fileUrl(profile.facePhotoThumbPath || profile.facePhotoPath)}} style={styles.avatar} resizeMode="cover" />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(profile?.fullName || '?').trim().charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>{profile?.fullName || 'Intern'}</Text>
          <TouchableOpacity id="edit-info-card" onPress={() => setShowProfileModal(true)} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <Icon name="pencil" size={16} color={colors.textAccent} />
          </TouchableOpacity>
        </View>
        <View style={styles.infoRows}>
          {infoRows.map(row => (
            <View key={row.label} style={styles.infoRow}>
              <Icon name={row.icon} size={14} color={colors.textMuted} />
              <Text style={styles.infoLabel}>{row.label}</Text>
              <Text style={[styles.infoValue, {color: row.label === 'Face Status' ? (faceStatus === 'Approved' ? colors.success : faceStatus === 'Rejected' ? colors.error : colors.warning) : colors.text}]}>
                {row.value || '—'}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* My Devices (#15 — inline MAC editor) */}
      {devices && (
        <View style={styles.infoCard}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>My Devices</Text>
            {!editingMacs ? (
              <TouchableOpacity id="edit-macs" onPress={startEditMacs} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                <Icon name="pencil" size={16} color={colors.textAccent} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity id="cancel-macs" onPress={() => setEditingMacs(false)} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                <Text style={styles.cancelMacsText}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>
          {editingMacs ? (
            <View style={styles.macEditor}>
              <Text style={styles.fieldLabel}>Laptop MAC</Text>
              <TextInput id="mac-laptop" style={styles.fieldInput} value={macLaptop} onChangeText={setMacLaptop} placeholder="AA:BB:CC:DD:EE:FF" placeholderTextColor={colors.textMuted} autoCapitalize="characters" autoCorrect={false} />
              <Text style={[styles.fieldLabel, styles.macFieldGap]}>Phone MAC</Text>
              <TextInput id="mac-phone" style={styles.fieldInput} value={macPhone} onChangeText={setMacPhone} placeholder="AA:BB:CC:DD:EE:FF" placeholderTextColor={colors.textMuted} autoCapitalize="characters" autoCorrect={false} />
              <GradientButton id="save-macs" style={styles.macSaveBtn} loading={macSaving} onPress={saveMacs} icon={<Icon name="check" size={16} color="#fff" />}>
                <Text style={styles.saveBtnText}>Save Devices</Text>
              </GradientButton>
            </View>
          ) : (
            <View style={styles.infoRows}>
              <View style={styles.infoRow}>
                <Icon name="key" size={14} color={colors.textMuted} />
                <Text style={styles.infoLabel}>Laptop MAC</Text>
                <Text style={styles.infoValue}>{devices.laptop || 'Not submitted'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Icon name="key" size={14} color={colors.textMuted} />
                <Text style={styles.infoLabel}>Phone MAC</Text>
                <Text style={styles.infoValue}>{devices.phone || 'Not submitted'}</Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Quick Actions */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Quick Actions</Text>
        <Text style={styles.cardSubtitle}>Tap to open attendance, documents, face or tasks</Text>
        <View style={styles.quickGrid}>
          {quickActions.map(action => (
            <TouchableOpacity
              key={action.key}
              id={`quick-action-${action.key}`}
              style={styles.quickTile}
              onPress={() => navigation.navigate(action.route)}>
              <View style={styles.quickIconBox}>
                <Icon name={action.icon} size={18} color={colors.textAccent} />
              </View>
              <Text style={styles.quickCount}>{action.count}</Text>
              <Text style={styles.quickLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Quick Links */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Quick Links</Text>
        <Text style={styles.cardSubtitle}>Common actions from one place</Text>
        {quickLinks.map(link => (
          <TouchableOpacity
            key={link.key}
            id={`quicklink-${link.key}`}
            style={styles.linkRow}
            onPress={() => link.key === 'ChangePassword' ? setShowPwModal(true) : navigation.navigate(link.key)}>
            <View style={styles.linkIconBox}>
              <Icon name={link.icon} size={18} color={colors.textAccent} />
            </View>
            <View style={styles.linkInfo}>
              <Text style={styles.linkLabel}>{link.label}</Text>
              <Text style={styles.linkDesc}>{link.desc}</Text>
            </View>
            <Icon name="chevronRight" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        ))}
      </View>

    </ScrollView>

      {/* Complete Profile Modal */}
      <Modal visible={showProfileModal} transparent animationType="fade" onRequestClose={() => setShowProfileModal(false)}>
        <View style={styles.modalOverlay}>
          <CenteredModalCard style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Complete Profile</Text>
              <TouchableOpacity id="close-profile-modal" onPress={() => setShowProfileModal(false)}>
                <Icon name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Gender</Text>
            <View style={styles.segRow}>
              <TouchableOpacity style={[styles.seg, gender === 0 && styles.segActive]} onPress={() => setGender(0)}>
                <Text style={[styles.segText, gender === 0 && styles.segTextActive]}>Male</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.seg, gender === 1 && styles.segActive]} onPress={() => setGender(1)}>
                <Text style={[styles.segText, gender === 1 && styles.segTextActive]}>Female</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.formField}>
              <Text style={styles.fieldLabel}>University</Text>
              <TextInput id="profile-university" style={styles.fieldInput} placeholder="e.g. NED University" placeholderTextColor={colors.textMuted} value={university} onChangeText={setUniversity} />
            </View>
            <View style={styles.formField}>
              <Text style={styles.fieldLabel}>Degree</Text>
              <TextInput id="profile-degree" style={styles.fieldInput} placeholder="e.g. BS Computer Science" placeholderTextColor={colors.textMuted} value={degree} onChangeText={setDegree} />
            </View>

            <GradientButton
              id="save-profile-btn"
              style={styles.saveBtn}
              onPress={async () => { await saveProfile(); setShowProfileModal(false); }}
              loading={saving}
              icon={<Icon name="check" size={18} color="#fff" />}>
              <Text style={styles.saveBtnText}>Save Profile</Text>
            </GradientButton>
          </CenteredModalCard>
        </View>
      </Modal>

      {/* Change Password Modal */}
      <Modal visible={showPwModal} transparent animationType="fade" onRequestClose={() => setShowPwModal(false)}>
        <View style={styles.modalOverlay}>
          <CenteredModalCard style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Password</Text>
              <TouchableOpacity id="close-password-modal" onPress={() => setShowPwModal(false)}>
                <Icon name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.formField}>
              <Text style={styles.fieldLabel}>Current Password</Text>
              <PasswordInput id="current-password" style={styles.fieldInput} placeholder="Enter your current password" placeholderTextColor={colors.textMuted} value={currentPw} onChangeText={setCurrentPw} />
            </View>
            <View style={styles.formField}>
              <Text style={styles.fieldLabel}>New Password</Text>
              <PasswordInput id="new-password" style={styles.fieldInput} placeholder="At least 6 characters" placeholderTextColor={colors.textMuted} value={newPw} onChangeText={setNewPw} />
            </View>
            <View style={styles.formField}>
              <Text style={styles.fieldLabel}>Confirm New Password</Text>
              <PasswordInput id="confirm-password" style={styles.fieldInput} placeholder="Re-enter your new password" placeholderTextColor={colors.textMuted} value={confirmPw} onChangeText={setConfirmPw} />
            </View>

            <GradientButton
              id="change-password-btn"
              style={styles.saveBtn}
              onPress={async () => { const ok = await changePassword(); if (ok !== false) setShowPwModal(false); }}
              loading={changingPw}
              icon={<Icon name="key" size={18} color="#fff" />}>
              <Text style={styles.saveBtnText}>Change Password</Text>
            </GradientButton>
          </CenteredModalCard>
        </View>
      </Modal>
    </ScreenBackground>
  );
}

const makeStyles = colors => StyleSheet.create({
  container: {flex: 1},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background},
  header: {padding: 20, paddingTop: 12},
  subtitle: {color: colors.textMuted, fontSize: 14, marginTop: 4},
  pwBanner: {flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 12, backgroundColor: colors.warning + '1a', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.warning},
  pwBannerText: {flex: 1, color: colors.text, fontSize: 12, fontWeight: '600'},
  menuBtn: {width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', justifyContent: 'center', alignItems: 'center'},
  infoCard: {marginHorizontal: 16, marginBottom: 12, backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border},
  card: {marginHorizontal: 16, marginBottom: 12, backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border},
cardTitle: {color: colors.text, fontSize: 16, fontWeight: '700'},
  cardHeaderRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  avatar: {width: 72, height: 72, borderRadius: 36, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', marginBottom: 12},
  avatarText: {color: colors.textAccent, fontSize: 28, fontWeight: '700'},
  quickGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12},
  quickTile: {flexBasis: '47%', flexGrow: 1, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, alignItems: 'center'},
  quickIconBox: {width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 6},
  quickCount: {color: colors.text, fontSize: 16, fontWeight: '700'},
  quickLabel: {color: colors.textMuted, fontSize: 11, marginTop: 2},
  cancelMacsText: {color: colors.textAccent, fontSize: 13, fontWeight: '600'},
  macEditor: {marginTop: 4},
  macFieldGap: {marginTop: 10},
  macSaveBtn: {borderRadius: 12, marginTop: 14},
  modalOverlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24},
  modalCard: {backgroundColor: colors.surface, borderRadius: 18, padding: 20, borderWidth: 1, borderColor: colors.border},
  modalHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16},
  modalTitle: {color: colors.text, fontSize: 18, fontWeight: '700'},
  infoRows: {marginTop: 12, gap: 8},
  infoRow: {flexDirection: 'row', alignItems: 'center'},
  infoLabel: {color: colors.textMuted, fontSize: 13, marginLeft: 8, flex: 1},
  infoValue: {color: colors.text, fontSize: 13, fontWeight: '600'},
  formField: {marginBottom: 12},
  fieldLabel: {color: colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 6},
  fieldInput: {backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14},
  inputWrapper: {flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14},
  eyeBtn: {padding: 4},
  segRow: {flexDirection: 'row', gap: 10, marginBottom: 14},
  seg: {flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border},
  segActive: {backgroundColor: colors.primary + '33', borderColor: colors.primary},
  segText: {color: colors.textSecondary, fontWeight: '600'},
  segTextActive: {color: colors.textAccent, fontWeight: '700'},
  saveBtn: {borderRadius: 12, marginTop: 6},
  saveBtnText: {color: '#fff', fontWeight: '700', fontSize: 15},
  linkRow: {flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border},
  linkIconBox: {width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center', marginRight: 12},
  linkInfo: {flex: 1},
  linkLabel: {color: colors.text, fontSize: 14, fontWeight: '700'},
  linkDesc: {color: colors.textMuted, fontSize: 11, marginTop: 2},
});
import React, {useMemo} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Image
} from 'react-native';
// SafeAreaView must come from safe-area-context, not react-native. The
// react-native export is deprecated and logs a warning on every mount;
// that warning raised the LogBox toast, which renders at the bottom of
// the screen and physically covered this component's Logout button.
import {SafeAreaView} from 'react-native-safe-area-context';
import {useSelector, useDispatch} from 'react-redux';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client, {clearTokens} from '../api/client';
import * as tokenStore from '../api/tokenStore';
import {useAppTheme, setMode} from '../theme';
import {logout} from '../store/slices/authSlice';
import {fileUrl} from '../api/fileClient';
import Icon from './Icon';

export default function RightSidebar({visible, onClose, navigation}) {
  const dispatch = useDispatch();
  const {user, role, profile} = useSelector(s => s.auth);
  const {colors, isDark} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const handleLogout = async () => {
    onClose();
    const refreshToken = await tokenStore.getRefreshToken();
    try { await client.post('/auth/logout', {refreshToken}); } catch {}
    await AsyncStorage.removeItem('user');
    clearTokens();
    dispatch(logout());
  };

  const navigateTo = (screenName) => {
    onClose();
    if (navigation && screenName) {
      navigation.navigate(screenName);
    }
  };

  const getMenuItems = () => {
    if (role === 'Admin') {
      return [
        {key: 'AdminDash', label: 'Dashboard', icon: 'home'},
        {key: 'MentorManagement', label: 'Mentors', icon: 'users'},
        {key: 'AdminInterns', label: 'Interns', icon: 'gradCap'},
        {key: 'AdminAttendance', label: 'Attendance', icon: 'mapPin'},
        {key: 'ActivityLogs', label: 'Activity Logs', icon: 'list'},
        {key: 'AdminDocuments', label: 'Approve Documents', icon: 'folder'},
        {key: 'AdminLeaveApprovals', label: 'Leave Approvals', icon: 'calendar'},
        {key: 'IssueDocuments', label: 'Issue Documents', icon: 'idCard'},
        {key: 'Departments', label: 'Departments', icon: 'building'},
        {key: 'AdminTransfers', label: 'Intern Transfers', icon: 'transfer'},
        {key: 'AdminReports', label: 'Reports', icon: 'file'},
        {key: 'Settings', label: 'Settings', icon: 'settings'},
      ];
    } else if (role === 'Mentor') {
      return [
        {key: 'MentorDash', label: 'Dashboard', icon: 'home'},
        {key: 'MentorInterns', label: 'Interns', icon: 'gradCap'},
        {key: 'AttendanceView', label: 'Attendance Logs', icon: 'mapPin'},
        {key: 'Tasks', label: 'Assign Tasks', icon: 'clipboard'},
        {key: 'MentorLeaveApprovals', label: 'Leave Approvals', icon: 'calendar'},
        {key: 'MentorDocuments', label: 'Approve Documents', icon: 'folder'},
        {key: 'IssueDocuments', label: 'Issue Documents', icon: 'idCard'},
        {key: 'MentorInternTransfers', label: 'Intern Transfers', icon: 'transfer'},
        {key: 'MentorReports', label: 'Reports', icon: 'file'},
        {key: 'MentorShifts', label: 'Shifts', icon: 'clock'},
      ];
    } else {
      return [
        {key: 'InternDash', label: 'Home Dashboard', icon: 'home'},
        {key: 'Profile', label: 'Profile', icon: 'user'},
        {key: 'Attendance', label: 'Attendance & Leaves', icon: 'mapPin'},
        {key: 'MyTasks', label: 'My Tasks', icon: 'clipboard'},
        {key: 'DocumentRequests', label: 'Document Requests', icon: 'ticket'},
        {key: 'Documents', label: 'Upload Documents', icon: 'upload'},
        {key: 'Guides', label: 'Guides', icon: 'info'},
        {key: 'InternReports', label: 'Reports', icon: 'file'},
      ];
    }
  };

  const menuItems = getMenuItems();
  const menuIconTint = isDark ? colors.primaryLight : colors.primary;
  const menuIconBoxBg = (isDark ? colors.primaryLight : colors.primary) + '1F';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

        <SafeAreaView style={styles.drawerContainer}>
          <View style={styles.drawerContent}>
            
            {/* Header / Profile info */}
            <View style={styles.profileHeader}>
              <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                <Icon name="close" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
              
              <View style={styles.avatarCircle}>
                {profile?.facePhotoThumbPath || profile?.facePhotoPath ? (
                  <Image source={{uri: fileUrl(profile.facePhotoThumbPath || profile.facePhotoPath)}} style={styles.avatarImage} resizeMode="cover" />
                ) : (
                  <Text style={styles.avatarText}>
                    {profile?.fullName ? profile.fullName[0].toUpperCase() : user?.username ? user.username[0].toUpperCase() : 'U'}
                  </Text>
                )}
              </View>
              
              <Text style={styles.userName}>{profile?.fullName || user?.username || 'User'}</Text>
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>{role || 'User'}</Text>
              </View>
              {profile?.department && (
                <View style={styles.deptRow}>
                  <Icon name="building" size={13} color={colors.textMuted} />
                  <Text style={styles.deptText}>{profile.department}</Text>
                </View>
              )}
            </View>

            <View style={styles.divider} />

            {/* Menu Links */}
            <Text style={styles.menuSectionTitle}>NAVIGATION</Text>
            <ScrollView style={styles.menuList} showsVerticalScrollIndicator={false}>
              {menuItems.map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={styles.menuItem}
                  onPress={() => navigateTo(item.key)}>
                  <View style={[styles.menuIconBox, {backgroundColor: menuIconBoxBg}]}>
                    <Icon name={item.icon} size={16} color={menuIconTint} />
                  </View>
                  <Text style={styles.menuLabel}>{item.label}</Text>
                  <Icon name="chevronRight" size={15} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.divider} />

            {/* Dark Mode Toggle + Logout */}
            <View style={styles.bottomRow}>
              <TouchableOpacity
                id="dark-mode-toggle"
                style={styles.darkBtn}
                onPress={() => setMode(isDark ? 'light' : 'dark')}>
                <Icon name={isDark ? 'sun' : 'moon'} size={17} color={isDark ? colors.statGold : colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                <Icon name="logout" size={16} color={colors.error} />
                <Text style={styles.logoutText}>Logout</Text>
              </TouchableOpacity>
            </View>

          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const makeStyles = colors => StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  backdrop: {
    flex: 1,
  },
  drawerContainer: {
    width: '78%',
    maxWidth: 320,
    backgroundColor: colors.surface,
    height: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 24,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  drawerContent: {
    flex: 1,
    padding: 20,
    justifyContent: 'space-between',
  },
  profileHeader: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 10,
    position: 'relative',
  },
  closeBtn: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginTop: 8,
    marginBottom: 6,
    shadowColor: colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  avatarImage: {width: '100%', height: '100%'},
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  userName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  roleBadge: {
    backgroundColor: colors.primary + '22',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    marginTop: 4,
    borderWidth: 1,
    borderColor: colors.primary + '44',
  },
  roleBadgeText: {
    color: colors.textAccent,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  deptText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  deptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 8,
  },
  menuSectionTitle: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 6,
    marginLeft: 4,
  },
  menuList: {
    flex: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 5,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuIconBox: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  menuLabel: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  darkBtn: {
    width: 46,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logoutBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.error + '18',
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.error + '44',
  },
  logoutText: {
    color: colors.error,
    fontSize: 14,
    fontWeight: '700',
  },
});

import React, {useEffect, useMemo, Suspense} from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {useSelector, useDispatch} from 'react-redux';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Text, View, ActivityIndicator, StyleSheet} from 'react-native';
import {setCredentials, setLoading, logout} from '../store/slices/authSlice';
import {pollUnreadCount} from '../store/slices/notificationsSlice';
import {clearTokens} from '../api/client';
import {useAppTheme} from '../theme';
import ScreenBackground from '../components/ScreenBackground';
import Icon from '../components/Icon';
import OfflineBanner from '../components/OfflineBanner';
import {effectiveFaceStatus} from '../utils/debug';

// Auth
import LoginScreen from '../screens/auth/LoginScreen';

// Admin — light screens loaded eagerly
import AdminDashboard from '../screens/admin/DashboardScreen';
import MentorManagementScreen from '../screens/admin/MentorManagementScreen';
import AdminInternsScreen from '../screens/admin/AdminInternsScreen';
import DepartmentsScreen from '../screens/admin/DepartmentsScreen';
import SettingsScreen from '../screens/admin/SettingsScreen';
import ShiftsScreen from '../screens/admin/ShiftsScreen';

// Admin — heavier screens loaded lazily
const ActivityLogsScreen = React.lazy(() => import('../screens/admin/ActivityLogsScreen'));
const AdminDocumentsScreen = React.lazy(() => import('../screens/admin/DocumentsScreen'));
const IssueDocumentsScreen = React.lazy(() => import('../screens/admin/IssueDocumentsScreen'));
const AdminAttendanceScreen = React.lazy(() => import('../screens/admin/AttendanceScreen'));
const AdminTransfersScreen = React.lazy(() => import('../screens/admin/AdminTransfersScreen'));
const AdminLeaveApprovalsScreen = React.lazy(() => import('../screens/admin/LeaveApprovalsScreen'));
const FaceApprovalsScreen = React.lazy(() => import('../screens/admin/FaceApprovalsScreen'));
const ReportsScreen = React.lazy(() => import('../screens/ReportsScreen'));

// Mentor — light screens loaded eagerly
import MentorDashboard from '../screens/mentor/DashboardScreen';
import MentorInternsScreen from '../screens/mentor/MentorInternsScreen';

// Mentor — heavier screens loaded lazily
const AttendanceViewScreen = React.lazy(() => import('../screens/mentor/AttendanceViewScreen'));
const AssignTaskScreen = React.lazy(() => import('../screens/mentor/AssignTaskScreen'));
const DocumentsApprovalScreen = React.lazy(() => import('../screens/mentor/DocumentsApprovalScreen'));
const TransferRequestsScreen = React.lazy(() => import('../screens/mentor/TransferRequestsScreen'));
const MentorInternTransfersScreen = React.lazy(() => import('../screens/mentor/MentorInternTransfersScreen'));
const InternTransfersScreen = React.lazy(() => import('../screens/intern/TransfersScreen'));
const MentorShiftsScreen = React.lazy(() => import('../screens/mentor/MentorShiftsScreen'));
const MentorEditInternScreen = React.lazy(() => import('../screens/mentor/MentorEditInternScreen'));
const MentorLeaveApprovalsScreen = React.lazy(() => import('../screens/mentor/LeaveApprovalsScreen'));

// Intern — light screens loaded eagerly
import InternDashboard from '../screens/intern/DashboardScreen';
import GuidesScreen from '../screens/intern/GuidesScreen';
import GuideDetailScreen from '../screens/intern/GuideDetailScreen';

// Intern — heavier screens loaded lazily (camera, PDF, face ONNX are expensive)
const AttendanceScreen = React.lazy(() => import('../screens/intern/AttendanceScreen'));
const TasksScreen = React.lazy(() => import('../screens/intern/TasksScreen'));
const FaceEnrollScreen = React.lazy(() => import('../screens/intern/FaceEnrollScreen'));
const DocumentsScreen = React.lazy(() => import('../screens/intern/DocumentsScreen'));
const DocumentRequestsScreen = React.lazy(() => import('../screens/intern/DocumentRequestsScreen'));
const ProfileScreen = React.lazy(() => import('../screens/intern/ProfileScreen'));

// Shared
const NotificationsScreen = React.lazy(() => import('../screens/NotificationsScreen'));
const SyncScreen = React.lazy(() => import('../screens/SyncScreen'));

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const tabBarStyle = {
  display: 'none',
};

// ─── Admin Tab Navigator ────────────────────────────────────────────────────
function AdminTabs() {
  const {colors} = useAppTheme();
  return (
<Tab.Navigator screenOptions={{
      headerShown: false,
      tabBarStyle,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.textMuted,
      tabBarLabelStyle: {fontSize: 11, fontWeight: '600', marginBottom: 2},
      lazy: true,
    }}>
      <Tab.Screen name="AdminDash" component={AdminDashboard} options={{
        title: 'Dashboard',
        tabBarIcon: ({color}) => <Icon name="home" size={20} color={color} />
      }}/>
      <Tab.Screen name="MentorManagement" component={MentorManagementScreen} options={{
        title: 'Mentors',
        tabBarIcon: ({color}) => <Icon name="users" size={20} color={color} />
      }}/>
      <Tab.Screen name="AdminInterns" component={AdminInternsScreen} options={{
        title: 'Interns',
        tabBarIcon: ({color}) => <Icon name="gradCap" size={20} color={color} />
      }}/>
      <Tab.Screen name="AdminAttendance" component={AdminAttendanceScreen} options={{
        title: 'Attendance',
        tabBarIcon: ({color}) => <Icon name="mapPin" size={20} color={color} />
      }}/>
      <Tab.Screen name="ActivityLogs" component={ActivityLogsScreen} options={{
        title: 'Logs',
        tabBarIcon: ({color}) => <Icon name="list" size={20} color={color} />
      }}/>
      <Tab.Screen name="AdminDocuments" component={AdminDocumentsScreen} options={{
        title: 'Approve Documents',
        tabBarIcon: ({color}) => <Icon name="folder" size={20} color={color} />
      }}/>
      <Tab.Screen name="AdminLeaveApprovals" component={AdminLeaveApprovalsScreen} options={{
        title: 'Leave',
        tabBarIcon: ({color}) => <Icon name="calendar" size={20} color={color} />
      }}/>
      <Tab.Screen name="FaceApprovals" component={FaceApprovalsScreen} initialParams={{role: 'admin'}} options={{
        title: 'Face',
        tabBarIcon: ({color}) => <Icon name="camera" size={20} color={color} />
      }}/>
      <Tab.Screen name="Departments" component={DepartmentsScreen} options={{
        title: 'Departments',
        tabBarIcon: ({color}) => <Icon name="building" size={20} color={color} />
      }}/>
      <Tab.Screen name="IssueDocuments" component={IssueDocumentsScreen} initialParams={{role: 'admin'}} options={{
        title: 'Issue Documents',
        tabBarIcon: ({color}) => <Icon name="idCard" size={20} color={color} />
      }}/>
      <Tab.Screen name="AdminTransfers" component={AdminTransfersScreen} options={{
        title: 'Transfers',
        tabBarIcon: ({color}) => <Icon name="transfer" size={20} color={color} />
      }}/>
      <Tab.Screen name="Settings" component={SettingsScreen} options={{
        title: 'Settings',
        tabBarIcon: ({color}) => <Icon name="settings" size={20} color={color} />
      }}/>
    </Tab.Navigator>
  );
}

// ─── Mentor Tab Navigator ────────────────────────────────────────────────────
function MentorTabs() {
  const {colors} = useAppTheme();
  return (
    <Tab.Navigator screenOptions={{
      headerShown: false,
      tabBarStyle,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.textMuted,
      lazy: true,
    }}>
      <Tab.Screen name="MentorDash" component={MentorDashboard} options={{
        title: 'Dashboard',
        tabBarIcon: ({color}) => <Icon name="home" size={20} color={color} />
      }}/>
      <Tab.Screen name="MentorInterns" component={MentorInternsScreen} options={{
        title: 'Interns',
        tabBarIcon: ({color}) => <Icon name="gradCap" size={20} color={color} />
      }}/>
      <Tab.Screen name="AttendanceView" component={AttendanceViewScreen} options={{
        title: 'Attendance',
        tabBarIcon: ({color}) => <Icon name="mapPin" size={20} color={color} />
      }}/>
      <Tab.Screen name="Tasks" component={AssignTaskScreen} options={{
        title: 'Tasks',
        tabBarIcon: ({color}) => <Icon name="clipboard" size={20} color={color} />
      }}/>
      <Tab.Screen name="IssueDocuments" component={IssueDocumentsScreen} initialParams={{role: 'mentor'}} options={{
        title: 'Issue Documents',
        tabBarIcon: ({color}) => <Icon name="idCard" size={20} color={color} />
      }}/>
      <Tab.Screen name="MentorDocuments" component={DocumentsApprovalScreen} options={{
        title: 'Documents',
        tabBarIcon: ({color}) => <Icon name="folder" size={20} color={color} />
      }}/>
      <Tab.Screen name="MentorLeaveApprovals" component={MentorLeaveApprovalsScreen} options={{
        title: 'Leave',
        tabBarIcon: ({color}) => <Icon name="calendar" size={20} color={color} />
      }}/>
      <Tab.Screen name="FaceApprovals" component={FaceApprovalsScreen} initialParams={{role: 'mentor'}} options={{
        title: 'Face',
        tabBarIcon: ({color}) => <Icon name="camera" size={20} color={color} />
      }}/>
      <Tab.Screen name="Transfers" component={TransferRequestsScreen} options={{
        title: 'Dept Transfers',
        tabBarIcon: ({color}) => <Icon name="transfer" size={20} color={color} />
      }}/>
      <Tab.Screen name="MentorInternTransfers" component={MentorInternTransfersScreen} options={{
        title: 'Intern Transfers',
        tabBarIcon: ({color}) => <Icon name="users" size={20} color={color} />
      }}/>
      <Tab.Screen name="MentorShifts" component={MentorShiftsScreen} options={{
        title: 'Shifts',
        tabBarIcon: ({color}) => <Icon name="clock" size={20} color={color} />
      }}/>
    </Tab.Navigator>
  );
}

// ─── Intern Tab Navigator ─────────────────────────────────────────────────────
function InternTabs() {
  const {colors} = useAppTheme();
  return (
    <Tab.Navigator screenOptions={{
      headerShown: false,
      tabBarStyle,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.textMuted,
      lazy: true,
    }}>
      <Tab.Screen name="InternDash" component={InternDashboard} options={{
        title: 'Home',
        tabBarIcon: ({color}) => <Icon name="home" size={20} color={color} />
      }}/>
      <Tab.Screen name="Profile" component={ProfileScreen} options={{
        title: 'Profile',
        tabBarIcon: ({color}) => <Icon name="user" size={20} color={color} />
      }}/>
      <Tab.Screen name="Attendance" component={AttendanceScreen} options={{
        title: 'Attendance & Leaves',
        tabBarIcon: ({color}) => <Icon name="mapPin" size={20} color={color} />
      }}/>
      <Tab.Screen name="MyTasks" component={TasksScreen} options={{
        title: 'Tasks',
        tabBarIcon: ({color}) => <Icon name="clipboard" size={20} color={color} />
      }}/>
      <Tab.Screen name="DocumentRequests" component={DocumentRequestsScreen} options={{
        title: 'Document Requests',
        tabBarIcon: ({color}) => <Icon name="ticket" size={20} color={color} />
      }}/>
      <Tab.Screen name="Documents" component={DocumentsScreen} options={{
        title: 'Upload Documents',
        tabBarIcon: ({color}) => <Icon name="upload" size={20} color={color} />
      }}/>
      <Tab.Screen name="Guides" component={GuidesScreen} options={{
        title: 'Guides',
        tabBarIcon: ({color}) => <Icon name="info" size={20} color={color} />
      }}/>
    </Tab.Navigator>
  );
}

// ─── Root Navigator ───────────────────────────────────────────────────────────
function RootNavigator() {
  const {isAuthenticated, isLoading, role, profile} = useSelector(s => s.auth);
  const debug = useSelector(s => s.debug);
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (isLoading) {
    return (
      <ScreenBackground>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingLogo}><Icon name="plane" size={44} color={colors.textAccent} /></Text>
          <Text style={styles.loadingText}>PIA Intern System</Text>
          <ActivityIndicator color={colors.textAccent} size="large" style={{marginTop: 24}} />
        </View>
      </ScreenBackground>
    );
  }

  return (
    <Suspense fallback={
      <ScreenBackground>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.textAccent} size="large" />
        </View>
      </ScreenBackground>
    }>
      <Stack.Navigator screenOptions={{headerShown: false}}>
        {!isAuthenticated ? (
          <Stack.Screen name="Login" component={LoginScreen} />
          ) : role === 'Admin' ? (
          <>
            <Stack.Screen name="AdminTabs" component={AdminTabs} />
            <Stack.Screen name="AdminShifts" component={ShiftsScreen} />
            <Stack.Screen name="AdminReports" component={ReportsScreen} initialParams={{role: 'admin'}} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="Sync" component={SyncScreen} />
          </>
        ) : role === 'Mentor' ? (
          <>
            <Stack.Screen name="MentorTabs" component={MentorTabs} />
            <Stack.Screen name="MentorEditIntern" component={MentorEditInternScreen} />
            <Stack.Screen name="MentorReports" component={ReportsScreen} initialParams={{role: 'mentor'}} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="Sync" component={SyncScreen} />
          </>
        ) : role === 'Intern' ? (
          <>
            {(() => {
              const faceStatus = effectiveFaceStatus(profile, debug);
              return faceStatus !== 'Approved' ? (
                <>
                  <Stack.Screen name="FaceEnroll" component={FaceEnrollScreen} />
                  <Stack.Screen name="InternTabs" component={InternTabs} />
                  <Stack.Screen name="InternReports" component={ReportsScreen} initialParams={{role: 'intern'}} />
                  <Stack.Screen name="Transfers" component={InternTransfersScreen} />
                  <Stack.Screen name="Notifications" component={NotificationsScreen} />
                  <Stack.Screen name="Sync" component={SyncScreen} />
                  <Stack.Screen name="GuideDetail" component={GuideDetailScreen} />
                </>
              ) : (
                <>
                  <Stack.Screen name="InternTabs" component={InternTabs} />
                  <Stack.Screen name="InternReports" component={ReportsScreen} initialParams={{role: 'intern'}} />
                  <Stack.Screen name="Transfers" component={InternTransfersScreen} />
                  <Stack.Screen name="FaceEnroll" component={FaceEnrollScreen} />
                  <Stack.Screen name="Notifications" component={NotificationsScreen} />
                  <Stack.Screen name="Sync" component={SyncScreen} />
                  <Stack.Screen name="GuideDetail" component={GuideDetailScreen} />
                </>
              );
            })()}
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </Suspense>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function AppNavigator() {
  const dispatch = useDispatch();
  const isAuthenticated = useSelector(s => s.auth.isAuthenticated);

  useEffect(() => {
    // Single global notification polling (not per AppHeader instance)
    if (isAuthenticated) dispatch(pollUnreadCount());
  }, [isAuthenticated, dispatch]);

  useEffect(() => {
    // Restore session on app start. Tokens live in the OS keychain; the user
    // bag and profile may be restored from persistence when we're offline.
    const restoreSession = async () => {
      try {
        const tokenStore = require('../api/tokenStore');
        const {setAppUser} = require('../api/client');
        const token = await tokenStore.getAccessToken();
        const persisted = require('../store').store.getState().auth;

        if (!token) {
          if (persisted.isAuthenticated) dispatch(logout());
          dispatch(setLoading(false));
          return;
        }

        let user = persisted.user;
        try {
          const userData = await AsyncStorage.getItem('user');
          if (userData) {
            const bag = JSON.parse(userData);
            user = {userId: bag.userId, username: bag.username, role: bag.role, ...user};
          }
        } catch {
          /* fall back to persisted */
        }
        if (!user?.userId) {
          dispatch(setLoading(false));
          return;
        }
        setAppUser(user);

        let profile = persisted.profile ?? null;
        if (user.role === 'Intern' || user.role === 'Mentor') {
          try {
            const client = require('../api/client').default;
            const endpoint = user.role === 'Intern' ? '/intern/dashboard' : '/mentor/dashboard';
            const profileRes = await client.get(endpoint);
            profile = profileRes.data;
          } catch (err) {
            const {isNetworkError} = require('../api/write');
            if (!isNetworkError(err)) {
              // The server rejected the session — force a fresh login.
              await AsyncStorage.removeItem('user');
              clearTokens();
              dispatch(setLoading(false));
              return;
            }
            // Offline: keep the persisted profile so the app can boot offline.
          }
        }

        dispatch(setCredentials({user, role: user.role, profile}));
      } catch {
        dispatch(setLoading(false));
      }
    };
    restoreSession();
  }, [dispatch]);

  return (
    <NavigationContainer>
      <OfflineBanner />
      <RootNavigator />
    </NavigationContainer>
  );
}

const makeStyles = colors => StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center', alignItems: 'center',
  },
  loadingLogo: {fontSize: 56, marginBottom: 8},
  loadingText: {color: colors.text, fontSize: 18, fontWeight: '700'},
});
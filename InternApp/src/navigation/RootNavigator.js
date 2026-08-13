import React, {useEffect, useState} from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {useSelector, useDispatch} from 'react-redux';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Text, View, ActivityIndicator, StyleSheet} from 'react-native';
import {setCredentials, setLoading} from '../store/slices/authSlice';
import theme from '../theme';

// Auth
import LoginScreen from '../screens/auth/LoginScreen';

// Admin
import AdminDashboard from '../screens/admin/DashboardScreen';
import MentorManagementScreen from '../screens/admin/MentorManagementScreen';
import AdminInternsScreen from '../screens/admin/AdminInternsScreen';
import ActivityLogsScreen from '../screens/admin/ActivityLogsScreen';
import AdminDocumentsScreen from '../screens/admin/DocumentsScreen';

// Mentor
import MentorDashboard from '../screens/mentor/DashboardScreen';
import CreateInternScreen from '../screens/mentor/CreateInternScreen';
import AttendanceViewScreen from '../screens/mentor/AttendanceViewScreen';
import AssignTaskScreen from '../screens/mentor/AssignTaskScreen';
import GatePassApprovalScreen from '../screens/mentor/GatePassApprovalScreen';
import MentorCertificatesScreen from '../screens/mentor/CertificatesScreen';
import DocumentsApprovalScreen from '../screens/mentor/DocumentsApprovalScreen';

// Intern
import InternDashboard from '../screens/intern/DashboardScreen';
import AttendanceScreen from '../screens/intern/AttendanceScreen';
import TasksScreen from '../screens/intern/TasksScreen';
import GatePassScreen from '../screens/intern/GatePassScreen';
import CertificateScreen from '../screens/intern/CertificateScreen';
import FaceEnrollScreen from '../screens/intern/FaceEnrollScreen';
import DocumentsScreen from '../screens/intern/DocumentsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const tabBarStyle = {
  display: 'none',
};

// ─── Admin Tab Navigator ────────────────────────────────────────────────────
function AdminTabs() {
  return (
    <Tab.Navigator screenOptions={{
      headerShown: false,
      tabBarStyle,
      tabBarActiveTintColor: theme.colors.primary,
      tabBarInactiveTintColor: theme.colors.textMuted,
      tabBarLabelStyle: {fontSize: 11, fontWeight: '600', marginBottom: 2},
    }}>
      <Tab.Screen name="AdminDash" component={AdminDashboard} options={{
        title: 'Dashboard',
        tabBarIcon: ({color}) => <Text style={{fontSize:20, color}}>🏠</Text>
      }}/>
      <Tab.Screen name="MentorManagement" component={MentorManagementScreen} options={{
        title: 'Mentors',
        tabBarIcon: ({color}) => <Text style={{fontSize:20, color}}>👨‍💼</Text>
      }}/>
      <Tab.Screen name="AdminInterns" component={AdminInternsScreen} options={{
        title: 'Interns',
        tabBarIcon: ({color}) => <Text style={{fontSize:20, color}}>🎓</Text>
      }}/>
      <Tab.Screen name="ActivityLogs" component={ActivityLogsScreen} options={{
        title: 'Logs',
        tabBarIcon: ({color}) => <Text style={{fontSize:20, color}}>📋</Text>
      }}/>
      <Tab.Screen name="AdminDocuments" component={AdminDocumentsScreen} options={{
        title: 'Documents',
        tabBarIcon: ({color}) => <Text style={{fontSize:20, color}}>📁</Text>
      }}/>
    </Tab.Navigator>
  );
}

// ─── Mentor Tab Navigator ────────────────────────────────────────────────────
function MentorTabs() {
  return (
    <Tab.Navigator screenOptions={{
      headerShown: false,
      tabBarStyle,
      tabBarActiveTintColor: theme.colors.primary,
      tabBarInactiveTintColor: theme.colors.textMuted,
    }}>
      <Tab.Screen name="MentorDash" component={MentorDashboard} options={{
        title: 'Dashboard',
        tabBarIcon: ({color}) => <Text style={{fontSize:20, color}}>🏠</Text>
      }}/>
      <Tab.Screen name="AttendanceView" component={AttendanceViewScreen} options={{
        title: 'Attendance',
        tabBarIcon: ({color}) => <Text style={{fontSize:20, color}}>📍</Text>
      }}/>
      <Tab.Screen name="Tasks" component={AssignTaskScreen} options={{
        title: 'Tasks',
        tabBarIcon: ({color}) => <Text style={{fontSize:20, color}}>📝</Text>
      }}/>
      <Tab.Screen name="GatePassApproval" component={GatePassApprovalScreen} options={{
        title: 'Approvals',
        tabBarIcon: ({color}) => <Text style={{fontSize:20, color}}>🎫</Text>
      }}/>
      <Tab.Screen name="MentorCerts" component={MentorCertificatesScreen} options={{
        title: 'Certificates',
        tabBarIcon: ({color}) => <Text style={{fontSize:20, color}}>🎓</Text>
      }}/>
      <Tab.Screen name="MentorDocuments" component={DocumentsApprovalScreen} options={{
        title: 'Documents',
        tabBarIcon: ({color}) => <Text style={{fontSize:20, color}}>📁</Text>
      }}/>
    </Tab.Navigator>
  );
}

// ─── Intern Tab Navigator ─────────────────────────────────────────────────────
function InternTabs() {
  return (
    <Tab.Navigator screenOptions={{
      headerShown: false,
      tabBarStyle,
      tabBarActiveTintColor: theme.colors.primary,
      tabBarInactiveTintColor: theme.colors.textMuted,
    }}>
      <Tab.Screen name="InternDash" component={InternDashboard} options={{
        title: 'Home',
        tabBarIcon: ({color}) => <Text style={{fontSize:20, color}}>🏠</Text>
      }}/>
      <Tab.Screen name="Attendance" component={AttendanceScreen} options={{
        title: 'Attendance',
        tabBarIcon: ({color}) => <Text style={{fontSize:20, color}}>📍</Text>
      }}/>
      <Tab.Screen name="MyTasks" component={TasksScreen} options={{
        title: 'Tasks',
        tabBarIcon: ({color}) => <Text style={{fontSize:20, color}}>📝</Text>
      }}/>
      <Tab.Screen name="GatePass" component={GatePassScreen} options={{
        title: 'Gate Pass',
        tabBarIcon: ({color}) => <Text style={{fontSize:20, color}}>🎫</Text>
      }}/>
      <Tab.Screen name="Certificate" component={CertificateScreen} options={{
        title: 'Certificate',
        tabBarIcon: ({color}) => <Text style={{fontSize:20, color}}>🎓</Text>
      }}/>
      <Tab.Screen name="Documents" component={DocumentsScreen} options={{
        title: 'Documents',
        tabBarIcon: ({color}) => <Text style={{fontSize:20, color}}>📁</Text>
      }}/>
    </Tab.Navigator>
  );
}

// ─── Root Navigator ───────────────────────────────────────────────────────────
function RootNavigator() {
  const {isAuthenticated, isLoading, role, profile} = useSelector(s => s.auth);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingLogo}>✈</Text>
        <Text style={styles.loadingText}>PIA Intern System</Text>
        <ActivityIndicator color={theme.colors.primary} size="large" style={{marginTop: 24}} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>
      {!isAuthenticated ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : role === 'Admin' ? (
        <Stack.Screen name="AdminTabs" component={AdminTabs} />
      ) : role === 'Mentor' ? (
        <>
          <Stack.Screen name="MentorTabs" component={MentorTabs} />
          <Stack.Screen name="CreateIntern" component={CreateInternScreen} options={{headerShown: true, headerTitle: 'Add New Intern', headerStyle:{backgroundColor:theme.colors.surface}, headerTintColor:theme.colors.text}} />
        </>
      ) : role === 'Intern' ? (
        <>
          {profile?.faceEnrolled === false ? (
            <Stack.Screen name="FaceEnroll" component={FaceEnrollScreen} />
          ) : (
            <Stack.Screen name="InternTabs" component={InternTabs} />
          )}
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function AppNavigator() {
  const dispatch = useDispatch();

  useEffect(() => {
    // Restore session on app start
    const restoreSession = async () => {
      try {
        const [userData, token] = await Promise.all([
          AsyncStorage.getItem('user'),
          AsyncStorage.getItem('accessToken'),
        ]);
        if (userData && token) {
          const user = JSON.parse(userData);
          // Fetch fresh profile
          try {
            const client = require('../api/client').default;
            let profileRes;
            if (user.role === 'Intern') profileRes = await client.get('/intern/dashboard');
            else if (user.role === 'Mentor') profileRes = await client.get('/mentor/dashboard');

            dispatch(setCredentials({
              user,
              role: user.role,
              profile: profileRes?.data ?? null,
            }));
          } catch {
            // Token expired
            await AsyncStorage.removeItem('accessToken');
            await AsyncStorage.removeItem('refreshToken');
            await AsyncStorage.removeItem('user');
            dispatch(setLoading(false));
          }
        } else {
          dispatch(setLoading(false));
        }
      } catch {
        dispatch(setLoading(false));
      }
    };
    restoreSession();
  }, []);

  return (
    <NavigationContainer>
      <RootNavigator />
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1, backgroundColor: theme.colors.background,
    justifyContent: 'center', alignItems: 'center',
  },
  loadingLogo: {fontSize: 56, marginBottom: 8},
  loadingText: {color: theme.colors.text, fontSize: 18, fontWeight: '700'},
});

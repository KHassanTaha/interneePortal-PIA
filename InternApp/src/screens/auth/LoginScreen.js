import React, {useMemo, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {useDispatch} from 'react-redux';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LinearGradient from 'react-native-linear-gradient';
import {setCredentials} from '../../store/slices/authSlice';
import client, {setTokens, setAppUser} from '../../api/client';
import {showToast} from '../../components/AppToast';
import {isNetworkError} from '../../api/write';
import {gradients, useAppTheme} from '../../theme';
import ScreenBackground from '../../components/ScreenBackground';
import Icon from '../../components/Icon';

export default function LoginScreen() {
  const dispatch = useDispatch();
  const {colors, isDark} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const getDeviceId = async () => {
    const existing = await AsyncStorage.getItem('deviceId');
    if (existing) return existing;
    const id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
    await AsyncStorage.setItem('deviceId', id);
    return id;
  };

  const getDeviceLabel = () => {
    const manufacturer = Platform.constants?.Manufacturer;
    const model = Platform.constants?.Model;
    const label = [manufacturer, model].filter(Boolean).join(' ').trim();
    return label || 'Unknown device';
  };

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      showToast('Enter your username and password.', 'error');
      return;
    }
    setLoading(true);
    try {
      const deviceId = await getDeviceId();
      const res = await client.post('/auth/login', {username, password, deviceId, deviceLabel: getDeviceLabel()});
      const {accessToken, refreshToken, role, userId, profile, device} = res.data;
      await AsyncStorage.setItem('user', JSON.stringify({userId, username, role}));
      setTokens(accessToken, refreshToken);
      setAppUser({userId, username, role});
      dispatch(setCredentials({
        user: {userId, username},
        role,
        profile,
        device,
      }));

      if (profile?.mustChangePassword) {
        Alert.alert(
          'Temporary Password',
          'This is a temporary password. Change it now from your Profile (Profile → Change Password).',
          [{text: 'OK'}],
        );
      }
    } catch (err) {
      const serverMsg = err.response?.data?.message;
      showToast(
        serverMsg ||
          (isNetworkError(err)
            ? "You're offline. Connect to the internet and try again."
            : "Can't reach the server. Check your connection and try again."),
        'error',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenBackground>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* PIA Logo Header */}
        <View style={styles.headerContainer}>
          <LinearGradient colors={gradients.primary} style={styles.logoBox}>
            <Icon name="plane" size={36} color="#fff" />
          </LinearGradient>
          <Text style={styles.airlineName}>PAKISTAN INTERNATIONAL AIRLINES</Text>
          <Text style={styles.tagline}>Great People to Fly With</Text>
          <LinearGradient colors={gradients.accent} style={styles.divider} />
          <Text style={styles.appTitle}>Intern Management Portal</Text>
        </View>

        {/* Login Form */}
        <View style={styles.formContainer}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Username</Text>
            <View style={styles.inputWrapper}>
              <Icon name="user" size={16} color={colors.textMuted} />
              <TextInput
                id="login-username"
                style={styles.input}
                placeholder="Enter your username"
                placeholderTextColor={colors.textMuted}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Password</Text>
            <View style={styles.inputWrapper}>
              <Icon name="lock" size={16} color={colors.textMuted} />
              <TextInput
                id="login-password"
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeBtn}>
                <Icon name={showPassword ? 'eye' : 'eyeOff'} size={18} color={showPassword ? colors.primary : colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          <LinearGradient
            colors={gradients.primary}
            start={{x: 0, y: 0}}
            end={{x: 1, y: 0}}
            style={[styles.loginBtn, loading && styles.loginBtnDisabled]}>
            <TouchableOpacity
              id="login-button"
              onPress={handleLogin}
              disabled={loading}
              style={styles.loginBtnInner}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.loginBtnText}>Sign In</Text>
              )}
            </TouchableOpacity>
          </LinearGradient>

          <View style={styles.roleHint}>
            <View style={styles.roleHintRow}>
              <Icon name="key" size={13} color={colors.textMuted} />
              <Text style={styles.roleHintText}>Contact your mentor or admin for credentials</Text>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
}

const makeStyles = colors => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoBox: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: colors.primaryLight,
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  airlineName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  tagline: {
    color: colors.textAccentAlt,
    fontSize: 11,
    marginTop: 2,
    letterSpacing: 1,
  },
  divider: {
    width: 60,
    height: 2,
    marginVertical: 12,
    borderRadius: 2,
  },
  appTitle: {
    color: colors.textSecondary,
    fontSize: 15,
    letterSpacing: 0.5,
  },
  formContainer: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    paddingVertical: 14,
    marginLeft: 8,
  },
  eyeBtn: {padding: 4},
  loginBtn: {
    borderRadius: 12,
    marginTop: 8,
    shadowColor: colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  loginBtnInner: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  loginBtnDisabled: {opacity: 0.7},
  loginBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  roleHint: {
    marginTop: 16,
    alignItems: 'center',
  },
  roleHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  roleHintText: {
    color: colors.textMuted,
    fontSize: 12,
  },
});
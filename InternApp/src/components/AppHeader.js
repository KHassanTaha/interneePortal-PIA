import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {useNavigation} from '@react-navigation/native';
import {useSelector} from 'react-redux';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {gradients} from '../theme';
import Icon from './Icon';

// Shared gradient header band with optional page title.
// Screens pass an optional back handler, title, and/or right-side action buttons.
export default function AppHeader({onBack, home, title, right, hideTitle}) {
  const navigation = useNavigation();
  const role = useSelector(s => s.auth.role);
  const unreadCount = useSelector(s => s.notifications.unreadCount);
  const insets = useSafeAreaInsets();

  const goHome = () =>
    navigation.navigate(role === 'Mentor' ? 'MentorDash' : role === 'Intern' ? 'InternDash' : 'AdminDash');

  return (
    <LinearGradient
      colors={gradients.primary}
      start={{x: 0, y: 0}}
      end={{x: 1, y: 1}}
      style={[styles.band, {paddingTop: insets.top + 6}]}>
      {home ? (
        <TouchableOpacity
          onPress={goHome}
          style={styles.backBtn}
          accessibilityLabel="Back to home"
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
          <Icon name="home" size={20} color="#fff" />
        </TouchableOpacity>
      ) : onBack ? (
        <TouchableOpacity
          onPress={onBack}
          style={styles.backBtn}
          accessibilityLabel="Go back"
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
          <Icon name="back" size={22} color="#fff" />
        </TouchableOpacity>
      ) : null}
      <View style={styles.spacer} />
      {!hideTitle && title ? (
        <View style={styles.titleWrap} pointerEvents="none">
          <Text style={styles.titleText}>{title}</Text>
        </View>
      ) : null}
      <TouchableOpacity
        onPress={() => navigation.navigate('Notifications')}
        style={styles.bellBtn}
        accessibilityLabel="Notifications"
        hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
        <Icon name="bell" size={20} color="#fff" />
        {unreadCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
      {right}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacer: {flex: 1},
  titleWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  bellBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 18,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#e53935',
    borderWidth: 1.5,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
  },
});
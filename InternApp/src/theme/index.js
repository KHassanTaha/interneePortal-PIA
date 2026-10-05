import {Appearance} from 'react-native';
import {useEffect, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// PIA brand palettes — light (PIA Theme spec: green #004F30, gold #AB9214,
// cream background #F4F1E3, white surfaces, ink text #1B1B1B, error #B3261E)
// and dark (PIA-adapted green-charcoal neutrals, cream text — no navy).
export const palettes = {
  dark: {
    primary: '#006633',
    primaryDark: '#004d26',
    primaryLight: '#4da674',
    accent: '#8B6914',
    accentLight: '#d4a843',
    background: '#0E1510',
    surface: '#151E17',
    surfaceLight: '#1D2A20',
    card: '#1C2720',
    border: '#3E5246',
    cardBorder: '#4E6B59',
    text: '#F4F1E3',
    textSecondary: '#F4F1E3CC',
    textMuted: '#F4F1E3A6',
    textAccent: '#4da674',
    textAccentAlt: '#d4a843',
    statGold: '#C9A227',
    error: '#ef4444',
    success: '#22c55e',
    warning: '#f59e0b',
    info: '#3b82f6',
    present: '#22c55e',
    absent: '#ef4444',
    pending: '#f59e0b',
  },
  light: {
    primary: '#004F30',
    primaryDark: '#00301D',
    primaryLight: '#3D7A5C',
    accent: '#AB9214',
    accentLight: '#D4BC5C',
    background: '#F4F1E3',
    surface: '#FFFFFF',
    surfaceLight: '#FEFCE2',
    card: '#F7F5E9',
    border: '#1B1B1B33',
    cardBorder: '#1B1B1B33',
    text: '#1B1B1B',
    textSecondary: '#1B1B1BCC',
    textMuted: '#1B1B1BB3',
    textAccent: '#004F30',
    textAccentAlt: '#AB9214',
    statGold: '#C9A227',
    error: '#B3261E',
    success: '#1E7A44',
    warning: '#9A7B0E',
    info: '#2F5FD0',
    present: '#1E7A44',
    absent: '#B3261E',
    pending: '#9A7B0E',
  },
};

// Centralized gradient pairs, keyed by semantic use (from the PIA Theme spec).
export const gradients = {
  primary: [palettes.light.primary, palettes.light.primaryLight],
  primaryDark: [palettes.light.primary, palettes.light.primaryDark],
  accent: [palettes.light.accent, palettes.light.accentLight],
  background: {
    light: ['#FEFCE2', '#F4F1E3'],
    dark: ['#151E17', '#0E1510'],
  },
};

const STORAGE_KEY = 'themeMode';

let manualMode = null; // null = follow the OS scheme
let currentScheme = Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';

export const theme = {
  colors: {...palettes[currentScheme]},
  fonts: {
    regular: 'Inter-Regular',
    medium: 'Inter-Medium',
    bold: 'Inter-Bold',
    light: 'Inter-Light',
  },
  spacing: {
    xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48,
  },
  radius: {
    sm: 8, md: 12, lg: 16, xl: 24, full: 999,
  },
};

const listeners = new Set();

function applyScheme() {
  theme.colors = {...palettes[currentScheme]};
  listeners.forEach(l => l());
}

export function getMode() {
  return manualMode;
}

export function setMode(mode) {
  manualMode = mode;
  currentScheme = manualMode ?? (Appearance.getColorScheme() === 'dark' ? 'dark' : 'light');
  applyScheme();
  AsyncStorage.setItem(STORAGE_KEY, mode);
}

export async function initTheme() {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      manualMode = stored;
      currentScheme = stored;
      applyScheme();
    }
  } catch {}
}

Appearance.addChangeListener(({colorScheme}) => {
  if (manualMode) return;
  const next = colorScheme === 'dark' ? 'dark' : 'light';
  if (next === currentScheme) return;
  currentScheme = next;
  applyScheme();
});

export function useAppTheme() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick(x => x + 1);
    listeners.add(l);
    return () => listeners.delete(l);
  }, []);
  return {theme, colors: theme.colors, isDark: currentScheme === 'dark'};
}

export default theme;
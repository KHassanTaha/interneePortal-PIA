import React, {useMemo} from 'react';
import {Text, TouchableOpacity, View, StyleSheet} from 'react-native';
import {useAppTheme} from '../theme';

// Segmented filter control. Each option: {key, label, color?} — color is used
// for the active segment tint (falls back to the primary theme color).
export default function FilterChips({options, value, onChange, idPrefix = 'filter', compact = false, wrap = false}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={[styles.container, compact && styles.containerCompact, wrap && styles.containerWrap]}>
      {options.map(o => {
        const active = value === o.key;
        const tint = o.color || colors.primary;
        return (
          <TouchableOpacity
            key={o.key}
            id={`${idPrefix}-${String(o.key).toLowerCase()}`}
            style={[styles.segment, compact && styles.segmentCompact, wrap && styles.segmentWrap, active && {backgroundColor: tint + '26', borderColor: tint}]}
            onPress={() => onChange(o.key)}>
            <Text style={[styles.segmentText, compact && styles.segmentTextCompact, active && {color: tint, fontWeight: '700'}]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const makeStyles = colors => StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 3,
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 3,
  },
  containerCompact: {marginTop: 8, borderRadius: 9, padding: 2},
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  segmentCompact: {paddingVertical: 5, borderRadius: 7},
  segmentWrap: {flex: 0, alignSelf: 'flex-start', paddingHorizontal: 12},
  containerWrap: {flexWrap: 'wrap'},
  segmentText: {color: colors.textSecondary, fontSize: 13, fontWeight: '600'},
  segmentTextCompact: {fontSize: 12},
});
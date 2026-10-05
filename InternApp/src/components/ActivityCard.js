import React, {useMemo} from 'react';
import {Text, TouchableOpacity, View, StyleSheet} from 'react-native';
import {useAppTheme} from '../theme';
import {prettifyLogType} from '../utils/logTypes';

// Timeline-style activity card: colored dot + connector line on the left,
// type badge + department + description + footer on the right.
export default function ActivityCard({log, color, onPress, id, showLine = true}) {
  const {colors, isDark} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const tint = color || colors.primary;

  return (
    <TouchableOpacity id={id} style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.timeline}>
        <View style={[styles.dot, {backgroundColor: tint}]} />
        {showLine && <View style={styles.line} />}
      </View>
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <View style={[styles.typeBadge, {backgroundColor: tint + '22'}]}>
            <Text style={[styles.typeText, {color: tint}]}>{prettifyLogType(log.logType)}</Text>
          </View>
          {log.department ? (
            <View style={styles.deptBadge}><Text style={styles.deptText}>{log.department}</Text></View>
          ) : null}
        </View>
        <Text style={styles.desc}>{log.description}</Text>
        <View style={styles.footer}>
          {log.performedBy ? <Text style={styles.by}>by @{log.performedBy}</Text> : <View />}
          <Text style={styles.time}>{new Date(log.createdAt).toLocaleString()}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (colors, isDark) => StyleSheet.create({
  card: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 10,
  },
  timeline: {width: 16, alignItems: 'center'},
  dot: {width: 10, height: 10, borderRadius: 5, marginTop: 5, marginBottom: 4},
  line: {flex: 1, width: 2, borderRadius: 1, backgroundColor: colors.border},
  body: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 12,
  },
  headerRow: {flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap'},
  typeBadge: {borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3},
  typeText: {fontSize: 11, fontWeight: '700'},
  deptBadge: {backgroundColor: colors.accent + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3},
  deptText: {color: colors.textSecondary, fontSize: 11, fontWeight: '600'},
  desc: {color: colors.text, fontSize: 13, lineHeight: 18, marginBottom: 8},
  footer: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  by: {color: isDark ? colors.primaryLight : colors.primary, fontSize: 11},
  time: {color: colors.textMuted, fontSize: 11},
});
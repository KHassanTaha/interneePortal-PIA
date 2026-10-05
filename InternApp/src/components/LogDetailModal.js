import React, {useMemo} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, Modal} from 'react-native';
import {useAppTheme} from '../theme';
import Icon from './Icon';
import CenteredModalCard from './CenteredModalCard';

const prettify = t => (t || '').replace(/([A-Z])/g, ' $1').trim();

export default function LogDetailModal({log, typeColor, onClose}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (!log) return null;

  const badgeColor = typeColor || colors.primary;
  let deviceInfo = null;
  if (log.metadata) {
    try {
      const m = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
      const parts = [m?.deviceLabel, m?.deviceHash].filter(Boolean);
      if (parts.length) deviceInfo = parts.join(' • ');
    } catch {}
  }
  const rows = [
    {label: 'Performed by', value: log.performedBy ? `@${log.performedBy}` : '\u2014'},
    ...(log.targetIntern ? [{label: 'Target intern', value: log.targetIntern}] : []),
    ...(log.department ? [{label: 'Department', value: log.department}] : []),
    ...(deviceInfo ? [{label: 'Device', value: deviceInfo}] : []),
    {label: 'Date & time', value: new Date(log.createdAt).toLocaleString()},
    {label: 'Log ID', value: `#${log.id}`},
  ];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <CenteredModalCard style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.typeBadge, {backgroundColor: badgeColor + '22'}]}>
              <Text style={[styles.typeText, {color: badgeColor}]}>{prettify(log.logType)}</Text>
            </View>
            <TouchableOpacity id="log-detail-close" style={styles.closeIcon} onPress={onClose} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Icon name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <Text style={styles.desc}>{log.description}</Text>
          <View style={styles.divider} />
          {rows.map(r => (
            <View key={r.label} style={styles.row}>
              <Text style={styles.rowLabel}>{r.label}</Text>
              <Text style={styles.rowValue}>{r.value}</Text>
            </View>
          ))}
          <TouchableOpacity id="log-detail-close-btn" style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </CenteredModalCard>
      </TouchableOpacity>
    </Modal>
  );
}

const makeStyles = colors => StyleSheet.create({
  overlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24},
  card: {backgroundColor: colors.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.cardBorder},
  cardHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10},
  typeBadge: {borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4},
  typeText: {fontSize: 12, fontWeight: '700'},
  closeIcon: {width: 32, height: 32, borderRadius: 16, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center'},
  desc: {color: colors.text, fontSize: 14, lineHeight: 20},
  divider: {height: 1, backgroundColor: colors.border, marginVertical: 14},
  row: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10},
  rowLabel: {color: colors.textMuted, fontSize: 12, fontWeight: '600', marginRight: 12},
  rowValue: {color: colors.text, fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right'},
  closeBtn: {backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 6},
  closeBtnText: {color: '#fff', fontWeight: '700', fontSize: 14},
});
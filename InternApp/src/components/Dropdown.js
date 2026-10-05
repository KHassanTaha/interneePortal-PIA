import React, {useState, useMemo, useRef} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, TextInput, PanResponder, Animated} from 'react-native';
import {useAppTheme} from '../theme';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from './Icon';

export default function Dropdown({label, value, options, onChange, placeholder = 'Select...', popover = false, style, id, searchable = true, clearable = false, onClear, compact = false}) {
  const {colors} = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors, insets), [colors, insets]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dy = useRef(new Animated.Value(0)).current;

  const closeSheet = () => { setOpen(false); setSearch(''); };

  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_e, g) => dy.setValue(Math.max(0, g.dy)),
    onPanResponderRelease: (_e, g) => {
      if (g.dy > 70 || g.vy > 0.7) closeSheet();
      Animated.spring(dy, {toValue: 0, useNativeDriver: true}).start();
    },
    onPanResponderTerminate: () => Animated.spring(dy, {toValue: 0, useNativeDriver: true}).start(),
  })).current;

  const selected = options.find(o => o.value === value);
  const display = selected ? selected.label : placeholder;

  const visible = (search.trim() ? options.filter(o => String(o.label).toLowerCase().includes(search.trim().toLowerCase())) : options);

  const optionRow = o => (
    <TouchableOpacity
      key={String(o.value)}
      id={`dropdown-option-${String(o.value)}`}
      style={[styles.option, o.value === value && styles.optionSelected]}
      onPress={() => { onChange(o.value); setOpen(false); setSearch(''); }}>
      <Text style={[styles.optionText, o.value === value && styles.optionTextSelected]}>{o.label}</Text>
      {o.value === value && <Icon name="check" size={16} color={colors.textAccent} />}
    </TouchableOpacity>
  );

  const optionList = (
    <>
      {searchable && (
        <View style={styles.searchWrap}>
          <Icon name="search" size={14} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search..."
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity style={styles.searchClear} onPress={() => setSearch('')}>
              <Icon name="close" size={14} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      )}
      <ScrollView style={styles.sheetList} bounces={false} keyboardShouldPersistTaps="handled">
        {visible.length === 0 ? (
          <Text style={styles.noMatch}>No matching options</Text>
        ) : visible.map(optionRow)}
      </ScrollView>
    </>
  );

  if (popover) {
    return (
      <View style={[styles.wrap, styles.popoverAnchor]}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        <View style={styles.triggerRow}>
          <TouchableOpacity
            id={`dropdown-${id || label || 'select'}`}
            style={[styles.trigger, style]}
            onPress={() => { setSearch(''); setOpen(v => !v); }}>
<Text style={[styles.triggerText, compact && styles.triggerTextCompact, !selected && styles.triggerPlaceholder]} numberOfLines={compact ? 2 : 1}>
            {display}
          </Text>
          <Icon name="chevronRight" size={16} color={colors.textMuted} style={{transform: [{rotate: open ? '-90deg' : '90deg'}]}} />
          </TouchableOpacity>
          {clearable && value != null && value !== '' && (
            <TouchableOpacity style={styles.clearBtn} onPress={() => { onChange(null); onClear && onClear(); }}>
              <Icon name="close" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        {open && (
          <>
            <TouchableOpacity style={styles.popoverBackdrop} activeOpacity={1} onPress={() => { setOpen(false); setSearch(''); }} />
            <View style={styles.popoverList}>
              {optionList}
            </View>
          </>
        )}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {label ? <Text style={[styles.label, compact && styles.labelCompact]}>{label}</Text> : null}
      <View style={styles.triggerRow}>
        <TouchableOpacity
          id={`dropdown-${id || label || 'select'}`}
          style={[styles.trigger, compact && styles.triggerCompact, style]}
          onPress={() => { setSearch(''); setOpen(true); }}>
          <Text style={[styles.triggerText, compact && styles.triggerTextCompact, !selected && styles.triggerPlaceholder]} numberOfLines={compact ? 2 : 1}>
            {display}
          </Text>
          <Icon name="chevronRight" size={16} color={colors.textMuted} style={{transform: [{rotate: '90deg'}]}} />
        </TouchableOpacity>
        {clearable && value != null && value !== '' && (
          <TouchableOpacity style={styles.clearBtn} onPress={() => { onChange(null); onClear && onClear(); }}>
            <Icon name="close" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={closeSheet}>
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.backdropTouch} activeOpacity={1} onPress={closeSheet} />
          <Animated.View style={[styles.sheet, {transform: [{translateY: dy}]}]}>
            <View {...pan.panHandlers} style={styles.sheetHandleZone} hitSlop={{top: 8, bottom: 6, left: 0, right: 0}}>
              <View style={styles.sheetHandle} />
            </View>
            <Text style={styles.sheetTitle}>{label || 'Select'}</Text>
            {optionList}
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (colors, insets) => StyleSheet.create({
  wrap: {alignSelf: 'stretch'},
  label: {color: colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 6, lineHeight: 16},
  labelCompact: {fontSize: 11, marginBottom: 4, lineHeight: 14},
  triggerRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  trigger: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 11, minHeight: 46,
  },
  triggerCompact: {paddingHorizontal: 10, paddingVertical: 6, minHeight: 40, borderRadius: 8},
  clearBtn: {width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border},
  triggerText: {flexShrink: 1, color: colors.text, fontSize: 13, fontWeight: '600', lineHeight: 20},
  triggerTextCompact: {fontSize: 12, lineHeight: 16},
  triggerPlaceholder: {color: colors.textMuted, fontWeight: '400'},
  chevron: {transform: [{rotate: '90deg'}]},
  searchWrap: {flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, marginBottom: 8},
  searchClear: {padding: 3},
  searchInput: {flex: 1, color: colors.text, fontSize: 13, paddingVertical: 8, padding: 0},
  noMatch: {color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 16},
  popoverAnchor: {overflow: 'visible'},
  popoverBackdrop: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10},
  popoverList: {
    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
    marginTop: 6, backgroundColor: colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, padding: 8,
    elevation: 8, shadowColor: '#000', shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.2, shadowRadius: 12,
  },
  overlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end'},
  backdropTouch: {flex: 1},
  sheet: {backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 30 + (insets ? insets.bottom : 0)},
  sheetHandleZone: {alignItems: 'center', paddingTop: 2, paddingBottom: 10},
  sheetHandle: {width: 44, height: 5, borderRadius: 3, backgroundColor: colors.textMuted, opacity: 0.5},
  sheetTitle: {color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 12},
  sheetList: {maxHeight: 320},
  option: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.card, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    marginBottom: 8, borderWidth: 1, borderColor: colors.border,
  },
  optionSelected: {backgroundColor: colors.primary + '22', borderColor: colors.primary},
  optionText: {color: colors.text, fontSize: 14, fontWeight: '500'},
  optionTextSelected: {color: colors.textAccent, fontWeight: '700'},
});

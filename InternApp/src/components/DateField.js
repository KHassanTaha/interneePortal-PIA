import React, {useState} from 'react';
import {View, Text, TouchableOpacity, Platform} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Icon from './Icon';
import {useAppTheme} from '../theme';

export default function DateField({
  label, value, onChange, maximumDate, minimumDate, placeholder = 'Select date', containerStyle,
}) {
  const {colors} = useAppTheme();
  const [show, setShow] = useState(false);
  const hasValue = !!value;
  const formatted = hasValue ? new Date(value).toLocaleDateString() : '';

  return (
    <View style={containerStyle}>
      {label ? <Text style={{color: colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 6}}>{label}</Text> : null}
      <TouchableOpacity
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border,
          paddingHorizontal: 14, paddingVertical: 12,
        }}
        onPress={() => setShow(true)}
      >
        <Icon name="calendar" size={15} color={colors.textSecondary} />
        <Text style={{flex: 1, fontSize: 14, color: hasValue ? colors.text : colors.textMuted}}>
          {formatted || placeholder}
        </Text>
        {hasValue ? (
          <TouchableOpacity
            onPress={() => onChange(null)}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
          >
            <Icon name="close" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>

      {show && (
        <DateTimePicker
          value={hasValue ? new Date(value) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'material'}
          maximumDate={maximumDate}
          minimumDate={minimumDate}
          onChange={(event, selected) => {
            setShow(false);
            if (event.type === 'set' && selected) onChange(selected);
          }}
        />
      )}
    </View>
  );
}

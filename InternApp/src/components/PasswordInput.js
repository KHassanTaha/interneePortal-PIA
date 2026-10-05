import React, {useState} from 'react';
import {View, TextInput, TouchableOpacity} from 'react-native';
import Icon from './Icon';
import {useAppTheme} from '../theme';

export default function PasswordInput({
  id, placeholder, value, onChangeText, style, placeholderTextColor, ...rest
}) {
  const {colors} = useAppTheme();
  const [show, setShow] = useState(false);
  return (
    <View style={{position: 'relative'}}>
      <TextInput
        id={id}
        style={[style, {paddingRight: 42}]}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoCorrect={false}
        {...rest}
      />
      <TouchableOpacity
        onPress={() => setShow(!show)}
        style={{position: 'absolute', right: 10, top: 0, bottom: 0, justifyContent: 'center'}}
        hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
      >
        <Icon name={show ? 'eye' : 'eyeOff'} size={18} color={colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

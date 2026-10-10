import React, {useMemo} from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';
import {useAppTheme} from '../theme';
import {fileUrl} from '../api/fileClient';

/**
 * Intern identity avatar (REQ-04). Renders the intern's enrollment selfie
 * thumbnail when one exists, otherwise an initials placeholder on PIA green.
 *
 * The same selector the profile avatar and the ID-card PDF use backs the
 * `thumbPath` supplied here, so a re-enrollment updates every surface at once.
 * Pass the 256px thumbnail; fall back to the full-res path only when no
 * thumbnail exists. The full-res file stays reserved for the viewer and the
 * ID-card embed.
 *
 * @param {{name?: string, thumbPath?: string, size?: number}} props
 * @returns {JSX.Element}
 */
export default function InternAvatar({name, thumbPath, size = 40}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors, size), [colors, size]);

  if (thumbPath) {
    return <Image source={{uri: fileUrl(thumbPath)}} style={styles.image} resizeMode="cover" />;
  }

  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <View style={styles.fallback}>
      <Text style={styles.initials}>{initial}</Text>
    </View>
  );
}

function makeStyles(colors, size) {
  const box = {width: size, height: size, borderRadius: size / 2};
  return StyleSheet.create({
    image: {...box, backgroundColor: colors.primary},
    fallback: {...box, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center'},
    initials: {color: '#fff', fontSize: Math.round(size * 0.42), fontWeight: '700'},
  });
}

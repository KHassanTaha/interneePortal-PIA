import React, {useMemo} from 'react';
import {
  View, Text, ScrollView, StyleSheet,
} from 'react-native';
import {useAppTheme} from '../../theme';
import ScreenBackground from '../../components/ScreenBackground';
import AppHeader from '../../components/AppHeader';
import {guides} from '../../content/guides';

export default function GuideDetailScreen({route, navigation}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const guideId = route?.params?.guideId;
  const guide = guides.find(g => g.id === guideId);

  if (!guide) return <View style={styles.center}><Text style={styles.notFound}>Guide not found</Text></View>;

  return (
    <ScreenBackground>
      <ScrollView style={styles.container}>
        <AppHeader onBack={() => navigation.goBack()} />
        <View style={styles.header}>
          <Text style={styles.title}>{guide.title}</Text>
          <Text style={styles.subtitle}>{guide.category}</Text>
        </View>

        {guide.content.map((section, i) => (
          <View key={i} style={styles.sectionCard}>
            <Text style={styles.sectionHeading}>{section.heading}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
          </View>
        ))}
      </ScrollView>
    </ScreenBackground>
  );
}

const makeStyles = colors => StyleSheet.create({
  center: {flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg},
  notFound: {fontSize: 15, color: colors.textMuted},
  container: {flex: 1, backgroundColor: colors.bg},
  header: {marginTop: 4, marginBottom: 16, paddingHorizontal: 20},
  title: {fontSize: 22, fontWeight: '700', color: colors.text},
  subtitle: {fontSize: 13, color: colors.textMuted, marginTop: 4},
  sectionCard: {backgroundColor: colors.card, borderRadius: 12, padding: 16, marginHorizontal: 20, marginBottom: 10, borderWidth: 1, borderColor: colors.border},
  sectionHeading: {fontSize: 15, fontWeight: '700', color: colors.textAccent, marginBottom: 8},
  sectionBody: {fontSize: 14, color: colors.text, lineHeight: 21},
});
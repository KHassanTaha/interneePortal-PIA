import React, {useMemo} from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
} from 'react-native';
import {useAppTheme} from '../../theme';
import ScreenBackground from '../../components/ScreenBackground';
import AppHeader from '../../components/AppHeader';
import RightSidebar from '../../components/RightSidebar';
import Icon from '../../components/Icon';
import {guides, GUIDE_CATEGORIES} from '../../content/guides';

export default function GuidesScreen({navigation}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [sidebarVisible, setSidebarVisible] = React.useState(false);

  const categories = Object.values(GUIDE_CATEGORIES);
  const grouped = {};
  categories.forEach(c => { grouped[c] = guides.filter(g => g.category === c); });

  return (
    <ScreenBackground>
      <ScrollView style={styles.container}>
        <AppHeader home right={<TouchableOpacity accessibilityRole="button" accessibilityLabel="Open navigation menu" id="guides-menu-btn" onPress={() => setSidebarVisible(true)} style={styles.menuBtn}><Icon name="menu" size={22} color="#fff" /></TouchableOpacity>} />
        <RightSidebar visible={sidebarVisible} onClose={() => setSidebarVisible(false)} navigation={navigation} />

        <View style={styles.header}>
          <Text style={styles.subtitle}>Help articles and reference materials</Text>
        </View>

        {categories.map(cat => {
          const items = grouped[cat];
          if (!items || items.length === 0) return null;
          return (
            <View key={cat} style={styles.section}>
              <Text style={styles.sectionTitle}>{cat}</Text>
              {items.map(g => (
                <TouchableOpacity key={g.id} id={`guide-${g.id}`} style={styles.guideCard} onPress={() => navigation.navigate('GuideDetail', {guideId: g.id})}>
                  <View style={styles.guideIconBox}>
                    <Icon name={g.icon} size={20} color={colors.textAccent} />
                  </View>
                  <View style={styles.guideInfo}>
                    <Text style={styles.guideTitle}>{g.title}</Text>
                    <Text style={styles.guideHint}>{g.content.length} sections</Text>
                  </View>
                  <Icon name="chevronRight" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          );
        })}
      </ScrollView>
    </ScreenBackground>
  );
}

const makeStyles = colors => StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.bg},
  menuBtn: {padding: 6, borderRadius: 8},
  header: {marginTop: 4, marginBottom: 16, paddingHorizontal: 20},
  subtitle: {fontSize: 13, color: colors.textMuted, marginTop: 4},
  section: {marginBottom: 20, paddingHorizontal: 20},
  sectionTitle: {fontSize: 14, fontWeight: '700', color: colors.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5},
  guideCard: {flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border},
  guideIconBox: {width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center', marginRight: 12},
  guideInfo: {flex: 1},
  guideTitle: {fontSize: 14, fontWeight: '600', color: colors.text},
  guideHint: {fontSize: 12, color: colors.textMuted, marginTop: 2},
});
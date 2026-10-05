import React, {useCallback, useState, useMemo} from 'react';
import {View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import client from '../../api/client';
import {showToast} from '../../components/AppToast';
import {useAppTheme} from '../../theme';
import ScreenBackground from '../../components/ScreenBackground';
import AppHeader from '../../components/AppHeader';
import Icon from '../../components/Icon';
import Spinner from '../../components/Spinner';
import RightSidebar from '../../components/RightSidebar';

export default function CertificateScreen({navigation}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(false);

  const fetchData = async () => {
    try { const res = await client.get('/intern/certificate/eligibility'); setData(res.data); }
    catch { showToast("Couldn't load eligibility.", 'error'); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    const loadData = async () => {
      try { const res = await client.get('/intern/certificate/eligibility'); if (!cancelled) setData(res.data); }
      catch { if (!cancelled) showToast("Couldn't load eligibility.", 'error'); }
      finally { if (!cancelled) { setLoading(false); setRefreshing(false); } }
    };
    loadData();
    return () => { cancelled = true; };
  }, []));

  if (loading) return <Spinner style={styles.center} />;

  const eligible = data?.eligible;
  const pct = data?.percentage ?? 0;
  const threshold = data?.thresholdPct ?? 75;
  const endDatePassed = !!data?.endDatePassed;
  const taskPct = data?.taskPct ?? 0;
  const taskThreshold = data?.taskThresholdPct ?? 0;

  return (
    <ScreenBackground style={styles.container}>
      <AppHeader
        right={<TouchableOpacity accessibilityRole="button" accessibilityLabel="Open navigation menu" style={styles.menuBtn} onPress={() => setSidebarVisible(true)}><Icon name="menu" size={22} color="#fff" /></TouchableOpacity>}
      />
      <RightSidebar visible={sidebarVisible} onClose={() => setSidebarVisible(false)} navigation={navigation} />

      <ScrollView contentContainerStyle={{paddingBottom:100, flexGrow:1}} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchData();}} tintColor={colors.primary}/>}>

        {/* Eligibility Status */}
        <View style={[styles.statusCard, {borderColor: (eligible ? colors.success : colors.warning) + '44'}]}>
          <View style={[styles.statusIcon, {backgroundColor: (eligible ? colors.success : colors.warning) + '22'}]}>
            <Icon name={eligible ? 'check' : 'clock'} size={32} color={eligible ? colors.success : colors.warning} />
          </View>
          <Text style={[styles.statusTitle, {color: eligible ? colors.success : colors.warning}]}>
            {eligible ? 'Certificate Eligible' : 'Not Yet Eligible'}
          </Text>
          {eligible ? (
            <Text style={styles.statusDesc}>You have met all requirements. Your certificate is ready.</Text>
          ) : (
            <Text style={styles.statusDesc}>
              {!endDatePassed
                ? 'Your internship period has not ended yet.'
                : taskPct < taskThreshold
                  ? 'You have not met the task-completion requirement yet.'
                  : `Complete your internship period and maintain ${threshold}% attendance to qualify.`}
            </Text>
          )}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{pct.toFixed(1)}%</Text>
            <Text style={styles.statLabel}>Attendance</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, {width: `${Math.min(pct, 100)}%`, backgroundColor: pct >= threshold ? colors.success : colors.warning}]} />
            </View>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{threshold}%</Text>
            <Text style={styles.statLabel}>Required</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{taskPct.toFixed(1)}%</Text>
            <Text style={styles.statLabel}>Tasks</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{endDatePassed ? 'Ended' : 'Ongoing'}</Text>
            <Text style={styles.statLabel}>Period</Text>
          </View>
        </View>

        {eligible && (
          <View style={styles.downloadCard}>
            <Icon name="file" size={24} color={colors.textAccent} />
            <Text style={styles.downloadText}>Your completion certificate will be available here once issued by your mentor.</Text>
          </View>
        )}

      </ScrollView>
    </ScreenBackground>
  );
}

const makeStyles = colors => StyleSheet.create({
  container:{flex:1}, center:{flex:1, justifyContent:'center', alignItems:'center'},
  menuBtn:{backgroundColor:'rgba(255,255,255,0.18)', borderWidth:1, borderColor:'rgba(255,255,255,0.35)', borderRadius:20, paddingHorizontal:12, paddingVertical:8},
  statusCard:{alignItems:'center', backgroundColor:colors.surface, margin:16, borderRadius:20, padding:24, borderWidth:1},
  statusIcon:{width:64, height:64, borderRadius:32, alignItems:'center', justifyContent:'center', marginBottom:12},
  statusTitle:{fontSize:20, fontWeight:'800', marginBottom:6},
  statusDesc:{color:colors.textSecondary, fontSize:13, textAlign:'center', lineHeight:20},
  statsRow:{flexDirection:'row', gap:12, marginHorizontal:16, marginBottom:12},
  statCard:{flex:1, backgroundColor:colors.surface, borderRadius:14, padding:16, borderWidth:1, borderColor:colors.border, alignItems:'center'},
  statValue:{color:colors.text, fontSize:22, fontWeight:'800'},
  statLabel:{color:colors.textMuted, fontSize:11, fontWeight:'600', marginTop:4, textTransform:'uppercase'},
  progressBar:{width:'100%', height:6, backgroundColor:colors.card, borderRadius:3, marginTop:8, overflow:'hidden'},
  progressFill:{height:'100%', borderRadius:3},
  downloadCard:{flexDirection:'row', alignItems:'center', gap:12, margin:16, backgroundColor:colors.primary+'12', borderRadius:14, padding:16, borderWidth:1, borderColor:colors.primary+'33'},
  downloadText:{flex:1, color:colors.textSecondary, fontSize:13, lineHeight:18},
});

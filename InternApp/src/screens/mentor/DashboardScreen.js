import React, {useState, useEffect, useMemo} from 'react';
import {View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl} from 'react-native';
import client from '../../api/client';
import {useAppTheme} from '../../theme';
import ScreenBackground from '../../components/ScreenBackground';
import AppHeader from '../../components/AppHeader';
import Icon from '../../components/Icon';
import Spinner from '../../components/Spinner';
import RightSidebar from '../../components/RightSidebar';

export default function MentorDashboard({navigation}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(false);

  const fetch = async () => {
    try { const res = await client.get('/mentor/dashboard'); setDashboard(res.data); }
    catch {} finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try { const res = await client.get('/mentor/dashboard'); if (!cancelled) setDashboard(res.data); }
      catch {} finally { if (!cancelled) { setLoading(false); setRefreshing(false); } }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <Spinner style={styles.center} />;

  const d = dashboard;

  const stats = [
    {label:'Active Interns', value: d?.activeInterns ?? 0, sub: d?.totalInterns != null ? `of ${d.totalInterns} total` : null, icon:'check'},
    {label:'Present Today', value: d?.presentToday ?? 0, sub: d?.onLeaveToday ? `${d.onLeaveToday} on leave` : 'no one on leave', icon:'mapPin'},
    {label:'Overdue Tasks', value: d?.overdueTasks ?? 0, sub:'past due & uncompleted', icon:'clipboard'},
  ];

  const actions = [
    {icon:'gradCap', label:'My Interns', onPress:() => navigation.navigate('MentorInterns')},
    {icon:'mapPin', label:'View Attendance', onPress:() => navigation.navigate('AttendanceView')},
    {icon:'clipboard', label:'Assign Tasks', onPress:() => navigation.navigate('Tasks')},
    {icon:'user', label:'Face Approvals', onPress:() => navigation.navigate('AttendanceView')},
{icon:'idCard', label:'Issue Documents', onPress:() => navigation.navigate('IssueDocuments')},
];

  return (
    <ScreenBackground>
      <AppHeader
        title="Dashboard"
        right={(
          <TouchableOpacity id="mentor-menu-btn" onPress={() => setSidebarVisible(true)} style={styles.menuBtn}>
            <Icon name="menu" size={22} color="#fff" />
          </TouchableOpacity>
        )}
      />
      <RightSidebar
        visible={sidebarVisible}
        onClose={() => setSidebarVisible(false)}
        navigation={navigation}
      />
      <ScrollView style={styles.container} contentContainerStyle={{paddingBottom: 100, flexGrow: 1}}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetch();}} tintColor={colors.primary}/>}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome, {d?.mentorName?.split(' ')[0]}</Text>
            <Text style={styles.dept}>{d?.department} — Mentor</Text>
          </View>
        </View>

        <View style={styles.statsGrid}>
          {stats.map((s, i) => (
            <View key={i} style={styles.statCard}>
              <View style={styles.statTop}>
                <Icon name={s.icon} size={18} color={colors.textAccent} />
                <Text style={styles.statVal}>{s.value}</Text>
              </View>
              <Text style={styles.statLabel}>{s.label}</Text>
              {s.sub ? <Text style={styles.statSub}>{s.sub}</Text> : null}
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Actions</Text>
        {actions.map((a, i) => (
          <TouchableOpacity key={i} id={`mentor-action-${i}`} style={styles.actionRow} onPress={a.onPress}>
            <Icon name={a.icon} size={22} color={colors.textAccent} />
            <Text style={styles.actionLabel}>{a.label}</Text>
            <View style={styles.actionRight}>
              {a.badge > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{a.badge}</Text></View>}
              <Icon name="chevronRight" size={16} color={colors.textMuted} />
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </ScreenBackground>
  );
}

const makeStyles = colors => StyleSheet.create({
  container:{flex:1},
  center:{flex:1, justifyContent:'center', alignItems:'center', backgroundColor:colors.background},
  header:{marginTop:12, paddingHorizontal:20, paddingBottom:16},
  greeting:{color:colors.text, fontSize:22, fontWeight:'700'},
  dept:{color:colors.textMuted, fontSize:12, marginTop:2},
  menuBtn:{width:40, height:40, borderRadius:20, backgroundColor:'rgba(255,255,255,0.18)', borderWidth:1, borderColor:'rgba(255,255,255,0.35)', alignItems:'center', justifyContent:'center'},
  statsGrid:{flexDirection:'row', flexWrap:'wrap', justifyContent:'space-between', paddingHorizontal:16, marginBottom:8},
  statCard:{width:'48%', backgroundColor:colors.surface, borderRadius:14, padding:12, borderLeftWidth:3, borderLeftColor:colors.primary, marginBottom:10, borderWidth:1, borderColor:colors.border},
  statTop:{flexDirection:'row', alignItems:'center', gap:8},
  statVal:{fontSize:22, fontWeight:'800', color:colors.text},
  statLabel:{color:colors.text, fontSize:12, fontWeight:'600', marginTop:8},
  statSub:{color:colors.textSecondary, fontSize:10, marginTop:2},
  sectionTitle:{color:colors.text, fontSize:16, fontWeight:'700', marginHorizontal:20, marginTop:8, marginBottom:12},
  actionRow:{flexDirection:'row', alignItems:'center', backgroundColor:colors.surface, marginHorizontal:16, marginBottom:8, borderRadius:14, padding:16, borderWidth:1, borderColor:colors.border, gap:14},
  actionLabel:{flex:1, color:colors.text, fontSize:15, fontWeight:'600'},
  actionRight:{flexDirection:'row', alignItems:'center', gap:8},
  badge:{backgroundColor:colors.warning, borderRadius:10, minWidth:20, height:20, justifyContent:'center', alignItems:'center', paddingHorizontal:6},
  badgeText:{color:'#fff', fontSize:11, fontWeight:'700'},
});
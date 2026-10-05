import React, {useCallback, useState} from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import client from '../../api/client';
import {showToast} from '../../components/AppToast';
import {moderate, queuedToast} from '../../api/moderate';
import {useAppTheme} from '../../theme';
import ScreenBackground from '../../components/ScreenBackground';
import AppHeader from '../../components/AppHeader';
import Icon from '../../components/Icon';
import Spinner from '../../components/Spinner';
import EndOfListMarker from '../../components/EndOfListMarker';

export default function TransferRequestsScreen({navigation}) {
  const {colors} = useAppTheme();
  const styles = makeStyles(colors);
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState(null);

  const fetchData = async () => {
    try {
      const res = await client.get('/mentor/transfers');
      setTransfers(res.data);
    } catch {
      showToast("Couldn't load transfer requests. Pull to refresh.", 'error');
    } finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await client.get('/mentor/transfers');
        if (!cancelled) setTransfers(res.data);
      } catch {
        showToast("Couldn't load transfer requests. Pull to refresh.", 'error');
      } finally { if (!cancelled) { setLoading(false); setRefreshing(false); } }
    };
    load();
    return () => { cancelled = true; };
  }, []));

  const respond = async (id, action) => {
    setActingId(id);
    try {
      const {queued} = await moderate({kind: 'mentor', label: action === 'accept' ? 'Accept department transfer' : 'Reject department transfer', method: 'POST', url: `/mentor/mentor-transfers/${id}/${action}`, body: {}, entityKey: `mentorTransfer:${id}`});
      queuedToast(queued, action === 'accept' ? 'Transfer accepted. Awaiting admin finalisation.' : 'Transfer rejected.');
      fetchData();
    } catch (e) {
      showToast(e.response?.data?.message || "Couldn't process the request.", 'error');
    } finally { setActingId(null); }
  };

  const statusColor = s => s === 'Finalised' ? colors.success
    : s === 'Accepted' ? colors.primary
    : s === 'Rejected' ? colors.error
    : colors.textMuted;

  if (loading) return <Spinner style={styles.center} />;

  return (
    <ScreenBackground style={styles.container}>
      <AppHeader home title="Dept Transfers" />
      <ScrollView
        contentContainerStyle={{padding: 16, paddingBottom: 100, flexGrow: 1}}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchData();}} tintColor={colors.primary}/>}>
        {transfers.length === 0 ? (
          <View style={styles.emptyBox}>
            <Icon name="transfer" size={44} color={colors.textMuted} />
            <Text style={styles.emptyText}>No department transfer requests.</Text>
          </View>
        ) : transfers.map(t => (
          <View key={t.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.avatarCircle}>
                <Icon name="transfer" size={20} color="#fff" />
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.cardName}>{t.fromDepartment} → {t.toDepartment}</Text>
                <Text style={styles.cardSub}>{t.status === 'Pending' ? 'Awaiting your response' : `Status: ${t.status}`}</Text>
              </View>
              <View style={[styles.statusBadge, {backgroundColor: statusColor(t.status) + '22'}]}>
                <Text style={[styles.statusText, {color: statusColor(t.status)}]}>{t.status}</Text>
              </View>
            </View>
            {t.adminNote ? <Text style={styles.note}>Note: {t.adminNote}</Text> : null}
            {t.status === 'Pending' && (
              <View style={styles.actions}>
                <TouchableOpacity id={`reject-transfer-${t.id}`} style={styles.rejectBtn} onPress={() => respond(t.id, 'reject')} disabled={actingId === t.id}>
                  <Text style={styles.rejectBtnText}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity id={`accept-transfer-${t.id}`} style={styles.acceptBtn} onPress={() => respond(t.id, 'accept')} disabled={actingId === t.id}>
                  {actingId === t.id ? <ActivityIndicator color="#fff" /> : <Text style={styles.acceptBtnText}>Accept</Text>}
                </TouchableOpacity>
              </View>
            )}
            {t.status === 'Accepted' && (
              <Text style={styles.awaiting}>Accepted. Waiting for admin to finalise the move.</Text>
            )}
          </View>
        ))}
        {transfers.length > 0 && <EndOfListMarker />}
      </ScrollView>
    </ScreenBackground>
  );
}

const makeStyles = colors => StyleSheet.create({
  container: {flex: 1},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background},
  emptyBox: {alignItems: 'center', paddingVertical: 80},
  emptyText: {color: colors.textSecondary, fontSize: 15, marginTop: 10, textAlign: 'center', paddingHorizontal: 30},
  card: {backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border},
  cardHeader: {flexDirection: 'row', alignItems: 'center'},
  avatarCircle: {width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: 12},
  cardInfo: {flex: 1},
  cardName: {color: colors.text, fontSize: 16, fontWeight: '700'},
  cardSub: {color: colors.textSecondary, fontSize: 13, marginTop: 2},
  statusBadge: {flexDirection: 'row', alignItems: 'center', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4},
  statusText: {fontSize: 11, fontWeight: '700'},
  note: {color: colors.textMuted, fontSize: 13, marginTop: 10, fontStyle: 'italic'},
  actions: {flexDirection: 'row', gap: 10, marginTop: 14},
  acceptBtn: {flex: 1, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center'},
  acceptBtnText: {color: '#fff', fontWeight: '700'},
  rejectBtn: {flex: 1, backgroundColor: colors.card, borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: colors.border},
  rejectBtnText: {color: colors.textSecondary, fontWeight: '700'},
  awaiting: {color: colors.textMuted, fontSize: 13, marginTop: 12, fontStyle: 'italic'},
});

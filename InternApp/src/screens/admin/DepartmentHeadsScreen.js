import React, {useState, useEffect} from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, Modal, TextInput, RefreshControl,
} from 'react-native';
import client from '../../api/client';
import {API_BASE_URL} from '../../config/constants';
import theme from '../../theme';

export default function DepartmentHeadsScreen() {
  const [heads, setHeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [designation, setDesignation] = useState('');
  const [signature, setSignature] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchHeads = async () => {
    try {
      const res = await client.get('/admin/department-heads');
      setHeads(res.data);
    } catch { Alert.alert('Error', 'Failed to load department heads'); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchHeads(); }, []);

  const pickSignature = async () => {
    try {
      const { pick, types } = require('@react-native-documents/picker');
      const [res] = await pick({type: [types.images]});
      const name2 = res.name || res.uri.split('/').pop() || 'signature.jpg';
      setSignature({uri: res.uri, name: name2});
    } catch (e) {
      const { isCancel } = require('@react-native-documents/picker');
      if (!isCancel(e)) Alert.alert('Error', 'Failed to pick signature image');
    }
  };

  const openCreate = () => {
    setEditing(null); setName(''); setDesignation(''); setSignature(null);
    setShowModal(true);
  };

  const openEdit = head => {
    setEditing(head); setName(head.name); setDesignation(head.designation || ''); setSignature(null);
    setShowModal(true);
  };

  const save = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Name is required');
      return;
    }
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('name', name.trim());
      formData.append('designation', designation.trim() || 'Head of Department');
      if (signature) {
        formData.append('signature', {
          uri: signature.uri,
          type: /\.png$/i.test(signature.name) ? 'image/png' : 'image/jpeg',
          name: signature.name,
        });
      }
      if (editing) {
        await client.put(`/admin/department-heads/${editing.id}`, formData, {
          headers: {'Content-Type': 'multipart/form-data'},
        });
        Alert.alert('Updated', 'Department head updated');
      } else {
        await client.post('/admin/department-heads', formData, {
          headers: {'Content-Type': 'multipart/form-data'},
        });
        Alert.alert('Created', 'Department head saved with signature');
      }
      setShowModal(false);
      fetchHeads();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const removeHead = head => {
    Alert.alert('Delete', `Delete department head "${head.name}"?`, [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await client.delete(`/admin/department-heads/${head.id}`);
          Alert.alert('Deleted', 'Department head removed');
          fetchHeads();
        } catch { Alert.alert('Error', 'Failed to delete'); }
      }},
    ]);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{paddingBottom: 100, flexGrow: 1}}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchHeads();}} tintColor={theme.colors.primary}/>}>
        <View style={styles.header}>
          <Text style={styles.title}>Department Heads</Text>
          <Text style={styles.subtitle}>Signatures are stamped on internship certificates</Text>
        </View>

        {heads.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>🖋️</Text>
            <Text style={styles.emptyText}>No department heads yet. Add one with a signature photo.</Text>
          </View>
        ) : heads.map(head => (
          <View key={head.id} style={styles.headCard}>
            <View style={styles.headRow}>
              {head.signatureImagePath ? (
                <TouchableOpacity
                  onPress={() => Alert.alert('Signature', 'Signature photo preview', [
                    {text: 'Open', onPress: () => {
                      const {Linking} = require('react-native');
                      Linking.openURL(`${API_BASE_URL.replace('/api', '')}/files/${head.signatureImagePath}`);
                    }},
                    {text: 'Close', style: 'cancel'},
                  ])}>
                  <Text style={styles.sigBadge}>🖊️ Signature saved</Text>
                </TouchableOpacity>
              ) : (
                <Text style={[styles.sigBadge, {color: theme.colors.warning}]}>⚠️ No signature yet</Text>
              )}
            </View>
            <Text style={styles.headName}>{head.name}</Text>
            <Text style={styles.headDesignation}>{head.designation}</Text>
            <View style={styles.actionRow}>
              <TouchableOpacity id={`edit-head-${head.id}`} style={styles.editBtn} onPress={() => openEdit(head)}>
                <Text style={styles.editBtnText}>✏️ Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity id={`delete-head-${head.id}`} style={styles.deleteBtn} onPress={() => removeHead(head)}>
                <Text style={styles.deleteBtnText}>🗑 Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      <TouchableOpacity id="add-head-btn" style={styles.fab} onPress={openCreate}>
        <Text style={styles.fabText}>＋ Add Department Head</Text>
      </TouchableOpacity>

      {/* Create / Edit Modal */}
      <Modal visible={showModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{editing ? 'Edit Department Head' : 'New Department Head'}</Text>
              <Text style={styles.modalSubtitle}>Name and signature appear on internship certificates</Text>

              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Full Name *</Text>
                <TextInput id="head-name" style={styles.fieldInput} placeholder="e.g. Alay Haider"
                  placeholderTextColor={theme.colors.textMuted} value={name} onChangeText={setName} />
              </View>
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Designation</Text>
                <TextInput id="head-designation" style={styles.fieldInput} placeholder="e.g. Oftg. Manager Application Development"
                  placeholderTextColor={theme.colors.textMuted} value={designation} onChangeText={setDesignation} />
              </View>

              <TouchableOpacity id="pick-signature" style={styles.pickBtn} onPress={pickSignature}>
                <Text style={styles.pickBtnText}>
                  {signature ? `✓ ${signature.name}` : '🖊️ Pick Signature Photo'}
                </Text>
              </TouchableOpacity>
              {editing && !signature && (
                <Text style={styles.modalSubtitle}>Current signature will be kept unless a new one is picked.</Text>
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity id="save-head" style={styles.createBtn} onPress={save} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>Save</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: theme.colors.background},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background},
  header: {padding: 20, paddingTop: 40},
  title: {color: theme.colors.text, fontSize: 22, fontWeight: '700'},
  subtitle: {color: theme.colors.textMuted, fontSize: 13, marginTop: 4},
  emptyBox: {alignItems: 'center', paddingVertical: 60, paddingHorizontal: 30},
  emptyIcon: {fontSize: 48, marginBottom: 12},
  emptyText: {color: theme.colors.textSecondary, fontSize: 15, textAlign: 'center'},
  headCard: {backgroundColor: theme.colors.surface, margin: 12, marginBottom: 4, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.colors.border},
  headRow: {flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8},
  sigBadge: {color: theme.colors.success, fontSize: 12, fontWeight: '600'},
  headName: {color: theme.colors.text, fontSize: 17, fontWeight: '700'},
  headDesignation: {color: theme.colors.textSecondary, fontSize: 13, marginTop: 2},
  actionRow: {flexDirection: 'row', gap: 8, marginTop: 14},
  editBtn: {flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border},
  editBtnText: {color: theme.colors.textSecondary, fontWeight: '600'},
  deleteBtn: {flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: theme.colors.error + '18'},
  deleteBtnText: {color: theme.colors.error, fontWeight: '600'},
  fab: {position: 'absolute', right: 20, bottom: 24, backgroundColor: theme.colors.primary, borderRadius: 30, paddingHorizontal: 20, paddingVertical: 14, elevation: 6, shadowColor: theme.colors.primary, shadowOpacity: 0.4, shadowRadius: 12},
  fabText: {color: '#fff', fontWeight: '700', fontSize: 14},
  modalOverlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.7)'},
  modalContent: {backgroundColor: theme.colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, marginTop: 'auto'},
  modalTitle: {color: theme.colors.text, fontSize: 18, fontWeight: '700', marginBottom: 4},
  modalSubtitle: {color: theme.colors.textMuted, fontSize: 12, marginBottom: 16, marginTop: 4},
  formField: {marginBottom: 14},
  fieldLabel: {color: theme.colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 6},
  fieldInput: {backgroundColor: theme.colors.card, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, color: theme.colors.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14},
  pickBtn: {backgroundColor: theme.colors.primary + '15', borderWidth: 1, borderColor: theme.colors.primary + '55', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginBottom: 6},
  pickBtnText: {color: theme.colors.primary, fontWeight: '600'},
  modalActions: {flexDirection: 'row', gap: 12, marginTop: 8},
  cancelBtn: {flex: 1, backgroundColor: theme.colors.card, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border},
  cancelBtnText: {color: theme.colors.textSecondary, fontWeight: '600'},
  createBtn: {flex: 1, backgroundColor: theme.colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center'},
  createBtnText: {color: '#fff', fontWeight: '700'},
});

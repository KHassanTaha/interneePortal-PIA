import React, {useCallback, useState, useMemo} from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput, RefreshControl, Switch,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import client from '../../api/client';
import {showToast} from '../../components/AppToast';
import {moderate, queuedToast} from '../../api/moderate';
import {useAppTheme} from '../../theme';
import ScreenBackground from '../../components/ScreenBackground';
import AppHeader from '../../components/AppHeader';
import Dropdown from '../../components/Dropdown';
import FilterChips from '../../components/FilterChips';
import Icon from '../../components/Icon';
import Spinner from '../../components/Spinner';
import PasswordInput from '../../components/PasswordInput';
import EndOfListMarker from '../../components/EndOfListMarker';
import SwipeableModal from '../../components/SwipeableModal';

export default function MentorManagementScreen({navigation}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [mentors, setMentors] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selectedDept, setSelectedDept] = useState(null);
  const [signatoryOnly, setSignatoryOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState({username:'', password:'', fullName:'', designation:'', departmentId:''});
  const [creating, setCreating] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [detailTarget, setDetailTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({fullName:'', designation:'', departmentId:'', phone:'', email:''});
  const [editActive, setEditActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createSignatory, setCreateSignatory] = useState(false);
  const [createSignature, setCreateSignature] = useState(null);
  const [editSignatory, setEditSignatory] = useState(false);
  const [editSignature, setEditSignature] = useState(null);
  const [transferTarget, setTransferTarget] = useState(null);
  const [transferDeptId, setTransferDeptId] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [transfers, setTransfers] = useState([]);
  const [showTransfersModal, setShowTransfersModal] = useState(false);
  const [loadingTransfers, setLoadingTransfers] = useState(false);

  const deptOptions = useMemo(
    () => departments.map(d => ({value: String(d.id), label: d.name})),
    [departments]
  );

  const fetchMentorData = useCallback(async () => {
    try {
      const [mentorsRes, deptsRes] = await Promise.all([
        client.get(selectedDept ? `/admin/mentors?departmentId=${selectedDept}` : '/admin/mentors'),
        client.get('/admin/departments'),
      ]);
      setMentors(mentorsRes.data);
      setDepartments(deptsRes.data);
    } catch {
      showToast("Couldn't load mentors. Check your connection and pull to refresh.", 'error');
    } finally { setLoading(false); setRefreshing(false); }
  }, [selectedDept]);

  useFocusEffect(
    useCallback(() => {
      fetchMentorData();
      return () => { setQuery(''); };
    }, [fetchMentorData])
  );

  const createMentor = async () => {
    if (!form.fullName.trim()) { showToast('Full name is required.', 'error'); return; }
    if (!form.designation.trim()) { showToast('Designation is required.', 'error'); return; }
    if (!form.password || form.password.length < 6) { showToast('Password must be at least 6 characters.', 'error'); return; }
    if (!form.departmentId) { showToast('Department is required.', 'error'); return; }
    if (createSignatory && !createSignature) { showToast('A signature image is required to make this mentor a signatory.', 'error'); return; }
    setCreating(true);
    try {
      const body = {
        username: form.username.trim(),
        password: form.password,
        fullName: form.fullName.trim(),
        designation: form.designation.trim(),
        departmentId: Number(form.departmentId),
      };
      let queued = false;
      if (createSignatory && createSignature) {
        const res = await client.post('/admin/mentors', body);
        const mentorId = res.data.mentorId;
        const fd = new FormData();
        fd.append('signature', {uri: createSignature.uri, type: /\.png$/i.test(createSignature.name) ? 'image/png' : 'image/jpeg', name: createSignature.name});
        await client.post(`/admin/mentors/${mentorId}/signatory`, fd, {headers: {'Content-Type': 'multipart/form-data'}});
      } else {
        ({queued} = await moderate({kind: 'admin', label: 'Create mentor account', method: 'POST', url: '/admin/mentors', body}));
      }
      queuedToast(queued, 'Mentor account created.');
      setShowCreateModal(false);
      setForm({username:'', password:'', fullName:'', designation:'', departmentId:''});
      setCreateSignatory(false); setCreateSignature(null);
      fetchMentorData();
    } catch (e) {
      showToast(e.response?.data?.message || "Couldn't create the mentor. Try again.", 'error');
    } finally { setCreating(false); }
  };

  const openEdit = m => {
    setEditTarget(m);
    setEditForm({fullName: m.fullName, designation: m.designation || '', phone: m.phone || '', email: m.email || ''});
    setEditActive(m.isActive);
    setEditSignatory(m.isSignatory);
    setEditSignature(null);
  };

  const saveMentor = async () => {
    if (!editTarget) return;
    if (!editForm.fullName.trim()) { showToast('Full name is required.', 'error'); return; }
    if (!editForm.designation.trim()) { showToast('Designation is required.', 'error'); return; }
    setSaving(true);
    try {
      await client.put(`/admin/mentors/${editTarget.id}`, {
        fullName: editForm.fullName.trim(),
        designation: editForm.designation.trim(),
        isActive: editActive,
        phone: editForm.phone.trim(),
        email: editForm.email.trim(),
      });
      const wasSignatory = editTarget.isSignatory;
      if (editSignatory && !wasSignatory) {
        if (!editSignature) { showToast('A signature image is required to make this mentor a signatory.', 'error'); setSaving(false); return; }
        const fd = new FormData();
        fd.append('signature', {uri: editSignature.uri, type: /\.png$/i.test(editSignature.name) ? 'image/png' : 'image/jpeg', name: editSignature.name});
        await client.post(`/admin/mentors/${editTarget.id}/signatory`, fd, {headers: {'Content-Type': 'multipart/form-data'}});
      } else if (editSignatory && wasSignatory && editSignature) {
        const fd = new FormData();
        fd.append('signature', {uri: editSignature.uri, type: /\.png$/i.test(editSignature.name) ? 'image/png' : 'image/jpeg', name: editSignature.name});
        await client.put(`/admin/mentors/${editTarget.id}/signatory`, fd, {headers: {'Content-Type': 'multipart/form-data'}});
      } else if (!editSignatory && wasSignatory) {
        await client.delete(`/admin/mentors/${editTarget.id}/signatory`);
      }
      showToast('Mentor updated.', 'success');
      setEditTarget(null);
      setDetailTarget(null);
      setEditSignatory(false); setEditSignature(null);
      fetchMentorData();
    } catch (e) {
      showToast(e.response?.data?.message || "Couldn't update the mentor. Try again.", 'error');
    } finally { setSaving(false); }
  };

  const pickSignature = async (setter) => {
    try {
      const { pick, types } = require('@react-native-documents/picker');
      const [res] = await pick({type: [types.images]});
      const name = res.name || res.uri.split('/').pop() || 'signature.jpg';
      setter({uri: res.uri, name});
    } catch (e) {
      const { isErrorWithCode, errorCodes } = require('@react-native-documents/picker');
      if (!(isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED)) showToast("Couldn't pick the signature image. Try again.", 'error');
    }
  };

  const openTransfer = m => {
    setTransferTarget(m);
    setTransferDeptId('');
    setTransferNote('');
  };

  const submitTransfer = async () => {
    if (!transferTarget) return;
    if (!transferDeptId) { showToast('Select a target department.', 'error'); return; }
    if (Number(transferDeptId) === transferTarget.departmentId) { showToast('Mentor is already in that department.', 'error'); return; }
    setTransferring(true);
    try {
      await client.post(`/admin/mentors/${transferTarget.id}/transfer`, {toDepartmentId: Number(transferDeptId), adminNote: transferNote});
      showToast('Transfer request sent to the mentor.', 'success');
      setTransferTarget(null);
    } catch (e) {
      showToast(e.response?.data?.message || "Couldn't initiate the transfer. Try again.", 'error');
    } finally { setTransferring(false); }
  };

  const openTransfers = async () => {
    setShowTransfersModal(true);
    setLoadingTransfers(true);
    try {
      const res = await client.get('/admin/transfers');
      setTransfers(res.data);
    } catch { showToast("Couldn't load transfer requests.", 'error'); }
    finally { setLoadingTransfers(false); }
  };

  const finaliseTransfer = async (t) => {
    try {
      await client.post(`/admin/mentors/${t.mentorId}/transfer/${t.id}/finalise`);
      showToast('Transfer finalised. Mentor moved to new department.', 'success');
      openTransfers();
    } catch (e) {
      showToast(e.response?.data?.message || "Couldn't finalise. Try again.", 'error');
    }
  };

  const resetPassword = async () => {
    if (!resetTarget) return;
    if (!newPassword || newPassword.length < 6) { showToast('Password must be at least 6 characters.', 'error'); return; }
    setResetting(true);
    try {
      await client.patch(`/admin/mentors/${resetTarget.id}/reset-password`, {newPassword});
      showToast('Password reset.', 'success');
      setResetTarget(null);
      setNewPassword('');
    } catch { showToast("Couldn't reset the password. Try again.", 'error'); }
    finally { setResetting(false); }
  };

  if (loading) return <Spinner style={styles.center} />;

  const q = query.trim().toLowerCase();
  const base = signatoryOnly ? mentors.filter(m => m.isSignatory) : mentors;
  const visible = q
    ? base.filter(m => m.fullName.toLowerCase().includes(q) || m.username.toLowerCase().includes(q))
    : base;

  return (
    <ScreenBackground style={styles.container}>
      <AppHeader
        home
        hideTitle
        title="Mentors"
        right={(
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
            <TouchableOpacity id="transfers-btn" style={[styles.addBtn, {backgroundColor: 'rgba(255,255,255,0.12)'}]} onPress={openTransfers}>
              <Icon name="transfer" size={14} color="#fff" />
              <Text style={styles.addBtnText}>Transfers</Text>
            </TouchableOpacity>
            <TouchableOpacity id="create-mentor-btn" style={styles.addBtn} onPress={() => setShowCreateModal(true)}>
              <Icon name="userPlus" size={15} color="#fff" />
              <Text style={styles.addBtnText}>Add Mentor</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      <ScrollView
        contentContainerStyle={{paddingBottom: 100, flexGrow: 1}}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchMentorData();}} tintColor={colors.primary}/>}>
        <View style={styles.searchRow}>
          <Icon name="search" size={18} color={colors.textMuted} />
          <TextInput
            id="mentors-search"
            style={styles.searchInput}
            placeholder="Search by name or username"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity id="mentors-search-clear" onPress={() => setQuery('')} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Icon name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.filterRow}>
          <Dropdown
            compact
            searchable
            clearable
            onClear={() => setSelectedDept(null)}
            placeholder="Department"
            value={selectedDept}
            onChange={setSelectedDept}
            options={[{value: null, label: 'All Departments'}, ...deptOptions]}
          />
        </View>

        <FilterChips compact options={[{key: 'all', label: 'All'}, {key: 'sign', label: 'Signatories'}]} value={signatoryOnly ? 'sign' : 'all'} onChange={v => setSignatoryOnly(v === 'sign')} idPrefix="mentor-filter" />

        {visible.length === 0 ? (
          <View style={styles.emptyBox}>
            <Icon name="search" size={44} color={colors.textMuted} />
            <Text style={styles.emptyText}>No mentors {q ? `match '${query.trim()}'` : 'found'}</Text>
          </View>
        ) : visible.map(m => (
          <TouchableOpacity key={m.id} id={`mentor-card-${m.id}`} style={styles.card} onPress={() => setDetailTarget(m)}>
            <View style={styles.cardHeader}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>{m.fullName[0]}</Text>
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.cardName}>{m.fullName}</Text>
                <Text style={styles.cardSub}>{m.designation || 'Mentor'} • {m.department}</Text>
                <Text style={styles.cardUsername}>@{m.username}</Text>
                {m.isSignatory && (
                  <View style={[styles.statusBadge, {backgroundColor: colors.accent + '22', marginTop: 6}]}>
                    <Icon name="signature" size={11} color={colors.textAccentAlt} />
                    <Text style={[styles.statusText, {color: colors.textAccentAlt}]}>Signatory</Text>
                  </View>
                )}
              </View>
              <View style={[styles.statusBadge, {backgroundColor: m.isActive ? colors.success + '22' : colors.error + '22'}]}>
                <Text style={[styles.statusText, {color: m.isActive ? colors.success : colors.error}]}>
                  {m.isActive ? 'Active' : 'Inactive'}
                </Text>
              </View>
            </View>
            <View style={styles.cardFooter}>
              <View style={styles.statItem}>
                <Icon name="users" size={14} color={colors.textSecondary} />
                <Text style={styles.cardStat}>{m.internCount} Interns</Text>
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity
                  id={`edit-mentor-${m.id}`}
                  style={styles.editBtn}
                  onPress={() => openEdit(m)}>
                  <Icon name="pencil" size={13} color={colors.textAccent} />
                  <Text style={styles.editBtnText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  id={`reset-pwd-mentor-${m.id}`}
                  style={styles.resetBtn}
                  onPress={() => { setResetTarget(m); setNewPassword(''); }}>
                  <Text style={styles.resetBtnText}>Reset Password</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        ))}
        {visible.length > 0 && <EndOfListMarker />}
      </ScrollView>

      {/* Create Mentor Modal */}
      <SwipeableModal visible={showCreateModal} transparent overlayStyle={styles.modalOverlay} sheetStyle={styles.modalContent} onRequestClose={() => setShowCreateModal(false)}>
            <Text style={styles.modalTitle}>Create Mentor Account</Text>
            {[
              {key: 'fullName', label: 'Full Name', placeholder: 'John Doe'},
              {key: 'designation', label: 'Designation', placeholder: 'Senior Developer'},
              {key: 'username', label: 'Username', placeholder: 'mentor_john', optional: true, hint: 'Auto-generated if blank'},
              {key: 'password', label: 'Password', placeholder: '••••••••', secure: true},
            ].map(f => (
              <View key={f.key} style={styles.modalField}>
                <Text style={styles.fieldLabel}>{f.label}{f.optional ? '' : ' *'}</Text>
                {f.secure ? (
                  <PasswordInput
                    id={`create-mentor-${f.key}`}
                    style={styles.fieldInput}
                    placeholder={f.placeholder}
                    placeholderTextColor={colors.textMuted}
                    value={form[f.key]}
                    onChangeText={v => setForm(p => ({...p, [f.key]: v}))}
                  />
                ) : (
                  <TextInput
                    id={`create-mentor-${f.key}`}
                    style={styles.fieldInput}
                    placeholder={f.placeholder}
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    value={form[f.key]}
                    onChangeText={v => setForm(p => ({...p, [f.key]: v}))}
                  />
                )}
                {f.hint && <Text style={styles.fieldHint}>{f.hint}</Text>}
              </View>
            ))}

            <View style={{marginTop: 14}}>
              <Dropdown
                label="Department *"
                inline
                value={form.departmentId || null}
                onChange={v => setForm(p => ({...p, departmentId: v}))}
                options={deptOptions}
                placeholder="Select department"
              />
            </View>

            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleLabel}>Promote to Department Head</Text>
                <Text style={styles.toggleHelper}>Creates a signatory entry for this mentor</Text>
              </View>
              <Switch
                id="create-mentor-signatory-toggle"
                value={createSignatory}
                onValueChange={setCreateSignatory}
                trackColor={{true: colors.primary, false: colors.border}}
                thumbColor="#fff"
              />
            </View>
            {createSignatory && (
              <View style={styles.signatureSection}>
                <Text style={styles.toggleLabel}>Signature</Text>
                <TouchableOpacity id="pick-create-signature" style={styles.pickBtn} onPress={() => pickSignature(setCreateSignature)}>
                  <Icon name="signature" size={16} color={colors.textAccent} />
                  <Text style={styles.pickBtnText}>{createSignature ? createSignature.name : 'Pick Signature Photo'}</Text>
                </TouchableOpacity>
                {!createSignature && <Text style={styles.modalSubtitle}>A signature image is required to make this mentor a signatory.</Text>}
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCreateModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity id="create-mentor-submit" style={styles.createBtn} onPress={createMentor} disabled={creating}>
                {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>Create</Text>}
              </TouchableOpacity>
            </View>
      </SwipeableModal>

      {/* Mentor Detail Modal */}
      <SwipeableModal visible={!!detailTarget} transparent overlayStyle={styles.modalOverlay} sheetStyle={styles.modalContent} onRequestClose={() => setDetailTarget(null)}>
            <View style={styles.detailHeader}>
              <View style={[styles.statusBadge, {backgroundColor: detailTarget?.isActive ? colors.success + '22' : colors.error + '22'}]}>
                <Text style={[styles.statusText, {color: detailTarget?.isActive ? colors.success : colors.error}]}>
                  {detailTarget?.isActive ? 'Active' : 'Inactive'}
                </Text>
              </View>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setDetailTarget(null)}>
                <Icon name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.detailAvatar}>
              <Text style={styles.detailAvatarText}>{detailTarget?.fullName?.[0]}</Text>
            </View>
            <Text style={styles.detailName}>{detailTarget?.fullName}</Text>
            <Text style={styles.detailUsername}>@{detailTarget?.username}</Text>
            {[
              {label: 'Designation', value: detailTarget?.designation || '—'},
              {label: 'Department', value: detailTarget?.department || '—'},
              {label: 'Phone', value: detailTarget?.phone || '—'},
              {label: 'Email', value: detailTarget?.email || '—'},
              {label: 'Interns Assigned', value: String(detailTarget?.internCount ?? 0)},
              {label: 'Joined', value: detailTarget?.createdAt ? new Date(detailTarget.createdAt).toLocaleDateString() : '—'},
              {label: 'Signatory', value: detailTarget?.isSignatory ? 'Yes' : 'No'},
             ].map(row => (
              <View key={row.label} style={styles.detailRow}>
                <Text style={styles.detailLabel}>{row.label}</Text>
                <Text style={styles.detailValue}>{row.value}</Text>
              </View>
            ))}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setDetailTarget(null)}>
                <Text style={styles.cancelBtnText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity id="mentor-detail-edit" style={styles.createBtn} onPress={() => { setDetailTarget(null); openEdit(detailTarget); }}>
                <Text style={styles.createBtnText}>Edit Details</Text>
              </TouchableOpacity>
            </View>
      </SwipeableModal>

      {/* Edit Mentor Modal */}
      <SwipeableModal visible={!!editTarget} transparent overlayStyle={styles.modalOverlay} sheetStyle={styles.modalContent} onRequestClose={() => setEditTarget(null)}>
            <Text style={styles.modalTitle}>Edit Mentor</Text>
            <Text style={styles.resetSubtitle}>{editTarget?.fullName} (@{editTarget?.username})</Text>
            <View style={styles.modalField}>
              <Text style={styles.fieldLabel}>Full Name *</Text>
              <TextInput
                id="edit-mentor-fullname"
                style={styles.fieldInput}
                placeholder="John Doe"
                placeholderTextColor={colors.textMuted}
                value={editForm.fullName}
                onChangeText={v => setEditForm(p => ({...p, fullName: v}))}
              />
            </View>
            <View style={styles.modalField}>
              <Text style={styles.fieldLabel}>Designation *</Text>
              <TextInput
                id="edit-mentor-designation"
                style={styles.fieldInput}
                placeholder="Senior Developer"
                placeholderTextColor={colors.textMuted}
                value={editForm.designation}
                onChangeText={v => setEditForm(p => ({...p, designation: v}))}
              />
            </View>
            <View style={styles.modalField}>
              <Text style={styles.fieldLabel}>Department</Text>
              <TouchableOpacity id="request-transfer-btn" style={styles.transferBtn} onPress={() => openTransfer(editTarget)}>
                <Icon name="transfer" size={15} color={colors.textAccent} />
                <Text style={styles.transferBtnText}>Request Department Transfer</Text>
              </TouchableOpacity>
              <Text style={styles.modalSubtitle}>Current: {editTarget?.department}</Text>
            </View>
            <View style={styles.modalField}>
              <Text style={styles.fieldLabel}>Phone</Text>
              <TextInput
                id="edit-mentor-phone"
                style={styles.fieldInput}
                placeholder="+92 300 0000000"
                placeholderTextColor={colors.textMuted}
                value={editForm.phone}
                onChangeText={v => setEditForm(p => ({...p, phone: v}))}
              />
            </View>
            <View style={styles.modalField}>
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                id="edit-mentor-email"
                style={styles.fieldInput}
                placeholder="mentor@pia.edu.pk"
                placeholderTextColor={colors.textMuted}
                value={editForm.email}
                autoCapitalize="none"
                keyboardType="email-address"
                onChangeText={v => setEditForm(p => ({...p, email: v}))}
              />
            </View>
            <Text style={[styles.fieldLabel, {marginTop: 14}]}>Account Status</Text>
            <View style={styles.segRow}>
              <TouchableOpacity style={[styles.seg, editActive && styles.segActive]} onPress={() => setEditActive(true)}>
                <Icon name="check" size={14} color={editActive ? colors.success : colors.textMuted} />
                <Text style={[styles.segText, editActive && styles.segTextActive]}>Active</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.seg, !editActive && styles.segInactive]} onPress={() => setEditActive(false)}>
                <Icon name="close" size={14} color={!editActive ? colors.error : colors.textMuted} />
                <Text style={[styles.segText, !editActive && styles.segTextInactive]}>Inactive</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleLabel}>Department Head / Signatory</Text>
                <Text style={styles.toggleHelper}>{editTarget?.isSignatory ? 'This mentor is a signatory' : 'Make this mentor a signatory'}</Text>
              </View>
              <Switch
                id="edit-mentor-signatory-toggle"
                value={editSignatory}
                onValueChange={setEditSignatory}
                trackColor={{true: colors.primary, false: colors.border}}
                thumbColor="#fff"
              />
            </View>
            {editSignatory && (
              <View style={styles.signatureSection}>
                <Text style={styles.toggleLabel}>Signature</Text>
                <TouchableOpacity id="pick-edit-signature" style={styles.pickBtn} onPress={() => pickSignature(setEditSignature)}>
                  <Icon name="signature" size={16} color={colors.textAccent} />
                  <Text style={styles.pickBtnText}>{editSignature ? editSignature.name : (editTarget?.isSignatory ? 'Pick New Signature (replaces current)' : 'Pick Signature Photo')}</Text>
                </TouchableOpacity>
                {editSignatory && !editTarget?.isSignatory && !editSignature && <Text style={styles.modalSubtitle}>A signature image is required to make this mentor a signatory.</Text>}
                {!editSignatory && editTarget?.isSignatory && <Text style={styles.modalSubtitle}>Turning this off will remove the signatory entry.</Text>}
              </View>
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditTarget(null)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity id="edit-mentor-submit" style={styles.createBtn} onPress={saveMentor} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>Save</Text>}
              </TouchableOpacity>
            </View>
      </SwipeableModal>

      {/* Reset Password Modal */}
      <SwipeableModal visible={!!resetTarget} transparent overlayStyle={styles.modalOverlay} sheetStyle={styles.modalContent} onRequestClose={() => setResetTarget(null)}>
            <Text style={styles.modalTitle}>Reset Password</Text>
            <Text style={styles.resetSubtitle}>Set a new password for {resetTarget?.fullName} (@{resetTarget?.username})</Text>
            <Text style={styles.fieldLabel}>New Password</Text>
            <PasswordInput
              id="reset-pwd-input"
              style={styles.fieldInput}
              placeholder="Minimum 6 characters"
              placeholderTextColor={colors.textMuted}
              autoFocus
              value={newPassword}
              onChangeText={setNewPassword}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setResetTarget(null)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity id="reset-pwd-submit" style={styles.createBtn} onPress={resetPassword} disabled={resetting}>
                {resetting ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>Reset</Text>}
              </TouchableOpacity>
            </View>
      </SwipeableModal>

      {/* Transfer Request Modal */}
      <SwipeableModal visible={!!transferTarget} transparent overlayStyle={styles.modalOverlay} sheetStyle={styles.modalContent} onRequestClose={() => setTransferTarget(null)}>
            <Text style={styles.modalTitle}>Request Department Transfer</Text>
            <Text style={styles.resetSubtitle}>{transferTarget?.fullName} (@{transferTarget?.username})</Text>
            <Text style={styles.modalSubtitle}>Current department: {transferTarget?.department}</Text>
            <View style={{marginTop: 8, marginBottom: 12}}>
              <Dropdown
                label="Target Department"
                inline
                value={transferDeptId || null}
                onChange={setTransferDeptId}
                options={deptOptions}
                placeholder="Select target department"
              />
            </View>
            <Text style={styles.fieldLabel}>Note (optional)</Text>
            <TextInput
              style={[styles.fieldInput, {height: 80, textAlignVertical: 'top'}]}
              placeholder="Add a note for the mentor"
              placeholderTextColor={colors.textMuted}
              value={transferNote}
              onChangeText={setTransferNote}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setTransferTarget(null)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity id="submit-transfer" style={styles.createBtn} onPress={submitTransfer} disabled={transferring}>
                {transferring ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>Send Request</Text>}
              </TouchableOpacity>
            </View>
      </SwipeableModal>

      {/* Transfers Modal */}
      <SwipeableModal visible={showTransfersModal} transparent overlayStyle={styles.modalOverlay} sheetStyle={styles.modalContent} scrollable={false} onRequestClose={() => setShowTransfersModal(false)}>
            <Text style={styles.modalTitle}>Department Transfers</Text>
            <Text style={styles.modalSubtitle}>Mentors must accept a transfer before it can be finalised.</Text>
            {loadingTransfers ? (
              <ActivityIndicator color={colors.textAccent} style={{marginVertical: 30}} />
            ) : transfers.length === 0 ? (
              <View style={styles.emptyBox}><Text style={styles.emptyText}>No transfer requests.</Text></View>
            ) : (
              <ScrollView style={{maxHeight: 440}}>
                {transfers.map(t => (
                  <View key={t.id} style={styles.transferCard}>
                    <View style={{flex: 1}}>
                      <Text style={styles.cardName}>{t.mentorName}</Text>
                      <Text style={styles.cardSub}>{t.fromDepartment} → {t.toDepartment}</Text>
                      <View style={[styles.statusBadge, {alignSelf: 'flex-start', marginTop: 6, backgroundColor: t.status === 'Finalised' ? colors.success + '22' : t.status === 'Accepted' ? colors.primary + '22' : t.status === 'Rejected' ? colors.error + '22' : colors.textMuted + '22'}]}>
                        <Text style={[styles.statusText, {color: t.status === 'Finalised' ? colors.success : t.status === 'Accepted' ? colors.primary : t.status === 'Rejected' ? colors.error : colors.textMuted}]}>{t.status}</Text>
                      </View>
                    </View>
                    {t.status === 'Accepted' && (
                      <TouchableOpacity id={`finalise-transfer-${t.id}`} style={styles.createBtn} onPress={() => finaliseTransfer(t)}>
                        <Text style={styles.createBtnText}>Finalise</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </ScrollView>
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowTransfersModal(false)}>
                <Text style={styles.cancelBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
      </SwipeableModal>
    </ScreenBackground>
  );
}

const makeStyles = colors => StyleSheet.create({
  container: {flex: 1},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background},
  addBtn: {flexDirection:'row', alignItems:'center', gap:6, backgroundColor:'rgba(255,255,255,0.18)', borderWidth:1, borderColor:'rgba(255,255,255,0.35)', borderRadius:20, paddingHorizontal:14, paddingVertical:9},
  addBtnText: {color:'#fff', fontWeight:'700', fontSize:13},
  searchRow:{flexDirection:'row', alignItems:'center', gap:8, marginHorizontal:16, marginTop:12, marginBottom:8, backgroundColor:colors.card, borderRadius:12, borderWidth:1, borderColor:colors.border, paddingHorizontal:12, paddingVertical:10},
  searchInput:{flex:1, color:colors.text, fontSize:14, padding:0},
  filterRow:{flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:16, marginBottom:8, gap:10},
  emptyBox:{alignItems:'center', paddingVertical:60},
  emptyText:{color:colors.textSecondary, fontSize:15, marginTop:10},
  card: {backgroundColor:colors.surface, marginHorizontal:16, marginBottom:12, borderRadius:16, padding:16, borderWidth:1, borderColor:colors.border},
  cardHeader: {flexDirection:'row', alignItems:'center', marginBottom:12},
  avatarCircle: {width:48, height:48, borderRadius:24, backgroundColor:colors.primary, justifyContent:'center', alignItems:'center', marginRight:12},
  avatarText: {color:'#fff', fontSize:20, fontWeight:'700'},
  cardInfo: {flex:1},
  cardName: {color:colors.text, fontSize:16, fontWeight:'700'},
  cardSub: {color:colors.textSecondary, fontSize:13, marginTop:2},
  cardUsername: {color:colors.textMuted, fontSize:12},
  statusBadge: {flexDirection:'row', alignItems:'center', gap:4, borderRadius:8, paddingHorizontal:8, paddingVertical:4},
  statusText: {fontSize:11, fontWeight:'700'},
  cardFooter: {flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingTop:12, borderTopWidth:1, borderTopColor:colors.border},
  cardActions: {flexDirection:'row', gap:8},
  statItem: {flexDirection:'row', alignItems:'center', gap:5},
  cardStat: {color:colors.textSecondary, fontSize:13},
  editBtn: {flexDirection:'row', alignItems:'center', gap:4, borderRadius:8, paddingHorizontal:12, paddingVertical:6, borderWidth:1, borderColor:colors.primary},
  editBtnText: {color:colors.textAccent, fontSize:12, fontWeight:'600'},
  resetBtn: {borderRadius:8, paddingHorizontal:12, paddingVertical:6, borderWidth:1, borderColor:colors.warning},
  resetBtnText: {color:colors.warning, fontSize:12, fontWeight:'600'},
  resetSubtitle: {color:colors.textMuted, fontSize:13, marginBottom:14},
  // Modal
  modalOverlay: {flex:1, backgroundColor:'rgba(0,0,0,0.7)', justifyContent:'flex-end'},
  modalContent: {backgroundColor:colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, padding:24, maxHeight:'85%'},
  modalTitle: {color:colors.text, fontSize:18, fontWeight:'700', marginBottom:20},
  modalField: {marginBottom:12},
  fieldLabel: {color:colors.textSecondary, fontSize:12, fontWeight:'600', marginBottom:6},
  fieldHint: {color:colors.textMuted, fontSize:11, marginTop:4},
  fieldInput: {backgroundColor:colors.card, borderRadius:10, borderWidth:1, borderColor:colors.border, color:colors.text, paddingHorizontal:14, paddingVertical:12, fontSize:14},
  // Detail modal
  detailHeader: {flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:12},
  closeBtn: {padding:4},
  detailAvatar: {width:64, height:64, borderRadius:32, backgroundColor:colors.primary, justifyContent:'center', alignItems:'center', alignSelf:'center', marginBottom:10},
  detailAvatarText: {color:'#fff', fontSize:26, fontWeight:'700'},
  detailName: {color:colors.text, fontSize:18, fontWeight:'700', textAlign:'center'},
  detailUsername: {color:colors.textMuted, fontSize:13, textAlign:'center', marginBottom:16},
  detailRow: {flexDirection:'row', justifyContent:'space-between', paddingVertical:10, borderTopWidth:1, borderTopColor:colors.border},
  detailLabel: {color:colors.textSecondary, fontSize:13},
  detailValue: {color:colors.text, fontSize:13, fontWeight:'600'},
  // Status toggle
  segRow: {flexDirection:'row', gap:10},
  seg: {flex:1, flexDirection:'row', justifyContent:'center', alignItems:'center', gap:6, paddingVertical:12, borderRadius:10, borderWidth:1, borderColor:colors.border, backgroundColor:colors.card},
  segActive: {borderColor:colors.success, backgroundColor:colors.success + '22'},
  segInactive: {borderColor:colors.error, backgroundColor:colors.error + '22'},
  segText: {color:colors.textSecondary, fontWeight:'600', fontSize:13},
  segTextActive: {color:colors.success, fontWeight:'700'},
  segTextInactive: {color:colors.error, fontWeight:'700'},
  modalActions: {flexDirection:'row', gap:12, marginTop:8},
  cancelBtn: {flex:1, backgroundColor:colors.card, borderRadius:12, paddingVertical:14, alignItems:'center', borderWidth:1, borderColor:colors.border},
  cancelBtnText: {color:colors.textSecondary, fontWeight:'600'},
  createBtn: {flex:1, backgroundColor:colors.primary, borderRadius:12, paddingVertical:14, alignItems:'center'},
  createBtnText: {color:'#fff', fontWeight:'700'},
  modalSubtitle: {color:colors.textMuted, fontSize:13, marginBottom:14},
  toggleRow: {flexDirection:'row', alignItems:'center', justifyContent:'space-between', backgroundColor:colors.card, borderRadius:12, borderWidth:1, borderColor:colors.border, padding:14, marginBottom:14, marginTop:8},
  toggleInfo: {flex:1, marginRight:10},
  toggleLabel: {color:colors.text, fontSize:14, fontWeight:'700'},
  toggleHelper: {color:colors.textMuted, fontSize:12, marginTop:2},
  signatureSection: {marginBottom:10},
  pickBtn: {flexDirection:'row', alignItems:'center', gap:8, borderRadius:10, borderWidth:1, borderColor:colors.primary, paddingHorizontal:14, paddingVertical:12, marginTop:6},
  pickBtnText: {color:colors.textAccent, fontSize:13, fontWeight:'600'},
  transferBtn: {flexDirection:'row', alignItems:'center', gap:8, borderRadius:10, borderWidth:1, borderColor:colors.primary, paddingHorizontal:14, paddingVertical:12},
  transferBtnText: {color:colors.textAccent, fontSize:13, fontWeight:'700'},
  transferCard: {flexDirection:'row', alignItems:'center', gap:12, backgroundColor:colors.surface, borderRadius:12, borderWidth:1, borderColor:colors.border, padding:14, marginBottom:10},
});
import React, {useCallback, useState, useMemo} from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, TextInput, RefreshControl, Switch,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import client from '../../api/client';
import {showToast} from '../../components/AppToast';
import {showConfirm} from '../../components/AppConfirm';
import {moderate, queuedToast} from '../../api/moderate';
import {useAppTheme} from '../../theme';
import ScreenBackground from '../../components/ScreenBackground';
import AppHeader from '../../components/AppHeader';
import Icon from '../../components/Icon';
import Spinner from '../../components/Spinner';
import Dropdown from '../../components/Dropdown';
import PasswordInput from '../../components/PasswordInput';
import EndOfListMarker from '../../components/EndOfListMarker';
import SwipeableModal from '../../components/SwipeableModal';

export default function DepartmentsScreen({navigation}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [departments, setDepartments] = useState([]);
  const [heads, setHeads] = useState([]);
  const [mentors, setMentors] = useState([]);
  const [query, setQuery] = useState('');
  const [expandedHeads, setExpandedHeads] = useState({});
  const [expandedMentors, setExpandedMentors] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [deptModal, setDeptModal] = useState(false);
  const [editingDept, setEditingDept] = useState(null);
  const [deptName, setDeptName] = useState('');
  const [deptCode, setDeptCode] = useState('');
  const [deptAddress, setDeptAddress] = useState('');
  const [deptLat, setDeptLat] = useState('');
  const [deptLng, setDeptLng] = useState('');
  const [savingDept, setSavingDept] = useState(false);
  const [detailDept, setDetailDept] = useState(null);

  const [headModal, setHeadModal] = useState(false);
  const [headDeptId, setHeadDeptId] = useState(null);
  const [editingHead, setEditingHead] = useState(null);
  const [headName, setHeadName] = useState('');
  const [headDesignation, setHeadDesignation] = useState('');
  const [signature, setSignature] = useState(null);
  const [savingHead, setSavingHead] = useState(false);
  const [mentorSignature, setMentorSignature] = useState(null);

  const [mentorModal, setMentorModal] = useState(false);
  const [editingMentor, setEditingMentor] = useState(null);
  const [mentorDeptId, setMentorDeptId] = useState(null);
  const [mentorForm, setMentorForm] = useState({fullName: '', designation: '', username: '', password: ''});
  const [mentorActive, setMentorActive] = useState(true);
  const [mentorSignatory, setMentorSignatory] = useState(false);
  const [savingMentor, setSavingMentor] = useState(false);

  const fetchDeptData = async () => {
    try {
      const [deptsRes, headsRes, mentorsRes] = await Promise.all([
        client.get('/admin/departments'),
        client.get('/admin/department-heads'),
        client.get('/admin/mentors'),
      ]);
      setDepartments(deptsRes.data);
      setHeads(headsRes.data);
      setMentors(mentorsRes.data);
    } catch { showToast("Couldn't load departments. Check your connection and try again.", 'error'); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const fetchData = async () => {
        try {
          const [deptsRes, headsRes, mentorsRes] = await Promise.all([
            client.get('/admin/departments'),
            client.get('/admin/department-heads'),
            client.get('/admin/mentors'),
          ]);
          if (!cancelled) {
            setDepartments(deptsRes.data);
            setHeads(headsRes.data);
            setMentors(mentorsRes.data);
          }
        } catch { if (!cancelled) showToast("Couldn't load departments. Check your connection and try again.", 'error'); }
        finally { if (!cancelled) { setLoading(false); setRefreshing(false); } }
      };
      fetchDeptData();
      return () => { cancelled = true; setQuery(''); };
    }, [])
  );

  const headsOf = deptId => heads.filter(h => h.departmentId === deptId);
  const mentorsOf = deptId => mentors.filter(m => m.departmentId === deptId);

  const toggleHeads = deptId => setExpandedHeads(p => ({...p, [deptId]: !p[deptId]}));
  const toggleMentors = deptId => setExpandedMentors(p => ({...p, [deptId]: !p[deptId]}));

  const openCreateMentor = dept => {
    setEditingMentor(null);
    setMentorDeptId(dept.id);
    setMentorForm({fullName: '', designation: '', username: '', password: ''});
    setMentorActive(true);
    setMentorModal(true);
  };

  const openEditMentor = (dept, mentor) => {
    setEditingMentor(mentor);
    setMentorDeptId(dept.id);
    setMentorForm({fullName: mentor.fullName, designation: mentor.designation || '', username: mentor.username, password: ''});
    setMentorActive(mentor.isActive);
    setMentorSignatory(heads.some(h => h.mentorId === mentor.id));
    setMentorSignature(null);
    setMentorModal(true);
  };

  const createMentor = async () => {
    if (!mentorForm.fullName.trim()) { showToast('Full name is required.', 'error'); return; }
    if (!mentorForm.designation.trim()) { showToast('Designation is required.', 'error'); return; }
    if (!mentorForm.password || mentorForm.password.length < 6) { showToast('Password must be at least 6 characters.', 'error'); return; }
    setSavingMentor(true);
    try {
      const {queued} = await moderate({kind: 'admin', label: 'Create mentor account', method: 'POST', url: '/admin/mentors', body: {
        username: mentorForm.username.trim(),
        password: mentorForm.password,
        fullName: mentorForm.fullName.trim(),
        designation: mentorForm.designation.trim(),
        departmentId: Number(mentorDeptId),
      }});
      queuedToast(queued, 'Mentor account created.');
      setMentorModal(false);
      setMentorForm({fullName: '', designation: '', username: '', password: ''});
      setExpandedMentors(p => ({...p, [mentorDeptId]: true}));
      fetchDeptData();
    } catch (e) {
      showToast(e.response?.data?.message || "Couldn't create the mentor. Try again.", 'error');
    } finally { setSavingMentor(false); }
  };

  const updateMentor = async () => {
    if (!editingMentor) return;
    if (!mentorForm.fullName.trim()) { showToast('Full name is required.', 'error'); return; }
    if (!mentorForm.designation.trim()) { showToast('Designation is required.', 'error'); return; }

    const wasSignatory = heads.some(h => h.mentorId === editingMentor.id);
    const turningOn = mentorSignatory && !wasSignatory;
    const turningOff = !mentorSignatory && wasSignatory;
    if (turningOn && !mentorSignature) {
      showToast('A signature image is required to make this mentor a signatory.', 'error');
      return;
    }

    setSavingMentor(true);
    try {
      await client.put(`/admin/mentors/${editingMentor.id}`, {
        fullName: mentorForm.fullName.trim(),
        designation: mentorForm.designation.trim(),
        departmentId: Number(mentorDeptId),
        isActive: mentorActive,
      });

      if (turningOn) {
        const fd = new FormData();
        fd.append('signature', {
          uri: mentorSignature.uri,
          type: /\.png$/i.test(mentorSignature.name) ? 'image/png' : 'image/jpeg',
          name: mentorSignature.name,
        });
        await client.post(`/admin/mentors/${editingMentor.id}/signatory`, fd, {
          headers: {'Content-Type': 'multipart/form-data'},
        });
        showToast('Mentor promoted to signatory.', 'success');
      } else if (turningOff) {
        await client.delete(`/admin/mentors/${editingMentor.id}/signatory`);
        showToast('Mentor removed as signatory.', 'success');
      } else if (mentorSignatory && mentorSignature) {
        const linkedHead = heads.find(h => h.mentorId === editingMentor.id);
        if (linkedHead) {
          const fd = new FormData();
          fd.append('signature', {
            uri: mentorSignature.uri,
            type: /\.png$/i.test(mentorSignature.name) ? 'image/png' : 'image/jpeg',
            name: mentorSignature.name,
          });
          await client.put(`/admin/department-heads/${linkedHead.id}`, fd, {
            headers: {'Content-Type': 'multipart/form-data'},
          });
          showToast('Signature updated.', 'success');
        }
      } else {
        showToast('Mentor updated.', 'success');
      }
      setMentorModal(false);
      fetchDeptData();
    } catch (e) {
      showToast(e.response?.data?.message || "Couldn't update the mentor. Try again.", 'error');
    } finally { setSavingMentor(false); }
  };

  const removeMentor = async mentor => {
    const ok = await showConfirm({
      title: 'Deactivate mentor',
      message: `Deactivate "${mentor.fullName}"? They can no longer log in.`,
      confirmText: 'Deactivate',
      destructive: true,
    });
    if (!ok) return;
    try {
      await client.delete(`/admin/mentors/${mentor.id}`);
      showToast('Mentor deactivated.', 'success');
      fetchDeptData();
    } catch {
      showToast("Couldn't deactivate the mentor. Try again.", 'error');
    }
  };

  const openCreateDept = () => {
    setEditingDept(null);
    setDeptName(''); setDeptCode(''); setDeptAddress(''); setDeptLat(''); setDeptLng('');
    setDeptModal(true);
  };

  const openEditDept = dept => {
    setEditingDept(dept);
    setDeptName(dept.name);
    setDeptCode(dept.code || '');
    setDeptAddress(dept.address || '');
    setDeptLat(dept.latitude != null ? String(dept.latitude) : '');
    setDeptLng(dept.longitude != null ? String(dept.longitude) : '');
    setDeptModal(true);
  };

  const saveDept = async () => {
    if (!deptName.trim()) { showToast('Department name is required.', 'error'); return; }
    if (!deptCode.trim()) { showToast('Department code is required.', 'error'); return; }
    const lat = parseFloat(deptLat);
    if (!deptLat.trim() || isNaN(lat) || lat < -90 || lat > 90) { showToast('Enter a valid latitude (-90 to 90).', 'error'); return; }
    const lng = parseFloat(deptLng);
    if (!deptLng.trim() || isNaN(lng) || lng < -180 || lng > 180) { showToast('Enter a valid longitude (-180 to 180).', 'error'); return; }
    setSavingDept(true);
    try {
      const body = {
        name: deptName.trim(),
        code: deptCode.trim(),
        address: deptAddress.trim() || null,
        latitude: lat,
        longitude: lng,
        radiusMeters: 100,
      };
      if (editingDept) {
        await client.put(`/admin/departments/${editingDept.id}`, body);
        showToast('Department updated.', 'success');
      } else {
        const {queued} = await moderate({kind: 'admin', label: 'Create department', method: 'POST', url: '/admin/departments', body});
        queuedToast(queued, 'Department created.');
      }
      setDeptModal(false);
      fetchDeptData();
    } catch (e) {
      showToast(e.response?.data?.message || "Couldn't save. Try again.", 'error');
    } finally { setSavingDept(false); }
  };

  const removeDept = async dept => {
    const ok = await showConfirm({
      title: 'Delete department',
      message: `Delete "${dept.name}"? Departments with assigned interns, mentors, or signatories can't be deleted.`,
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await client.delete(`/admin/departments/${dept.id}`);
      showToast('Department deleted.', 'success');
      fetchDeptData();
    } catch (e) {
      showToast(e.response?.data?.message || "Couldn't delete. Try again.", 'error');
    }
  };

  const openEditHead = (dept, head) => {
    setEditingHead(head);
    setHeadDeptId(dept.id);
    setHeadName(head.name); setHeadDesignation(head.designation || ''); setSignature(null);
    setHeadModal(true);
  };

  const pickSignature = async () => {
    try {
      const { pick, types } = require('@react-native-documents/picker');
      const [res] = await pick({type: [types.images]});
      const name2 = res.name || res.uri.split('/').pop() || 'signature.jpg';
      setSignature({uri: res.uri, name: name2});
    } catch (e) {
      const { isErrorWithCode, errorCodes } = require('@react-native-documents/picker');
      if (!(isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED)) showToast("Couldn't pick the signature image. Try again.", 'error');
    }
  };

  const pickMentorSignature = async () => {
    try {
      const { pick, types } = require('@react-native-documents/picker');
      const [res] = await pick({type: [types.images]});
      const name2 = res.name || res.uri.split('/').pop() || 'signature.jpg';
      setMentorSignature({uri: res.uri, name: name2});
    } catch (e) {
      const { isErrorWithCode, errorCodes } = require('@react-native-documents/picker');
      if (!(isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED)) showToast("Couldn't pick the signature image. Try again.", 'error');
    }
  };

  const saveHead = async () => {
    if (!headName.trim()) { showToast('Name is required.', 'error'); return; }
    setSavingHead(true);
    try {
      const formData = new FormData();
      formData.append('name', headName.trim());
      formData.append('designation', headDesignation.trim() || 'Head of Department');
      formData.append('departmentId', String(headDeptId));
      if (signature) {
        formData.append('signature', {
          uri: signature.uri,
          type: /\.png$/i.test(signature.name) ? 'image/png' : 'image/jpeg',
          name: signature.name,
        });
      }
      if (editingHead) {
        await client.put(`/admin/department-heads/${editingHead.id}`, formData, {
          headers: {'Content-Type': 'multipart/form-data'},
        });
        showToast('Signatory updated.', 'success');
      } else {
        await client.post('/admin/department-heads', formData, {
          headers: {'Content-Type': 'multipart/form-data'},
        });
        showToast('Signatory saved.', 'success');
      }
      setHeadModal(false);
      fetchDeptData();
    } catch (e) {
      showToast(e.response?.data?.message || "Couldn't save. Try again.", 'error');
    } finally { setSavingHead(false); }
  };

  const removeHead = async head => {
    const ok = await showConfirm({
      title: 'Delete signatory',
      message: `Delete "${head.name}"?`,
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await client.delete(`/admin/department-heads/${head.id}`);
      showToast('Signatory removed.', 'success');
      fetchDeptData();
    } catch { showToast("Couldn't delete. Try again.", 'error'); }
  };

  const previewSignature = async head => {
    const ok = await showConfirm({
      title: 'Signature preview',
      message: `Open the signature photo of "${head.name}"?`,
      confirmText: 'Open',
    });
    if (!ok) return;
    const {openFileWithAuth} = require('../../api/fileClient');
    openFileWithAuth(head.signatureImagePath).catch(() => {});
  };

  const linkedHead = editingMentor ? heads.find(h => h.mentorId === editingMentor.id) : null;

  if (loading) return <Spinner style={styles.center} />;

  const q = query.trim().toLowerCase();
  const visible = q
    ? departments.filter(d =>
        d.name.toLowerCase().includes(q) ||
        (d.code || '').toLowerCase().includes(q) ||
        mentors.some(m => m.departmentId === d.id && (m.fullName || '').toLowerCase().includes(q)))
    : departments;

  return (
    <ScreenBackground style={styles.container}>
      <AppHeader
        home
        hideTitle
        title="Departments"
        right={(
          <TouchableOpacity id="add-dept-btn" style={styles.headerBtn} onPress={openCreateDept}>
            <Icon name="plus" size={16} color="#fff" />
            <Text style={styles.headerBtnText}>New</Text>
          </TouchableOpacity>
        )}
      />

      <ScrollView
        contentContainerStyle={{paddingBottom: 100, flexGrow: 1}}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchDeptData();}} tintColor={colors.primary}/>}>
        <View style={styles.searchRow}>
          <Icon name="search" size={18} color={colors.textMuted} />
          <TextInput
            id="depts-search"
            style={styles.searchInput}
            placeholder="Search by name or code"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity id="depts-search-clear" onPress={() => setQuery('')} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Icon name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        {visible.length === 0 ? (
          <View style={styles.emptyBox}>
            <Icon name="building" size={44} color={colors.textMuted} />
            <Text style={styles.emptyText}>
              {q ? `No departments match '${query.trim()}'` : 'No departments yet. Add one to get started.'}
            </Text>
          </View>
        ) : visible.map(dept => (
          <View key={dept.id} style={styles.deptCard}>
            <View style={styles.deptTop}>
              <View style={styles.deptIconBox}>
                <Icon name="building" size={20} color="#fff" />
              </View>
              <View style={styles.deptInfo}>
                <Text style={styles.deptName}>{dept.name}</Text>
                <Text style={styles.deptCode}>{dept.code || 'No code'}</Text>
              </View>
              <View style={styles.deptActions}>
                <TouchableOpacity id={`detail-dept-${dept.id}`} style={styles.iconBtn} onPress={() => setDetailDept(dept)}>
                  <Icon name="eye" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity id={`edit-dept-${dept.id}`} style={styles.iconBtn} onPress={() => openEditDept(dept)}>
                  <Icon name="pencil" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity id={`delete-dept-${dept.id}`} style={styles.iconBtn} onPress={() => removeDept(dept)}>
                  <Icon name="trash" size={18} color={colors.error} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Icon name="users" size={14} color={colors.textMuted} />
                <Text style={styles.statText}>{dept.internCount} interns</Text>
              </View>
              <View style={styles.statItem}>
                <Icon name="briefcase" size={14} color={colors.textMuted} />
                <Text style={styles.statText}>{dept.mentorCount} mentors</Text>
              </View>
              <View style={styles.statItem}>
                <Icon name="lock" size={14} color={colors.textMuted} />
                <Text style={styles.statText}>{dept.radiusMeters ?? 100} m</Text>
              </View>
            </View>

            <View style={styles.headsSection}>
              <View style={styles.sectionHeader}>
                <TouchableOpacity id={`toggle-heads-${dept.id}`} style={styles.sectionToggle} onPress={() => toggleHeads(dept.id)}>
                  <Icon name="chevronRight" size={14} color={colors.textSecondary} style={[styles.chevron, expandedHeads[dept.id] && styles.chevronOpen]} />
                  <Text style={styles.headsTitle}>Signatories</Text>
                  <Text style={styles.sectionCount}>{headsOf(dept.id).length}</Text>
                </TouchableOpacity>
                <View style={{flex: 1}} />
              </View>
              {expandedHeads[dept.id] && (
                <View>
                  {headsOf(dept.id).length === 0 ? (
                    <Text style={styles.noHeadsText}>No signatories yet. Issued documents are system-generated and do not require a signature.</Text>
                  ) : headsOf(dept.id).map(head => (
                    <View key={head.id} style={styles.headRow}>
                      <View style={styles.headInfo}>
                        <Text style={styles.headName}>{head.name}</Text>
                        <Text style={styles.headDesignation}>{head.designation}</Text>
                        {head.signatureImagePath ? (
                          <TouchableOpacity style={styles.sigBadge} onPress={() => previewSignature(head)}>
                            <Icon name="check" size={12} color={colors.success} />
                            <Text style={styles.sigText}>Signature saved</Text>
                          </TouchableOpacity>
                        ) : (
                          <View style={styles.sigBadge}>
                            <Icon name="alert" size={12} color={colors.pending} />
                            <Text style={[styles.sigText, {color: colors.pending}]}>No signature</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.headActions}>
                        <TouchableOpacity id={`edit-head-${head.id}`} style={styles.iconBtn} onPress={() => openEditHead(dept, head)}>
                          <Icon name="pencil" size={16} color={colors.textSecondary} />
                        </TouchableOpacity>
                        <TouchableOpacity id={`delete-head-${head.id}`} style={styles.iconBtn} onPress={() => removeHead(head)}>
                          <Icon name="trash" size={16} color={colors.error} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.mentorsSection}>
              <View style={styles.sectionHeader}>
                <TouchableOpacity id={`toggle-mentors-${dept.id}`} style={styles.sectionToggle} onPress={() => toggleMentors(dept.id)}>
                  <Icon name="chevronRight" size={14} color={colors.textSecondary} style={[styles.chevron, expandedMentors[dept.id] && styles.chevronOpen]} />
                  <Text style={styles.headsTitle}>Mentors</Text>
                  <Text style={styles.sectionCount}>{mentorsOf(dept.id).length}</Text>
                </TouchableOpacity>
                <View style={{flex: 1}} />
                {expandedMentors[dept.id] && (
                  <TouchableOpacity id={`add-mentor-${dept.id}`} style={styles.addHeadBtn} onPress={() => openCreateMentor(dept)}>
                    <Icon name="plus" size={14} color={colors.textAccent} />
                    <Text style={styles.addHeadText}>Add Mentor</Text>
                  </TouchableOpacity>
                )}
              </View>
              {expandedMentors[dept.id] && (
                <View>
                  {mentorsOf(dept.id).length === 0 ? (
                    <Text style={styles.noHeadsText}>No mentors assigned to this department.</Text>
                  ) : mentorsOf(dept.id).map(mentor => (
                    <View key={mentor.id} style={styles.mentorRow}>
                      <View style={styles.mentorAvatar}>
                        <Icon name="briefcase" size={13} color="#fff" />
                      </View>
                      <View style={styles.mentorInfo}>
                        <Text style={styles.mentorName}>{mentor.fullName}</Text>
                        <Text style={styles.mentorDesignation}>{mentor.designation || 'Mentor'} • @{mentor.username}</Text>
                        <View style={styles.mentorBadges}>
                          {mentor.isSignatory && (
                            <View style={styles.sigBadge}>
                              <Icon name="signature" size={12} color={colors.textAccentAlt} />
                              <Text style={[styles.sigText, {color: colors.textAccentAlt}]}>Signatory</Text>
                            </View>
                          )}
                          {!mentor.isActive && (
                            <View style={styles.sigBadge}>
                              <Icon name="alert" size={12} color={colors.error} />
                              <Text style={[styles.sigText, {color: colors.error}]}>Inactive</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <View style={styles.headActions}>
                        <TouchableOpacity id={`edit-mentor-${mentor.id}`} style={styles.iconBtn} onPress={() => openEditMentor(dept, mentor)}>
                          <Icon name="pencil" size={16} color={colors.textSecondary} />
                        </TouchableOpacity>
                        <TouchableOpacity id={`delete-mentor-${mentor.id}`} style={styles.iconBtn} onPress={() => removeMentor(mentor)}>
                          <Icon name="trash" size={16} color={colors.error} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        ))}
        {visible.length > 0 && <EndOfListMarker />}
      </ScrollView>

      {/* Department Modal */}
      <SwipeableModal visible={deptModal} transparent overlayStyle={styles.modalOverlay} sheetStyle={styles.modalContent} scrollable={false} onRequestClose={() => setDeptModal(false)}>
          <ScrollView contentContainerStyle={{flexGrow: 1, justifyContent: 'flex-end'}}>
              <Text style={styles.modalTitle}>{editingDept ? 'Edit Department' : 'New Department'}</Text>
              <Text style={styles.modalSubtitle}>Geofence coordinates are used for attendance verification.</Text>

              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Name *</Text>
                <TextInput id="dept-name" style={styles.fieldInput} placeholder="e.g. ERP Section"
                  placeholderTextColor={colors.textMuted} value={deptName} onChangeText={setDeptName} />
              </View>
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Code *</Text>
                <TextInput id="dept-code" style={styles.fieldInput} placeholder="e.g. ERP"
                  placeholderTextColor={colors.textMuted} value={deptCode} onChangeText={setDeptCode} />
              </View>
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Address</Text>
                <TextInput id="dept-address" style={styles.fieldInput} placeholder="e.g. 5th Floor, XYZ Tower" multiline
                  placeholderTextColor={colors.textMuted} value={deptAddress} onChangeText={setDeptAddress} />
              </View>
              <View style={styles.formRow}>
                <View style={[styles.formField, {flex: 1}]}>
                  <Text style={styles.fieldLabel}>Latitude *</Text>
                  <TextInput id="dept-lat" style={styles.fieldInput} placeholder="24.8949" keyboardType="numeric"
                    placeholderTextColor={colors.textMuted} value={deptLat} onChangeText={setDeptLat} />
                </View>
                <View style={[styles.formField, {flex: 1}]}>
                  <Text style={styles.fieldLabel}>Longitude *</Text>
                  <TextInput id="dept-lng" style={styles.fieldInput} placeholder="67.1521" keyboardType="numeric"
                    placeholderTextColor={colors.textMuted} value={deptLng} onChangeText={setDeptLng} />
                </View>
              </View>
              <View style={styles.geofenceNote}>
                <Icon name="lock" size={13} color={colors.textMuted} />
                <Text style={styles.geofenceNoteText}>Geofence radius is fixed at 100 m</Text>
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setDeptModal(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity id="save-dept" style={styles.createBtn} onPress={saveDept} disabled={savingDept}>
                  {savingDept ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>Save</Text>}
                </TouchableOpacity>
              </View>
          </ScrollView>
      </SwipeableModal>

      {/* Department Detail Modal */}
      <Modal visible={!!detailDept} transparent animationType="fade" onRequestClose={() => setDetailDept(null)}>
        <View style={styles.detailOverlay}>
          <View style={styles.deptDetailCard}>
            <View style={styles.deptDetailHeader}>
              <Text style={styles.modalTitle}>{detailDept?.name}</Text>
              <TouchableOpacity id="close-dept-detail" onPress={() => setDetailDept(null)} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                <Icon name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
            {[
              {label: 'Code', value: detailDept?.code || '—'},
              {label: 'Address', value: detailDept?.address || '—'},
              {label: 'Latitude', value: detailDept?.latitude != null ? String(detailDept.latitude) : '—'},
              {label: 'Longitude', value: detailDept?.longitude != null ? String(detailDept.longitude) : '—'},
              {label: 'Geofence Radius', value: `${detailDept?.radiusMeters ?? 100} m`},
              {label: 'Interns', value: String(detailDept?.internCount ?? 0)},
              {label: 'Mentors', value: String(detailDept?.mentorCount ?? 0)},
            ].map(row => (
              <View key={row.label} style={styles.dRow}>
                <Text style={styles.dLabel}>{row.label}</Text>
                <Text style={styles.dValue}>{row.value}</Text>
              </View>
            ))}
            <TouchableOpacity id="dept-detail-edit" style={[styles.createBtn, styles.detailEditBtn]} onPress={() => { const d = detailDept; setDetailDept(null); openEditDept(d); }}>
              <Text style={styles.createBtnText}>Edit Department</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add / Edit Mentor Modal */}
      <SwipeableModal visible={mentorModal} transparent overlayStyle={styles.modalOverlay} sheetStyle={styles.modalContent} scrollable={false} onRequestClose={() => setMentorModal(false)}>
          <ScrollView contentContainerStyle={{flexGrow: 1, justifyContent: 'flex-end'}}>
              <Text style={styles.modalTitle}>{editingMentor ? 'Edit Mentor' : 'Add Mentor'}</Text>
              <Text style={styles.modalSubtitle}>
                {editingMentor
                  ? `${editingMentor.fullName} (@${editingMentor.username})`
                  : `New mentor account for ${departments.find(d => d.id === mentorDeptId)?.name}.`}
              </Text>

              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Full Name *</Text>
                <TextInput id="mentor-fullname" style={styles.fieldInput} placeholder="e.g. John Doe"
                  placeholderTextColor={colors.textMuted} value={mentorForm.fullName} onChangeText={t => setMentorForm(p => ({...p, fullName: t}))} />
              </View>
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Designation *</Text>
                <TextInput id="mentor-designation" style={styles.fieldInput} placeholder="e.g. Senior Developer"
                  placeholderTextColor={colors.textMuted} value={mentorForm.designation} onChangeText={t => setMentorForm(p => ({...p, designation: t}))} />
              </View>
              {!editingMentor && (
                <>
                  <View style={styles.formField}>
                    <Text style={styles.fieldLabel}>Username</Text>
                    <TextInput id="mentor-username" style={styles.fieldInput} placeholder="e.g. mentor_john — auto-generated if blank" autoCapitalize="none"
                      placeholderTextColor={colors.textMuted} value={mentorForm.username} onChangeText={t => setMentorForm(p => ({...p, username: t}))} />
                  </View>
                  <View style={styles.formField}>
                    <Text style={styles.fieldLabel}>Password *</Text>
                    <PasswordInput id="mentor-password" style={styles.fieldInput} placeholder="At least 6 characters"
                      placeholderTextColor={colors.textMuted} value={mentorForm.password} onChangeText={t => setMentorForm(p => ({...p, password: t}))} />
                  </View>
                </>
              )}
              {editingMentor && (
                <>
                  <View style={styles.formField}>
                    <Dropdown
                      id="mentor-dept"
                      inline
                      label="Department *"
                      value={mentorDeptId}
                      onChange={setMentorDeptId}
                      options={departments.map(d => ({value: d.id, label: d.name}))}
                      placeholder="Select department"
                    />
                  </View>
                  <View style={styles.formField}>
                    <Text style={styles.fieldLabel}>Account Status</Text>
                    <View style={styles.segRow}>
                      <TouchableOpacity style={[styles.seg, mentorActive && styles.segActive]} onPress={() => setMentorActive(true)}>
                        <Icon name="check" size={14} color={mentorActive ? colors.success : colors.textMuted} />
                        <Text style={[styles.segText, mentorActive && styles.segTextActive]}>Active</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.seg, !mentorActive && styles.segInactive]} onPress={() => setMentorActive(false)}>
                        <Icon name="close" size={14} color={!mentorActive ? colors.error : colors.textMuted} />
                        <Text style={[styles.segText, !mentorActive && styles.segTextInactive]}>Inactive</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.toggleRow}>
                    <View style={styles.toggleInfo}>
                      <Text style={styles.toggleLabel}>Promote to Department Head</Text>
                      <Text style={styles.toggleHelper}>
                        Creates a signatory entry for this mentor in their department
                      </Text>
                    </View>
                    <Switch
                      id="mentor-signatory-toggle"
                      value={mentorSignatory}
                      onValueChange={setMentorSignatory}
                      trackColor={{true: colors.primary, false: colors.border}}
                      thumbColor="#fff"
                    />
                  </View>
                  {mentorSignatory && (
                    <View style={styles.signatureSection}>
                      <Text style={styles.toggleLabel}>Signature</Text>
                      <Text style={styles.toggleHelper}>
                        Upload the signature used on certificates and gate pass letters.
                      </Text>
                      <TouchableOpacity id="pick-mentor-signature" style={styles.pickBtn} onPress={pickMentorSignature}>
                        <Icon name="signature" size={16} color={colors.textAccent} />
                        <Text style={styles.pickBtnText}>
                          {mentorSignature ? mentorSignature.name : 'Pick Signature Photo'}
                        </Text>
                      </TouchableOpacity>
                      {!mentorSignature && linkedHead?.signatureImagePath && (
                        <Text style={styles.modalSubtitle}>Current signature saved. Pick a new one to replace it.</Text>
                      )}
                    </View>
                  )}
                </>
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setMentorModal(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity id="save-mentor" style={styles.createBtn} onPress={editingMentor ? updateMentor : createMentor} disabled={savingMentor}>
                  {savingMentor ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>{editingMentor ? 'Save' : 'Create'}</Text>}
                </TouchableOpacity>
              </View>
          </ScrollView>
      </SwipeableModal>

      {/* Signatory Modal */}
      <SwipeableModal visible={headModal} transparent overlayStyle={styles.modalOverlay} sheetStyle={styles.modalContent} scrollable={false} onRequestClose={() => setHeadModal(false)}>
          <ScrollView contentContainerStyle={{flexGrow: 1, justifyContent: 'flex-end'}}>
              <Text style={styles.modalTitle}>Edit Signatory</Text>
              <Text style={styles.modalSubtitle}>Name and signature appear on internship certificates and gate pass letters.</Text>

              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Full Name *</Text>
                <TextInput id="head-name" style={styles.fieldInput} placeholder="e.g. Alay Haider"
                  placeholderTextColor={colors.textMuted} value={headName} onChangeText={setHeadName} />
              </View>
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Designation</Text>
                <TextInput id="head-designation" style={styles.fieldInput} placeholder="e.g. Oftg. Manager Application Development"
                  placeholderTextColor={colors.textMuted} value={headDesignation} onChangeText={setHeadDesignation} />
              </View>

              <TouchableOpacity id="pick-signature" style={styles.pickBtn} onPress={pickSignature}>
                <Icon name="signature" size={16} color={colors.textAccent} />
                <Text style={styles.pickBtnText}>
                  {signature ? signature.name : 'Pick Signature Photo'}
                </Text>
              </TouchableOpacity>
              {editingHead && !signature && (
                <Text style={styles.modalSubtitle}>Current signature will be kept unless a new one is picked.</Text>
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setHeadModal(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity id="save-head" style={styles.createBtn} onPress={saveHead} disabled={savingHead}>
                  {savingHead ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>Save</Text>}
                </TouchableOpacity>
              </View>
          </ScrollView>
      </SwipeableModal>
    </ScreenBackground>
  );
}

const makeStyles = colors => StyleSheet.create({
  container: {flex: 1},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background},
  headerBtn: {flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9},
  headerBtnText: {color: '#fff', fontWeight: '700', fontSize: 13},
  searchRow: {flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 12, marginBottom: 8, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10},
  searchInput: {flex: 1, color: colors.text, fontSize: 14, padding: 0},
  emptyBox: {alignItems: 'center', paddingVertical: 60, paddingHorizontal: 30},
  emptyText: {color: colors.textSecondary, fontSize: 15, textAlign: 'center', marginTop: 12},
  deptCard: {backgroundColor: colors.surface, margin: 12, marginBottom: 4, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border},
  deptTop: {flexDirection: 'row', alignItems: 'center'},
  deptIconBox: {width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: 12},
  deptInfo: {flex: 1},
  deptName: {color: colors.text, fontSize: 16, fontWeight: '700'},
  deptCode: {color: colors.textMuted, fontSize: 12, marginTop: 1},
  deptActions: {flexDirection: 'row', gap: 8},
  iconBtn: {width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border},
  statsRow: {flexDirection: 'row', gap: 18, marginTop: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border},
  statItem: {flexDirection: 'row', alignItems: 'center', gap: 5},
  statText: {color: colors.textSecondary, fontSize: 12},
  headsSection: {marginTop: 12},
  sectionHeader: {flexDirection: 'row', alignItems: 'center', marginBottom: 8},
  sectionToggle: {flexDirection: 'row', alignItems: 'center', gap: 6},
  chevron: {transform: [{rotate: '0deg'}]},
  chevronOpen: {transform: [{rotate: '90deg'}]},
  sectionCount: {backgroundColor: colors.card, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, color: colors.textSecondary, fontSize: 11, fontWeight: '700', overflow: 'hidden'},
  headsTitle: {color: colors.text, fontSize: 13, fontWeight: '700'},
  addHeadBtn: {flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary + '15', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6},
  addHeadText: {color: colors.textAccent, fontSize: 12, fontWeight: '700'},
  noHeadsText: {color: colors.textMuted, fontSize: 12, marginBottom: 4},
  headRow: {flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 10, padding: 10, marginBottom: 6},
  headInfo: {flex: 1},
  headName: {color: colors.text, fontSize: 13, fontWeight: '600'},
  headDesignation: {color: colors.textSecondary, fontSize: 11, marginTop: 1},
  sigBadge: {flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4},
  sigText: {color: colors.success, fontSize: 11, fontWeight: '600'},
  headActions: {flexDirection: 'row', gap: 6},
  mentorsSection: {marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12},
  mentorRow: {flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 10, padding: 10, marginBottom: 6},
  mentorAvatar: {width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center', marginRight: 10},
  mentorInfo: {flex: 1},
  mentorName: {color: colors.text, fontSize: 13, fontWeight: '600'},
  mentorDesignation: {color: colors.textSecondary, fontSize: 11, marginTop: 1},
  mentorBadges: {flexDirection: 'row', gap: 8, marginTop: 4},
  toggleRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 14},
  signatureSection: {backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 14},
  toggleInfo: {flex: 1, marginRight: 12},
  toggleLabel: {color: colors.text, fontSize: 14, fontWeight: '700'},
  toggleHelper: {color: colors.textMuted, fontSize: 12, marginTop: 2},
  segRow: {flexDirection: 'row', gap: 10},
  seg: {flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingVertical: 10, backgroundColor: colors.card},
  segActive: {backgroundColor: colors.success + '18', borderColor: colors.success},
  segInactive: {backgroundColor: colors.error + '18', borderColor: colors.error},
  segText: {color: colors.textSecondary, fontSize: 13, fontWeight: '600'},
  segTextActive: {color: colors.success, fontWeight: '700'},
  segTextInactive: {color: colors.error, fontWeight: '700'},
  modalOverlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end'},
  modalContent: {backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24},
  modalTitle: {color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 4},
  modalSubtitle: {color: colors.textMuted, fontSize: 12, marginBottom: 16, marginTop: 4},
  formField: {marginBottom: 14},
  formRow: {flexDirection: 'row', gap: 12},
  fieldLabel: {color: colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 6},
  fieldInput: {backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14},
  pickBtn: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary + '15', borderWidth: 1, borderColor: colors.primary + '55', borderRadius: 10, paddingVertical: 12, marginBottom: 6},
  pickBtnText: {color: colors.textAccent, fontWeight: '600'},
  geofenceNote: {flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 6},
  geofenceNoteText: {color: colors.textMuted, fontSize: 12},
  modalActions: {flexDirection: 'row', gap: 12, marginTop: 8},
  cancelBtn: {flex: 1, backgroundColor: colors.card, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border},
  cancelBtnText: {color: colors.textSecondary, fontWeight: '600'},
  createBtn: {flex: 1, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center'},
  createBtnText: {color: '#fff', fontWeight: '700', fontSize: 15, textAlign: 'center'},
  detailEditBtn: {marginTop: 16, alignSelf: 'stretch', flex: 0},
  detailOverlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24},
  deptDetailCard: {backgroundColor: colors.surface, borderRadius: 18, padding: 20, borderWidth: 1, borderColor: colors.border},
  deptDetailHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12},
  dRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border},
  dLabel: {color: colors.textMuted, fontSize: 13},
  dValue: {color: colors.text, fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right', marginLeft: 12},
});
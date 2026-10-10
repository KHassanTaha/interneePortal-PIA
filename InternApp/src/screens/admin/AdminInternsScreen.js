import React, {useCallback, useState, useMemo} from 'react';
import {View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl, Image, Modal} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import client from '../../api/client';
import {fileUrl} from '../../api/fileClient';
import {showToast} from '../../components/AppToast';
import {moderate, queuedToast} from '../../api/moderate';
import {useAppTheme} from '../../theme';
import ScreenBackground from '../../components/ScreenBackground';
import {safePeriod} from '../../utils/dates';
import AppHeader from '../../components/AppHeader';
import Dropdown from '../../components/Dropdown';
import Icon from '../../components/Icon';
import InternAvatar from '../../components/InternAvatar';
import Spinner from '../../components/Spinner';
import PasswordInput from '../../components/PasswordInput';
import DateField from '../../components/DateField';
import EndOfListMarker from '../../components/EndOfListMarker';
import SwipeableModal from '../../components/SwipeableModal';

const emptyForm = {
  fullName: '', username: '', password: '', cnic: '', university: '', degree: '',
  gender: 0, startDate: '', endDate: '', departmentId: null, mentorId: null, shiftId: null,
};

export default function AdminInternsScreen({navigation}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [interns, setInterns] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [mentors, setMentors] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [selectedDept, setSelectedDept] = useState(null);
  const [viewerUri, setViewerUri] = useState(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [cnicError, setCnicError] = useState(null);

  const [detailTarget, setDetailTarget] = useState(null);
  const [internDocs, setInternDocs] = useState({uploaded: [], issued: []});
  const [internAttendance, setInternAttendance] = useState([]);
  const [loadingInternData, setLoadingInternData] = useState(false);
  const [activeSheet, setActiveSheet] = useState('docs');
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPw, setResetPw] = useState('');
  const [resetting, setResetting] = useState(false);
  const [faceResetTarget, setFaceResetTarget] = useState(null);
  const [faceResetting, setFaceResetting] = useState(false);
  const [faceHistory, setFaceHistory] = useState([]);
  const [showFaceHistory, setShowFaceHistory] = useState(false);
  const [allDevices, setAllDevices] = useState([]);

  const resetInternPassword = async () => {
    if (!resetPw || resetPw.length < 6) { showToast('Password must be at least 6 characters.', 'error'); return; }
    setResetting(true);
    try {
      await client.patch(`/admin/interns/${resetTarget.id}/reset-password`, {newPassword: resetPw});
      showToast('Password reset.', 'success');
      setResetPw('');
      setResetTarget(null);
    } catch (e) { showToast(e.response?.data?.message || "Couldn't reset password.", 'error'); }
    finally { setResetting(false); }
  };

  const openDoc = (path) => {
    if (!path) return;
    const {openFileWithAuth} = require('../../api/fileClient');
    openFileWithAuth(path).catch(() => showToast("Couldn't open the file. Try again.", 'error'));
  };

  const openFaceHistory = async (i) => {
    setFaceHistory([]);
    setShowFaceHistory(true);
    try {
      const res = await client.get(`/admin/interns/${i.id}/face-records`);
      setFaceHistory(res.data || []);
    } catch {
      setFaceHistory([]);
    }
  };

  const resetFaceEnrollment = async () => {
    setFaceResetting(true);
    try {
      await client.post(`/admin/interns/${faceResetTarget.id}/face/reset`);
      showToast('Face enrollment reset. Intern must re-enroll.', 'success');
      setFaceResetTarget(null);
      const res = await client.get(selectedDept ? `/admin/interns?departmentId=${selectedDept}` : '/admin/interns');
      setInterns(res.data);
      if (detailTarget) setDetailTarget(res.data.find(x => x.id === detailTarget.id) || null);
    } catch (e) { showToast(e.response?.data?.message || "Couldn't reset face enrollment.", 'error'); }
    finally { setFaceResetting(false); }
  };

  const openInternDetail = async (i) => {
    setDetailTarget(i);
    setShowDocsSheet(false);
    setShowAttendanceSheet(false);
    setLoadingInternData(true);
    try {
      const [docsRes, attRes] = await Promise.all([
        client.get(`/admin/interns/${i.id}/documents`),
        client.get(`/admin/attendance?internId=${i.id}`),
      ]);
      setInternDocs(docsRes.data);
      setInternAttendance(attRes.data);
    } catch {
      setInternDocs({uploaded: [], issued: []});
      setInternAttendance([]);
    } finally { setLoadingInternData(false); }
  };

  const openFilePath = path => {
    const {openFileWithAuth} = require('../../api/fileClient');
    openFileWithAuth(path).catch(() => showToast("Couldn't open the file. Try again.", 'error'));
  };
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editActive, setEditActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const deptOptions = useMemo(
    () => departments.map(d => ({value: String(d.id), label: d.name})),
    [departments]
  );

  const fetchInternsData = async () => {
    try {
      const [internsRes, deptsRes, mentorsRes, shiftsRes, devicesRes] = await Promise.all([
        client.get(selectedDept ? `/admin/interns?departmentId=${selectedDept}` : '/admin/interns'),
        client.get('/admin/departments'),
        client.get('/admin/mentors'),
        client.get('/admin/shifts'),
        client.get('/admin/devices'),
      ]);
      setInterns(internsRes.data);
      setDepartments(deptsRes.data);
      setMentors(mentorsRes.data);
      setShifts(shiftsRes.data);
      setAllDevices(devicesRes.data);
    } catch {
      showToast("Couldn't load interns. Check your connection and pull to refresh.", 'error');
    } finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const fetchData = async () => {
        try {
          const [internsRes, deptsRes, mentorsRes, shiftsRes, devicesRes] = await Promise.all([
            client.get(selectedDept ? `/admin/interns?departmentId=${selectedDept}` : '/admin/interns'),
            client.get('/admin/departments'),
            client.get('/admin/mentors'),
            client.get('/admin/shifts'),
            client.get('/admin/devices'),
          ]);
          if (!cancelled) {
            setInterns(internsRes.data);
            setDepartments(deptsRes.data);
            setMentors(mentorsRes.data);
            setShifts(shiftsRes.data);
            setAllDevices(devicesRes.data);
          }
        } catch {
          if (!cancelled) showToast("Couldn't load interns. Check your connection and pull to refresh.", 'error');
        } finally { if (!cancelled) { setLoading(false); setRefreshing(false); } }
      };
      fetchData();
      return () => { cancelled = true; setQuery(''); };
    }, [selectedDept])
  );

  const validate = (f, {passwordRequired}) => {
    if (!f.fullName.trim()) { showToast('Full name is required.', 'error'); return false; }
    if (passwordRequired && (!f.password || f.password.length < 6)) { showToast('Password must be at least 6 characters.', 'error'); return false; }
    if (!passwordRequired && f.password && f.password.length < 6) { showToast('New password must be at least 6 characters.', 'error'); return false; }
    if (passwordRequired && !f.departmentId) { showToast('Select a department.', 'error'); return false; }
    if (passwordRequired && !f.mentorId) { showToast('Select a mentor.', 'error'); return false; }
    if (passwordRequired && !f.startDate.trim()) { showToast('Start date is required (YYYY-MM-DD).', 'error'); return false; }
    if (passwordRequired && !f.endDate.trim()) { showToast('End date is required (YYYY-MM-DD).', 'error'); return false; }
    // Required on create only (edit keeps legacy null rows editable). Inline
    // error, not a toast — the message belongs under the field.
    if (passwordRequired && !f.cnic.trim()) { setCnicError('CNIC is required.'); return false; }
    if (f.startDate.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(f.startDate.trim())) { showToast('Start date must use format YYYY-MM-DD.', 'error'); return false; }
    if (f.endDate.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(f.endDate.trim())) { showToast('End date must use format YYYY-MM-DD.', 'error'); return false; }
    if (f.startDate.trim() && f.endDate.trim() && new Date(f.endDate.trim()) < new Date(f.startDate.trim())) { showToast('End date cannot be before start date.', 'error'); return false; }
    if (f.cnic.trim() && !/^\d{13}$/.test(f.cnic.replace(/-/g, ''))) { showToast('CNIC must be 13 digits (e.g. 42101-1234567-8).', 'error'); return false; }
    return true;
  };

  const mentorsFor = departmentId =>
    mentors.filter(m => !departmentId || m.departmentId === Number(departmentId));

  const onDeptChange = (v, currentMentorId, setter, formKey) => {
    setter(p => {
      const stillValid = currentMentorId && mentors.find(m => m.id === Number(currentMentorId))?.departmentId === Number(v);
      return {...p, departmentId: v, mentorId: stillValid ? currentMentorId : null};
    });
  };

  const createIntern = async () => {
    if (!validate(form, {passwordRequired: true})) return;
    setCreating(true);
    try {
      const {queued} = await moderate({kind: 'admin', label: 'Create intern account', method: 'POST', url: '/admin/interns', body: {
        username: form.username.trim() || null,
        password: form.password,
        fullName: form.fullName.trim(),
        cnic: form.cnic.trim() || null,
        university: form.university.trim() || null,
        degree: form.degree.trim() || null,
        gender: form.gender,
        startDate: form.startDate.trim(),
        endDate: form.endDate.trim(),
        mentorId: Number(form.mentorId),
        departmentId: Number(form.departmentId),
        shiftId: form.shiftId ? Number(form.shiftId) : null,
      }});
      queuedToast(queued, 'Intern created. They can now log in.');
      setShowCreateModal(false);
      setForm(emptyForm);
      setCnicError(null);
      fetchInternsData();
    } catch (e) {
      if (e.response?.status === 409) {
        setCnicError(e.response?.data?.message || "This CNIC is already registered to another intern.");
      } else {
        setCnicError(null);
        showToast(e.response?.data?.message || "Couldn't create the intern. Try again.", 'error');
      }
    } finally { setCreating(false); }
  };

  const openEdit = i => {
    setEditTarget(i);
    setEditForm({
      fullName: i.fullName || '', username: i.username || '', password: '',
      cnic: i.cnic || '', university: i.university || '', degree: i.degree || '',
      gender: i.gender ?? 0,
      startDate: String(i.startDate || '').slice(0, 10),
      endDate: String(i.endDate || '').slice(0, 10),
      departmentId: i.departmentId ? String(i.departmentId) : null,
      mentorId: i.mentorId ? String(i.mentorId) : null,
      shiftId: i.shiftId ? String(i.shiftId) : null,
    });
    setEditActive(i.isActive !== false);
  };

  const saveIntern = async () => {
    if (!editTarget) return;
    if (!validate(editForm, {passwordRequired: false})) return;
    setSaving(true);
    try {
      await client.put(`/admin/interns/${editTarget.id}`, {
        username: editForm.username.trim() || null,
        password: editForm.password || null,
        fullName: editForm.fullName.trim(),
        cnic: editForm.cnic.trim() || null,
        university: editForm.university.trim() || null,
        degree: editForm.degree.trim() || null,
        gender: editForm.gender,
        startDate: editForm.startDate.trim() || null,
        endDate: editForm.endDate.trim() || null,
        departmentId: editForm.departmentId ? Number(editForm.departmentId) : null,
        mentorId: editForm.mentorId ? Number(editForm.mentorId) : null,
        shiftId: editForm.shiftId ? Number(editForm.shiftId) : null,
        isActive: editActive,
      });
      showToast('Intern updated.', 'success');
      setEditTarget(null);
      setDetailTarget(null);
      fetchInternsData();
    } catch (e) {
      showToast(e.response?.data?.message || "Couldn't update the intern. Try again.", 'error');
    } finally { setSaving(false); }
  };

  if (loading) return <Spinner style={styles.center} />;

  const q = query.trim().toLowerCase();
  const visible = q
    ? interns.filter(i => i.fullName.toLowerCase().includes(q) || i.username.toLowerCase().includes(q))
    : interns;

  return (
    <ScreenBackground style={styles.container}>
      <AppHeader
        home
        hideTitle
        title="Interns"
        right={(
          <TouchableOpacity id="add-intern-btn" style={styles.headerBtn} onPress={() => { setForm(emptyForm); setCnicError(null); setShowCreateModal(true); }}>
            <Icon name="userPlus" size={16} color="#fff" />
            <Text style={styles.headerBtnText}>Add Intern</Text>
          </TouchableOpacity>
        )}
      />

      <ScrollView
        contentContainerStyle={{paddingBottom: 100, flexGrow: 1}}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchInternsData();}} tintColor={colors.primary}/>}>
        <View style={styles.searchRow}>
          <Icon name="search" size={18} color={colors.textMuted} />
          <TextInput
            id="interns-search"
            style={styles.searchInput}
            placeholder="Search by name or username"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity id="interns-search-clear" onPress={() => setQuery('')} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
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
        {visible.length === 0 ? (
          <View style={styles.emptyBox}>
            <Icon name="search" size={44} color={colors.textMuted} />
            <Text style={styles.emptyText}>No interns {q ? `match '${query.trim()}'` : 'found'}</Text>
          </View>
        ) : visible.map(i => (
          <TouchableOpacity key={i.id} id={`intern-card-${i.id}`} style={styles.card} onPress={() => openInternDetail(i)}>
            <View style={styles.cardTop}>
              <View style={styles.avatarBox}><InternAvatar name={i.fullName} thumbPath={i.photoThumbPath} size={44} /></View>
              <View style={styles.cardInfo}>
                <Text style={styles.name}>{i.fullName}</Text>
                <Text style={styles.sub}>{i.department} • {i.mentor}</Text>
                <Text style={styles.sub2}>@{i.username}</Text>
              </View>
              <View style={[styles.badge, {backgroundColor: i.isExpired ? colors.error+'22' : i.isActive ? colors.success+'22' : colors.error+'22'}]}>
                <Text style={[styles.badgeText, {color: i.isExpired ? colors.error : i.isActive ? colors.success : colors.error}]}>
                  {i.isExpired ? 'Expired' : i.isActive ? 'Active' : 'Inactive'}
                </Text>
              </View>
            </View>
            {i.todayAttendance && (
              <View style={styles.todayRow}>
                {[['In', i.todayAttendance.inTime, i.todayAttendance.checkInPhotoPath], ['Out', i.todayAttendance.outTime, i.todayAttendance.checkOutPhotoPath]].map(([label, time, photo]) => (
                  <View key={label} style={styles.todayItem}>
                    <Text style={styles.todayLabel}>{label}</Text>
                    {photo ? (
                      <TouchableOpacity id={`today-${label.toLowerCase()}-${i.id}`} onPress={() => setViewerUri(fileUrl(photo))}>
                        <Image source={{uri: fileUrl(photo)}} style={styles.todayThumb} />
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.todayTime}>{time ? new Date(time).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : '—'}</Text>
                    )}
                    <Text style={styles.todayCaption}>{time ? new Date(time).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : '—'}</Text>
                  </View>
                ))}
              </View>
            )}
            <View style={styles.period}>
              <View style={styles.periodItem}>
                <Icon name="calendar" size={13} color={colors.textMuted} />
                <Text style={styles.periodText}>{safePeriod(i.startDate, i.endDate)}</Text>
              </View>
              <View style={styles.periodItem}>
                <Icon name={i.faceEnrolled ? 'user' : 'alert'} size={13} color={i.faceEnrolled ? colors.success : colors.pending} />
                <Text style={[styles.faceText, {color: i.faceEnrolled ? colors.success : colors.pending}]}>
                  {i.faceEnrolled ? 'Face Enrolled' : 'No Face'}
                </Text>
              </View>
            </View>
            {i.university && (
              <View style={styles.uniRow}>
                <Icon name="gradCap" size={13} color={colors.textMuted} />
                <Text style={styles.uni}>{i.degree} • {i.university}</Text>
              </View>
            )}
            <TouchableOpacity id={`edit-intern-${i.id}`} style={styles.editBtn} onPress={() => openEdit(i)}>
              <Icon name="pencil" size={15} color={colors.textAccent} />
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
        {visible.length > 0 && <EndOfListMarker />}
      </ScrollView>

      {/* Create Intern Modal */}
      <SwipeableModal visible={showCreateModal} transparent overlayStyle={styles.modalOverlay} sheetStyle={styles.modalContent} scrollable={false} onRequestClose={() => setShowCreateModal(false)}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Create Intern Account</Text>
              <Text style={styles.subtitle}>Leave username blank to auto-generate one (e.g. firstname.PIA.001).</Text>

              <InternFormFields
                styles={styles}
                colors={colors}
                form={form}
                setForm={setForm}
                deptOptions={deptOptions}
                mentorOptions={mentorsFor(form.departmentId).map(m => ({value: String(m.id), label: m.fullName}))}
                shiftOptions={shifts.map(s => ({value: String(s.id), label: s.name}))}
                onDeptChange={v => onDeptChange(v, form.mentorId, setForm)}
                cnicError={cnicError}
                clearCnicError={() => setCnicError(null)}
                inlineDropdowns
              />

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCreateModal(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity id="create-intern-submit" style={styles.createBtn} onPress={createIntern} disabled={creating}>
                  {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>Create</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
      </SwipeableModal>

      {/* Intern Detail Modal */}
      <SwipeableModal visible={!!detailTarget} transparent overlayStyle={styles.modalOverlay} sheetStyle={styles.modalContent} onRequestClose={() => setDetailTarget(null)}>
            <View style={styles.detailHeader}>
              <View style={[styles.badge, {backgroundColor: detailTarget?.isExpired ? colors.error+'22' : detailTarget?.isActive ? colors.success+'22' : colors.error+'22'}]}>
                <Text style={[styles.badgeText, {color: detailTarget?.isExpired ? colors.error : detailTarget?.isActive ? colors.success : colors.error}]}>
                  {detailTarget?.isExpired ? 'Expired' : detailTarget?.isActive ? 'Active' : 'Inactive'}
                </Text>
              </View>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setDetailTarget(null)}>
                <Icon name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.detailAvatar}>
              <InternAvatar name={detailTarget?.fullName} thumbPath={detailTarget?.photoThumbPath} size={64} />
            </View>
            <Text style={styles.detailName}>{detailTarget?.fullName}</Text>
            <Text style={styles.detailUsername}>@{detailTarget?.username}</Text>
            {[
              {label: 'RegNo', value: detailTarget?.regNo || '—'},
              {label: 'Department', value: detailTarget?.department || '—'},
              {label: 'Mentor', value: detailTarget?.mentor || '—'},
              {label: 'CNIC', value: detailTarget?.cnic || '—'},
              {label: 'University', value: detailTarget?.university || '—'},
              {label: 'Degree', value: detailTarget?.degree || '—'},
              {label: 'Period', value: detailTarget ? safePeriod(detailTarget.startDate, detailTarget.endDate) : '—'},
              {label: 'Today Check-in', value: detailTarget?.todayAttendance?.inTime ? new Date(detailTarget.todayAttendance.inTime).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : '—'},
              {label: 'Today Check-out', value: detailTarget?.todayAttendance?.outTime ? new Date(detailTarget.todayAttendance.outTime).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : '—'},
              {label: 'Face Status', value: detailTarget?.faceEnrolled ? 'Enrolled' : 'Not enrolled'},
              ...(() => {
                const devs = allDevices.filter(d => d.internId === detailTarget?.id);
                const laptop = devs.find(d => d.deviceType === 'Laptop');
                const phone = devs.find(d => d.deviceType === 'Phone');
                return [
                  {label: 'Laptop MAC', value: laptop?.macAddress || '—'},
                  {label: 'Phone MAC', value: phone?.macAddress || '—'},
                ];
              })(),
            ].map(row => (
              <View key={row.label} style={styles.detailRow}>
                <Text style={styles.detailLabel}>{row.label}</Text>
                <Text style={styles.detailValue}>{row.value}</Text>
              </View>
            ))}
            <View style={styles.detailActions}>
              <TouchableOpacity id="intern-docs-btn" style={styles.detailActionBtn} onPress={() => setActiveSheet('docs')}>
                <Icon name="folder" size={16} color={colors.textAccent} />
                <Text style={styles.detailActionText}>Documents ({internDocs.uploaded.length + internDocs.issued.length})</Text>
              </TouchableOpacity>
              <TouchableOpacity id="intern-attendance-btn" style={styles.detailActionBtn} onPress={() => setActiveSheet('attendance')}>
                <Icon name="mapPin" size={16} color={colors.textAccent} />
                <Text style={styles.detailActionText}>Attendance ({internAttendance.length})</Text>
              </TouchableOpacity>
              <TouchableOpacity id="intern-reset-pw-btn" style={styles.detailActionBtn} onPress={() => { setResetPw(''); setResetTarget(detailTarget); }}>
                <Icon name="key" size={16} color={colors.textAccent} />
                <Text style={styles.detailActionText}>Reset Password</Text>
              </TouchableOpacity>
              <TouchableOpacity id="intern-face-reset-btn" style={styles.detailActionBtn} onPress={() => setFaceResetTarget(detailTarget)} disabled={!detailTarget?.faceEnrolled}>
                <Icon name="user" size={16} color={detailTarget?.faceEnrolled ? colors.error : colors.textMuted} />
                <Text style={[styles.detailActionText, {color: detailTarget?.faceEnrolled ? colors.error : colors.textMuted}]}>Reset Face</Text>
              </TouchableOpacity>
              <TouchableOpacity id="intern-face-history-btn" style={styles.detailActionBtn} onPress={() => openFaceHistory(detailTarget)}>
                <Icon name="clock" size={16} color={colors.textAccent} />
                <Text style={styles.detailActionText}>Face History</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.faceBox}>
              <Text style={styles.detailLabel}>Facial Register</Text>
              <View style={styles.faceImageSlot}>
                {detailTarget?.faceEnrolled ? (
                  <View style={{alignItems: 'center'}}>
                    <Icon name="user" size={40} color={colors.success} />
                    <Text style={[styles.detailActionText, {color: colors.success, marginTop: 6}]}>Approved</Text>
                    {detailTarget?.faceEnrolledAt ? <Text style={styles.modalSubtitle}>{new Date(detailTarget.faceEnrolledAt).toLocaleString()}</Text> : null}
                  </View>
                ) : (
                  <Text style={styles.modalSubtitle}>No approved facial register yet.</Text>
                )}
              </View>
              <Text style={styles.modalSubtitle}>The approved facial register image will appear here once provided.</Text>
            </View>
            {activeSheet === 'docs' && (
              <View style={styles.sheetSection}>
                <Text style={styles.sheetTitle}>Documents</Text>
                {internDocs.uploaded.length === 0 && internDocs.issued.length === 0 ? (
                  <Text style={styles.sheetEmpty}>No documents uploaded.</Text>
                ) : (
                  [...internDocs.uploaded, ...internDocs.issued].map((d,i) => (
                    <TouchableOpacity key={`${d.documentType || d.type}-${d.id || i}`} style={styles.docRow} onPress={() => openDoc(d.filePath)}>
                      <Icon name="file" size={14} color={colors.textAccent} />
                      <View style={styles.docInfo}>
                        <Text style={styles.docName}>{d.documentType || d.name || 'Official Document'}</Text>
                        {d.documentType ? (
                          <Text style={styles.docMeta}>{d.status} · {new Date(d.uploadedAt).toLocaleDateString()}</Text>
                        ) : (
                          <Text style={styles.docMeta}>Issued {d.issuedAt ? new Date(d.issuedAt).toLocaleDateString() : ''}</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}
            {activeSheet === 'attendance' && (
              <View style={styles.sheetSection}>
                <Text style={styles.sheetTitle}>Recent Attendance</Text>
                {internAttendance.length === 0 ? (
                  <Text style={styles.sheetEmpty}>No attendance records.</Text>
                ) : (
                  internAttendance.slice(0,10).map(a => (
                    <View key={a.id} style={styles.attRow}>
                      <Text style={styles.attDate}>{new Date(a.timestamp).toLocaleDateString()}</Text>
                      <Text style={[styles.attStatus, {color: a.status==='Present'?colors.success:colors.error}]}>{a.status}</Text>
                      {a.arrivalStatus && <Text style={styles.attSlot}>Arr: {a.arrivalStatus}</Text>}
                      {a.departureStatus && <Text style={styles.attSlot}>Dep: {a.departureStatus}</Text>}
                    </View>
                  ))
                )}
              </View>
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setDetailTarget(null)}>
                <Text style={styles.cancelBtnText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity id="intern-detail-edit" style={styles.createBtn} onPress={() => { setDetailTarget(null); openEdit(detailTarget); }}>
                <Text style={styles.createBtnText}>Edit Details</Text>
              </TouchableOpacity>
            </View>
      </SwipeableModal>

      {/* Edit Intern Modal */}
      <SwipeableModal visible={!!editTarget} transparent overlayStyle={styles.modalOverlay} sheetStyle={styles.modalContent} scrollable={false} onRequestClose={() => setEditTarget(null)}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Edit Intern</Text>
              <Text style={styles.subtitle}>{editTarget?.fullName} (@{editTarget?.username})</Text>

              <Text style={styles.fieldLabel}>Account Status</Text>
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
              <Text style={styles.hint}>Inactive interns cannot log in.</Text>

              <InternFormFields
                styles={styles}
                colors={colors}
                form={editForm}
                setForm={setEditForm}
                deptOptions={deptOptions}
                mentorOptions={mentorsFor(editForm.departmentId).map(m => ({value: String(m.id), label: m.fullName}))}
                shiftOptions={shifts.map(s => ({value: String(s.id), label: s.name}))}
                onDeptChange={v => onDeptChange(v, editForm.mentorId, setEditForm)}
                isEdit
                inlineDropdowns
              />

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditTarget(null)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity id="edit-intern-submit" style={styles.createBtn} onPress={saveIntern} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>Save</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
      </SwipeableModal>

      {/* Reset Password Modal */}
      <SwipeableModal visible={!!resetTarget} transparent overlayStyle={styles.modalOverlay} sheetStyle={styles.modalContent} onRequestClose={() => setResetTarget(null)}>
            <Text style={styles.modalTitle}>Reset Password</Text>
            <Text style={styles.subtitle}>Set a new password for {resetTarget?.fullName}</Text>
            <Text style={styles.fieldLabel}>New Password</Text>
            <TextInput id="admin-reset-pw-input" style={styles.fieldInput} placeholder="At least 6 characters" placeholderTextColor={colors.textMuted} value={resetPw} onChangeText={setResetPw} secureTextEntry autoCapitalize="none" />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setResetTarget(null)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity id="admin-reset-pw-submit" style={styles.createBtn} onPress={resetInternPassword} disabled={resetting}>
                {resetting ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>Reset</Text>}
              </TouchableOpacity>
            </View>
      </SwipeableModal>

      {/* Reset Face Enrollment Modal */}
      <SwipeableModal visible={!!faceResetTarget} transparent overlayStyle={styles.modalOverlay} sheetStyle={styles.modalContent} onRequestClose={() => setFaceResetTarget(null)}>
            <Text style={styles.modalTitle}>Reset Face Enrollment</Text>
            <Text style={styles.subtitle}>{faceResetTarget?.fullName} will be required to re-enroll their face. Their previous enrollment is kept in history for reference.</Text>
            <Text style={styles.modalSubtitle}>This clears the current facial register so the intern must submit a new one.</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setFaceResetTarget(null)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity id="admin-face-reset-submit" style={[styles.createBtn, {backgroundColor: colors.error}]} onPress={resetFaceEnrollment} disabled={faceResetting}>
                {faceResetting ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>Reset</Text>}
              </TouchableOpacity>
            </View>
      </SwipeableModal>

      {/* Face History Sheet */}
      <SwipeableModal visible={showFaceHistory} transparent overlayStyle={styles.modalOverlay} sheetStyle={styles.modalContent} onRequestClose={() => setShowFaceHistory(false)}>
            <View style={styles.detailHeader}>
              <Text style={styles.modalTitle}>Face Enrollment History</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setShowFaceHistory(false)}>
                <Icon name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {faceHistory.length === 0 ? (
              <Text style={styles.modalSubtitle}>No previous face enrollment records.</Text>
            ) : (
              faceHistory.map(r => (
                <View key={r.id} style={styles.detailRow}>
                  <View>
                    <Text style={styles.detailLabel}>{r.status}</Text>
                    <Text style={styles.modalSubtitle}>{new Date(r.enrolledAt).toLocaleString()}</Text>
                  </View>
                  <Text style={[styles.detailValue, {color: r.status === 'Approved' ? colors.success : colors.textMuted}]}>{r.status === 'Approved' ? 'Enrolled' : r.status}</Text>
                </View>
              ))
            )}
      </SwipeableModal>

      <Modal visible={viewerUri !== null} transparent animationType="fade" onRequestClose={() => setViewerUri(null)}>
        <View style={styles.viewerOverlay}>
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerUri(null)}>
            <Icon name="close" size={22} color="#fff" />
          </TouchableOpacity>
          {viewerUri && <Image source={{uri: viewerUri}} style={styles.viewerImage} resizeMode="contain" />}
        </View>
      </Modal>
    </ScreenBackground>
  );
}

// Shared field set for Create + Edit modals.
function InternFormFields({styles, colors, form, setForm, deptOptions, mentorOptions, shiftOptions, onDeptChange, isEdit, inlineDropdowns, cnicError, clearCnicError}) {
  const set = (key, val) => setForm(p => ({...p, [key]: val}));
  const onCnicChange = v => { set('cnic', v); if (clearCnicError) clearCnicError(); };
  return (
    <>
      <View style={styles.modalField}>
        <Text style={styles.fieldLabel}>Full Name *</Text>
        <TextInput id="intern-name" style={styles.fieldInput} placeholder="e.g. Ali Raza" placeholderTextColor={colors.textMuted} value={form.fullName} onChangeText={v => set('fullName', v)} />
      </View>
      <View style={styles.modalField}>
        <Text style={styles.fieldLabel}>Username</Text>
        <TextInput id="intern-username" style={styles.fieldInput} placeholder="Auto-generated if blank" placeholderTextColor={colors.textMuted} autoCapitalize="none" value={form.username} onChangeText={v => set('username', v)} />
      </View>
      <View style={styles.modalField}>
        <Text style={styles.fieldLabel}>{isEdit ? 'Reset Password' : 'Password *'}</Text>
        <PasswordInput id="intern-password" style={styles.fieldInput} placeholder={isEdit ? 'Leave blank to keep current' : 'Temporary password'} placeholderTextColor={colors.textMuted} value={form.password} onChangeText={v => set('password', v)} />
      </View>
      <View style={styles.modalField}>
        <Text style={styles.fieldLabel}>{isEdit ? 'CNIC' : 'CNIC *'}</Text>
        <TextInput id="intern-cnic" style={styles.fieldInput} placeholder={isEdit ? '42101-1234567-8' : 'e.g. 42101-1234567-1'} placeholderTextColor={colors.textMuted} value={form.cnic} onChangeText={onCnicChange} />
        {cnicError ? (
          <View style={styles.inlineFieldError}>
            <Icon name="alert" size={13} color={colors.error} />
            <Text style={styles.inlineFieldErrorText}>{cnicError}</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.fieldLabel}>Gender</Text>
      <View style={styles.segRow}>
        <TouchableOpacity style={[styles.seg, form.gender === 0 && styles.genderSegActive]} onPress={() => set('gender', 0)}>
          <Text style={[styles.segText, form.gender === 0 && styles.genderSegTextActive]}>Male</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.seg, form.gender === 1 && styles.genderSegActive]} onPress={() => set('gender', 1)}>
          <Text style={[styles.segText, form.gender === 1 && styles.genderSegTextActive]}>Female</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.modalField}>
        <Text style={styles.fieldLabel}>University</Text>
        <TextInput id="intern-uni" style={styles.fieldInput} placeholder="e.g. NED University" placeholderTextColor={colors.textMuted} value={form.university} onChangeText={v => set('university', v)} />
      </View>
      <View style={styles.modalField}>
        <Text style={styles.fieldLabel}>Degree</Text>
        <TextInput id="intern-degree" style={styles.fieldInput} placeholder="e.g. BS Computer Science" placeholderTextColor={colors.textMuted} value={form.degree} onChangeText={v => set('degree', v)} />
      </View>

      <View style={styles.formRow}>
        <DateField label={`Start Date${isEdit ? '' : ' *'}`} value={form.startDate} onChange={d => set('startDate', d ? d.toISOString().slice(0,10) : '')} maximumDate={form.endDate ? new Date(form.endDate) : undefined} containerStyle={[styles.modalField, {flex: 1}]} />
        <DateField label={`End Date${isEdit ? '' : ' *'}`} value={form.endDate} onChange={d => set('endDate', d ? d.toISOString().slice(0,10) : '')} minimumDate={form.startDate ? new Date(form.startDate) : undefined} containerStyle={[styles.modalField, {flex: 1}]} />
      </View>

      <View style={{marginTop: 4, marginBottom: 14}}>
        <Dropdown
          label={`Department${isEdit ? '' : ' *'}`}
          inline={inlineDropdowns}
          value={form.departmentId}
          onChange={onDeptChange}
          options={deptOptions}
          placeholder="Select department"
        />
      </View>

      <View style={{marginBottom: 4}}>
        <Dropdown
          label={`Mentor${isEdit ? '' : ' *'}`}
          inline={inlineDropdowns}
          value={form.mentorId}
          onChange={v => set('mentorId', v)}
          options={mentorOptions}
          placeholder={form.departmentId ? 'Select mentor' : 'Select a department first'}
        />
      </View>

      <View style={{marginBottom: 14}}>
        <Dropdown
          label="Shift"
          inline={inlineDropdowns}
          value={form.shiftId}
          onChange={v => set('shiftId', v)}
          options={[{value: null, label: 'No shift (default: Morning)'}, ...(shiftOptions || [])]}
          placeholder="Select a shift"
        />
      </View>
    </>
  );
}

const makeStyles = colors => StyleSheet.create({
  container:{flex:1},
  center:{flex:1, justifyContent:'center', alignItems:'center'},
  headerBtn:{flexDirection:'row', alignItems:'center', gap:6, backgroundColor:'rgba(255,255,255,0.18)', borderWidth:1, borderColor:'rgba(255,255,255,0.35)', borderRadius:20, paddingHorizontal:14, paddingVertical:9},
  headerBtnText:{color:'#fff', fontWeight:'700', fontSize:13},
  searchRow:{flexDirection:'row', alignItems:'center', gap:8, marginHorizontal:16, marginTop:12, marginBottom:8, backgroundColor:colors.card, borderRadius:12, borderWidth:1, borderColor:colors.border, paddingHorizontal:12, paddingVertical:10},
  searchInput:{flex:1, color:colors.text, fontSize:14, padding:0},
  filterRow:{flexDirection:'row', paddingHorizontal:16, marginBottom:8},
  emptyBox: {alignItems:'center', paddingVertical:60},
  emptyText: {color:colors.textSecondary, fontSize:15, marginTop:10},
  card:{backgroundColor:colors.surface, margin:12, marginBottom:4, borderRadius:14, padding:14, borderWidth:1, borderColor:colors.border},
  cardTop:{flexDirection:'row', alignItems:'center', marginBottom:8},
  avatarBox:{width:44, height:44, borderRadius:22, justifyContent:'center', alignItems:'center', marginRight:12},
  cardInfo:{flex:1},
  name:{color:colors.text, fontSize:15, fontWeight:'700'},
  sub:{color:colors.textSecondary, fontSize:12},
  sub2:{color:colors.textMuted, fontSize:11},
  badge:{borderRadius:6, paddingHorizontal:8, paddingVertical:4},
  badgeText:{fontSize:11, fontWeight:'700'},
  period:{flexDirection:'row', justifyContent:'space-between', marginBottom:4},
  periodItem:{flexDirection:'row', alignItems:'center', gap:4},
  periodText:{color:colors.textMuted, fontSize:12},
  faceText:{color:colors.textMuted, fontSize:12},
  uniRow:{flexDirection:'row', alignItems:'center', gap:4, marginBottom:8},
  uni:{color:colors.textMuted, fontSize:12},
  editBtn:{flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, borderRadius:10, paddingVertical:9, backgroundColor:colors.primary+'15', borderWidth:1, borderColor:colors.primary+'55'},
  editBtnText:{color:colors.textAccent, fontWeight:'600', fontSize:13},
  // Modal (shared shape with MentorManagementScreen)
  modalOverlay: {flex:1, backgroundColor:'rgba(0,0,0,0.7)', justifyContent:'flex-end'},
  modalContent: {backgroundColor:colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, padding:24, maxHeight:'88%'},
  modalTitle: {color:colors.text, fontSize:18, fontWeight:'700', marginBottom:6},
  subtitle: {color: colors.textMuted, fontSize: 12, marginBottom: 18},
  modalField: {marginBottom:12},
  formRow: {flexDirection: 'row', gap: 12},
  fieldLabel: {color:colors.textSecondary, fontSize:12, fontWeight:'600', marginBottom:6},
  fieldInput: {backgroundColor:colors.card, borderRadius:10, borderWidth:1, borderColor:colors.border, color:colors.text, paddingHorizontal:14, paddingVertical:12, fontSize:14},
  inlineFieldError: {flexDirection:'row', alignItems:'center', gap:6, marginTop:6},
  inlineFieldErrorText: {color:colors.error, fontSize:12, flexShrink:1},
  hint: {color: colors.textMuted, fontSize: 11, marginBottom: 14},
  // Detail modal
  detailHeader: {flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:12},
  closeBtn: {padding:4},
  detailAvatar: {width:64, height:64, borderRadius:32, justifyContent:'center', alignItems:'center', alignSelf:'center', marginBottom:10},
  detailName: {color:colors.text, fontSize:18, fontWeight:'700', textAlign:'center'},
  detailUsername: {color:colors.textMuted, fontSize:13, textAlign:'center', marginBottom:16},
  detailRow: {flexDirection:'row', justifyContent:'space-between', paddingVertical:10, borderTopWidth:1, borderTopColor:colors.border},
  detailLabel: {color:colors.textSecondary, fontSize:13},
  detailValue: {color:colors.text, fontSize:13, fontWeight:'600'},
  // Status / gender toggles
  segRow: {flexDirection:'row', gap:10, marginBottom:4},
  seg: {flex:1, flexDirection:'row', justifyContent:'center', alignItems:'center', gap:6, paddingVertical:12, borderRadius:10, borderWidth:1, borderColor:colors.border, backgroundColor:colors.card},
  segActive: {borderColor:colors.success, backgroundColor:colors.success + '22'},
  segInactive: {borderColor:colors.error, backgroundColor:colors.error + '22'},
  segText: {color:colors.textSecondary, fontWeight:'600', fontSize:13},
  segTextActive: {color:colors.success, fontWeight:'700'},
  segTextInactive: {color:colors.error, fontWeight:'700'},
  genderSegActive: {borderColor:colors.primary, backgroundColor:colors.primary + '22'},
  genderSegTextActive: {color:colors.textAccent, fontWeight:'700'},
  modalActions: {flexDirection:'row', gap:12, marginTop:8, marginBottom: 8},
  cancelBtn: {flex:1, backgroundColor:colors.card, borderRadius:12, paddingVertical:14, alignItems:'center', borderWidth:1, borderColor:colors.border},
  cancelBtnText: {color:colors.textSecondary, fontWeight:'600'},
  createBtn: {flex:1, backgroundColor:colors.primary, borderRadius:12, paddingVertical:14, alignItems:'center'},
  createBtnText: {color:'#fff', fontWeight:'700'},
  todayRow: {flexDirection: 'row', gap: 24, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border},
  todayItem: {flexDirection: 'row', alignItems: 'center', gap: 8},
  todayLabel: {color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase'},
  todayThumb: {width: 26, height: 26, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card},
  todayCaption: {color: colors.textSecondary, fontSize: 12, fontWeight: '600'},
  todayTime: {color: colors.textSecondary, fontSize: 12, fontWeight: '600'},
  // Sheet sections (docs / attendance)
  sheetSection: {marginTop:14, borderTopWidth:1, borderTopColor:colors.border, paddingTop:10},
  sheetTitle: {color:colors.text, fontSize:15, fontWeight:'700', marginBottom:8},
  sheetEmpty: {color:colors.textMuted, fontSize:13, paddingVertical:8},
  docRow: {flexDirection:'row', alignItems:'center', gap:10, paddingVertical:9, borderBottomWidth:1, borderBottomColor:colors.border},
  docInfo: {flex:1},
  docName: {color:colors.text, fontSize:13, fontWeight:'600'},
  docMeta: {color:colors.textMuted, fontSize:11, marginTop:2},
  attRow: {flexDirection:'row', alignItems:'center', gap:8, paddingVertical:9, borderBottomWidth:1, borderBottomColor:colors.border},
  attDate: {color:colors.text, fontSize:13, fontWeight:'600', width:110},
  attStatus: {fontSize:12, fontWeight:'700'},
  attSlot: {color:colors.textMuted, fontSize:11, flex:1, textAlign:'right'},
  viewerOverlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center'},
  viewerClose: {position: 'absolute', top: 50, right: 20, zIndex: 1, padding: 8},
  viewerImage: {width: '100%', height: '78%'},
});
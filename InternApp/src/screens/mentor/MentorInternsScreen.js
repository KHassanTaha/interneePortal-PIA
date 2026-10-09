import React, {useCallback, useState, useMemo} from 'react';
import {View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl, Modal, Image, PermissionsAndroid} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import {useFocusEffect} from '@react-navigation/native';
import client from '../../api/client';
import {fileUrl} from '../../api/fileClient';
import {showToast} from '../../components/AppToast';
import {showConfirm} from '../../components/AppConfirm';
import {moderate} from '../../api/moderate';
import {useAppTheme} from '../../theme';
import ScreenBackground from '../../components/ScreenBackground';
import AppHeader from '../../components/AppHeader';
import Icon from '../../components/Icon';
import InternAvatar from '../../components/InternAvatar';
import Spinner from '../../components/Spinner';
import Dropdown from '../../components/Dropdown';
import PasswordInput from '../../components/PasswordInput';
import DateField from '../../components/DateField';
import EndOfListMarker from '../../components/EndOfListMarker';
import SwipeableModal from '../../components/SwipeableModal';
import {safePeriod} from '../../utils/dates';

export default function MentorInternsScreen({navigation}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [interns, setInterns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewerUri, setViewerUri] = useState(null);
  const [query, setQuery] = useState('');

  const [detailTarget, setDetailTarget] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [internDocs, setInternDocs] = useState({uploaded: [], issued: []});
  const [internAttendance, setInternAttendance] = useState([]);
  const [allDevices, setAllDevices] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [activeSheet, setActiveSheet] = useState(null);

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferTarget, setTransferTarget] = useState(null);
  const [allMentors, setAllMentors] = useState([]);
  const [transferDept, setTransferDept] = useState('');
  const [transferToMentor, setTransferToMentor] = useState(null);
  const [transferNote, setTransferNote] = useState('');
  const [sendingTransfer, setSendingTransfer] = useState(false);

  const [showShiftChange, setShowShiftChange] = useState(false);
  const [shiftChangeTarget, setShiftChangeTarget] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [shiftChangeTo, setShiftChangeTo] = useState(null);
  const [shiftChangeNote, setShiftChangeNote] = useState('');
  const [sendingShift, setSendingShift] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({fullName:'', password:'', cnic:'', university:'', degree:'', gender:'Male', customUsername:''});
  const [selectedShift, setSelectedShift] = useState(null);
  const [createStart, setCreateStart] = useState(new Date());
  const [createEnd, setCreateEnd] = useState(new Date(Date.now() + 90*24*60*60*1000));
  const [creating, setCreating] = useState(false);
  const [createOffice, setCreateOffice] = useState(null);
  const [capturingLoc, setCapturingLoc] = useState(false);

  const fetchData = async () => {
    try {
      const [iRes, mRes, dRes] = await Promise.all([
        client.get('/mentor/interns'),
        client.get('/mentor/mentors'),
        client.get('/mentor/devices'),
      ]);
      setInterns(iRes.data);
      setAllMentors(mRes.data);
      setAllDevices(dRes.data);
    } catch { showToast("Couldn't load interns.", 'error'); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [iRes, mRes, dRes] = await Promise.all([
          client.get('/mentor/interns'),
          client.get('/mentor/mentors'),
          client.get('/mentor/devices'),
        ]);
        if (!cancelled) { setInterns(iRes.data); setAllMentors(mRes.data); setAllDevices(dRes.data); }
      } catch { showToast("Couldn't load interns.", 'error'); }
      finally { if (!cancelled) { setLoading(false); setRefreshing(false); } }
    };
    load();
    return () => { cancelled = true; setQuery(''); };
  }, []));

  const openDetail = async (i) => {
    setDetailTarget(i);
    setActiveSheet(null);
    setLoadingDetail(true);
    try {
      const [detailRes, docsRes, attRes] = await Promise.all([
        client.get(`/mentor/interns/${i.id}`),
        client.get(`/mentor/interns/${i.id}/documents`),
        client.get(`/mentor/attendance?internId=${i.id}`),
      ]);
      setDetailData(detailRes.data);
      setInternDocs(docsRes.data);
      setInternAttendance(attRes.data);
    } catch {}
    finally { setLoadingDetail(false); }
  };

  const openTransfer = async (intern) => {
    setTransferTarget(intern);
    setTransferDept(intern.department || '');
    setTransferToMentor(null);
    setTransferNote('');
    setShowTransferModal(true);
  };

  const submitTransfer = async () => {
    if (!transferToMentor) { showToast('Select a target mentor.', 'error'); return; }
    setSendingTransfer(true);
    try {
      await client.post(`/mentor/interns/${transferTarget.id}/transfer`, {toMentorId: Number(transferToMentor), notes: transferNote.trim() || null});
      showToast('Transfer initiated.', 'success');
      setShowTransferModal(false);
      fetchData();
    } catch (e) { showToast(e.response?.data?.message || 'Failed.', 'error'); }
    finally { setSendingTransfer(false); }
  };

  const openShiftChange = async (intern) => {
    setShiftChangeTarget(intern);
    setShiftChangeTo(null);
    setShiftChangeNote('');
    try {
      const res = await client.get('/mentor/shifts');
      setShifts(res.data);
    } catch {}
    setShowShiftChange(true);
  };

  const submitShiftChange = async () => {
    if (!shiftChangeTo) { showToast('Select a target shift.', 'error'); return; }
    setSendingShift(true);
    try {
      await client.post(`/mentor/interns/${shiftChangeTarget.id}/shift-change`, {toShiftId: Number(shiftChangeTo), notes: shiftChangeNote.trim() || null});
      showToast('Shift change requested.', 'success');
      setShowShiftChange(false);
    } catch (e) { showToast(e.response?.data?.message || 'Failed.', 'error'); }
    finally { setSendingShift(false); }
  };

  const openFilePath = path => {
    const {openFileWithAuth} = require('../../api/fileClient');
    openFileWithAuth(path).catch(() => showToast("Couldn't open file.", 'error'));
  };

  const openCreate = async () => {
    setCreateForm({fullName:'', password:'', cnic:'', university:'', degree:'', gender:'Male', customUsername:''});
    setCreateStart(new Date());
    setCreateEnd(new Date(Date.now() + 90*24*60*60*1000));
    setCreateOffice(null);
    try {
      const res = await client.get('/mentor/shifts');
      setShifts(res.data);
      setSelectedShift(res.data.find(s => s.name.toLowerCase() === 'morning') || res.data.find(s => s.isCompanyWide) || res.data[0] || null);
    } catch { setSelectedShift(null); }
    setShowCreate(true);
  };

  const getAutoUsername = () => {
    if (createForm.customUsername.trim()) return createForm.customUsername.trim();
    if (!createForm.fullName.trim()) return 'firstname.PIA.001';
    const first = createForm.fullName.trim().split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${first || 'intern'}.PIA.001`;
  };

  const captureCreateLocation = async () => {
    setCapturingLoc(true);
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {title: 'Location access', message: 'Capture the intern\'s office location so their attendance geofence is accurate.', buttonPositive: 'OK'},
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('Location denied');
      const pos = await new Promise((resolve, reject) => Geolocation.getCurrentPosition(resolve, reject, {enableHighAccuracy: true, timeout: 12000, maximumAge: 60000}));
      setCreateOffice({lat: pos.coords.latitude, lng: pos.coords.longitude});
      showToast('Office location captured. Attendance geofence will use these coordinates.', 'success');
    } catch {
      showToast("Couldn't capture your location. Check location access and try again.", 'error');
    } finally { setCapturingLoc(false); }
  };

  const submitCreate = async () => {
    if (!createForm.fullName.trim() || !createForm.password.trim()) { showToast('Full name and password are required.', 'error'); return; }
    if (createForm.cnic.trim() && !/^\d{13}$/.test(createForm.cnic.replace(/-/g, ''))) { showToast('CNIC must be 13 digits.', 'error'); return; }
    if (createStart < new Date(new Date().setHours(0,0,0,0))) { showToast('Start date cannot be in the past.', 'error'); return; }
    if (createStart >= createEnd) { showToast('End date must be after the start date.', 'error'); return; }
    if (createStart >= createEnd) { showToast('End date must be after the start date.', 'error'); return; }

    setCreating(true);
    try {
      const body = {
        username: createForm.customUsername.trim() || null,
        password: createForm.password,
        fullName: createForm.fullName.trim(),
        cnic: createForm.cnic.trim() || null,
        university: createForm.university.trim() || null,
        degree: createForm.degree.trim() || null,
        gender: createForm.gender,
        departmentId: null,
        shiftId: selectedShift?.id || null,
        startDate: `${createStart.getFullYear()}-${String(createStart.getMonth()+1).padStart(2,'0')}-${String(createStart.getDate()).padStart(2,'0')}`,
        endDate: `${createEnd.getFullYear()}-${String(createEnd.getMonth()+1).padStart(2,'0')}-${String(createEnd.getDate()).padStart(2,'0')}`,
        officeLatitude: createOffice?.lat ?? null,
        officeLongitude: createOffice?.lng ?? null,
      };
      const {queued, res} = await moderate({kind: 'mentor', label: 'Create intern account', method: 'POST', url: '/mentor/interns', body});
      setShowCreate(false);
      if (queued) {
        showToast('Intern create saved locally — will sync when online.', 'info');
      } else {
        const days = Math.ceil((createEnd.getTime() - createStart.getTime()) / (1000*60*60*24));
        const creds = `Intern account created.\n\nUsername: ${res.data.username}\nDuration: ${days} Days (~${(days/30).toFixed(1)} Months)\n\nShare these credentials with the intern.`;
        showToast('Intern created.', 'success');
        showConfirm({title:'Account created', message:creds, confirmText:'Done'});
      }
      fetchData();
    } catch (e) { showToast(e.response?.data?.message || "Couldn't create the intern account. Try again.", 'error'); }
    finally { setCreating(false); }
  };

  if (loading) return <Spinner style={styles.center} />;

  const q = query.trim().toLowerCase();
  const visible = q ? interns.filter(i => i.fullName.toLowerCase().includes(q)) : interns;
  const mentorDepts = [...new Set(allMentors.map(m => m.department).filter(Boolean))];

  return (
    <ScreenBackground style={styles.container}>
      <AppHeader home title="Interns" right={(
        <TouchableOpacity style={styles.headerBtn} onPress={openCreate}>
          <Icon name="userPlus" size={16} color="#fff" />
          <Text style={styles.headerBtnText}>Add Intern</Text>
        </TouchableOpacity>
      )} />
      <ScrollView contentContainerStyle={{paddingBottom:100, flexGrow:1}} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchData();}} tintColor={colors.primary}/>}>
        <View style={styles.searchRow}>
          <Icon name="search" size={18} color={colors.textMuted} />
          <TextInput style={styles.searchInput} placeholder="Search interns" placeholderTextColor={colors.textMuted} value={query} onChangeText={setQuery} />
          {query.length > 0 && (
            <TouchableOpacity id="mentor-interns-search-clear" onPress={() => setQuery('')} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Icon name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        {visible.length === 0 ? (
          <View style={styles.emptyBox}><Icon name="gradCap" size={44} color={colors.textMuted} /><Text style={styles.emptyText}>No interns</Text></View>
        ) : visible.map(i => (
          <TouchableOpacity key={i.id} style={styles.card} onPress={() => openDetail(i)}>
            <View style={styles.cardTop}>
              <View style={styles.avatarBox}><InternAvatar name={i.fullName} thumbPath={i.photoThumbPath} size={44} /></View>
              <View style={{flex:1}}>
                <Text style={styles.name}>{i.fullName}</Text>
                <Text style={styles.sub}>@{i.username} • {i.department}</Text>
                {i.shift && <Text style={styles.sub2}>Shift: {i.shift}</Text>}
              </View>
              <View style={[styles.badge, {backgroundColor: i.isActive ? colors.success+'22' : colors.error+'22'}]}>
                <Text style={[styles.badgeText, {color: i.isActive ? colors.success : colors.error}]}>{i.isActive ? 'Active' : 'Inactive'}</Text>
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
            <View style={styles.cardActions}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => openDetail(i)}><Icon name="eye" size={14} color={colors.textAccent} /><Text style={styles.actionText}>Detail</Text></TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('MentorEditIntern', {intern: i})}><Icon name="pencil" size={14} color={colors.textAccent} /><Text style={styles.actionText}>Edit</Text></TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => openShiftChange(i)}><Icon name="refresh" size={14} color={colors.textAccentAlt} /><Text style={[styles.actionText, {color:colors.textAccentAlt}]}>Shift</Text></TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => openTransfer(i)}><Icon name="transfer" size={14} color={colors.info} /><Text style={[styles.actionText, {color:colors.info}]}>Transfer</Text></TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))}
        {visible.length > 0 && <EndOfListMarker />}
      </ScrollView>

      {/* Detail Modal */}
      <SwipeableModal visible={!!detailTarget} transparent overlayStyle={styles.modalOverlay} sheetStyle={styles.modalContent} scrollable={false} onRequestClose={() => setDetailTarget(null)}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.detailAvatarWrap}>
                <InternAvatar name={detailTarget?.fullName} thumbPath={detailData?.photoThumbPath || detailTarget?.photoThumbPath} size={64} />
              </View>
              <View style={styles.detailHeader}>
                <Text style={styles.modalTitle}>{detailTarget?.fullName}</Text>
                <TouchableOpacity onPress={() => setDetailTarget(null)}><Icon name="close" size={18} color={colors.textSecondary} /></TouchableOpacity>
              </View>
              {loadingDetail ? <ActivityIndicator size="large" color={colors.textAccent} style={{marginVertical:30}} /> : (
                <>
                  {[
                    {label:'Username', value:`@${detailTarget?.username}`},
                    {label:'Department', value:detailTarget?.department},
                    {label:'Shift', value:(typeof detailData?.shift === 'object' ? detailData?.shift?.name : detailData?.shift) || 'Default (Morning)'},
                    {label:'CNIC', value:detailTarget?.cnic || '—'},
                    {label:'University', value:detailTarget?.university || '—'},
                    {label:'Period', value: safePeriod(detailTarget?.startDate, detailTarget?.endDate)},
                    {label:'Today Check-in', value: detailData?.todayAttendance?.inTime ? new Date(detailData.todayAttendance.inTime).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : '—'},
                    {label:'Today Check-out', value: detailData?.todayAttendance?.outTime ? new Date(detailData.todayAttendance.outTime).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : '—'},
                    {label:'Attendance Score', value: detailData?.attendancePercentage != null ? `${detailData.attendancePercentage.toFixed(1)}%` : '—'},
                    ...(() => {
                      const devs = allDevices.filter(d => d.internId === detailTarget?.id);
                      const laptop = devs.find(d => d.deviceType === 'Laptop');
                      const phone = devs.find(d => d.deviceType === 'Phone');
                      return [
                        {label:'Laptop MAC', value: laptop?.macAddress || '—'},
                        {label:'Phone MAC', value: phone?.macAddress || '—'},
                      ];
                    })(),
                  ].map(r => (
                    <View key={r.label} style={styles.detailRow}>
                      <Text style={styles.detailLabel}>{r.label}</Text>
                      <Text style={styles.detailValue}>{r.value}</Text>
                    </View>
                  ))}
                  <View style={styles.detailActions}>
                    <TouchableOpacity style={styles.detailActionBtn} onPress={() => setActiveSheet('docs')}><Icon name="folder" size={16} color={colors.textAccent} /><Text style={styles.detailActionText}>Docs ({internDocs.uploaded.length + internDocs.issued.length})</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.detailActionBtn} onPress={() => setActiveSheet('attendance')}><Icon name="mapPin" size={16} color={colors.textAccent} /><Text style={styles.detailActionText}>Attendance ({internAttendance.length})</Text></TouchableOpacity>
                  </View>
                  {activeSheet === 'docs' && (
                    <View style={styles.sheetSection}>
                      <Text style={styles.sheetTitle}>Documents</Text>
                      {internDocs.uploaded.length === 0 && internDocs.issued.length === 0 ? (
                        <Text style={styles.sheetEmpty}>No documents uploaded.</Text>
                      ) : (
                        [...internDocs.uploaded, ...internDocs.issued].map((d,i) => (
                          <TouchableOpacity key={i} style={styles.docRow} onPress={() => d.filePath && openFilePath(d.filePath)}>
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
                      {internAttendance.slice(0,10).map(a => (
                        <View key={a.id} style={styles.attRow}>
                          <Text style={styles.attDate}>{new Date(a.timestamp).toLocaleDateString()}</Text>
                          <Text style={[styles.attStatus, {color: a.status==='Present'?colors.success:colors.error}]}>{a.status}</Text>
                          {a.arrivalStatus && <Text style={styles.attSlot}>Arr: {a.arrivalStatus}</Text>}
                          {a.departureStatus && <Text style={styles.attSlot}>Dep: {a.departureStatus}</Text>}
                        </View>
                      ))}
                    </View>
                  )}
                </>
              )}
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setDetailTarget(null)}><Text style={styles.cancelBtnText}>Close</Text></TouchableOpacity>
              </View>
            </ScrollView>
      </SwipeableModal>

      {/* Transfer Modal */}
      <SwipeableModal visible={showTransferModal} transparent overlayStyle={styles.modalOverlay} sheetStyle={styles.modalContent} onRequestClose={() => setShowTransferModal(false)}>
            <Text style={styles.modalTitle}>Initiate Intern Transfer</Text>
            <Text style={styles.subtitle}>Transfer {transferTarget?.fullName} to another mentor.</Text>
            {mentorDepts.length > 0 && (
              <View style={{marginBottom:12}}>
                <Dropdown
                  label="Department"
                  value={transferDept}
                  onChange={setTransferDept}
                  options={[{value: '', label: 'All Departments'}, ...mentorDepts.map(d => ({value: d, label: d}))]}
                  placeholder="All Departments"
                  inline
                  searchable={false}
                />
              </View>
            )}
            <View style={{marginBottom:12}}>
              <Dropdown label="To Mentor" value={transferToMentor} onChange={setTransferToMentor} options={allMentors.filter(m => m.id !== detailTarget?.mentorId && (!transferDept || m.department === transferDept)).map(m => ({value: String(m.id), label: m.fullName}))} placeholder="Select mentor" inline />
            </View>
            <View style={styles.modalField}>
              <Text style={styles.fieldLabel}>Note</Text>
              <TextInput style={styles.fieldInput} placeholder="Optional" placeholderTextColor={colors.textMuted} value={transferNote} onChangeText={setTransferNote} />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowTransferModal(false)}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.createBtn} onPress={submitTransfer} disabled={sendingTransfer}>
                {sendingTransfer ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>Initiate Transfer</Text>}
              </TouchableOpacity>
            </View>
      </SwipeableModal>

      {/* Shift Change Modal */}
      <SwipeableModal visible={showShiftChange} transparent overlayStyle={styles.modalOverlay} sheetStyle={styles.modalContent} onRequestClose={() => setShowShiftChange(false)}>
            <Text style={styles.modalTitle}>Request Shift Change</Text>
            <Text style={styles.subtitle}>Change shift for {shiftChangeTarget?.fullName}.</Text>
            <View style={{marginBottom:12}}>
              <Dropdown label="New Shift" value={shiftChangeTo} onChange={setShiftChangeTo} options={shifts.map(s => ({value: String(s.id), label: `${s.name} (${s.startTime?.slice(0,5)}-${s.endTime?.slice(0,5)})`}))} placeholder="Select shift" inline />
            </View>
            <View style={styles.modalField}>
              <Text style={styles.fieldLabel}>Note</Text>
              <TextInput style={styles.fieldInput} placeholder="Optional" placeholderTextColor={colors.textMuted} value={shiftChangeNote} onChangeText={setShiftChangeNote} />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowShiftChange(false)}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.createBtn} onPress={submitShiftChange} disabled={sendingShift}>
                {sendingShift ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>Request Change</Text>}
              </TouchableOpacity>
            </View>
      </SwipeableModal>

      {/* Create Intern Modal */}
      <SwipeableModal visible={showCreate} transparent overlayStyle={styles.modalOverlay} sheetStyle={styles.modalContent} scrollable={false} onRequestClose={() => setShowCreate(false)}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Add Intern</Text>
              <Text style={styles.subtitle}>Username is auto-generated in the format firstname.PIA.001. The intern is assigned to your department by default.</Text>

              <View style={styles.modalField}>
                <Text style={styles.fieldLabel}>Full Name *</Text>
                <TextInput style={styles.fieldInput} placeholder="e.g. Ali Raza" placeholderTextColor={colors.textMuted} value={createForm.fullName} onChangeText={v => setCreateForm(f => ({...f, fullName: v}))} />
              </View>

              <View style={styles.modalField}>
                <Text style={styles.fieldLabel}>Gender</Text>
                <View style={styles.segRow}>
                  {['Male','Female'].map(g => (
                    <TouchableOpacity key={g} style={[styles.seg, createForm.gender === g && styles.segActive]} onPress={() => setCreateForm(f => ({...f, gender: g}))}>
                      <Text style={[styles.segText, createForm.gender === g && styles.segTextActive]}>{g}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.usernameCard}>
                <Text style={styles.fieldLabel}>Auto-Generated Username</Text>
                <View style={styles.usernameRow}>
                  <Icon name="key" size={15} color={colors.textAccent} />
                  <Text style={styles.usernameValue}>{getAutoUsername()}</Text>
                </View>
              </View>

              <View style={styles.modalField}>
                <Text style={styles.fieldLabel}>Custom Username (optional)</Text>
                <TextInput style={styles.fieldInput} placeholder="Leave blank to auto-generate" placeholderTextColor={colors.textMuted} autoCapitalize="none" value={createForm.customUsername} onChangeText={v => setCreateForm(f => ({...f, customUsername: v}))} />
              </View>

              <View style={styles.modalField}>
                <Text style={styles.fieldLabel}>Login Password *</Text>
                <PasswordInput style={styles.fieldInput} placeholder="Temporary password" placeholderTextColor={colors.textMuted} value={createForm.password} onChangeText={v => setCreateForm(f => ({...f, password: v}))} />
              </View>

              <View style={styles.modalField}>
                <Dropdown
                  label="Shift"
                  id="create-shift"
                  value={selectedShift?.id ?? null}
                  options={shifts.map(s => ({value: s.id, label: `${s.name} (${s.startTime?.slice(0,5)}-${s.endTime?.slice(0,5)})`}))}
                  onChange={id => setSelectedShift(shifts.find(s => s.id === id) || null)}
                  placeholder="Select shift"
                  searchable={false}
                />
              </View>

              <View style={styles.modalField}>
                <Text style={styles.fieldLabel}>CNIC</Text>
                <TextInput style={styles.fieldInput} placeholder="42101-1234567-8" placeholderTextColor={colors.textMuted} keyboardType="numeric" value={createForm.cnic} onChangeText={v => setCreateForm(f => ({...f, cnic: v}))} />
              </View>

              <View style={styles.modalField}>
                <Text style={styles.fieldLabel}>University / Institute</Text>
                <TextInput style={styles.fieldInput} placeholder="e.g. NED University" placeholderTextColor={colors.textMuted} value={createForm.university} onChangeText={v => setCreateForm(f => ({...f, university: v}))} />
              </View>

              <View style={styles.modalField}>
                <Text style={styles.fieldLabel}>Degree / Program</Text>
                <TextInput style={styles.fieldInput} placeholder="e.g. BS Computer Science" placeholderTextColor={colors.textMuted} value={createForm.degree} onChangeText={v => setCreateForm(f => ({...f, degree: v}))} />
              </View>

              <View style={styles.formRow}>
                <DateField label="Start Date" value={createStart} onChange={d => { if (d) { setCreateStart(d); if (d >= createEnd) setCreateEnd(new Date(d.getTime() + 30*24*60*60*1000)); } }} maximumDate={createEnd} containerStyle={[styles.modalField, {flex:1}]} />
                <DateField label="End Date" value={createEnd} onChange={d => { if (d) { if (d <= createStart) { showToast('End date must be after the start date.', 'error'); return; } setCreateEnd(d); } }} minimumDate={createStart} containerStyle={[styles.modalField, {flex:1}]} />
              </View>

              <View style={styles.durationCard}>
                <Icon name="clock" size={14} color={colors.textAccent} />
                <Text style={styles.durationText}>Duration: {Math.ceil((createEnd.getTime() - createStart.getTime()) / (1000*60*60*24))} Days (~{(Math.ceil((createEnd.getTime() - createStart.getTime()) / (1000*60*60*24))/30).toFixed(1)} Months)</Text>
              </View>

              <TouchableOpacity id="capture-office-location" style={[styles.locBtn, createOffice && styles.locBtnDone]} onPress={captureCreateLocation} disabled={capturingLoc}>
                {capturingLoc ? <ActivityIndicator size="small" color={colors.textAccent} /> : <Icon name={createOffice ? 'check' : 'mapPin'} size={16} color={createOffice ? colors.success : colors.textAccent} />}
                <View style={{flex:1}}>
                  <Text style={[styles.locBtnText, createOffice && {color: colors.success}]}>
                    {createOffice ? `Office location: ${createOffice.lat.toFixed(5)}, ${createOffice.lng.toFixed(5)}` : 'Locate Office (GPS)'}
                  </Text>
                  <Text style={[styles.locBtnSub, createOffice && {color: colors.success}]}>
                    {createOffice ? 'Geofence will use this point for attendance' : 'Capture live GPS — falls back to department coordinates if skipped'}
                  </Text>
                </View>
              </TouchableOpacity>

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCreate(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.createBtn} onPress={submitCreate} disabled={creating}>
                  {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>Create & Save</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
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

const makeStyles = colors => StyleSheet.create({
  container:{flex:1}, center:{flex:1, justifyContent:'center', alignItems:'center'},
  searchRow:{flexDirection:'row', alignItems:'center', gap:8, marginHorizontal:16, marginTop:12, marginBottom:8, backgroundColor:colors.card, borderRadius:12, borderWidth:1, borderColor:colors.border, paddingHorizontal:12, paddingVertical:10},
  searchInput:{flex:1, color:colors.text, fontSize:14, padding:0},
  emptyBox:{alignItems:'center', paddingVertical:60}, emptyText:{color:colors.textSecondary, fontSize:15, marginTop:10},
  card:{backgroundColor:colors.surface, margin:12, marginBottom:4, borderRadius:14, padding:14, borderWidth:1, borderColor:colors.border},
  cardTop:{flexDirection:'row', alignItems:'center', marginBottom:8},
  avatarBox:{width:44, height:44, borderRadius:22, justifyContent:'center', alignItems:'center', marginRight:12},
  name:{color:colors.text, fontSize:15, fontWeight:'700'},
  sub:{color:colors.textSecondary, fontSize:12},
  sub2:{color:colors.textMuted, fontSize:11},
  badge:{borderRadius:6, paddingHorizontal:8, paddingVertical:4},
  badgeText:{fontSize:11, fontWeight:'700'},
  cardActions:{flexDirection:'row', gap:8, marginTop:4},
  actionBtn:{flexDirection:'row', alignItems:'center', gap:4, flex:1, justifyContent:'center', paddingVertical:8, borderRadius:8, backgroundColor:colors.card, borderWidth:1, borderColor:colors.border},
  actionText:{color:colors.textAccent, fontSize:11, fontWeight:'600'},
  modalOverlay:{flex:1, backgroundColor:'rgba(0,0,0,0.7)', justifyContent:'flex-end'},
  modalContent:{backgroundColor:colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, padding:24, maxHeight:'88%'},
  modalTitle:{color:colors.text, fontSize:18, fontWeight:'700', marginBottom:4},
  subtitle:{color:colors.textMuted, fontSize:12, marginBottom:16},
  detailAvatarWrap:{alignItems:'center', marginBottom:10},
  detailHeader:{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:12},
  detailRow:{flexDirection:'row', justifyContent:'space-between', paddingVertical:10, borderTopWidth:1, borderTopColor:colors.border},
  detailLabel:{color:colors.textSecondary, fontSize:13},
  detailValue:{color:colors.text, fontSize:13, fontWeight:'600'},
  detailActions:{flexDirection:'row', gap:10, marginTop:12},
  detailActionBtn:{flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, paddingVertical:10, borderRadius:10, backgroundColor:colors.primary+'15', borderWidth:1, borderColor:colors.primary+'55'},
  detailActionText:{color:colors.textAccent, fontWeight:'600', fontSize:12},
  sheetSection:{marginTop:12, borderTopWidth:1, borderTopColor:colors.border, paddingTop:12},
  sheetTitle:{color:colors.text, fontSize:14, fontWeight:'700', marginBottom:8},
  docRow:{flexDirection:'row', alignItems:'center', gap:8, paddingVertical:7, borderBottomWidth:1, borderBottomColor:colors.border},
  docInfo:{flex:1},
  docName:{color:colors.text, fontSize:13, fontWeight:'600'},
  docMeta:{color:colors.textMuted, fontSize:11, marginTop:2},
  sheetEmpty:{color:colors.textMuted, fontSize:13, paddingVertical:6},
  attRow:{flexDirection:'row', alignItems:'center', gap:8, paddingVertical:6, borderTopWidth:1, borderTopColor:colors.border},
  attDate:{color:colors.text, fontSize:12, flex:1},
  attStatus:{fontSize:12, fontWeight:'600'},
  attSlot:{color:colors.textMuted, fontSize:11},
  modalField:{marginBottom:12},
  fieldLabel:{color:colors.textSecondary, fontSize:12, fontWeight:'600', marginBottom:6},
  fieldInput:{backgroundColor:colors.card, borderRadius:10, borderWidth:1, borderColor:colors.border, color:colors.text, paddingHorizontal:14, paddingVertical:12, fontSize:14},
  modalActions:{flexDirection:'row', gap:12, marginTop:8},
  cancelBtn:{flex:1, backgroundColor:colors.card, borderRadius:12, paddingVertical:14, alignItems:'center', borderWidth:1, borderColor:colors.border},
  cancelBtnText:{color:colors.textSecondary, fontWeight:'600'},
  createBtn:{flex:1, backgroundColor:colors.primary, borderRadius:12, paddingVertical:14, alignItems:'center'},
  createBtnText:{color:'#fff', fontWeight:'700'},
  headerBtn:{flexDirection:'row', alignItems:'center', gap:6, backgroundColor:'rgba(255,255,255,0.18)', borderWidth:1, borderColor:'rgba(255,255,255,0.35)', borderRadius:20, paddingHorizontal:14, paddingVertical:9},
  headerBtnText:{color:'#fff', fontWeight:'700', fontSize:13},
  segRow:{flexDirection:'row', gap:10},
  seg:{flex:1, alignItems:'center', justifyContent:'center', paddingVertical:12, borderRadius:10, borderWidth:1, borderColor:colors.border, backgroundColor:colors.card},
  segActive:{borderColor:colors.primary, backgroundColor:colors.primary+'22'},
  segText:{color:colors.textSecondary, fontWeight:'600', fontSize:13},
  segTextActive:{color:colors.textAccent, fontWeight:'700'},
  usernameCard:{backgroundColor:colors.primary+'15', borderRadius:12, padding:14, marginBottom:16, borderWidth:1, borderColor:colors.primary+'44'},
  usernameRow:{flexDirection:'row', alignItems:'center', gap:8, marginTop:4},
  usernameValue:{color:colors.textAccent, fontSize:16, fontWeight:'800'},
  formRow:{flexDirection:'row', gap:12},
  durationCard:{flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, backgroundColor:colors.primary+'18', borderRadius:10, padding:12, marginTop:4, marginBottom:20, borderWidth:1, borderColor:colors.primary+'44'},
  durationText:{color:colors.textAccent, fontSize:12, fontWeight:'600'},
  locBtn:{flexDirection:'row', alignItems:'center', gap:10, backgroundColor:colors.card, borderRadius:12, padding:14, marginBottom:16, borderWidth:1, borderColor:colors.border},
  locBtnDone:{borderColor:colors.success},
  locBtnText:{color:colors.text, fontSize:13, fontWeight:'700'},
  locBtnSub:{color:colors.textMuted, fontSize:11, marginTop:2},
  durationText:{color:colors.textAccent, fontWeight:'700', fontSize:13},
  todayRow: {flexDirection: 'row', gap: 24, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border},
  todayItem: {flexDirection: 'row', alignItems: 'center', gap: 8},
  todayLabel: {color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase'},
  todayThumb: {width: 26, height: 26, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card},
  todayCaption: {color: colors.textSecondary, fontSize: 12, fontWeight: '600'},
  todayTime: {color: colors.textSecondary, fontSize: 12, fontWeight: '600'},
  viewerOverlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center'},
  viewerClose: {position: 'absolute', top: 50, right: 20, zIndex: 1, padding: 8},
  viewerImage: {width: '100%', height: '78%'},
});

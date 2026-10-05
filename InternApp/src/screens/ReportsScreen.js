import React, {useState, useMemo, useCallback} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator} from 'react-native';
import client from '../api/client';
import {showToast} from '../components/AppToast';
import {useAppTheme} from '../theme';
import ScreenBackground from '../components/ScreenBackground';
import AppHeader from '../components/AppHeader';
import Icon from '../components/Icon';
import DateField from '../components/DateField';
import Dropdown from '../components/Dropdown';
import {downloadPdf, downloadExcel, shareFile, formatVal, estimateReportPages} from '../utils/reportHelpers';

const today = () => { const d = new Date(); return d.toISOString().slice(0, 10); };
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };

export default function ReportsScreen({navigation, route, onBack}) {
  const role = route?.params?.role;
  const handleBack = onBack || (() => navigation.goBack());
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [deptId, setDeptId] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [reportKey, setReportKey] = useState(null);
  const [format, setFormat] = useState('pdf');
  const [preview, setPreview] = useState(null); // null = not loaded
  const [previewError, setPreviewError] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [busy, setBusy] = useState(null); // 'download'

  React.useEffect(() => {
    if (role === 'admin') {
      client.get('/admin/departments')
        .then(r => setDepartments((r.data || []).map(d => ({value: d.id, label: d.name}))))
        .catch(() => {});
    }
  }, [role]);

  const allReports = useMemo(() => (role === 'admin' ? [
    {key: 'attendance', label: 'Attendance Log', icon: 'clipboard', url: () => `/admin/reports/attendance?from=${from}&to=${to}${deptId ? `&departmentId=${deptId}` : ''}`},
    {key: 'summary', label: 'Attendance Summary', icon: 'list', url: () => `/admin/reports/attendance-summary?from=${from}&to=${to}${deptId ? `&departmentId=${deptId}` : ''}`},
    {key: 'tasks', label: 'Task Completion', icon: 'briefcase', url: () => `/admin/reports/tasks?from=${from}&to=${to}`},
    {key: 'interns', label: 'Interns', icon: 'users', url: () => `/admin/reports/interns`},
    {key: 'transfers', label: 'Intern Transfers', icon: 'transfer', url: () => `/admin/reports/transfers?from=${from}&to=${to}`},
    {key: 'shifts', label: 'Shifts', icon: 'clock', url: () => `/admin/reports/shifts`},
  ] : role === 'mentor' ? [
    {key: 'attendance', label: 'Attendance Log', icon: 'clipboard', url: () => `/mentor/reports/attendance?from=${from}&to=${to}`},
    {key: 'tasks', label: 'Task Completion', icon: 'briefcase', url: () => `/mentor/reports/tasks?from=${from}&to=${to}`},
    {key: 'summary', label: 'Intern Summary', icon: 'list', url: () => `/mentor/reports/summary`},
    {key: 'transfers', label: 'Intern Transfers', icon: 'transfer', url: () => `/mentor/reports/transfers?from=${from}&to=${to}`},
  ] : [
    {key: 'attendance', label: 'My Attendance', icon: 'clipboard', url: () => `/intern/reports/attendance?from=${from}&to=${to}`},
    {key: 'tasks', label: 'My Tasks', icon: 'briefcase', url: () => `/intern/reports/tasks`},
    {key: 'transfers', label: 'My Transfers', icon: 'transfer', url: () => `/intern/reports/transfers?from=${from}&to=${to}`},
  ]), [role, from, to, deptId]);

  const loadPreview = useCallback(async () => {
    if (!reportKey) return;
    setPreviewLoading(true);
    setPreviewError(false);
    try {
      const report = allReports.find(r => r.key === reportKey);
      const res = await client.get(report.url());
      setPreview(res.data || []);
    } catch {
      setPreviewError(true);
      setPreview([]);
    } finally {
      setPreviewLoading(false);
    }
  }, [reportKey, allReports]);

  const selected = allReports.find(r => r.key === reportKey);

  React.useEffect(() => {
    if (reportKey) loadPreview();
  }, [reportKey, from, to, deptId, loadPreview]);

  const subtitle = `Period: ${from} → ${to}${deptId ? ' · dept filtered' : ''}`;

const doDownload = async () => {
    if (!reportKey) { showToast('Choose a report type first.', 'error'); return; }
    setBusy('download');
    try {
      if (!preview) await loadPreview();
      const url = selected.url();
      const fileName = `report-${reportKey}-${from}-to-${to}`;
      let path;
      if (format === 'excel') {
        path = await downloadExcel(url);
        await shareFile(path, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      } else {
        path = await downloadPdf(fileName, url);
        await shareFile(path, 'application/pdf');
      }
    } catch (e) {
      console.error('[Report export failed]', e);
      showToast((e && e.message) || 'Report export failed.', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScreenBackground style={styles.container}>
      <AppHeader onBack={handleBack} title="Reports" />
      <ScrollView contentContainerStyle={{padding: 16, paddingBottom: 100}}>
        <View style={styles.rangeCard}>
          <View style={styles.rangeRow}>
            <View style={{flex: 1}}>
              <DateField value={from} onChange={d => setFrom(d ? d.toISOString().slice(0, 10) : monthStart())} maximumDate={new Date(to)} placeholder="From" containerStyle={styles.dateField} />
            </View>
            <View style={{flex: 1}}>
              <DateField value={to} onChange={d => setTo(d ? d.toISOString().slice(0, 10) : today())} minimumDate={new Date(from)} placeholder="To" containerStyle={styles.dateField} />
            </View>
          </View>
          {role === 'admin' && (
            <View style={{marginTop: 12}}>
              <Dropdown
                placeholder="Department"
                value={deptId}
                onChange={setDeptId}
                options={[{value: null, label: 'All Departments'}, ...departments]}
              />
            </View>
          )}
        </View>

        <Text style={styles.sectionTitle}>Report Configuration</Text>
        <View style={styles.rangeCard}>
          <View style={{marginBottom: 12}}>
            <Dropdown
              label="Report Type"
              value={reportKey}
              onChange={setReportKey}
              options={allReports.map(r => ({value: r.key, label: r.label}))}
              placeholder="Select a report type"
              searchable
            />
          </View>
          <View style={{marginBottom: 12}}>
            <Dropdown
              label="Format"
              value={format}
              onChange={setFormat}
              options={[{value:'pdf', label:'PDF'}, {value:'excel', label:'Excel (XLSX)'}]}
              placeholder="PDF"
              searchable={false}
            />
          </View>
        </View>

        <TouchableOpacity style={[styles.downloadBtn, busy && styles.downloadBtnDisabled]} onPress={doDownload} disabled={!!busy}>
          {busy === 'download' ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.downloadBtnText}>{format === 'excel' ? 'Generate & Download XLSX' : 'Generate & Download PDF'}</Text>}
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Preview</Text>
        <View style={styles.previewCard}>
          {previewLoading ? (
            <View style={styles.previewCenter}><ActivityIndicator size="small" color={colors.textAccent} /></View>
          ) : previewError ? (
            <Text style={styles.previewError}>Couldn't load preview. Select a report type and try again.</Text>
          ) : !preview ? (
            <Text style={styles.previewHint}>Select a report type above to preview its rows before downloading.</Text>
          ) : preview.length === 0 ? (
            <Text style={styles.previewHint}>No data in the selected range.</Text>
          ) : (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                <View style={styles.table}>
                  <View style={styles.tableHead}>
                    <Text style={styles.tableTh}>#</Text>
                    {Object.keys(preview[0]).map(c => <Text key={c} style={styles.tableTh}>{c}</Text>)}
                  </View>
                  {preview.map((row, ri) => (
                    <View key={ri} style={styles.tableRow}>
                      <Text style={styles.tableTd}>{ri + 1}</Text>
                      {Object.keys(preview[0]).map(c => <Text key={c} style={styles.tableTd}>{formatVal(row[c])}</Text>)}
                    </View>
                  ))}
                </View>
              </ScrollView>
              <Text style={styles.previewMeta}>{preview.length} record{preview.length === 1 ? '' : 's'}{format === 'pdf' ? ` · ≈${estimateReportPages(preview.length)} page${estimateReportPages(preview.length) === 1 ? '' : 's'} (PDF)` : ''}</Text>
            </>
          )}
        </View>
      </ScrollView>
    </ScreenBackground>
  );
}

const makeStyles = colors => StyleSheet.create({
  container: {flex: 1},
  rangeCard: {backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 16},
  rangeRow: {flexDirection: 'row', gap: 12},
  dateField: {flex: 1},
  sectionTitle: {color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 10, marginTop: 4},
  previewCard: {backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 16},
  previewMeta: {color: colors.textMuted, fontSize: 12, marginTop: 10},
  previewCenter: {alignItems: 'center', paddingVertical: 24},
  previewHint: {color: colors.textMuted, fontSize: 13},
  previewError: {color: colors.error, fontSize: 13},
  tableHead: {flexDirection: 'row', backgroundColor: colors.primary, paddingVertical: 8},
  tableTh: {color: '#fff', fontSize: 11, fontWeight: '700', paddingHorizontal: 8},
  tableRow: {flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border},
  tableTd: {color: colors.textSecondary, fontSize: 11, paddingHorizontal: 8},
  downloadBtn: {backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8},
  downloadBtnDisabled: {opacity: 0.5},
  downloadBtnText: {color: '#fff', fontWeight: '700'},
});
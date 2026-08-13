import React, {useState, useEffect} from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, Platform
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import client from '../../api/client';
import theme from '../../theme';

export default function CreateInternScreen({navigation}) {
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [cnic, setCnic] = useState('');
  const [university, setUniversity] = useState('');
  const [degree, setDegree] = useState('');
  const [gender, setGender] = useState('Male');
  const [customUsername, setCustomUsername] = useState('');

  const [departments, setDepartments] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState(null);

  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));
  const [showPicker, setShowPicker] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    try {
      const res = await client.get('/admin/departments');
      setDepartments(res.data);
      if (res.data.length > 0) {
        setSelectedDepartment(res.data[0]);
      }
    } catch {}
  };

  const getAutoUsernamePreview = () => {
    if (customUsername.trim()) return customUsername.trim();
    if (!fullName.trim()) return 'firstname.PIA.001';
    const first = fullName.trim().split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${first || 'intern'}.PIA.001`;
  };

  const handleDateChange = (event, selectedDate) => {
    const currentPicker = showPicker;
    setShowPicker(null);
    if (selectedDate && event.type !== 'dismissed') {
      if (currentPicker === 'start') {
        setStartDate(selectedDate);
        if (selectedDate >= endDate) {
          setEndDate(new Date(selectedDate.getTime() + 30 * 24 * 60 * 60 * 1000));
        }
      } else if (currentPicker === 'end') {
        if (selectedDate <= startDate) {
          Alert.alert('Invalid Date', 'End date must be after the start date');
          return;
        }
        setEndDate(selectedDate);
      }
    }
  };

  const calculateDays = () => {
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const months = (days / 30).toFixed(1);
    return `${days} Days (~${months} Months)`;
  };

  const submit = async () => {
    if (!fullName.trim() || !password.trim()) {
      Alert.alert('Required Fields', 'Full name and password are required');
      return;
    }
    if (startDate >= endDate) {
      Alert.alert('Invalid Dates', 'End date must be after the start date');
      return;
    }

    setLoading(true);
    try {
      const res = await client.post('/mentor/interns', {
        username: customUsername.trim() || null,
        password: password,
        fullName: fullName.trim(),
        cnic: cnic.trim() || null,
        university: university.trim() || null,
        degree: degree.trim() || null,
        gender: gender,
        departmentId: selectedDepartment?.id || null,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      Alert.alert(
        '✅ Account Created',
        `Intern account created & saved to database!\n\nUsername: ${res.data.username}\nDepartment: ${selectedDepartment?.name || 'Assigned'}\nDuration: ${calculateDays()}\n\nShare credentials with internee.`,
        [{text: 'Done', onPress: () => navigation.goBack()}]
      );
    } catch (e) {
      Alert.alert('Creation Failed', e.response?.data?.message || 'Failed to create intern account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, {paddingBottom: 100, flexGrow: 1}]}>
      <Text style={styles.headerTitle}>New Intern Registration</Text>
      <Text style={styles.subtitle}>Register internee. Username is auto-generated in format firstname.PIA.001 in database.</Text>

      {/* Department Selection */}
      <Text style={styles.label}>Select Department *</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.deptScroll}>
        {departments.map(d => (
          <TouchableOpacity
            key={d.id}
            style={[
              styles.deptChip,
              selectedDepartment?.id === d.id && styles.deptChipSelected,
            ]}
            onPress={() => setSelectedDepartment(d)}>
            <Text style={[
              styles.deptChipText,
              selectedDepartment?.id === d.id && styles.deptChipTextSelected,
            ]}>
              🏢 {d.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Form Fields */}
      <View style={styles.field}>
        <Text style={styles.label}>Full Name *</Text>
        <TextInput
          style={styles.input}
          placeholder=""
          placeholderTextColor={theme.colors.textMuted}
          value={fullName}
          onChangeText={v => setFullName(v)}
        />
      </View>

      {/* Auto-Generated Username Card */}
      <View style={styles.usernamePreviewCard}>
        <Text style={styles.usernamePreviewTitle}>Auto-Generated Username Format:</Text>
        <Text style={styles.usernamePreviewValue}>🔑 {getAutoUsernamePreview()}</Text>
        <Text style={styles.usernamePreviewSub}>Automatically incremented in database (e.g. 001, 002, 003)</Text>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Gender *</Text>
        <View style={styles.row}>
          {['Male', 'Female'].map(g => (
            <TouchableOpacity
              key={g}
              id={`gender-${g.toLowerCase()}`}
              style={[styles.genderChip, gender === g && styles.genderChipSelected]}
              onPress={() => setGender(g)}>
              <Text style={[styles.genderChipText, gender === g && styles.genderChipTextSelected]}>
                {g === 'Male' ? '👨 Male' : '👩 Female'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>CNIC / Identification</Text>
        <TextInput
          style={styles.input}
          placeholder=""
          placeholderTextColor={theme.colors.textMuted}
          keyboardType="numeric"
          value={cnic}
          onChangeText={v => setCnic(v)}
        />
      </View>

      <View style={styles.row}>
        <View style={[styles.field, {flex: 1, marginRight: 8}]}>
          <Text style={styles.label}>University / Institute</Text>
          <TextInput
            style={styles.input}
            placeholder=""
            placeholderTextColor={theme.colors.textMuted}
            value={university}
            onChangeText={v => setUniversity(v)}
          />
        </View>
        <View style={[styles.field, {flex: 1, marginLeft: 8}]}>
          <Text style={styles.label}>Degree / Program</Text>
          <TextInput
            style={styles.input}
            placeholder=""
            placeholderTextColor={theme.colors.textMuted}
            value={degree}
            onChangeText={v => setDegree(v)}
          />
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.field}>
        <Text style={styles.label}>Login Password *</Text>
        <TextInput
          style={styles.input}
          placeholder=""
          placeholderTextColor={theme.colors.textMuted}
          secureTextEntry
          value={password}
          onChangeText={v => setPassword(v)}
        />
      </View>

      <View style={styles.divider} />

      {/* Date Pickers */}
      <Text style={styles.sectionHeader}>Internship Tenure</Text>
      
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.dateBox, {marginRight: 8}]}
          onPress={() => setShowPicker('start')}>
          <Text style={styles.dateLabel}>Start Date</Text>
          <Text style={styles.dateValue}>📅 {startDate.toLocaleDateString()}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.dateBox, {marginLeft: 8}]}
          onPress={() => setShowPicker('end')}>
          <Text style={styles.dateLabel}>End Date</Text>
          <Text style={styles.dateValue}>📅 {endDate.toLocaleDateString()}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.durationCard}>
        <Text style={styles.durationText}>⏱ Duration: {calculateDays()}</Text>
      </View>

      {showPicker && (
        <DateTimePicker
          value={showPicker === 'start' ? startDate : endDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDateChange}
        />
      )}

      {/* Submit */}
      <TouchableOpacity
        style={styles.submitBtn}
        onPress={submit}
        disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitBtnText}>Create Account & Save to Database</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: theme.colors.background},
  content: {padding: 20, paddingBottom: 40},
  headerTitle: {color: theme.colors.text, fontSize: 22, fontWeight: '700', marginTop: 24, marginBottom: 4},
  subtitle: {color: theme.colors.textSecondary, fontSize: 13, marginBottom: 20},
  label: {color: theme.colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 8},
  input: {
    backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1,
    borderColor: theme.colors.border, color: theme.colors.text,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14,
  },
  field: {marginBottom: 16},
  row: {flexDirection: 'row', marginBottom: 8},
  deptScroll: {marginBottom: 20},
  deptChip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    marginRight: 10,
  },
  deptChipSelected: {
    backgroundColor: theme.colors.primary + '33',
    borderColor: theme.colors.primary,
  },
  deptChipText: {color: theme.colors.textSecondary, fontSize: 13, fontWeight: '600'},
  deptChipTextSelected: {color: theme.colors.primary, fontWeight: '700'},
  genderChip: {
    flex: 1, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12,
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    marginRight: 10, alignItems: 'center',
  },
  genderChipSelected: {
    backgroundColor: theme.colors.primary + '33',
    borderColor: theme.colors.primary,
  },
  genderChipText: {color: theme.colors.textSecondary, fontSize: 13, fontWeight: '600'},
  genderChipTextSelected: {color: theme.colors.primary, fontWeight: '700'},
  usernamePreviewCard: {
    backgroundColor: theme.colors.primary + '15', borderRadius: 12, padding: 14,
    marginBottom: 16, borderWidth: 1, borderColor: theme.colors.primary + '44',
  },
  usernamePreviewTitle: {color: theme.colors.textSecondary, fontSize: 11, fontWeight: '600'},
  usernamePreviewValue: {color: theme.colors.primary, fontSize: 16, fontWeight: '800', marginVertical: 4},
  usernamePreviewSub: {color: theme.colors.textMuted, fontSize: 11},
  divider: {height: 1, backgroundColor: theme.colors.border, marginVertical: 16},
  sectionHeader: {color: theme.colors.text, fontSize: 15, fontWeight: '700', marginBottom: 12},
  dateBox: {
    flex: 1, backgroundColor: theme.colors.surface, borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: theme.colors.border,
  },
  dateLabel: {color: theme.colors.textMuted, fontSize: 11, marginBottom: 4},
  dateValue: {color: theme.colors.primary, fontSize: 14, fontWeight: '700'},
  durationCard: {
    backgroundColor: theme.colors.primary + '18', borderRadius: 10, padding: 12,
    marginTop: 12, marginBottom: 20, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.primary + '44',
  },
  durationText: {color: theme.colors.primary, fontWeight: '700', fontSize: 13},
  submitBtn: {
    backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', shadowColor: theme.colors.primary, shadowOpacity: 0.4,
    shadowRadius: 12, elevation: 6,
  },
  submitBtnText: {color: '#fff', fontSize: 15, fontWeight: '700'},
});

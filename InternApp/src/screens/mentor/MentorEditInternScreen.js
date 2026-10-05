import React, {useState, useMemo} from 'react';
import {View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator} from 'react-native';
import client from '../../api/client';
import {showToast} from '../../components/AppToast';
import {useAppTheme} from '../../theme';
import ScreenBackground from '../../components/ScreenBackground';
import PasswordInput from '../../components/PasswordInput';
import AppHeader from '../../components/AppHeader';

export default function MentorEditInternScreen({route, navigation}) {
  const {colors} = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const intern = route.params?.intern;

  const [fullName, setFullName] = useState(intern?.fullName || '');
  const [cnic, setCnic] = useState(intern?.cnic || '');
  const [university, setUniversity] = useState(intern?.university || '');
  const [degree, setDegree] = useState(intern?.degree || '');
  const [gender, setGender] = useState(intern?.gender === 1 ? 'Female' : 'Male');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const save = async () => {
    if (!fullName.trim()) { showToast('Full name is required.', 'error'); return; }
    setLoading(true);
    try {
      await client.put(`/mentor/interns/${intern.id}`, {
        fullName: fullName.trim(),
        cnic: cnic.trim() || null,
        university: university.trim() || null,
        degree: degree.trim() || null,
        gender: gender === 'Female' ? 1 : 0,
      });
      showToast('Intern updated.', 'success');
      navigation.goBack();
    } catch (e) { showToast(e.response?.data?.message || 'Failed to update.', 'error'); }
    finally { setLoading(false); }
  };

  const resetPassword = async () => {
    if (!newPassword.trim() || newPassword.length < 6) { showToast('Password must be at least 6 characters.', 'error'); return; }
    setLoading(true);
    try {
      await client.patch(`/mentor/interns/${intern.id}/reset-password`, {newPassword: newPassword.trim()});
      showToast('Password reset.', 'success');
      setNewPassword('');
    } catch (e) { showToast(e.response?.data?.message || 'Failed to reset password.', 'error'); }
    finally { setLoading(false); }
  };

  if (!intern) return <View style={styles.center}><Text style={{color:colors.error}}>No intern selected.</Text></View>;

  return (
    <ScreenBackground>
      <AppHeader onBack={() => navigation.goBack()} title="Edit Intern" />
      <ScrollView style={styles.container} contentContainerStyle={{paddingBottom:100, flexGrow:1}}>

        <View style={styles.field}>
          <Text style={styles.label}>Full Name *</Text>
          <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholderTextColor={colors.textMuted} />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>CNIC</Text>
          <TextInput style={styles.input} value={cnic} onChangeText={setCnic} placeholderTextColor={colors.textMuted} />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>University</Text>
          <TextInput style={styles.input} value={university} onChangeText={setUniversity} placeholderTextColor={colors.textMuted} />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Degree</Text>
          <TextInput style={styles.input} value={degree} onChangeText={setDegree} placeholderTextColor={colors.textMuted} />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Gender</Text>
          <View style={styles.row}>
            {['Male', 'Female'].map(g => (
              <TouchableOpacity key={g} style={[styles.genderChip, gender === g && styles.genderChipSelected]} onPress={() => setGender(g)}>
                <Text style={[styles.genderChipText, gender === g && styles.genderChipTextSelected]}>{g}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity style={styles.submitBtn} onPress={save} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Save Changes</Text>}
        </TouchableOpacity>

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Reset Password</Text>
        <View style={styles.field}>
          <Text style={styles.label}>New Password</Text>
          <PasswordInput style={styles.input} value={newPassword} onChangeText={setNewPassword} placeholderTextColor={colors.textMuted} placeholder="Min 6 characters" />
        </View>

        <TouchableOpacity style={styles.resetBtn} onPress={resetPassword} disabled={loading}>
          <Text style={styles.resetBtnText}>Reset Password</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenBackground>
  );
}

const makeStyles = colors => StyleSheet.create({
  container:{flex:1, padding:20},
  center:{flex:1, justifyContent:'center', alignItems:'center'},
  field:{marginBottom:16},
  label:{color:colors.textSecondary, fontSize:12, fontWeight:'600', marginBottom:8},
  input:{backgroundColor:colors.surface, borderRadius:12, borderWidth:1, borderColor:colors.border, color:colors.text, paddingHorizontal:14, paddingVertical:12, fontSize:14},
  row:{flexDirection:'row', gap:10},
  genderChip:{flex:1, paddingVertical:12, borderRadius:12, borderWidth:1, borderColor:colors.border, backgroundColor:colors.surface, alignItems:'center'},
  genderChipSelected:{backgroundColor:colors.primary+'33', borderColor:colors.primary},
  genderChipText:{color:colors.textSecondary, fontSize:13, fontWeight:'600'},
  genderChipTextSelected:{color:colors.textAccent, fontWeight:'700'},
  submitBtn:{backgroundColor:colors.primary, borderRadius:14, paddingVertical:16, alignItems:'center', shadowColor:colors.primary, shadowOpacity:0.4, shadowRadius:12, elevation:6},
  submitBtnText:{color:'#fff', fontSize:15, fontWeight:'700'},
  divider:{height:1, backgroundColor:colors.border, marginVertical:24},
  sectionTitle:{color:colors.text, fontSize:16, fontWeight:'700', marginBottom:12},
  resetBtn:{backgroundColor:colors.error+'18', borderRadius:14, paddingVertical:16, alignItems:'center', borderWidth:1, borderColor:colors.error+'44'},
  resetBtnText:{color:colors.error, fontSize:15, fontWeight:'700'},
});

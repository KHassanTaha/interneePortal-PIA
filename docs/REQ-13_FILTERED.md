# REQ-13 FILTERED DEFECTS

> Filtered - prioritized example screens

+## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/AttendanceScreen.js:135
+- Button/pressable near line; label (approx): {t.label}
+- Issues: no numberOfLines on Text
+- Snippet:           <TouchableOpacity             key={t.key}             id={`att-tab-${t.key}`}             style={[styles.tab, 
+
---
+## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/AttendanceScreen.js:176
+- Button/pressable near line; label (approx): {dateFilter}
+- Issues: no numberOfLines on Text
+- Snippet:                   <TouchableOpacity id="admin-attendance-date" style={styles.datePickerBtn} onPress={() => setShowPicker
+
---
+## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/AttendanceScreen.js:179
+- Button/pressable near line; label (approx): <unknown>
+- Issues: no numberOfLines on Text
+- Snippet:                   </TouchableOpacity>                   {dateFilter ? (                     <TouchableOpacity style={sty
+
---
+## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/AttendanceScreen.js:181
+- Button/pressable near line; label (approx): <unknown>
+- Issues: no numberOfLines on Text
+- Snippet:                     <TouchableOpacity style={styles.clearBtn} onPress={() => setDateFilter('')} hitSlop={{top: 8, bottom
+
---
+## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/AttendanceScreen.js:183
+- Button/pressable near line; label (approx): <unknown>
+- Issues: no numberOfLines on Text
+- Snippet:                     </TouchableOpacity>                   ) : null}                 </View>               </View>       
+
---
+## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/AttendanceScreen.js:196
+- Button/pressable near line; label (approx): No attendance records{dateFilter ? ` for ${dateFilter}` : ''}
+- Issues: no numberOfLines on Text
+- Snippet:                   <TouchableOpacity id="att-search-clear" onPress={() => setQuery('')} hitSlop={{top: 8, bottom: 8, left
+
---
+## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/AttendanceScreen.js:198
+- Button/pressable near line; label (approx): No attendance records{dateFilter ? ` for ${dateFilter}` : ''}
+- Issues: no numberOfLines on Text
+- Snippet:                   </TouchableOpacity>                 )}               </View>                {visible.length === 0 ? ( 
+
---
+## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/AttendanceScreen.js:208
+- Button/pressable near line; label (approx): {a.internName}
+- Issues: no numberOfLines on Text
+- Snippet:                 <TouchableOpacity key={a.id} style={styles.recordCard} activeOpacity={0.7} onPress={() => { if (a.checkI
+
---
+## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/AttendanceScreen.js:217
+- Button/pressable near line; label (approx): Edit
+- Issues: no numberOfLines on Text
+- Snippet:                     <TouchableOpacity id={`att-edit-${a.id}`} style={styles.editBtn} onPress={() => openEdit(a)} disable
+
---
+## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/AttendanceScreen.js:219
+- Button/pressable near line; label (approx): In: {a.arrivalStatus}
+- Issues: no numberOfLines on Text
+- Snippet:                     </TouchableOpacity>                   </View>                   {(a.arrivalStatus !== 'Pending' || a
+
---
+## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/AttendanceScreen.js:247
+- Button/pressable near line; label (approx): {slot}
+- Issues: no numberOfLines on Text
+- Snippet:                           <TouchableOpacity key={slot} id={`att-${slot.toLowerCase()}-${a.id}`} style={styles.photoCell}
+
---
+## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/AttendanceScreen.js:250
+- Button/pressable near line; label (approx): •
+- Issues: no numberOfLines on Text
+- Snippet:                           </TouchableOpacity>                         );                       })}                     <
+
---
+## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/AttendanceScreen.js:321
+- Button/pressable near line; label (approx): Cancel
+- Issues: no numberOfLines on Text, horizontal row may lack flexShrink
+- Snippet:               <TouchableOpacity style={styles.editCancel} onPress={() => setEditTarget(null)}><Text style={styles.editCa
+
---
+## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/AttendanceScreen.js:322
+- Button/pressable near line; label (approx): Save Times
+- Issues: no numberOfLines on Text, horizontal row may lack flexShrink
+- Snippet:               <TouchableOpacity style={styles.editSave} onPress={saveEditTime} disabled={savingEdit}>                 {s
+
---
+## Notes on requested examples
+- Dropdown on interns page (admin/mentor): InternApp/src/screens/admin/InternsScreen.js and InternApp/src/screens/mentor/InternsScreen.js — check dropdown/searchable dropdown components (SearchableDropdown, Dropdown). May need to ensure selected text ellipsizes and has flexShrink when in horizontal layouts.
+- Mark attendance start buttons: InternApp/src/screens/intern/MarkAttendanceScreen.js — check start/capture buttons (Pressable/TouchableOpacity) for label truncation, minHeight, flexShrink.
+

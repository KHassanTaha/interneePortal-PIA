# REQ-13 — Button sizing audit (code-level)

Audit scope: InternApp/src/screens/*. No emulator verification. Focus: TouchableOpacity/Pressable with Text children lacking numberOfLines/ellipsizeMode/flexShrink, horizontal row buttons without flexShrink, labels with fontSize>14 without line-height control, buttons with padding only and no minHeight.


## /home/taha/Documents/pia-interns-app/InternApp/src/screens/ReportsScreen.js:154
- Button/pressable near line; label (approx): {format === 'excel' ? 'Generate & Download XLSX' : 'Generate & Download PDF'}
- Issues: no numberOfLines on Text
- Snippet:         <TouchableOpacity style={[styles.downloadBtn, busy && styles.downloadBtnDisabled]} onPress={doDownload} disabled

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/ReportsScreen.js:156
- Button/pressable near line; label (approx): Preview
- Issues: no numberOfLines on Text
- Snippet:         </TouchableOpacity>          <Text style={styles.sectionTitle}>Preview</Text>         <View style={styles.previe

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/NotificationsScreen.js:70
- Button/pressable near line; label (approx): Mark all read
- Issues: no numberOfLines on Text
- Snippet:           <TouchableOpacity style={styles.readAllBtn} onPress={() => {             dispatch(markNotificationAllRead()); 

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/NotificationsScreen.js:76
- Button/pressable near line; label (approx): No notifications yet
- Issues: no numberOfLines on Text
- Snippet:           </TouchableOpacity>         ) : null       } onBack={() => navigation.goBack()} />        {loading ? <Spinner 

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/NotificationsScreen.js:91
- Button/pressable near line; label (approx): {n.title}
- Issues: review: missing numberOfLines/ellipsizeMode/flexShrink? check block
- Snippet:             <TouchableOpacity               key={`${n.isLocal ? 'local' : 'server'}-${n.id}`}               style={[styl

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/SyncScreen.js:61
- Button/pressable near line; label (approx): Retry
- Issues: no numberOfLines on Text
- Snippet:             <TouchableOpacity               style={[styles.smallBtn, {borderColor: colors.border}]}               onPres

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/SyncScreen.js:66
- Button/pressable near line; label (approx): Discard
- Issues: no numberOfLines on Text
- Snippet:             </TouchableOpacity>             <TouchableOpacity               style={[styles.smallBtn, {borderColor: color

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/SyncScreen.js:67
- Button/pressable near line; label (approx): Discard
- Issues: no numberOfLines on Text
- Snippet:             <TouchableOpacity               style={[styles.smallBtn, {borderColor: colors.border}]}               onPres

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/SyncScreen.js:72
- Button/pressable near line; label (approx): {isOnline ? 'Online' : 'Offline'}
- Issues: no numberOfLines on Text
- Snippet:             </TouchableOpacity>           </View>         ) : null}       </View>     );   };    return (     <ScreenBac

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/SyncScreen.js:128
- Button/pressable near line; label (approx): {n.title}
- Issues: review: missing numberOfLines/ellipsizeMode/flexShrink? check block
- Snippet:               <TouchableOpacity                 key={n.id}                 style={styles.activityRow}                 on

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/LeaveApprovalsScreen.js:156
- Button/pressable near line; label (approx): Reject
- Issues: no numberOfLines on Text
- Snippet:                 <TouchableOpacity id={`reject-${item.id}`} style={styles.rejectBtn} onPress={() => openReject(item)}>   

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/LeaveApprovalsScreen.js:158
- Button/pressable near line; label (approx): Approve
- Issues: no numberOfLines on Text
- Snippet:                 </TouchableOpacity>                 <TouchableOpacity id={`approve-${item.id}`} style={styles.approveBtn

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/LeaveApprovalsScreen.js:159
- Button/pressable near line; label (approx): Approve
- Issues: no numberOfLines on Text
- Snippet:                 <TouchableOpacity id={`approve-${item.id}`} style={styles.approveBtn} onPress={() => handleApprove(item)

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/LeaveApprovalsScreen.js:161
- Button/pressable near line; label (approx): Reject Leave
- Issues: no numberOfLines on Text
- Snippet:                 </TouchableOpacity>               </View>             )}           </View>         ))}       </ScrollVie

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/LeaveApprovalsScreen.js:175
- Button/pressable near line; label (approx): Cancel
- Issues: no numberOfLines on Text, horizontal row may lack flexShrink
- Snippet:               <TouchableOpacity style={styles.modalCancel} onPress={() => setRejectLeave(null)}><Text style={styles.moda

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/LeaveApprovalsScreen.js:176
- Button/pressable near line; label (approx): Confirm
- Issues: no numberOfLines on Text, horizontal row may lack flexShrink
- Snippet:               <TouchableOpacity style={styles.modalConfirm} onPress={submitReject}><Text style={styles.modalConfirmText}

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/AttendanceScreen.js:135
- Button/pressable near line; label (approx): {t.label}
- Issues: no numberOfLines on Text
- Snippet:           <TouchableOpacity             key={t.key}             id={`att-tab-${t.key}`}             style={[styles.tab, 

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/AttendanceScreen.js:176
- Button/pressable near line; label (approx): {dateFilter}
- Issues: no numberOfLines on Text
- Snippet:                   <TouchableOpacity id="admin-attendance-date" style={styles.datePickerBtn} onPress={() => setShowPicker

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/AttendanceScreen.js:179
- Button/pressable near line; label (approx): <unknown>
- Issues: no numberOfLines on Text
- Snippet:                   </TouchableOpacity>                   {dateFilter ? (                     <TouchableOpacity style={sty

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/AttendanceScreen.js:181
- Button/pressable near line; label (approx): <unknown>
- Issues: no numberOfLines on Text
- Snippet:                     <TouchableOpacity style={styles.clearBtn} onPress={() => setDateFilter('')} hitSlop={{top: 8, bottom

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/AttendanceScreen.js:183
- Button/pressable near line; label (approx): <unknown>
- Issues: no numberOfLines on Text
- Snippet:                     </TouchableOpacity>                   ) : null}                 </View>               </View>       

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/AttendanceScreen.js:196
- Button/pressable near line; label (approx): No attendance records{dateFilter ? ` for ${dateFilter}` : ''}
- Issues: no numberOfLines on Text
- Snippet:                   <TouchableOpacity id="att-search-clear" onPress={() => setQuery('')} hitSlop={{top: 8, bottom: 8, left

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/AttendanceScreen.js:198
- Button/pressable near line; label (approx): No attendance records{dateFilter ? ` for ${dateFilter}` : ''}
- Issues: no numberOfLines on Text
- Snippet:                   </TouchableOpacity>                 )}               </View>                {visible.length === 0 ? ( 

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/AttendanceScreen.js:208
- Button/pressable near line; label (approx): {a.internName}
- Issues: no numberOfLines on Text
- Snippet:                 <TouchableOpacity key={a.id} style={styles.recordCard} activeOpacity={0.7} onPress={() => { if (a.checkI

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/AttendanceScreen.js:217
- Button/pressable near line; label (approx): Edit
- Issues: no numberOfLines on Text
- Snippet:                     <TouchableOpacity id={`att-edit-${a.id}`} style={styles.editBtn} onPress={() => openEdit(a)} disable

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/AttendanceScreen.js:219
- Button/pressable near line; label (approx): In: {a.arrivalStatus}
- Issues: no numberOfLines on Text
- Snippet:                     </TouchableOpacity>                   </View>                   {(a.arrivalStatus !== 'Pending' || a

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/AttendanceScreen.js:247
- Button/pressable near line; label (approx): {slot}
- Issues: no numberOfLines on Text
- Snippet:                           <TouchableOpacity key={slot} id={`att-${slot.toLowerCase()}-${a.id}`} style={styles.photoCell}

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/AttendanceScreen.js:250
- Button/pressable near line; label (approx): •
- Issues: no numberOfLines on Text
- Snippet:                           </TouchableOpacity>                         );                       })}                     <

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/AttendanceScreen.js:321
- Button/pressable near line; label (approx): Cancel
- Issues: no numberOfLines on Text, horizontal row may lack flexShrink
- Snippet:               <TouchableOpacity style={styles.editCancel} onPress={() => setEditTarget(null)}><Text style={styles.editCa

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/AttendanceScreen.js:322
- Button/pressable near line; label (approx): Save Times
- Issues: no numberOfLines on Text, horizontal row may lack flexShrink
- Snippet:               <TouchableOpacity style={styles.editSave} onPress={saveEditTime} disabled={savingEdit}>                 {s

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/DocumentsScreen.js:193
- Button/pressable near line; label (approx): {t.label}
- Issues: no numberOfLines on Text
- Snippet:             <TouchableOpacity               key={t.label}               id={`doc-type-tab-${t.key || 'all'}`}           

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/DocumentsScreen.js:230
- Button/pressable near line; label (approx): {selectedIds.length} selected
- Issues: no numberOfLines on Text
- Snippet:             <TouchableOpacity id="docs-search-clear" onPress={() => setQuery('')} hitSlop={{top: 8, bottom: 8, left: 8, 

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/DocumentsScreen.js:232
- Button/pressable near line; label (approx): {selectedIds.length} selected
- Issues: no numberOfLines on Text
- Snippet:             </TouchableOpacity>           )}         </View>          {tab === 'Pending' && selectedIds.length > 0 && ( 

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/DocumentsScreen.js:239
- Button/pressable near line; label (approx): Approve Selected
- Issues: no numberOfLines on Text
- Snippet:             <TouchableOpacity style={styles.batchClear} onPress={() => setSelected({})} hitSlop={{top: 8, bottom: 8, lef

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/DocumentsScreen.js:241
- Button/pressable near line; label (approx): Approve Selected
- Issues: no numberOfLines on Text
- Snippet:             </TouchableOpacity>             <TouchableOpacity id="approve-selected-docs" style={styles.batchApprove} onP

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/DocumentsScreen.js:242
- Button/pressable near line; label (approx): Approve Selected
- Issues: no numberOfLines on Text
- Snippet:             <TouchableOpacity id="approve-selected-docs" style={styles.batchApprove} onPress={handleBatchApprove} disabl

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/DocumentsScreen.js:244
- Button/pressable near line; label (approx): No {tab.toLowerCase()} documents
- Issues: no numberOfLines on Text
- Snippet:             </TouchableOpacity>           </View>         )}          {visibleDocs.length === 0 ? (           <View styl

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/DocumentsScreen.js:257
- Button/pressable near line; label (approx): {item.internName}
- Issues: no numberOfLines on Text
- Snippet:                 <TouchableOpacity                   id={`select-doc-${item.id}`}                   style={[styles.checkb

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/DocumentsScreen.js:262
- Button/pressable near line; label (approx): {item.internName}
- Issues: no numberOfLines on Text
- Snippet:                 </TouchableOpacity>               )}               <View style={styles.avatarCircle}>                 <I

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/DocumentsScreen.js:282
- Button/pressable near line; label (approx): View
- Issues: no numberOfLines on Text
- Snippet:               <TouchableOpacity id={`view-${item.id}`} style={styles.viewBtn} onPress={() => viewDocument(item)}>       

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/DocumentsScreen.js:285
- Button/pressable near line; label (approx): Reject
- Issues: no numberOfLines on Text
- Snippet:               </TouchableOpacity>               {item.status === 'Pending' && (                 <>                   <To

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/DocumentsScreen.js:288
- Button/pressable near line; label (approx): Reject
- Issues: no numberOfLines on Text
- Snippet:                   <TouchableOpacity id={`reject-${item.id}`} style={styles.rejectBtn} onPress={() => handleReject(item)}

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/DocumentsScreen.js:291
- Button/pressable near line; label (approx): Approve
- Issues: no numberOfLines on Text
- Snippet:                   </TouchableOpacity>                   <TouchableOpacity id={`approve-${item.id}`} style={styles.approv

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/DocumentsScreen.js:292
- Button/pressable near line; label (approx): Approve
- Issues: no numberOfLines on Text
- Snippet:                   <TouchableOpacity id={`approve-${item.id}`} style={styles.approveBtn} onPress={() => handleApprove(ite

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/DocumentsScreen.js:295
- Button/pressable near line; label (approx): Reject {rejectDoc?.internName}'s {rejectDoc ? DOC_LABELS[rejectDoc.documentType] || rejectDoc.documentType : ''}
- Issues: no numberOfLines on Text
- Snippet:                   </TouchableOpacity>                 </>               )}               <TouchableOpacity id={`delete-$

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/DocumentsScreen.js:298
- Button/pressable near line; label (approx): Reject {rejectDoc?.internName}'s {rejectDoc ? DOC_LABELS[rejectDoc.documentType] || rejectDoc.documentType : ''}
- Issues: no numberOfLines on Text
- Snippet:               <TouchableOpacity id={`delete-${item.id}`} style={styles.deleteBtn} onPress={() => handleDelete(item)}>   

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/DocumentsScreen.js:300
- Button/pressable near line; label (approx): Reject {rejectDoc?.internName}'s {rejectDoc ? DOC_LABELS[rejectDoc.documentType] || rejectDoc.documentType : ''}
- Issues: no numberOfLines on Text
- Snippet:               </TouchableOpacity>             </View>           </View>         ))}         {visibleDocs.length > 0 && <

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/DocumentsScreen.js:321
- Button/pressable near line; label (approx): Cancel
- Issues: no numberOfLines on Text
- Snippet:               <TouchableOpacity style={styles.rejectCancel} onPress={() => setRejectDoc(null)}>                 <Text st

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/DocumentsScreen.js:323
- Button/pressable near line; label (approx): Reject
- Issues: no numberOfLines on Text
- Snippet:               </TouchableOpacity>               <TouchableOpacity                 id="confirm-reject"                 st

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/DocumentsScreen.js:324
- Button/pressable near line; label (approx): Reject
- Issues: no numberOfLines on Text
- Snippet:               <TouchableOpacity                 id="confirm-reject"                 style={[styles.rejectConfirm, (!reje

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/DocumentsScreen.js:330
- Button/pressable near line; label (approx): Close
- Issues: no numberOfLines on Text
- Snippet:               </TouchableOpacity>             </View>           </CenteredModalCard>         </View>       </Modal>     

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/DocumentsScreen.js:338
- Button/pressable near line; label (approx): Close
- Issues: no numberOfLines on Text, horizontal row may lack flexShrink
- Snippet:           <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerUri(null)}>             <Icon name="close

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/ShiftsScreen.js:161
- Button/pressable near line; label (approx): Add Shift
- Issues: no numberOfLines on Text
- Snippet:       <AppHeader hideTitle onBack={() => navigation.goBack()} title="Shifts" right={<TouchableOpacity style={styles.addB

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/ShiftsScreen.js:168
- Button/pressable near line; label (approx): No shifts found
- Issues: no numberOfLines on Text
- Snippet:             <TouchableOpacity id="shifts-search-clear" onPress={() => setSearch('')} hitSlop={{top: 8, bottom: 8, left: 

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/ShiftsScreen.js:170
- Button/pressable near line; label (approx): No shifts found
- Issues: no numberOfLines on Text
- Snippet:             </TouchableOpacity>           )}         </View>          <FilterChips compact options={[{key: 'all', label:

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/ShiftsScreen.js:202
- Button/pressable near line; label (approx): {s.isActive ? 'Deactivate' : 'Activate'}
- Issues: no numberOfLines on Text
- Snippet:               <TouchableOpacity style={styles.iconBtn} onPress={() => toggleShift(s)}>                 <Icon name="refre

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/ShiftsScreen.js:205
- Button/pressable near line; label (approx): Edit
- Issues: no numberOfLines on Text
- Snippet:               </TouchableOpacity>               <TouchableOpacity style={styles.iconBtn} onPress={() => openEdit(s)}>   

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/ShiftsScreen.js:206
- Button/pressable near line; label (approx): Edit
- Issues: no numberOfLines on Text
- Snippet:               <TouchableOpacity style={styles.iconBtn} onPress={() => openEdit(s)}>                 <Icon name="edit" si

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/ShiftsScreen.js:209
- Button/pressable near line; label (approx): Impact
- Issues: no numberOfLines on Text
- Snippet:               </TouchableOpacity>               <TouchableOpacity style={styles.iconBtn} onPress={() => loadImpact(s)}> 

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/ShiftsScreen.js:210
- Button/pressable near line; label (approx): Impact
- Issues: no numberOfLines on Text
- Snippet:               <TouchableOpacity style={styles.iconBtn} onPress={() => loadImpact(s)}>                 <Icon name="users"

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/ShiftsScreen.js:213
- Button/pressable near line; label (approx): {editing ? 'Edit Shift' : 'Add Shift'}
- Issues: no numberOfLines on Text
- Snippet:               </TouchableOpacity>             </View>           </View>         ))}         {filtered.length > 0 && <End

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/ShiftsScreen.js:237
- Button/pressable near line; label (approx): Company-wide
- Issues: no numberOfLines on Text
- Snippet:               <TouchableOpacity style={[styles.scopeBtn, formCompany && styles.scopeBtnOn]} onPress={() => setFormCompan

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/ShiftsScreen.js:239
- Button/pressable near line; label (approx): Department
- Issues: no numberOfLines on Text
- Snippet:               </TouchableOpacity>               <TouchableOpacity style={[styles.scopeBtn, !formCompany && styles.scopeB

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/ShiftsScreen.js:240
- Button/pressable near line; label (approx): Department
- Issues: no numberOfLines on Text
- Snippet:               <TouchableOpacity style={[styles.scopeBtn, !formCompany && styles.scopeBtnOn]} onPress={() => setFormCompa

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/ShiftsScreen.js:242
- Button/pressable near line; label (approx): Department *
- Issues: no numberOfLines on Text
- Snippet:               </TouchableOpacity>             </View>             {!formCompany && (               <View style={styles.m

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/ShiftsScreen.js:251
- Button/pressable near line; label (approx): Cancel
- Issues: no numberOfLines on Text
- Snippet:               <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowForm(false)}><Text style={styles.cancelBt

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/ShiftsScreen.js:252
- Button/pressable near line; label (approx): {editing ? 'Update' : 'Create'}
- Issues: no numberOfLines on Text
- Snippet:               <TouchableOpacity style={styles.createBtn} onPress={saveShift} disabled={saving}>                 {saving 

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/ShiftsScreen.js:254
- Button/pressable near line; label (approx): Impact — {impactShift?.name}
- Issues: no numberOfLines on Text
- Snippet:               </TouchableOpacity>             </View>       </SwipeableModal>        <SwipeableModal visible={!!impactSh

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/ShiftsScreen.js:282
- Button/pressable near line; label (approx): Close
- Issues: no numberOfLines on Text, horizontal row may lack flexShrink
- Snippet:                   <TouchableOpacity style={styles.cancelBtn} onPress={() => setImpactShift(null)}><Text style={styles.ca

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/ShiftsScreen.js:283
- Button/pressable near line; label (approx): Delete
- Issues: no numberOfLines on Text, horizontal row may lack flexShrink
- Snippet:                   <TouchableOpacity style={[styles.createBtn, styles.deleteBtn]} disabled={!impact.canDelete} onPress={(

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/SettingsScreen.js:164
- Button/pressable near line; label (approx): Save Settings
- Issues: no numberOfLines on Text
- Snippet:           <TouchableOpacity style={styles.saveBtn} onPress={saveSettings} disabled={savingSettings}>             {saving

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/SettingsScreen.js:166
- Button/pressable near line; label (approx): Configurability
- Issues: no numberOfLines on Text
- Snippet:           </TouchableOpacity>         </View>          {/* Shifts */}         <View style={styles.sectionCard}>         

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/SettingsScreen.js:172
- Button/pressable near line; label (approx): Shifts
- Issues: no numberOfLines on Text
- Snippet:           <TouchableOpacity style={styles.linkRow} onPress={() => navigation.getParent()?.navigate('AdminShifts')}>     

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/SettingsScreen.js:181
- Button/pressable near line; label (approx): Public Holidays
- Issues: no numberOfLines on Text
- Snippet:           </TouchableOpacity>         </View>          {/* Public Holidays */}         <View style={styles.sectionCard}>

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/SettingsScreen.js:188
- Button/pressable near line; label (approx): Add
- Issues: no numberOfLines on Text
- Snippet:             <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddHoliday(true)}>               <Icon name="p

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/SettingsScreen.js:191
- Button/pressable near line; label (approx): No public holidays configured.
- Issues: no numberOfLines on Text
- Snippet:             </TouchableOpacity>           </View>           {holidays.length === 0 ? (             <Text style={styles.e

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/SettingsScreen.js:201
- Button/pressable near line; label (approx): {editingHoliday ? 'Edit Public Holiday' : 'Add Public Holiday'}
- Issues: no numberOfLines on Text
- Snippet:               <TouchableOpacity style={styles.deleteBtn} onPress={() => startEditHoliday(h)}>                 <Icon name

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/SettingsScreen.js:203
- Button/pressable near line; label (approx): {editingHoliday ? 'Edit Public Holiday' : 'Add Public Holiday'}
- Issues: no numberOfLines on Text
- Snippet:               </TouchableOpacity>               <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteHoliday(

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/SettingsScreen.js:204
- Button/pressable near line; label (approx): {editingHoliday ? 'Edit Public Holiday' : 'Add Public Holiday'}
- Issues: no numberOfLines on Text
- Snippet:               <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteHoliday(h)}>                 <Icon name="t

## /home/taha/Documents/pia-interns-app/InternApp/src/screens/admin/SettingsScreen.js:206
- Button/pressable near line; label (approx): {editingHoliday ? 'Edit Public Holiday' : 'Add Public Holiday'}
- Issues: no numberOfLines on Text
- Snippet:               </TouchableOpacity>             </View>           ))}         </View>          <EndOfListMarker />       <

## Notes on requested examples
- Dropdown on interns page (admin/mentor): InternApp/src/screens/admin/InternsScreen.js and InternApp/src/screens/mentor/InternsScreen.js — check dropdown/searchable dropdown components (SearchableDropdown, Dropdown). May need to ensure selected text ellipsizes and has flexShrink when in horizontal layouts.
- Mark attendance start buttons: InternApp/src/screens/intern/MarkAttendanceScreen.js — check start/capture buttons (Pressable/TouchableOpacity) for label truncation, minHeight, flexShrink.


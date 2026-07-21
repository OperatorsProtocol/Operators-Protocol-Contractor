import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as FileSystem from 'expo-file-system/legacy';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../supabase';

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function JobsScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [jobStats, setJobStats] = useState<Record<number, any>>({});
  const [allLogs, setAllLogs] = useState<any[]>([]);
  
  const [filterDate, setFilterDate] = useState(new Date());
  const [timeFrame, setTimeFrame] = useState<'MONTH' | '3_MONTHS' | 'YEAR' | 'ALL'>('MONTH');
  const [viewMode, setViewMode] = useState<'ACTIVE' | 'COMPLETED'>('ACTIVE');

  const [isAddingJob, setIsAddingJob] = useState(false);
  const [newJobName, setNewJobName] = useState('');
  const [newJobIsBiz, setNewJobIsBiz] = useState(true);

  const [isEditingJob, setIsEditingJob] = useState(false);
  const [editJobId, setEditJobId] = useState<number | null>(null);
  const [editJobName, setEditJobName] = useState('');
  const [editJobIsBiz, setEditJobIsBiz] = useState(true);

  const [vaultJob, setVaultJob] = useState<any>(null);

  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [isLabourModalVisible, setIsLabourModalVisible] = useState(false);
  const [labourDate, setLabourDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [hours, setHours] = useState('');
  const [rate, setRate] = useState('');
  const [labourNotes, setLabourNotes] = useState('');
  const [labourVehicle, setLabourVehicle] = useState<any>(null);
  const [savingLabour, setSavingLabour] = useState(false);

  const fetchData = async () => {
    setRefreshing(true);
    const { data: jData } = await supabase.from('jobs').select('*').eq('is_active', viewMode === 'ACTIVE').order('created_at', { ascending: false });
    const { data: lData } = await supabase.from('vehicle_logs').select('*').not('job_id', 'is', null).order('created_at', { ascending: false });
    const { data: vData } = await supabase.from('vehicles').select('*');

    if (vData) setVehicles(vData);
    if (lData) setAllLogs(lData);

    if (jData) {
        setJobs(jData);
        const stats: Record<number, any> = {};
        
        jData.forEach((job: any) => {
            const jobLogs = lData ? lData.filter((l: any) => l.job_id === job.id) : [];
            
            const periodJobLogs = jobLogs.filter((l: any) => {
                if (timeFrame === 'ALL') return true;
                const logDate = new Date(l.created_at);
                if (timeFrame === 'MONTH') {
                    return logDate.getMonth() === filterDate.getMonth() && logDate.getFullYear() === filterDate.getFullYear();
                } else if (timeFrame === '3_MONTHS') {
                    const d = new Date(); d.setMonth(d.getMonth() - 3);
                    return logDate >= d;
                } else if (timeFrame === 'YEAR') {
                    return logDate.getFullYear() === new Date().getFullYear();
                }
                return true;
            });

            let materials = 0; let fuel = 0; let repair = 0; let labour = 0;
            periodJobLogs.forEach((log: any) => {
                const cost = log.cost || 0;
                if (log.log_type === 'MATERIALS') materials += cost;
                else if (log.log_type === 'LABOUR') labour += cost;
                else if (log.log_type === 'FUEL') fuel += cost;
                else if (log.log_type === 'MAINTENANCE') repair += cost;
            });

            let lifetimeTotal = 0;
            jobLogs.forEach((log: any) => lifetimeTotal += (log.cost || 0));

            stats[job.id] = { materials, fuel, repair, labour, periodTotal: materials + fuel + repair + labour, lifetimeTotal };
        });
        setJobStats(stats);
    }
    setRefreshing(false);
  };

  useFocusEffect(useCallback(() => { fetchData(); }, [filterDate, viewMode, timeFrame]));

  const handlePrevMonth = () => setFilterDate(new Date(filterDate.getFullYear(), filterDate.getMonth() - 1, 1));
  const handleNextMonth = () => setFilterDate(new Date(filterDate.getFullYear(), filterDate.getMonth() + 1, 1));

  const handleCompleteJob = (id: number, name: string) => {
      Alert.alert("Complete", `Mark "${name}" as finished?`, [
          { text: "Cancel", style: "cancel" },
          { text: "Mark Complete", onPress: async () => { 
              const { error } = await supabase.from('jobs').update({ is_active: false }).eq('id', id);
              if (error) Alert.alert("Error", error.message);
              else fetchData(); 
          }}
      ]);
  };

  const handleRestoreJob = (id: number, name: string) => {
      Alert.alert("Restore", `Move "${name}" back to active?`, [
          { text: "Cancel", style: "cancel" },
          { text: "Restore", onPress: async () => { 
              const { error } = await supabase.from('jobs').update({ is_active: true }).eq('id', id);
              if (error) Alert.alert("Error", error.message);
              else fetchData(); 
          }}
      ]);
  };

  const handleDeleteJob = (id: number, name: string) => {
      Alert.alert("Delete", `WARNING: Deleting "${name}" removes it permanently.`, [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: async () => { 
              const { error } = await supabase.from('jobs').delete().eq('id', id);
              if (error) Alert.alert("Database Error", error.message);
              else fetchData(); 
          }}
      ]);
  };

  const handleSaveNewJob = async () => {
      if (!newJobName) return Alert.alert("Missing", "Please enter a name.");
      const { error } = await supabase.from('jobs').insert([{ name: newJobName, is_business: newJobIsBiz, is_active: true }]);
      if (error) Alert.alert("Error", error.message);
      else { setNewJobName(''); setIsAddingJob(false); fetchData(); }
  };

  const openEditJobModal = (job: any) => {
      setEditJobId(job.id);
      setEditJobName(job.name);
      setEditJobIsBiz(job.is_business);
      setIsEditingJob(true);
  };

  const handleUpdateJob = async () => {
      if (!editJobName || !editJobId) return;
      const { error } = await supabase.from('jobs').update({ name: editJobName, is_business: editJobIsBiz }).eq('id', editJobId);
      if (error) Alert.alert("Error", error.message);
      else { setIsEditingJob(false); fetchData(); }
  };

  const openLabourModal = (job: any) => { 
      setSelectedJob(job); setHours(''); setRate(''); setLabourNotes(''); setLabourVehicle(null); setLabourDate(new Date()); setIsLabourModalVisible(true); 
  };
  
  const handleSaveLabour = async () => {
      if (!hours || !rate) return Alert.alert("Missing Info", "Enter hours and rate.");
      setSavingLabour(true);
      const calculatedCost = parseFloat(hours) * parseFloat(rate);
      
      const finalNotes = labourNotes ? `Labour: ${hours} hrs @ $${rate}/hr - ${labourNotes}` : `Labour: ${hours} hrs @ $${rate}/hr`;

      const { error } = await supabase.from('vehicle_logs').insert({
          created_at: labourDate.toISOString(), cost: calculatedCost, hours: parseFloat(hours), hourly_rate: parseFloat(rate),
          log_type: 'LABOUR', is_business: selectedJob.is_business, job_id: selectedJob.id, job_name: selectedJob.name, 
          vehicle_id: labourVehicle?.id || null, vehicle_name: labourVehicle?.name || null,
          notes: finalNotes
      });
      if (error) Alert.alert("Error", error.message);
      else { setIsLabourModalVisible(false); fetchData(); }
      setSavingLabour(false);
  };

  const triggerExport = (job: any) => {
      Alert.alert("Select Export Range", "Choose timeframe:", [
          { text: "Cancel", style: "cancel" },
          { text: `This Month (${MONTHS[filterDate.getMonth()]})`, onPress: () => exportProjectLedger(job, 'month') },
          { text: `This Year (${filterDate.getFullYear()})`, onPress: () => exportProjectLedger(job, 'year') },
          { text: "All-Time", onPress: () => exportProjectLedger(job, 'all') }
      ]);
  };

  const exportProjectLedger = async (job: any, range: 'month' | 'year' | 'all') => {
      let query = supabase.from('vehicle_logs').select('*').eq('job_id', job.id).order('created_at', { ascending: false });
      
      if (range === 'month') {
          const start = new Date(filterDate.getFullYear(), filterDate.getMonth(), 1).toISOString();
          const end = new Date(filterDate.getFullYear(), filterDate.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
          query = query.gte('created_at', start).lte('created_at', end);
      } else if (range === 'year') {
          const start = new Date(filterDate.getFullYear(), 0, 1).toISOString();
          const end = new Date(filterDate.getFullYear(), 11, 31, 23, 59, 59, 999).toISOString();
          query = query.gte('created_at', start).lte('created_at', end);
      }

      const { data, error } = await query;
      if (error || !data || data.length === 0) return Alert.alert("Empty", `No logs to export for this ${range}.`);

      let csv = `Name,${job.name}\nExport Date,${new Date().toLocaleDateString()}\nRange,${range}\n\n`;
      csv += 'Date,Log Type,Total Cost,Tax Extracted,Currency,Vendor/Location,Notes,Digital Receipt Link\n';
      
      data.forEach(l => {
          const date = new Date(l.created_at).toISOString().split('T')[0];
          let type = l.log_type || 'General';
          if (type === 'MAINTENANCE') type = 'Vehicle Repairs & Maintenance';
          if (type === 'MATERIALS') type = 'Materials & Supplies';
          if (type === 'FUEL') type = 'Fuel & Oil';

          const cost = l.cost ? l.cost.toFixed(2) : '0.00';
          const gst = l.gst_amount ? l.gst_amount.toFixed(2) : '0.00';
          const currency = l.currency || 'CAD';
          const vendor = (l.vendor || '').replace(/,/g, ' ');
          const notes = (l.notes || '').replace(/,/g, ' ');
          const receipt = l.receipt_url || 'No Image';
          csv += `${date},${type},${cost},${gst},${currency},${vendor},${notes},${receipt}\n`;
      });

      const fileName = `${job.name.replace(/\s/g, '_')}_Ledger_${range}.csv`;
      const fileUri = FileSystem.documentDirectory + fileName;
      await FileSystem.writeAsStringAsync(fileUri, csv); 
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(fileUri);
      else Alert.alert("Error", "Sharing is not available.");
  };

  return (
    <View style={styles.container}>
      <View style={[styles.headerContainer, {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}]}>
          <Text style={styles.header}>PROJECTS / TRIPS</Text>
          <TouchableOpacity onPress={() => setIsAddingJob(true)}><Text style={{color: '#FF9800', fontWeight: 'bold', fontSize: 16}}>+ NEW</Text></TouchableOpacity>
      </View>

      <View style={styles.toggleContainer}>
          <TouchableOpacity style={[styles.toggleBtn, viewMode === 'ACTIVE' && styles.toggleActive]} onPress={() => setViewMode('ACTIVE')}><Text style={[styles.toggleText, viewMode === 'ACTIVE' && {color: '#000'}]}>ACTIVE</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.toggleBtn, viewMode === 'COMPLETED' && styles.toggleActive]} onPress={() => setViewMode('COMPLETED')}><Text style={[styles.toggleText, viewMode === 'COMPLETED' && {color: '#000'}]}>COMPLETED</Text></TouchableOpacity>
      </View>

      <View style={{ marginBottom: 15 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 5, paddingRight: 20 }}>
              <TouchableOpacity style={[styles.pill, timeFrame === 'MONTH' && styles.pillActive]} onPress={() => setTimeFrame('MONTH')}>
                  <Text style={[styles.pillText, timeFrame === 'MONTH' && styles.pillTextActive]}>THIS MONTH</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.pill, timeFrame === '3_MONTHS' && styles.pillActive]} onPress={() => setTimeFrame('3_MONTHS')}>
                  <Text style={[styles.pillText, timeFrame === '3_MONTHS' && styles.pillTextActive]}>LAST 90 DAYS</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.pill, timeFrame === 'YEAR' && styles.pillActive]} onPress={() => setTimeFrame('YEAR')}>
                  <Text style={[styles.pillText, timeFrame === 'YEAR' && styles.pillTextActive]}>THIS YEAR</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.pill, timeFrame === 'ALL' && styles.pillActive]} onPress={() => setTimeFrame('ALL')}>
                  <Text style={[styles.pillText, timeFrame === 'ALL' && styles.pillTextActive]}>ALL-TIME</Text>
              </TouchableOpacity>
          </ScrollView>
      </View>

      <View style={styles.filterRow}>
          {timeFrame === 'MONTH' ? (
              <>
                  <TouchableOpacity onPress={handlePrevMonth} style={styles.arrowBtn}><Ionicons name="chevron-back" size={24} color="#FF9800" /></TouchableOpacity>
                  <Text style={styles.monthText}>{MONTHS[filterDate.getMonth()]} {filterDate.getFullYear()}</Text>
                  <TouchableOpacity onPress={handleNextMonth} style={styles.arrowBtn}><Ionicons name="chevron-forward" size={24} color="#FF9800" /></TouchableOpacity>
              </>
          ) : (
              <View style={{flex: 1, alignItems: 'center'}}>
                  <Text style={styles.monthText}>
                      {timeFrame === '3_MONTHS' ? 'LAST 90 DAYS' : timeFrame === 'YEAR' ? `YEAR TO DATE (${new Date().getFullYear()})` : 'ALL-TIME HISTORY'}
                  </Text>
              </View>
          )}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchData} tintColor="#FF9800" />}>
          {jobs.length === 0 && !refreshing && <Text style={styles.emptyText}>No {viewMode.toLowerCase()} records found.</Text>}
          {jobs.map((job: any) => {
              const stats = jobStats[job.id] || { materials: 0, fuel: 0, repair: 0, labour: 0, periodTotal: 0, lifetimeTotal: 0 };
              const borderColor = job.is_business ? '#4CAF50' : '#9C27B0';
              
              let spendLabel = timeFrame === 'MONTH' ? `${MONTHS[filterDate.getMonth()].toUpperCase()} SPEND` : timeFrame === '3_MONTHS' ? '90 DAY SPEND' : timeFrame === 'YEAR' ? 'YTD SPEND' : 'ALL-TIME SPEND';

              return (
                  <View key={job.id} style={[styles.jobCard, {borderLeftWidth: 4, borderLeftColor: borderColor}]}>
                      
                      <View style={styles.jobHeader}>
                          <View style={{flexDirection: 'row', alignItems: 'center'}}>
                            <View>
                                <Text style={[styles.jobTitle, viewMode === 'COMPLETED' && {color: '#888'}]}>{job.is_business ? '💼' : '🏠'} {job.name}</Text>
                                <Text style={{color: '#666', fontSize: 10, marginTop: 4, fontWeight: 'bold'}}>LIFETIME: ${stats.lifetimeTotal.toFixed(2)}</Text>
                            </View>
                            <TouchableOpacity onPress={() => openEditJobModal(job)} style={{marginLeft: 15, padding: 5}}>
                                <Ionicons name="pencil-outline" size={20} color="#888" />
                            </TouchableOpacity>
                          </View>

                          <View style={{alignItems: 'flex-end'}}>
                            <Text style={{color: '#888', fontSize: 10, fontWeight: 'bold', marginBottom: 2}}>{spendLabel}</Text>
                            <Text style={[styles.jobTotal, viewMode === 'COMPLETED' && {color: '#AAA'}]}>${stats.periodTotal.toFixed(2)}</Text>
                          </View>
                      </View>

                      <TouchableOpacity style={styles.vaultBtn} onPress={() => setVaultJob(job)}>
                          <Text style={styles.vaultBtnText}>🗄️ OPEN PROJECT VAULT</Text>
                      </TouchableOpacity>
                      
                      <View style={styles.breakdownRow}><Text style={styles.breakdownLabel}>🧱 Materials</Text><Text style={styles.breakdownValue}>${stats.materials.toFixed(2)}</Text></View>
                      <View style={styles.breakdownRow}><Text style={styles.breakdownLabel}>⛽ Fuel & Oil</Text><Text style={styles.breakdownValue}>${stats.fuel.toFixed(2)}</Text></View>
                      <View style={styles.breakdownRow}><Text style={styles.breakdownLabel}>🔧 Repairs</Text><Text style={styles.breakdownValue}>${stats.repair.toFixed(2)}</Text></View>
                      <View style={styles.breakdownRow}><Text style={styles.breakdownLabel}>⏱️ Labour</Text><Text style={styles.breakdownValue}>${stats.labour.toFixed(2)}</Text></View>

                      <View style={styles.actionRow}>
                          {viewMode === 'ACTIVE' ? (
                              <>
                                  <TouchableOpacity style={styles.actionBtnBlue} onPress={() => router.navigate({ pathname: '/(tabs)', params: { prefillJob: job.id, isBiz: job.is_business.toString(), editId: '' } })}><Text style={styles.actionBtnText}>+ EXPENSE</Text></TouchableOpacity>
                                  <TouchableOpacity style={styles.actionBtnDark} onPress={() => openLabourModal(job)}><Text style={styles.actionBtnText}>+ LABOUR</Text></TouchableOpacity>
                              </>
                          ) : (
                              <TouchableOpacity style={[styles.completeBtn, {backgroundColor: '#333', flex: 2}]} onPress={() => handleRestoreJob(job.id, job.name)}>
                                  <Text style={[styles.completeBtnText, {color: '#FFF'}]}>↺ RESTORE</Text>
                              </TouchableOpacity>
                          )}
                          <TouchableOpacity style={styles.exportBtn} onPress={() => triggerExport(job)}><Ionicons name="download-outline" size={18} color="#000" /></TouchableOpacity>
                      </View>
                      
                      <View style={{flexDirection: 'row', marginTop: 10, gap: 10}}>
                         {viewMode === 'ACTIVE' && <TouchableOpacity style={styles.completeBtn} onPress={() => handleCompleteJob(job.id, job.name)}><Text style={styles.completeBtnText}>✓ FINISH</Text></TouchableOpacity>}
                         <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteJob(job.id, job.name)}><Ionicons name="trash" size={18} color="#FFF" /></TouchableOpacity>
                      </View>
                  </View>
              );
          })}
      </ScrollView>

      <Modal visible={!!vaultJob} animationType="slide" transparent>
          <View style={styles.modalBg}>
              <View style={styles.modalContent}>
                  <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}}>
                      <Text style={styles.modalTitle}>{vaultJob?.is_business ? '💼' : '🏠'} {vaultJob?.name} Vault</Text>
                      <TouchableOpacity onPress={() => setVaultJob(null)}><Ionicons name="close" size={28} color="#FFF" /></TouchableOpacity>
                  </View>

                  <ScrollView style={{backgroundColor:'#121212', borderRadius:10, padding:10}}>
                      {allLogs.filter(l => l.job_id === vaultJob?.id).length === 0 ? <Text style={{color:'#666', textAlign:'center', marginTop:20}}>No records found.</Text> : null}
                      {allLogs.filter(l => l.job_id === vaultJob?.id).map((log, index) => (
                          <TouchableOpacity 
                              key={index} 
                              style={styles.logRow}
                              onPress={() => {
                                  const targetJobId = vaultJob.id.toString();
                                  setVaultJob(null);
                                  router.push({ pathname: '/(tabs)/history', params: { jobFilter: targetJobId } });
                              }}
                          >
                              <View>
                                  <Text style={styles.logDate}>{new Date(log.created_at).toLocaleDateString()} {log.vehicle_name ? `• ${log.vehicle_name}` : ''}</Text>
                                  <Text style={styles.logType}>
                                      {log.log_type === 'FUEL' ? '⛽ Fuel' : log.log_type === 'LABOUR' ? '⏱️ Labour' : log.log_type === 'MATERIALS' ? '🧱 Materials' : `🔧 ${log.notes || 'Repair'}`}
                                  </Text>
                              </View>
                              <View style={{alignItems:'flex-end'}}>
                                  <Text style={styles.logCost}>${log.cost.toFixed(2)}</Text>
                                  {log.log_type === 'FUEL' && log.liters && <Text style={styles.logOdo}>{(log.cost / log.liters).toFixed(3)}/Vol</Text>}
                                  {log.log_type === 'LABOUR' && log.hours && <Text style={styles.logOdo}>{log.hours} hrs @ ${log.hourly_rate}</Text>}
                              </View>
                          </TouchableOpacity>
                      ))}
                  </ScrollView>
              </View>
          </View>
      </Modal>

      <Modal visible={isLabourModalVisible} animationType="slide" transparent>
          <View style={styles.modalBg}>
              <View style={styles.modalContent}>
                  <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}}>
                      <Text style={styles.modalTitle}>Log Labour</Text>
                      <TouchableOpacity onPress={() => setIsLabourModalVisible(false)}><Ionicons name="close" size={28} color="#FFF" /></TouchableOpacity>
                  </View>
                  <Text style={{color: '#FF9800', fontWeight: 'bold', marginBottom: 20}}>{selectedJob?.is_business ? '💼' : '🏠'} {selectedJob?.name}</Text>
                  
                  <Text style={styles.label}>Date Worked</Text>
                  {Platform.OS === 'android' && (
                    <TouchableOpacity style={[styles.input, {marginBottom: 15}]} onPress={() => setShowDatePicker(true)}><Text style={{color: '#FFF'}}>{labourDate.toLocaleDateString()}</Text></TouchableOpacity>
                  )}
                  {(showDatePicker || Platform.OS === 'ios') && (
                    <DateTimePicker value={labourDate} mode="date" display="default" onChange={(e, d) => { setShowDatePicker(Platform.OS === 'ios'); if(d) setLabourDate(d); }} themeVariant="dark" />
                  )}

                  <View style={{flexDirection: 'row', gap: 15, marginTop: 15}}>
                      <View style={{flex: 1}}><Text style={styles.label}>Total Hours</Text><TextInput style={styles.input} value={hours} onChangeText={setHours} keyboardType="decimal-pad" placeholder="e.g. 8.5" placeholderTextColor="#666" /></View>
                      <View style={{flex: 1}}><Text style={styles.label}>Hourly Rate ($)</Text><TextInput style={styles.input} value={rate} onChangeText={setRate} keyboardType="decimal-pad" placeholder="e.g. 65" placeholderTextColor="#666" /></View>
                  </View>

                  <Text style={[styles.label, {marginTop: 15}]}>Labour Notes</Text>
                  <TextInput style={styles.input} value={labourNotes} onChangeText={setLabourNotes} placeholder="What did you work on?" placeholderTextColor="#666" />

                  <Text style={[styles.label, {marginTop: 15}]}>Attach to Vehicle (Optional)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillContainer}>
                      <TouchableOpacity style={[styles.pill, !labourVehicle && styles.pillActive]} onPress={() => setLabourVehicle(null)}><Text style={[styles.pillText, !labourVehicle && styles.pillTextActive]}>NONE</Text></TouchableOpacity>
                      {vehicles.map(v => (
                          <TouchableOpacity key={v.id} style={[styles.pill, labourVehicle?.id === v.id && styles.pillActive]} onPress={() => setLabourVehicle(v)}>
                              <Text style={[styles.pillText, labourVehicle?.id === v.id && styles.pillTextActive]}>{v.name}</Text>
                          </TouchableOpacity>
                      ))}
                  </ScrollView>

                  <View style={styles.costPreview}>
                      <Text style={{color: '#888', fontWeight: 'bold'}}>TOTAL LABOUR COST</Text>
                      <Text style={{color: '#4CAF50', fontSize: 24, fontWeight: 'bold'}}>${(parseFloat(hours || '0') * parseFloat(rate || '0')).toFixed(2)}</Text>
                  </View>
                  
                  <TouchableOpacity onPress={handleSaveLabour} style={styles.saveBtn} disabled={savingLabour}>
                      {savingLabour ? <ActivityIndicator color="#000" /> : <Text style={styles.saveText}>SAVE LABOUR</Text>}
                  </TouchableOpacity>
              </View>
          </View>
      </Modal>

      <Modal visible={isAddingJob} animationType="fade" transparent>
          <View style={styles.modalBg}>
              <View style={[styles.modalContent, {height: 'auto', paddingBottom: 40}]}>
                  <Text style={styles.modalTitle}>New Project / Trip</Text>
                  
                  <View style={[styles.toggleContainer, {marginBottom: 20}]}>
                      <TouchableOpacity style={[styles.toggleBtn, newJobIsBiz && {backgroundColor: '#4CAF50'}]} onPress={() => setNewJobIsBiz(true)}>
                          <Text style={[styles.toggleText, newJobIsBiz && {color: '#000'}]}>💼 BUSINESS</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.toggleBtn, !newJobIsBiz && {backgroundColor: '#9C27B0'}]} onPress={() => setNewJobIsBiz(false)}>
                          <Text style={[styles.toggleText, !newJobIsBiz && {color: '#000'}]}>🏠 PERSONAL</Text>
                      </TouchableOpacity>
                  </View>

                  <Text style={styles.label}>Name</Text>
                  <TextInput style={[styles.input, {marginBottom: 20}]} value={newJobName} onChangeText={setNewJobName} placeholder={newJobIsBiz ? "e.g. Smith Reno" : "e.g. Oregon Roadtrip"} placeholderTextColor="#666" autoFocus />
                  <TouchableOpacity onPress={handleSaveNewJob} style={[styles.saveBtn, {marginTop: 0, padding: 15}]}><Text style={styles.saveText}>SAVE DETAILS</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => setIsAddingJob(false)} style={{marginTop:15, alignItems:'center'}}><Text style={{color:'#666'}}>Cancel</Text></TouchableOpacity>
              </View>
          </View>
      </Modal>

      <Modal visible={isEditingJob} animationType="fade" transparent>
          <View style={styles.modalBg}>
              <View style={[styles.modalContent, {height: 'auto', paddingBottom: 40}]}>
                  <Text style={styles.modalTitle}>Edit Project</Text>
                  
                  <View style={[styles.toggleContainer, {marginBottom: 20}]}>
                      <TouchableOpacity style={[styles.toggleBtn, editJobIsBiz && {backgroundColor: '#4CAF50'}]} onPress={() => setEditJobIsBiz(true)}>
                          <Text style={[styles.toggleText, editJobIsBiz && {color: '#000'}]}>💼 BUSINESS</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.toggleBtn, !editJobIsBiz && {backgroundColor: '#9C27B0'}]} onPress={() => setEditJobIsBiz(false)}>
                          <Text style={[styles.toggleText, !editJobIsBiz && {color: '#000'}]}>🏠 PERSONAL</Text>
                      </TouchableOpacity>
                  </View>

                  <Text style={styles.label}>Name</Text>
                  <TextInput style={[styles.input, {marginBottom: 20}]} value={editJobName} onChangeText={setEditJobName} placeholderTextColor="#666" />
                  <TouchableOpacity onPress={handleUpdateJob} style={[styles.saveBtn, {marginTop: 0, padding: 15}]}><Text style={styles.saveText}>UPDATE DETAILS</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => setIsEditingJob(false)} style={{marginTop:15, alignItems:'center'}}><Text style={{color:'#666'}}>Cancel</Text></TouchableOpacity>
              </View>
          </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', paddingTop: 60, paddingHorizontal: 20 },
  headerContainer: { marginBottom: 15 }, header: { color: '#FFF', fontSize: 24, fontWeight: 'bold' },
  emptyText: { color: '#666', textAlign: 'center', marginTop: 40, fontSize: 16 },
  toggleContainer: { flexDirection: 'row', backgroundColor: '#1E1E1E', borderRadius: 8, marginBottom: 20, borderWidth: 1, borderColor: '#333' },
  toggleBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 6 }, toggleActive: { backgroundColor: '#FF9800' }, toggleText: { color: '#888', fontWeight: 'bold', fontSize: 12 },
  filterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1E1E1E', padding: 15, borderRadius: 12, marginBottom: 20, borderWidth: 1, borderColor: '#333' },
  arrowBtn: { paddingHorizontal: 10 }, monthText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  jobCard: { backgroundColor: '#1E1E1E', padding: 20, borderRadius: 15, marginBottom: 15, borderWidth: 1, borderColor: '#333' },
  jobHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  jobTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold' }, jobTotal: { color: '#FF9800', fontSize: 22, fontWeight: '900' },
  vaultBtn: { backgroundColor: '#333', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginBottom: 15, borderWidth: 1, borderColor: '#555' },
  vaultBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 12, letterSpacing: 1 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }, breakdownLabel: { color: '#888', fontSize: 14, fontWeight: 'bold' }, breakdownValue: { color: '#FFF', fontSize: 14, fontWeight: 'bold' },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, paddingTop: 15, borderTopWidth: 1, borderTopColor: '#333', gap: 10 },
  actionBtnBlue: { flex: 1, backgroundColor: '#2196F3', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  actionBtnDark: { flex: 1, backgroundColor: '#333', paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#555' },
  actionBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  exportBtn: { backgroundColor: '#FF9800', paddingHorizontal: 15, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  completeBtn: { flex: 1, backgroundColor: '#4CAF50', paddingVertical: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, completeBtnText: { color: '#000', fontWeight: 'bold', fontSize: 12 },
  deleteBtn: { width: 50, backgroundColor: '#D32F2F', paddingVertical: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1E1E1E', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 25, borderWidth: 1, borderColor: '#333', height: '85%' },
  modalTitle: { color: '#FFF', fontSize: 24, fontWeight: 'bold' }, label: { color: '#888', fontSize: 12, fontWeight: 'bold', marginBottom: 8 },
  input: { backgroundColor: '#121212', color: '#FFF', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#333', fontSize: 16 },
  pillContainer: { flexDirection: 'row', marginBottom: 5 }, 
  pill: { backgroundColor: '#1E1E1E', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: '#333', justifyContent: 'center', alignSelf: 'flex-start', flexShrink: 0 },
  pillActive: { backgroundColor: '#FF9800', borderColor: '#FF9800' },
  pillText: { color: '#888', fontWeight: 'bold', fontSize: 10 },
  pillTextActive: { color: '#000' },
  costPreview: { backgroundColor: '#121212', padding: 20, borderRadius: 10, alignItems: 'center', marginTop: 20, marginBottom: 20, borderWidth: 1, borderColor: '#333' },
  saveBtn: { backgroundColor: '#FF9800', padding: 18, borderRadius: 10, alignItems: 'center' }, saveText: { fontWeight: 'bold', color: '#000', fontSize: 16 },
  logRow: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#333', paddingVertical: 10 },
  logDate: { color: '#888', fontSize: 12 }, logType: { color: '#FFF', fontWeight: 'bold' }, logCost: { color: '#4CAF50', fontWeight: 'bold' }, logOdo: { color: '#666', fontSize: 12 }
});

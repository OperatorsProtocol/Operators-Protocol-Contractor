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
  const [quotes, setQuotes] = useState<any[]>([]); 
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [jobStats, setJobStats] = useState<Record<number, any>>({});
  const [allLogs, setAllLogs] = useState<any[]>([]);
  
  const [filterDate, setFilterDate] = useState(new Date());
  const [timeFrame, setTimeFrame] = useState<'MONTH' | '3_MONTHS' | 'YEAR' | 'ALL'>('MONTH');
  const [viewMode, setViewMode] = useState<'ACTIVE' | 'COMPLETED' | 'QUOTES'>('ACTIVE'); 

  // --- JOB STATES ---
  const [isAddingJob, setIsAddingJob] = useState(false);
  const [newJobName, setNewJobName] = useState('');
  const [newJobAddress, setNewJobAddress] = useState('');
  const [newJobDistance, setNewJobDistance] = useState('');
  const [newJobIsBiz, setNewJobIsBiz] = useState(true);

  const [isEditingJob, setIsEditingJob] = useState(false);
  const [editJobId, setEditJobId] = useState<number | null>(null);
  const [editJobName, setEditJobName] = useState('');
  const [editJobAddress, setEditJobAddress] = useState('');
  const [editJobDistance, setEditJobDistance] = useState('');
  const [editJobIsBiz, setEditJobIsBiz] = useState(true);

  const [vaultJob, setVaultJob] = useState<any>(null);

  // --- LABOUR STATES ---
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [isLabourModalVisible, setIsLabourModalVisible] = useState(false);
  const [labourDate, setLabourDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [hours, setHours] = useState('');
  const [rate, setRate] = useState('');
  const [labourNotes, setLabourNotes] = useState('');
  const [labourVehicle, setLabourVehicle] = useState<any>(null);
  const [savingLabour, setSavingLabour] = useState(false);

  // --- QUOTE STATES ---
  const [isQuoteModalVisible, setIsQuoteModalVisible] = useState(false);
  const [editQuoteId, setEditQuoteId] = useState<number | null>(null); // NEW: Track which quote we are editing
  const [qCustomer, setQCustomer] = useState('');
  const [qDesc, setQDesc] = useState('');
  const [qLabour, setQLabour] = useState('');
  const [qMaterials, setQMaterials] = useState('');
  const [qMarkup, setQMarkup] = useState('15'); 
  const [qTax, setQTax] = useState('5'); 
  const [savingQuote, setSavingQuote] = useState(false); 

  const fetchData = async () => {
    setRefreshing(true);

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (!user || authErr) {
        await supabase.auth.signOut();
        router.replace('/login');
        return;
    }

    // Fetch Quotes
    const { data: qData } = await supabase.from('quotes').select('*').order('created_at', { ascending: false });
    if (qData) setQuotes(qData);

    const { data: jData } = await supabase.from('jobs').select('*').eq('is_active', viewMode === 'ACTIVE').order('created_at', { ascending: true });
    const { data: lData } = await supabase.from('vehicle_logs').select('*').not('job_id', 'is', null).order('created_at', { ascending: false });
    const { data: vData } = await supabase.from('vehicles').select('*');

    if (vData) setVehicles(vData);
    if (lData) setAllLogs(lData);

    if (jData) {
        const sortedJobs = jData.sort((a, b) => {
            if (a.name === 'General Overhead') return -1;
            if (b.name === 'General Overhead') return 1;
            return 0;
        });

        setJobs(sortedJobs);
        const stats: Record<number, any> = {};
        
        sortedJobs.forEach((job: any) => {
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

            let fuel = 0; let materials = 0; let tools = 0; let labour = 0; 
            let maintenance = 0; let rentals = 0; let permits = 0; let insurance = 0; let admin = 0;

            periodJobLogs.forEach((log: any) => {
                const cost = log.cost || 0;
                const cat = log.expense_category || log.log_type;
                if (cat === 'FUEL') fuel += cost;
                else if (cat === 'MATERIALS') materials += cost;
                else if (cat === 'TOOLS') tools += cost;
                else if (cat === 'LABOUR') labour += cost;
                else if (cat === 'MAINTENANCE') maintenance += cost;
                else if (cat === 'RENTALS') rentals += cost;
                else if (cat === 'PERMITS') permits += cost;
                else if (cat === 'INSURANCE') insurance += cost;
                else if (cat === 'ADMIN' || cat === 'PARKING') admin += cost;
            });

            let lifetimeTotal = 0;
            jobLogs.forEach((log: any) => lifetimeTotal += (log.cost || 0));

            const periodTotal = fuel + materials + tools + labour + maintenance + rentals + permits + insurance + admin;
            stats[job.id] = { fuel, materials, tools, labour, maintenance, rentals, permits, insurance, admin, periodTotal, lifetimeTotal };
        });
        setJobStats(stats);
    }
    setRefreshing(false);
  };

  useFocusEffect(useCallback(() => { fetchData(); }, [filterDate, viewMode, timeFrame]));

  const handlePrevMonth = () => setFilterDate(new Date(filterDate.getFullYear(), filterDate.getMonth() - 1, 1));
  const handleNextMonth = () => setFilterDate(new Date(filterDate.getFullYear(), filterDate.getMonth() + 1, 1));

  // --- JOB FUNCTIONS ---
  const handleCompleteJob = (id: number, name: string) => {
      if (name === 'General Overhead') return Alert.alert("Protected", "General Overhead cannot be completed.");
      Alert.alert("Complete", `Mark "${name}" as finished?`, [
          { text: "Cancel", style: "cancel" },
          { text: "Mark Complete", onPress: async () => { 
              const { error } = await supabase.from('jobs').update({ is_active: false }).eq('id', id);
              if (error) Alert.alert("Error", "Could not complete job: " + error.message);
              else fetchData(); 
          }}
      ]);
  };

  const handleRestoreJob = (id: number, name: string) => {
      Alert.alert("Restore", `Move "${name}" back to active?`, [
          { text: "Cancel", style: "cancel" },
          { text: "Restore", onPress: async () => { 
              const { error } = await supabase.from('jobs').update({ is_active: true }).eq('id', id);
              if (error) Alert.alert("Error", "Could not restore job: " + error.message);
              else fetchData(); 
          }}
      ]);
  };

  const handleDeleteJob = (id: number, name: string) => {
      if (name === 'General Overhead') return Alert.alert("Protected", "General Overhead cannot be deleted.");
      Alert.alert("Delete", `WARNING: Deleting "${name}" removes it permanently.`, [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: async () => { 
              const { error } = await supabase.from('jobs').delete().eq('id', id);
              if (error) Alert.alert("Database Error", "Could not delete job: " + error.message);
              else fetchData(); 
          }}
      ]);
  };

  const handleSaveNewJob = async () => {
      if (!newJobName.trim()) return Alert.alert("Missing", "Please enter a name.");
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
          name: newJobName.trim(), is_business: newJobIsBiz, is_active: true,
          address: newJobAddress.trim() || null, default_distance: newJobDistance ? parseInt(newJobDistance) : null,
          user_id: user?.id
      };
      const { error } = await supabase.from('jobs').insert([payload]);
      if (error) Alert.alert("Error", error.message);
      else { 
          setNewJobName(''); setNewJobAddress(''); setNewJobDistance('');
          setIsAddingJob(false); fetchData(); 
      }
  };

  const openEditJobModal = (job: any) => {
      setEditJobId(job.id); setEditJobName(job.name); setEditJobIsBiz(job.is_business);
      setEditJobAddress(job.address || ''); setEditJobDistance(job.default_distance?.toString() || '');
      setIsEditingJob(true);
  };

  const handleUpdateJob = async () => {
      if (!editJobName.trim() || !editJobId) return;
      const payload = {
          name: editJobName.trim(), is_business: editJobIsBiz,
          address: editJobAddress.trim() || null, default_distance: editJobDistance ? parseInt(editJobDistance) : null
      };
      const { error } = await supabase.from('jobs').update(payload).eq('id', editJobId);
      if (error) Alert.alert("Error", "Could not update job: " + error.message);
      else { setIsEditingJob(false); fetchData(); }
  };

  // --- LABOUR FUNCTIONS ---
  const openLabourModal = (job: any) => { 
      setSelectedJob(job); setHours(''); setRate(''); setLabourNotes(''); setLabourVehicle(null); setLabourDate(new Date()); setIsLabourModalVisible(true); 
  };
  
  const handleSaveLabour = async () => {
      const parsedHours = Math.max(0, parseFloat(hours || '0'));
      const parsedRate = Math.max(0, parseFloat(rate || '0'));
      if (parsedHours <= 0 || parsedRate <= 0) return Alert.alert("Invalid Input", "Please enter valid hours and rate.");
      
      setSavingLabour(true);
      const { data: { user } } = await supabase.auth.getUser();
      const calculatedCost = parsedHours * parsedRate;
      const finalNotes = labourNotes ? `Labour: ${parsedHours} hrs @ $${parsedRate}/hr - ${labourNotes}` : `Labour: ${parsedHours} hrs @ $${parsedRate}/hr`;

      const { error } = await supabase.from('vehicle_logs').insert({
          created_at: labourDate.toISOString(), cost: calculatedCost, hours: parsedHours, hourly_rate: parsedRate,
          log_type: 'LABOUR', expense_category: 'LABOUR', is_business: selectedJob.is_business, job_id: selectedJob.id, job_name: selectedJob.name, 
          vehicle_id: labourVehicle?.id || null, vehicle_name: labourVehicle?.name || null, notes: finalNotes, user_id: user?.id
      });
      if (error) Alert.alert("Error", error.message);
      else { setIsLabourModalVisible(false); fetchData(); }
      setSavingLabour(false);
  };

  // --- QUOTE FUNCTIONS ---
  const calculateQuoteTotal = () => {
      const l = Math.max(0, parseFloat(qLabour || '0') || 0);
      const m = Math.max(0, parseFloat(qMaterials || '0') || 0);
      const mark = Math.max(0, parseFloat(qMarkup || '0') || 0);
      const tax = Math.max(0, parseFloat(qTax || '0') || 0);
      
      const sub = l + m;
      const preTax = sub * (1 + (mark / 100));
      const final = preTax * (1 + (tax / 100));
      return final.toFixed(2);
  };

  const openNewQuoteModal = () => {
      setEditQuoteId(null);
      setQCustomer(''); setQDesc(''); setQLabour(''); setQMaterials(''); setQMarkup('15'); setQTax('5');
      setIsQuoteModalVisible(true);
  };

  const openEditQuoteModal = (quote: any) => {
      setEditQuoteId(quote.id);
      setQCustomer(quote.customer_name);
      setQDesc(quote.description || '');
      setQLabour(quote.est_labour?.toString() || '0');
      setQMaterials(quote.est_materials?.toString() || '0');
      setQMarkup(quote.markup_percent?.toString() || '15');
      setQTax(quote.tax_percent?.toString() || '5');
      setIsQuoteModalVisible(true);
  };

  const handleSaveQuote = async () => {
      if (!qCustomer.trim()) return Alert.alert("Missing", "Customer Name is required.");
      setSavingQuote(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      const payload = {
          customer_name: qCustomer.trim(),
          description: qDesc.trim(),
          est_labour: Math.max(0, parseFloat(qLabour || '0') || 0),
          est_materials: Math.max(0, parseFloat(qMaterials || '0') || 0),
          markup_percent: Math.max(0, parseFloat(qMarkup || '0') || 0),
          tax_percent: Math.max(0, parseFloat(qTax || '0') || 0),
          total: parseFloat(calculateQuoteTotal()),
          status: 'Draft',
          user_id: user?.id
      };

      let error;
      if (editQuoteId) {
          const { error: updateErr } = await supabase.from('quotes').update(payload).eq('id', editQuoteId);
          error = updateErr;
      } else {
          const { error: insertErr } = await supabase.from('quotes').insert([payload]);
          error = insertErr;
      }
      
      setSavingQuote(false);

      if (error) {
          Alert.alert("Error", `Could not ${editQuoteId ? 'update' : 'save'} quote: ` + error.message);
      } else {
          setEditQuoteId(null);
          setQCustomer(''); setQDesc(''); setQLabour(''); setQMaterials(''); setQMarkup('15'); setQTax('5');
          setIsQuoteModalVisible(false); fetchData();
      }
  };

  const handleConvertToJob = async (quote: any) => {
      Alert.alert("Convert Quote", `Convert ${quote.customer_name}'s quote into an active project?`, [
          { text: "Cancel", style: "cancel" },
          { text: "Convert", onPress: async () => {
              const { data: { user } } = await supabase.auth.getUser();
              const newJobName = `${quote.customer_name} - ${quote.description || 'Project'}`;
              
              const { error: jobErr } = await supabase.from('jobs').insert([{
                  name: newJobName, is_business: true, is_active: true, user_id: user?.id
              }]);
              
              if (!jobErr) {
                  const { error: quoteErr } = await supabase.from('quotes').update({ status: 'Accepted & Converted' }).eq('id', quote.id);
                  if (quoteErr) Alert.alert("Warning", "Job created, but failed to update quote status: " + quoteErr.message);
                  else {
                      fetchData();
                      Alert.alert("Success", "Quote converted to an active project!");
                  }
              } else {
                  Alert.alert("Error", "Failed to create project: " + jobErr.message);
              }
          }}
      ]);
  };

  const handleDeleteQuote = (id: number) => {
      Alert.alert("Delete Quote", "Permanently remove this quote?", [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: async () => {
              const { error } = await supabase.from('quotes').delete().eq('id', id);
              if (error) Alert.alert("Error", "Could not delete quote: " + error.message);
              else fetchData();
          }}
      ]);
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
      csv += 'Date,Category,Total Cost,Tax Extracted,Currency,Vendor/Location,Notes,Digital Receipt Link\n';
      
      data.forEach(l => {
          const date = new Date(l.created_at).toISOString().split('T')[0];
          let cat = l.expense_category || l.log_type || 'General';
          if (cat === 'MAINTENANCE') cat = 'Maintenance & Repairs';
          if (cat === 'MATERIALS') cat = 'Materials';
          if (cat === 'FUEL') cat = 'Fuel & Oil';

          const cost = l.cost ? l.cost.toFixed(2) : '0.00';
          const gst = l.gst_amount ? l.gst_amount.toFixed(2) : '0.00';
          const currency = l.currency || 'CAD';
          const vendor = (l.vendor || '').replace(/,/g, ' ');
          const notes = (l.notes || '').replace(/,/g, ' ');
          const receipt = l.receipt_url || 'No Image';
          csv += `${date},${cat},${cost},${gst},${currency},${vendor},${notes},${receipt}\n`;
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
          <Text style={styles.header}>{viewMode === 'QUOTES' ? 'QUOTES & ESTIMATES' : 'PROJECTS / TRIPS'}</Text>
          {viewMode === 'QUOTES' ? (
              <TouchableOpacity onPress={openNewQuoteModal}><Text style={{color: '#2196F3', fontWeight: 'bold', fontSize: 16}}>+ NEW QUOTE</Text></TouchableOpacity>
          ) : (
              <TouchableOpacity onPress={() => { setNewJobName(''); setNewJobAddress(''); setNewJobDistance(''); setIsAddingJob(true); }}><Text style={{color: '#FF9800', fontWeight: 'bold', fontSize: 16}}>+ NEW</Text></TouchableOpacity>
          )}
      </View>

      <View style={styles.toggleContainer}>
          <TouchableOpacity style={[styles.toggleBtn, viewMode === 'ACTIVE' && styles.toggleActive]} onPress={() => setViewMode('ACTIVE')}><Text style={[styles.toggleText, viewMode === 'ACTIVE' && {color: '#000'}]}>ACTIVE</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.toggleBtn, viewMode === 'COMPLETED' && styles.toggleActive]} onPress={() => setViewMode('COMPLETED')}><Text style={[styles.toggleText, viewMode === 'COMPLETED' && {color: '#000'}]}>COMPLETED</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.toggleBtn, viewMode === 'QUOTES' && {backgroundColor: '#2196F3'}]} onPress={() => setViewMode('QUOTES')}><Text style={[styles.toggleText, viewMode === 'QUOTES' && {color: '#FFF'}]}>QUOTES</Text></TouchableOpacity>
      </View>

      {/* Hide filters if viewing quotes */}
      {viewMode !== 'QUOTES' && (
          <>
              <View style={{ marginBottom: 15 }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 5, paddingRight: 20 }}>
                      <TouchableOpacity style={[styles.pill, timeFrame === 'MONTH' && styles.pillActive]} onPress={() => setTimeFrame('MONTH')}><Text style={[styles.pillText, timeFrame === 'MONTH' && styles.pillTextActive]}>THIS MONTH</Text></TouchableOpacity>
                      <TouchableOpacity style={[styles.pill, timeFrame === '3_MONTHS' && styles.pillActive]} onPress={() => setTimeFrame('3_MONTHS')}><Text style={[styles.pillText, timeFrame === '3_MONTHS' && styles.pillTextActive]}>LAST 90 DAYS</Text></TouchableOpacity>
                      <TouchableOpacity style={[styles.pill, timeFrame === 'YEAR' && styles.pillActive]} onPress={() => setTimeFrame('YEAR')}><Text style={[styles.pillText, timeFrame === 'YEAR' && styles.pillTextActive]}>THIS YEAR</Text></TouchableOpacity>
                      <TouchableOpacity style={[styles.pill, timeFrame === 'ALL' && styles.pillActive]} onPress={() => setTimeFrame('ALL')}><Text style={[styles.pillText, timeFrame === 'ALL' && styles.pillTextActive]}>ALL-TIME</Text></TouchableOpacity>
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
                          <Text style={styles.monthText}>{timeFrame === '3_MONTHS' ? 'LAST 90 DAYS' : timeFrame === 'YEAR' ? `YEAR TO DATE (${new Date().getFullYear()})` : 'ALL-TIME HISTORY'}</Text>
                      </View>
                  )}
              </View>
          </>
      )}

      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchData} tintColor={viewMode === 'QUOTES' ? '#2196F3' : '#FF9800'} />}>
          
          {/* QUOTES VIEW */}
          {viewMode === 'QUOTES' && (
              <>
                  {quotes.length === 0 && !refreshing && <Text style={styles.emptyText}>No quotes found. Tap + NEW QUOTE to build an estimate.</Text>}
                  {quotes.map(quote => (
                      <View key={quote.id} style={[styles.jobCard, {borderLeftWidth: 4, borderLeftColor: '#2196F3'}]}>
                          <View style={styles.jobHeader}>
                              <View style={{flex: 1}}>
                                  <Text style={styles.jobTitle} numberOfLines={1}>📄 {quote.customer_name}</Text>
                                  <Text style={{color: '#888', fontSize: 12, marginTop: 4}}>{quote.description}</Text>
                              </View>
                              <View style={{alignItems: 'flex-end', marginLeft: 10}}>
                                  <Text style={{color: '#888', fontSize: 10, fontWeight: 'bold', marginBottom: 2}}>EST TOTAL</Text>
                                  <Text style={[styles.jobTotal, {color: '#2196F3'}]}>${quote.total.toFixed(2)}</Text>
                              </View>
                          </View>

                          <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#333'}}>
                              <Text style={{color: '#AAA', fontSize: 12}}>Status: <Text style={{fontWeight: 'bold', color: quote.status.includes('Accepted') ? '#4CAF50' : '#FF9800'}}>{quote.status}</Text></Text>
                              <Text style={{color: '#AAA', fontSize: 12}}>{new Date(quote.created_at).toLocaleDateString()}</Text>
                          </View>

                          <View style={styles.breakdownRow}><Text style={styles.breakdownLabel}>Estimated Labour</Text><Text style={styles.breakdownValue}>${quote.est_labour.toFixed(2)}</Text></View>
                          <View style={styles.breakdownRow}><Text style={styles.breakdownLabel}>Estimated Materials</Text><Text style={styles.breakdownValue}>${quote.est_materials.toFixed(2)}</Text></View>
                          <View style={styles.breakdownRow}><Text style={styles.breakdownLabel}>Markup Applied</Text><Text style={styles.breakdownValue}>{quote.markup_percent}%</Text></View>
                          <View style={styles.breakdownRow}><Text style={styles.breakdownLabel}>Tax</Text><Text style={styles.breakdownValue}>{quote.tax_percent}%</Text></View>

                          <View style={{flexDirection: 'row', marginTop: 15, gap: 10}}>
                              {quote.status !== 'Accepted & Converted' && (
                                  <TouchableOpacity style={[styles.completeBtn, {backgroundColor: '#4CAF50', flex: 1}]} onPress={() => handleConvertToJob(quote)}>
                                      <Text style={styles.completeBtnText}>✓ CONVERT</Text>
                                  </TouchableOpacity>
                              )}
                              <TouchableOpacity style={{ width: 50, backgroundColor: '#333', paddingVertical: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#555' }} onPress={() => openEditQuoteModal(quote)}>
                                  <Ionicons name="pencil" size={18} color="#FFF" />
                              </TouchableOpacity>
                              <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteQuote(quote.id)}>
                                  <Ionicons name="trash" size={18} color="#FFF" />
                              </TouchableOpacity>
                          </View>
                      </View>
                  ))}
              </>
          )}

          {/* JOBS VIEW */}
          {viewMode !== 'QUOTES' && (
              <>
                  {jobs.length === 0 && !refreshing && <Text style={styles.emptyText}>No {viewMode.toLowerCase()} records found.</Text>}
                  {jobs.map((job: any) => {
                      const stats = jobStats[job.id] || { fuel: 0, materials: 0, tools: 0, labour: 0, maintenance: 0, rentals: 0, permits: 0, insurance: 0, admin: 0, periodTotal: 0, lifetimeTotal: 0 };
                      const borderColor = job.is_business ? '#4CAF50' : '#9C27B0';
                      let spendLabel = timeFrame === 'MONTH' ? `${MONTHS[filterDate.getMonth()].toUpperCase()} SPEND` : timeFrame === '3_MONTHS' ? '90 DAY SPEND' : timeFrame === 'YEAR' ? 'YTD SPEND' : 'ALL-TIME SPEND';

                      return (
                          <View key={job.id} style={[styles.jobCard, {borderLeftWidth: 4, borderLeftColor: borderColor}]}>
                              <View style={styles.jobHeader}>
                                  <View style={{flexDirection: 'row', alignItems: 'center', flex: 1}}>
                                    <View style={{flex: 1}}>
                                        <Text style={[styles.jobTitle, viewMode === 'COMPLETED' && {color: '#888'}]} numberOfLines={1}>{job.is_business ? '💼' : '🏠'} {job.name}</Text>
                                        <Text style={{color: '#666', fontSize: 10, marginTop: 4, fontWeight: 'bold'}}>LIFETIME: ${stats.lifetimeTotal.toFixed(2)}</Text>
                                    </View>
                                    {job.name !== 'General Overhead' && (
                                        <TouchableOpacity onPress={() => openEditJobModal(job)} style={{marginLeft: 15, padding: 5}}>
                                            <Ionicons name="pencil-outline" size={20} color="#888" />
                                        </TouchableOpacity>
                                    )}
                                  </View>

                                  <View style={{alignItems: 'flex-end', marginLeft: 10}}>
                                    <Text style={{color: '#888', fontSize: 10, fontWeight: 'bold', marginBottom: 2}}>{spendLabel}</Text>
                                    <Text style={[styles.jobTotal, viewMode === 'COMPLETED' && {color: '#AAA'}]}>${stats.periodTotal.toFixed(2)}</Text>
                                  </View>
                              </View>

                              {job.address && <Text style={{color: '#888', fontSize: 12, marginBottom: 10}}>📍 {job.address} {job.default_distance ? `(${job.default_distance} dist)` : ''}</Text>}

                              <TouchableOpacity style={styles.vaultBtn} onPress={() => setVaultJob(job)}>
                                  <Text style={styles.vaultBtnText}>🗄️ OPEN PROJECT VAULT</Text>
                              </TouchableOpacity>
                              
                              <View style={styles.breakdownRow}><Text style={styles.breakdownLabel}>⛽ Fuel & Oil</Text><Text style={styles.breakdownValue}>${stats.fuel.toFixed(2)}</Text></View>
                              <View style={styles.breakdownRow}><Text style={styles.breakdownLabel}>🧱 Materials</Text><Text style={styles.breakdownValue}>${stats.materials.toFixed(2)}</Text></View>
                              <View style={styles.breakdownRow}><Text style={styles.breakdownLabel}>🧰 Tools</Text><Text style={styles.breakdownValue}>${stats.tools.toFixed(2)}</Text></View>
                              <View style={styles.breakdownRow}><Text style={styles.breakdownLabel}>⏱️ Labour</Text><Text style={styles.breakdownValue}>${stats.labour.toFixed(2)}</Text></View>
                              <View style={styles.breakdownRow}><Text style={styles.breakdownLabel}>🔧 Maintenance & Repairs</Text><Text style={styles.breakdownValue}>${stats.maintenance.toFixed(2)}</Text></View>
                              <View style={styles.breakdownRow}><Text style={styles.breakdownLabel}>🏗️ Rentals</Text><Text style={styles.breakdownValue}>${stats.rentals.toFixed(2)}</Text></View>
                              <View style={styles.breakdownRow}><Text style={styles.breakdownLabel}>📜 Permits</Text><Text style={styles.breakdownValue}>${stats.permits.toFixed(2)}</Text></View>
                              <View style={styles.breakdownRow}><Text style={styles.breakdownLabel}>🛡️ Insurance</Text><Text style={styles.breakdownValue}>${stats.insurance.toFixed(2)}</Text></View>
                              <View style={styles.breakdownRow}><Text style={styles.breakdownLabel}>💻 Admin & Parking</Text><Text style={styles.breakdownValue}>${stats.admin.toFixed(2)}</Text></View>

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
                              
                              {job.name !== 'General Overhead' && (
                                  <View style={{flexDirection: 'row', marginTop: 10, gap: 10}}>
                                     {viewMode === 'ACTIVE' && <TouchableOpacity style={styles.completeBtn} onPress={() => handleCompleteJob(job.id, job.name)}><Text style={styles.completeBtnText}>✓ FINISH</Text></TouchableOpacity>}
                                     <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteJob(job.id, job.name)}><Ionicons name="trash" size={18} color="#FFF" /></TouchableOpacity>
                                  </View>
                              )}
                          </View>
                      );
                  })}
              </>
          )}
      </ScrollView>

      {/* --- QUOTE MODAL --- */}
      <Modal visible={isQuoteModalVisible} animationType="fade" transparent>
          <View style={styles.modalBg}>
              <View style={[styles.modalContent, {height: '90%', paddingBottom: 40}]}>
                  <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}}>
                      <Text style={styles.modalTitle}>{editQuoteId ? 'Edit Quote' : 'Build Quote'}</Text>
                      <TouchableOpacity onPress={() => setIsQuoteModalVisible(false)}><Ionicons name="close" size={28} color="#FFF" /></TouchableOpacity>
                  </View>
                  
                  <ScrollView showsVerticalScrollIndicator={false}>
                      <Text style={styles.label}>Customer / Client Name</Text>
                      <TextInput style={[styles.input, {marginBottom: 15}]} value={qCustomer} onChangeText={setQCustomer} placeholder="e.g. John Smith" placeholderTextColor="#666" />
                      
                      <Text style={styles.label}>Job Description</Text>
                      <TextInput style={[styles.input, {marginBottom: 15}]} value={qDesc} onChangeText={setQDesc} placeholder="e.g. Master Bathroom Reno" placeholderTextColor="#666" />

                      <View style={{flexDirection: 'row', gap: 15, marginBottom: 15}}>
                          <View style={{flex: 1}}><Text style={styles.label}>Est. Labour ($)</Text><TextInput style={styles.input} value={qLabour} onChangeText={setQLabour} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#666" /></View>
                          <View style={{flex: 1}}><Text style={styles.label}>Est. Materials ($)</Text><TextInput style={styles.input} value={qMaterials} onChangeText={setQMaterials} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#666" /></View>
                      </View>

                      <View style={{flexDirection: 'row', gap: 15, marginBottom: 15}}>
                          <View style={{flex: 1}}><Text style={styles.label}>Markup (%)</Text><TextInput style={styles.input} value={qMarkup} onChangeText={setQMarkup} keyboardType="decimal-pad" placeholder="15" placeholderTextColor="#666" /></View>
                          <View style={{flex: 1}}><Text style={styles.label}>Tax (%)</Text><TextInput style={styles.input} value={qTax} onChangeText={setQTax} keyboardType="decimal-pad" placeholder="5" placeholderTextColor="#666" /></View>
                      </View>

                      <View style={styles.costPreview}>
                          <Text style={{color: '#888', fontWeight: 'bold'}}>ESTIMATED TOTAL TO CLIENT</Text>
                          <Text style={{color: '#2196F3', fontSize: 32, fontWeight: 'bold'}}>${calculateQuoteTotal()}</Text>
                      </View>

                      <TouchableOpacity onPress={handleSaveQuote} style={[styles.saveBtn, {backgroundColor: '#2196F3'}]} disabled={savingQuote}>
                          {savingQuote ? <ActivityIndicator color="#FFF" /> : <Text style={[styles.saveText, {color: '#FFF'}]}>{editQuoteId ? 'UPDATE QUOTE' : 'SAVE QUOTE'}</Text>}
                      </TouchableOpacity>
                  </ScrollView>
              </View>
          </View>
      </Modal>

      {/* --- VAULT MODAL --- */}
      <Modal visible={!!vaultJob} animationType="slide" transparent>
          <View style={styles.modalBg}>
              <View style={styles.modalContent}>
                  <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}}>
                      <Text style={styles.modalTitle}>{vaultJob?.is_business ? '💼' : '🏠'} {vaultJob?.name} Vault</Text>
                      <TouchableOpacity onPress={() => setVaultJob(null)}><Ionicons name="close" size={28} color="#FFF" /></TouchableOpacity>
                  </View>

                  <ScrollView style={{backgroundColor:'#121212', borderRadius:10, padding:10}}>
                      {allLogs.filter(l => l.job_id === vaultJob?.id).length === 0 ? <Text style={{color:'#666', textAlign:'center', marginTop:20}}>No records found.</Text> : null}
                      {allLogs.filter(l => l.job_id === vaultJob?.id).map((log, index) => {
                          const cat = log.expense_category || log.log_type;
                          let icon = '📄';
                          if (cat === 'FUEL') icon = '⛽';
                          else if (cat === 'MAINTENANCE') icon = '🔧';
                          else if (cat === 'MATERIALS') icon = '🧱';
                          else if (cat === 'LABOUR') icon = '⏱️';
                          else if (cat === 'PERMITS') icon = '📜';
                          else if (cat === 'RENTALS') icon = '🏗️';
                          else if (cat === 'INSURANCE') icon = '🛡️';
                          else if (cat === 'TOOLS') icon = '🧰';
                          else if (cat === 'ADMIN' || cat === 'PARKING') icon = '💻';

                          return (
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
                                          {icon} {cat.charAt(0) + cat.slice(1).toLowerCase()}
                                      </Text>
                                  </View>
                                  <View style={{alignItems:'flex-end'}}>
                                      <Text style={styles.logCost}>${log.cost.toFixed(2)}</Text>
                                      {cat === 'FUEL' && log.liters && <Text style={styles.logOdo}>{(log.cost / log.liters).toFixed(3)}/Vol</Text>}
                                      {cat === 'LABOUR' && log.hours && <Text style={styles.logOdo}>{log.hours} hrs @ ${log.hourly_rate}</Text>}
                                  </View>
                              </TouchableOpacity>
                          );
                      })}
                  </ScrollView>
              </View>
          </View>
      </Modal>

      {/* --- LABOUR MODAL --- */}
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

      {/* --- ADD/EDIT JOB MODALS --- */}
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
                  <TextInput style={[styles.input, {marginBottom: 10}]} value={newJobName} onChangeText={setNewJobName} placeholder={newJobIsBiz ? "e.g. Smith Reno" : "e.g. Oregon Roadtrip"} placeholderTextColor="#666" autoFocus />
                  
                  <Text style={styles.label}>Address (Optional)</Text>
                  <TextInput style={[styles.input, {marginBottom: 10}]} value={newJobAddress} onChangeText={setNewJobAddress} placeholder="e.g. 123 Main St" placeholderTextColor="#666" />

                  <Text style={styles.label}>Default Trip Distance (Optional)</Text>
                  <TextInput style={[styles.input, {marginBottom: 20}]} value={newJobDistance} onChangeText={setNewJobDistance} placeholder="e.g. 15" keyboardType="number-pad" placeholderTextColor="#666" />

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
                  <TextInput style={[styles.input, {marginBottom: 10}]} value={editJobName} onChangeText={setEditJobName} placeholderTextColor="#666" />

                  <Text style={styles.label}>Address (Optional)</Text>
                  <TextInput style={[styles.input, {marginBottom: 10}]} value={editJobAddress} onChangeText={setEditJobAddress} placeholderTextColor="#666" />

                  <Text style={styles.label}>Default Trip Distance (Optional)</Text>
                  <TextInput style={[styles.input, {marginBottom: 20}]} value={editJobDistance} onChangeText={setEditJobDistance} keyboardType="number-pad" placeholderTextColor="#666" />

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
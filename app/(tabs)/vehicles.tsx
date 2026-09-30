import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Linking, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Purchases from 'react-native-purchases';
import { supabase } from '../../supabase';

export default function FleetAndSettingsScreen() {
  const router = useRouter();
  const [mainTab, setMainTab] = useState<'FLEET' | 'PREFS'>('FLEET');

  // FLEET STATES
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCar, setSelectedCar] = useState<any>(null); 
  const [isEditing, setIsEditing] = useState(false); 
  const [logFilter, setLogFilter] = useState<'ALL' | 'SERVICE'>('ALL'); 
  
  const [formName, setFormName] = useState('');
  const [formMake, setFormMake] = useState('');
  const [formModel, setFormModel] = useState('');
  const [formYear, setFormYear] = useState('');
  const [formOdo, setFormOdo] = useState('');
  const [formLastService, setFormLastService] = useState('');
  const [formInterval, setFormInterval] = useState(''); 
  const [formSpecs, setFormSpecs] = useState(''); 
  const [formDistanceUnit, setFormDistanceUnit] = useState<'km' | 'mi'>('km');
  const [formEconomyDisplay, setFormEconomyDisplay] = useState<'L/100km' | 'MPG'>('L/100km');
  const [formIsEquipment, setFormIsEquipment] = useState(false);
  const [carLogs, setCarLogs] = useState<any[]>([]);

  // PREFS / SETTINGS STATES
  const [tax1Rate, setTax1Rate] = useState('5');
  const [tax2Rate, setTax2Rate] = useState('12');
  const [defaultRegion, setDefaultRegion] = useState<'CA' | 'US'>('CA');
  
  // Smart Locations State
  const [savedLocations, setSavedLocations] = useState<any[]>([]); 
  const [locFormName, setLocFormName] = useState('');
  const [locFormAddress, setLocFormAddress] = useState('');
  const [locFormDistance, setLocFormDistance] = useState('');

  const loadSettings = async () => {
      try {
          const t1 = await AsyncStorage.getItem('tax1Rate');
          const t2 = await AsyncStorage.getItem('tax2Rate');
          const reg = await AsyncStorage.getItem('defaultRegion');
          
          if (t1) setTax1Rate(t1);
          if (t2) setTax2Rate(t2);
          if (reg) setDefaultRegion(reg as 'CA' | 'US');

          // Fetch Quick Locations from Cloud (Synced with Trips tab)
          const { data: locs, error } = await supabase.from('quick_locations').select('*').order('created_at', { ascending: true });
          if (locs) setSavedLocations(locs);

      } catch (e) { console.log("Failed to load settings", e); }
  };

  const savePreferences = async () => {
      try {
          await AsyncStorage.setItem('tax1Rate', tax1Rate);
          await AsyncStorage.setItem('tax2Rate', tax2Rate);
          await AsyncStorage.setItem('defaultRegion', defaultRegion);
          Alert.alert("Saved", "Preferences updated and synced to your Scanner & Trips.");
      } catch (e) {
          Alert.alert("Error", "Failed to save preferences.");
      }
  };

  const handleAddLocation = async () => {
      if (!locFormName) return Alert.alert("Missing Info", "Please enter a location name.");
      
      const { data: { user } } = await supabase.auth.getUser();

      const newLoc = {
          user_id: user?.id,
          name: locFormName.trim(),
          address: locFormAddress.trim(),
          distance: locFormDistance ? parseFloat(locFormDistance) : 0
      };

      const { data, error } = await supabase.from('quick_locations').insert([newLoc]).select();
      
      if (error) {
          Alert.alert("Error", error.message);
          return;
      }

      if (data && data.length > 0) {
          setSavedLocations([...savedLocations, data[0]]);
      }
      
      setLocFormName(''); setLocFormAddress(''); setLocFormDistance('');
      Alert.alert("Success", `Added "${newLoc.name}" to quick locations.`);
  };

  const handleDeleteLocation = async (id: string | number) => {
      const { error } = await supabase.from('quick_locations').delete().eq('id', id);
      if (error) {
          Alert.alert("Error", error.message);
          return;
      }
      setSavedLocations(savedLocations.filter(loc => loc.id !== id));
  };

  // --- AUTH ACTIONS (LOGOUT & DELETE) ---
  const handleLogout = async () => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Log Out", 
        style: "destructive", 
        onPress: async () => {
          await supabase.auth.signOut();
          const onboardingState = await AsyncStorage.getItem('hasSeenOnboarding');
          await AsyncStorage.clear();
          if (onboardingState) {
            await AsyncStorage.setItem('hasSeenOnboarding', onboardingState);
          }
          router.replace('/login');
        } 
      }
    ]);
  };

  const handleDeleteAccount = async () => {
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account, saved vehicles, receipts, and trip logs. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "DELETE EVERYTHING", 
          style: "destructive", 
          onPress: async () => {
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                await supabase.from('vehicle_logs').delete().eq('user_id', user.id);
                await supabase.from('trips').delete().eq('user_id', user.id);
                await supabase.from('vehicles').delete().eq('user_id', user.id);
                await supabase.from('jobs').delete().eq('user_id', user.id);
                await supabase.from('quick_locations').delete().eq('user_id', user.id);
              }
              await supabase.auth.signOut();
              await AsyncStorage.clear();
              Alert.alert("Account Deleted", "Your account and data have been removed.");
              router.replace('/login');
            } catch (e: any) {
              Alert.alert("Error", e.message);
            }
          } 
        }
      ]
    );
  };

  // FLEET LOGIC
  const fetchGarage = async () => {
    setRefreshing(true);

    // 1. Session Guard (Prevents ghost data bug)
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (!user || authErr) {
        await supabase.auth.signOut();
        router.replace('/login');
        return;
    }

    const { data: vData } = await supabase.from('vehicles').select('*').order('is_default', {ascending: false});
    const { data: lData } = await supabase.from('vehicle_logs').select('*');

    if (vData) {
        const enriched = vData.map(car => {
            const cLogs = lData ? lData.filter(l => l.vehicle_id === car.id) : [];
            const cTrips = cLogs.filter(l => l.log_type === 'TRIP');
            const fuelLogs = cLogs.filter(l => (l.expense_category || l.log_type) === 'FUEL');
            
            // 1. Establish Start and Current Odometer
            const startOdo = car.odometer || 0;
            const maxLogOdo = cLogs.length > 0 ? Math.max(...cLogs.map(l => l.odometer || 0)) : 0;
            const currentOdo = Math.max(startOdo, maxLogOdo);
            
            // 2. Total Distance Driven (Delta)
            const totalDistanceDriven = Math.max(0, currentOdo - startOdo);

            // 3. Business Use (Explicitly Logged)
            const bizDist = cTrips.filter(t => t.is_business).reduce((sum, t) => sum + (t.distance || 0), 0);
            
            // 4. Personal Use (Everything Else)
            const persDist = Math.max(0, totalDistanceDriven - bizDist);
            
            // 5. Calculate Final Percentages
            const effectiveTotal = bizDist + persDist;
            const bizPercent = effectiveTotal > 0 ? Math.round((bizDist / effectiveTotal) * 100) : 0;
            const persPercent = effectiveTotal > 0 ? 100 - bizPercent : 0;
            
            // 6. Fuel Economy Calculation
            let fuelEcon = 'N/A';
            const distanceDriven = currentOdo - startOdo;
            if (distanceDriven > 0 && fuelLogs.length > 0 && !car.is_equipment) {
                const totalLiters = fuelLogs.reduce((sum, l) => sum + (l.liters || 0), 0);
                if (totalLiters > 0) {
                    if (car.economy_display === 'MPG') {
                        const miles = car.distance_unit === 'km' ? distanceDriven * 0.621371 : distanceDriven;
                        const gallons = totalLiters * 0.264172;
                        fuelEcon = (miles / gallons).toFixed(1) + ' MPG';
                    } else {
                        const km = car.distance_unit === 'mi' ? distanceDriven * 1.60934 : distanceDriven;
                        fuelEcon = ((totalLiters / km) * 100).toFixed(1) + ' L/100km';
                    }
                }
            } else if (car.is_equipment) {
                fuelEcon = 'Tracked by Hrs';
            }

            return { ...car, totalSpent: 0, bizPercent, persPercent, currentOdo, fuelEcon, service_interval: car.service_interval || 10000 };
        });
        setVehicles(enriched);
        
        if (selectedCar) {
            const updatedCarLogs = lData ? lData.filter(l => l.vehicle_id === selectedCar.id).sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) : [];
            setCarLogs(updatedCarLogs);
        }
    }
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => { 
      fetchGarage(); 
      loadSettings();
    }, [])
  );

  const handleSaveVehicle = async () => {
      if (!formName) return Alert.alert("Missing Info", "Please enter a nickname.");
      
      const { data: { user } } = await supabase.auth.getUser(); 
      
      const payload = {
          name: formName, make: formMake, model: formModel,
          year: parseInt(formYear) || new Date().getFullYear(),
          odometer: parseInt(formOdo) || 0,
          last_service_odo: parseInt(formLastService) || null,
          service_interval: parseInt(formInterval) || (formIsEquipment ? 250 : 10000),
          specs: formSpecs,
          distance_unit: formIsEquipment ? 'hrs' : formDistanceUnit,
          economy_display: formIsEquipment ? 'N/A' : formEconomyDisplay,
          is_equipment: formIsEquipment,
          user_id: user?.id 
      };

      if (selectedCar && isEditing) {
          const { error } = await supabase.from('vehicles').update(payload).eq('id', selectedCar.id);
          if (error) Alert.alert("Error", error.message);
      } else {
          const isFirst = vehicles.length === 0;
          const { error } = await supabase.from('vehicles').insert({...payload, is_default: isFirst && !formIsEquipment});
          if (error) Alert.alert("Error", error.message);
      }
      
      setIsEditing(false); setSelectedCar(null); fetchGarage();
  };

  const handleSetDefault = async (car: any) => {
      await supabase.from('vehicles').update({ is_default: false }).neq('id', 0);
      await supabase.from('vehicles').update({ is_default: true }).eq('id', car.id);
      setSelectedCar(null); fetchGarage();
  };

  const handleDelete = async (id: number) => {
      Alert.alert("Delete Fleet Item?", "This will permanently delete this vehicle and ALL of its logs.", [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: 'destructive', onPress: async () => {
              await supabase.from('vehicle_logs').delete().eq('vehicle_id', id);
              await supabase.from('trips').delete().eq('vehicle_id', id);
              
              const { error } = await supabase.from('vehicles').delete().eq('id', id);
              
              if (error) {
                  Alert.alert("Error", error.message);
              } else {
                  setIsEditing(false); 
                  setSelectedCar(null); 
                  fetchGarage();
              }
          }}
      ]);
  };

  const handleResetService = (car: any) => {
      Alert.alert(
          "Log Service",
          "Do you want to scan a receipt for this service, or just reset the maintenance countdown?",
          [
              { text: "Cancel", style: "cancel" },
              { text: "Just Reset Tracker", onPress: async () => {
                  const { error } = await supabase.from('vehicles').update({ last_service_odo: car.currentOdo }).eq('id', car.id);
                  if (error) Alert.alert("Error", error.message);
                  else {
                      Alert.alert("Success", "Maintenance countdown reset.");
                      fetchGarage();
                      if (selectedCar) setSelectedCar({...selectedCar, last_service_odo: car.currentOdo});
                  }
              }},
              { text: "Scan Receipt & Log", onPress: () => {
                  setSelectedCar(null); 
                  router.navigate({ 
                      pathname: '/(tabs)', 
                      params: { prefillVehicle: car.id.toString(), logType: 'MAINTENANCE' } 
                  });
              }}
          ]
      );
  };

  const openDetails = async (car: any) => {
      setSelectedCar(car); setIsEditing(false); setLogFilter('ALL');
      const { data } = await supabase.from('vehicle_logs').select('*').eq('vehicle_id', car.id).order('created_at', { ascending: false });
      setCarLogs(data || []);
  };

  const triggerExport = () => {
      const currentMonth = new Date().toLocaleString('default', { month: 'long' });
      Alert.alert(
          "Select Export Range",
          "Export logs for this month only, or the entire vehicle history?",
          [
              { text: "Cancel", style: "cancel" },
              { text: `This Month (${currentMonth})`, onPress: () => exportToCSV('month') },
              { text: "All-Time", onPress: () => exportToCSV('all') }
          ]
      );
  };

  const exportToCSV = async (range: 'month' | 'all') => {
      let logsToExport = logFilter === 'SERVICE' ? carLogs.filter(l => (l.expense_category || l.log_type) === 'MAINTENANCE') : carLogs;
      
      if (range === 'month') {
          const now = new Date();
          logsToExport = logsToExport.filter(l => {
              const logDate = new Date(l.created_at);
              return logDate.getMonth() === now.getMonth() && logDate.getFullYear() === now.getFullYear();
          });
      }

      if (logsToExport.length === 0) return Alert.alert("Empty", `No logs to export for this ${range}.`);

      let csv = `Fleet Item Name,${selectedCar.name}\nMake/Model,${selectedCar.year} ${selectedCar.make} ${selectedCar.model}\nSpecs,"${(selectedCar.specs || 'N/A').replace(/"/g, '""')}"\nRange,${range === 'all' ? 'All-Time' : 'Current Month'}\n\n`; 
      csv += 'Date,Category,Project,Cost,GST Paid,Currency,Volume,Meter,Location,Vendor,Notes,Receipt Photo\n';
      
      logsToExport.forEach(l => {
          const date = new Date(l.created_at).toISOString().split('T')[0];
          let cat = l.expense_category || l.log_type || 'General';
          if (cat === 'MAINTENANCE') cat = 'Vehicle Repairs & Maintenance';
          if (cat === 'MATERIALS') cat = 'Materials & Supplies';
          if (cat === 'FUEL') cat = 'Fuel & Oil';

          const job = (l.job_name || 'General Overhead').replace(/,/g, ' ');
          const cost = l.cost ? l.cost.toFixed(2) : '0.00';
          const gst = l.gst_amount ? l.gst_amount.toFixed(2) : '0.00';
          const currency = l.currency || 'CAD';
          const volume = l.liters ? l.liters.toFixed(2) : '0';
          const odo = l.odometer || '0';
          const loc = (l.end_loc || '').replace(/,/g, ' ');
          const vendor = (l.vendor || '').replace(/,/g, ' ');
          const cleanNotes = (l.notes || '').replace(/,/g, ' '); 
          const receipt = l.receipt_url || 'N/A';

          csv += `${date},${cat},${job},${cost},${gst},${currency},${volume},${odo},${loc},${vendor},${cleanNotes},${receipt}\n`;
      });

      const fileName = `${selectedCar.name.replace(/\s/g, '_')}_${logFilter}_Report_${range}.csv`;
      const fileUri = FileSystem.documentDirectory + fileName;
      
      await FileSystem.writeAsStringAsync(fileUri, csv); 
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(fileUri);
      else Alert.alert("Error", "Sharing is not available on this device");
  };

  const openAddModal = () => {
      setFormName(''); setFormMake(''); setFormModel(''); setFormYear(''); 
      setFormOdo(''); setFormLastService(''); setFormInterval('10000'); setFormSpecs('');
      setFormDistanceUnit('km'); setFormEconomyDisplay('L/100km'); setFormIsEquipment(false);
      setSelectedCar(null); setIsEditing(true);
  };

  const openEditModal = (car: any) => {
      setFormName(car.name); setFormMake(car.make || ''); setFormModel(car.model || ''); 
      setFormYear(car.year?.toString() || ''); 
      setFormOdo(car.currentOdo?.toString() || car.odometer?.toString() || '');
      setFormLastService(car.last_service_odo?.toString() || '');
      setFormInterval(car.service_interval?.toString() || (car.is_equipment ? '250' : '10000'));
      setFormSpecs(car.specs || '');
      setFormDistanceUnit(car.distance_unit || 'km');
      setFormEconomyDisplay(car.economy_display || 'L/100km');
      setFormIsEquipment(car.is_equipment || false);
      setSelectedCar(car); setIsEditing(true);
  };

  const renderCar = ({ item }: any) => {
    const kmSinceService = item.last_service_odo ? (item.currentOdo - item.last_service_odo) : 0;
    const untilDue = item.service_interval - kmSinceService;
    const isOverdue = untilDue <= 0;
    const distUnit = item.is_equipment ? 'hrs' : (item.distance_unit || 'km');

    return (
        <TouchableOpacity onPress={() => openDetails(item)}>
            <View style={[styles.card, item.is_default && {borderColor: '#4CAF50', borderWidth: 1}]}>
                <View style={styles.row}>
                    <Text style={styles.icon}>{item.is_equipment ? '🚜' : '🚙'}</Text>
                    <View style={{flex: 1}}>
                        <View style={{flexDirection: 'row', alignItems: 'center'}}>
                            <Text style={styles.name}>{item.name}</Text>
                            {item.is_default && <Text style={{marginLeft: 10, fontSize: 10, color: '#4CAF50', fontWeight: 'bold'}}>DEFAULT</Text>}
                        </View>
                        <Text style={styles.model}>{item.year} {item.make} {item.model}</Text>
                    </View>
                    <TouchableOpacity onPress={() => openEditModal(item)} style={{padding:10}}>
                        <Ionicons name="create-outline" size={20} color="#666" />
                    </TouchableOpacity>
                </View>

                {!item.is_equipment && (
                    <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, marginBottom: 5}}>
                        <Text style={{color: '#4CAF50', fontSize: 11, fontWeight: 'bold'}}>💼 {item.bizPercent}% Business</Text>
                        <Text style={{color: '#9C27B0', fontSize: 11, fontWeight: 'bold'}}>🏠 {item.persPercent}% Personal</Text>
                    </View>
                )}

                <View style={styles.statRow}>
                    <View style={styles.stat}>
                        <Text style={styles.statLabel}>{item.is_equipment ? 'MACHINE HOURS' : 'ODOMETER'}</Text>
                        <Text style={styles.statValue}>{item.currentOdo.toLocaleString()} {distUnit}</Text>
                    </View>
                    <View style={[styles.stat, {alignItems: 'flex-end', flex: 1.2}]}>
                        <Text style={styles.statLabel}>SERVICE STATUS</Text>
                        {item.last_service_odo ? (
                            <>
                                <Text style={[styles.statValue, {fontSize: 12}]}>Done {kmSinceService.toLocaleString()} {distUnit} ago</Text>
                                <Text style={[styles.statValue, isOverdue ? {color: '#F44336', fontWeight:'bold'} : {color: '#4CAF50', fontWeight:'bold'}]}>
                                    {isOverdue ? `⚠️ Overdue by ${Math.abs(untilDue).toLocaleString()}` : `Due in ${Math.max(0, untilDue).toLocaleString()}`} {distUnit}
                                </Text>
                            </>
                        ) : (
                            <Text style={styles.statValue}>Unknown</Text>
                        )}
                    </View>
                </View>
            </View>
        </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
          <Text style={styles.header}>FLEET & PREFS</Text>
          {mainTab === 'FLEET' && (
             <TouchableOpacity onPress={openAddModal}><Text style={{color:'#FF9800', fontWeight:'bold', fontSize: 16}}>+ ADD</Text></TouchableOpacity>
          )}
      </View>

      <View style={[styles.toggleContainer, {marginBottom: 20}]}>
          <TouchableOpacity style={[styles.toggleBtn, mainTab === 'FLEET' && styles.toggleActive]} onPress={() => setMainTab('FLEET')}>
              <Text style={[styles.toggleText, mainTab === 'FLEET' && {color: '#000'}]}>🚜 FLEET</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.toggleBtn, mainTab === 'PREFS' && styles.toggleActive]} onPress={() => setMainTab('PREFS')}>
              <Text style={[styles.toggleText, mainTab === 'PREFS' && {color: '#000'}]}>⚙️ SETTINGS</Text>
          </TouchableOpacity>
      </View>

      {mainTab === 'FLEET' && (
          <FlatList 
            data={vehicles} 
            renderItem={renderCar} 
            keyExtractor={item => item.id.toString()}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchGarage} tintColor="#FF9800"/>}
            ListEmptyComponent={<Text style={{color: '#666', textAlign: 'center', marginTop: 40}}>No items in your fleet yet.</Text>}
          />
      )}

      {mainTab === 'PREFS' && (
          <ScrollView>
              <Text style={styles.sectionHeader}>GLOBAL DEFAULTS (SCANNER & TRIPS)</Text>
              <View style={styles.card}>
                 <Text style={styles.label}>Default Country & Currency</Text>
                 <View style={[styles.toggleContainer, {marginBottom: 15}]}>
                      <TouchableOpacity style={[styles.toggleBtn, defaultRegion === 'CA' && styles.toggleActive]} onPress={() => setDefaultRegion('CA')}>
                          <Text style={[styles.toggleText, defaultRegion === 'CA' && {color: '#000'}]}>🇨🇦 CAN (CAD)</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.toggleBtn, defaultRegion === 'US' && styles.toggleActive]} onPress={() => setDefaultRegion('US')}>
                          <Text style={[styles.toggleText, defaultRegion === 'US' && {color: '#000'}]}>🇺🇸 USA (USD)</Text>
                      </TouchableOpacity>
                  </View>

                 <Text style={styles.label}>Quick-Select Trip Locations</Text>
                 <View style={{flexDirection: 'row', gap: 10, marginBottom: 10}}>
                     <TextInput style={[styles.input, {flex: 1}]} value={locFormName} onChangeText={setLocFormName} placeholder="Name (e.g. Home Depot)" placeholderTextColor="#666"/>
                 </View>
                 <View style={{flexDirection: 'row', gap: 10, marginBottom: 15}}>
                     <TextInput style={[styles.input, {flex: 2}]} value={locFormAddress} onChangeText={setLocFormAddress} placeholder="Address (Optional)" placeholderTextColor="#666"/>
                     <TextInput style={[styles.input, {flex: 1}]} value={locFormDistance} onChangeText={setLocFormDistance} placeholder="Dist. (Opt)" keyboardType="number-pad" placeholderTextColor="#666"/>
                 </View>
                 <TouchableOpacity style={[styles.actionBtn, {marginBottom: 15}]} onPress={handleAddLocation}>
                     <Text style={{color: '#000', fontWeight: 'bold'}}>+ ADD SMART LOCATION</Text>
                 </TouchableOpacity>

                 {savedLocations.length > 0 && (
                     <View style={{borderTopWidth: 1, borderTopColor: '#333', paddingTop: 15}}>
                         {savedLocations.map(loc => (
                             <View key={loc.id} style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#121212', padding: 10, borderRadius: 8, marginBottom: 8}}>
                                 <View>
                                     <Text style={{color: '#FFF', fontWeight: 'bold'}}>{loc.name}</Text>
                                     {loc.address ? <Text style={{color: '#888', fontSize: 10}}>{loc.address}</Text> : null}
                                 </View>
                                 <View style={{flexDirection: 'row', alignItems: 'center', gap: 15}}>
                                     {loc.distance > 0 && <Text style={{color: '#FF9800', fontWeight: 'bold'}}>{loc.distance}</Text>}
                                     <TouchableOpacity onPress={() => handleDeleteLocation(loc.id)}>
                                         <Ionicons name="trash" size={18} color="#D32F2F" />
                                     </TouchableOpacity>
                                 </View>
                             </View>
                         ))}
                     </View>
                 )}
              </View>

              <Text style={styles.sectionHeader}>TAX RATE CALCULATOR</Text>
              <View style={styles.card}>
                 <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15}}>
                     <View style={{flex: 1, marginRight: 10}}>
                        <Text style={styles.label}>Tax 1 Rate (%)</Text>
                        <TextInput style={styles.input} value={tax1Rate} onChangeText={setTax1Rate} keyboardType="decimal-pad" placeholder="e.g. 5" placeholderTextColor="#666"/>
                     </View>
                     <View style={{flex: 1}}>
                        <Text style={styles.label}>Tax 2 Rate (%)</Text>
                        <TextInput style={styles.input} value={tax2Rate} onChangeText={setTax2Rate} keyboardType="decimal-pad" placeholder="e.g. 12" placeholderTextColor="#666"/>
                     </View>
                 </View>
              </View>

              <TouchableOpacity onPress={savePreferences} style={[styles.saveBtn, {marginBottom: 30}]}>
                 <Text style={styles.saveText}>SAVE PREFERENCES</Text>
              </TouchableOpacity>

              <Text style={[styles.sectionHeader, {marginTop: 10}]}>ACCOUNT & SUBSCRIPTION</Text>
              <View style={styles.card}>
                 <TouchableOpacity 
                   style={[styles.actionBtn, {backgroundColor: '#2196F3', width: '100%', marginBottom: 10}]} 
                   onPress={() => Linking.openURL('mailto:operatorsprotocol@gmail.com?subject=Operators%20Protocol%20Support')}
                 >
                     <Text style={{color: '#FFF', fontWeight: 'bold'}}>✉️ CONTACT SUPPORT</Text>
                 </TouchableOpacity>
                 <TouchableOpacity 
                   onPress={async () => {
                     try {
                       await Purchases.showManageSubscriptions();
                     } catch (e) {
                       Alert.alert("Notice", "You can manage your subscription directly in your phone's App Store or Google Play settings.");
                     }
                   }} 
                   style={[styles.actionBtn, {marginBottom: 10, width: '100%'}]}
                 >
                     <Text style={{color: '#FFF', fontWeight: 'bold'}}>MANAGE SUBSCRIPTION</Text>
                 </TouchableOpacity>
                 <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#333', width: '100%', marginBottom: 10}]} onPress={handleLogout}>
                     <Text style={{color: '#FFF', fontWeight: 'bold'}}>LOG OUT</Text>
                 </TouchableOpacity>
                 <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#8B0000', width: '100%'}]} onPress={handleDeleteAccount}>
                     <Text style={{color: '#FFF', fontWeight: 'bold'}}>DELETE ACCOUNT</Text>
                 </TouchableOpacity>
              </View>
          </ScrollView>
      )}

      {/* --- MODALS --- */}
      <Modal visible={!!selectedCar && !isEditing} animationType="slide" transparent>
          <View style={styles.modalBg}>
              <View style={styles.modalContent}>
                  <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>{selectedCar?.is_equipment ? '🚜' : '🚙'} {selectedCar?.name} Vault</Text>
                      <TouchableOpacity onPress={() => setSelectedCar(null)}><Ionicons name="close" size={28} color="#FFF" /></TouchableOpacity>
                  </View>

                  {selectedCar?.specs ? (
                      <View style={styles.specsVault}>
                          <Text style={{color: '#888', fontSize: 10, fontWeight: 'bold', marginBottom: 5}}>GLOVEBOX SPECS & PARTS</Text>
                          <Text style={{color: '#FFF', fontSize: 14}}>{selectedCar.specs}</Text>
                      </View>
                  ) : null}
                  
                  {!selectedCar?.is_default && !selectedCar?.is_equipment && (
                      <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#2196F3', width: '100%', marginBottom: 15}]} onPress={() => handleSetDefault(selectedCar)}>
                          <Text style={{color: '#FFF', fontWeight: 'bold', fontSize: 12}}>⭐ SET AS DEFAULT FLEET VEHICLE</Text>
                      </TouchableOpacity>
                  )}

                  <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom: 15}}>
                      <TouchableOpacity style={[styles.actionBtn, {backgroundColor:'#333', width: '48%'}]} onPress={() => handleResetService(selectedCar)}>
                          <Text style={{color:'#FFF', fontWeight:'bold', fontSize:12}}>🛠️️ LOG SERVICE</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.actionBtn, {width: '48%'}]} onPress={triggerExport}>
                          <Text style={{color:'#000', fontWeight:'bold', fontSize:12}}>📤 EXPORT {logFilter}</Text>
                      </TouchableOpacity>
                  </View>

                  <View style={styles.toggleContainer}>
                      <TouchableOpacity style={[styles.toggleBtn, logFilter === 'ALL' && styles.toggleActive]} onPress={() => setLogFilter('ALL')}>
                          <Text style={[styles.toggleText, logFilter === 'ALL' && {color: '#000'}]}>ALL LOGS</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.toggleBtn, logFilter === 'SERVICE' && styles.toggleActive]} onPress={() => setLogFilter('SERVICE')}>
                          <Text style={[styles.toggleText, logFilter === 'SERVICE' && {color: '#000'}]}>SERVICE ONLY</Text>
                      </TouchableOpacity>
                  </View>

                  <ScrollView style={{backgroundColor:'#121212', borderRadius:10, padding:10}}>
                      {carLogs.filter(l => logFilter === 'ALL' || (l.expense_category || l.log_type) === 'MAINTENANCE').length === 0 ? <Text style={{color:'#666', textAlign:'center', marginTop:20}}>No records found.</Text> : null}
                      {carLogs.filter(l => logFilter === 'ALL' || (l.expense_category || l.log_type) === 'MAINTENANCE').map((log, index) => {
                          const cat = log.expense_category || log.log_type || 'General';
                          let icon = '📄';
                          let displayLabel = cat;
                          
                          if (cat === 'FUEL') { icon = '⛽'; displayLabel = 'Fuel'; }
                          else if (cat === 'MAINTENANCE') { icon = '🔧'; displayLabel = log.notes || 'Repair'; }
                          else if (cat === 'INSURANCE') { icon = '🛡️'; displayLabel = 'Insurance'; }
                          else if (cat === 'TOOLS') { icon = '🧰'; displayLabel = 'Tools'; }
                          else if (cat === 'ADMIN') { icon = '💻'; displayLabel = 'Admin'; }
                          else if (cat === 'LABOUR') { icon = '⏱️'; displayLabel = 'Labour'; }
                          else if (cat === 'MATERIALS') { icon = '🧱'; displayLabel = 'Materials'; }
                          else if (cat === 'PERMITS') { icon = '📜'; displayLabel = 'Permits'; }
                          else if (cat === 'RENTALS') { icon = '🏗️'; displayLabel = 'Rentals'; }

                          return (
                              <View key={index} style={styles.logRow}>
                                  <View>
                                      <Text style={styles.logDate}>{new Date(log.created_at).toLocaleDateString()}</Text>
                                      <Text style={styles.logType}>{icon} {displayLabel}</Text>
                                  </View>
                                  <View style={{alignItems:'flex-end'}}>
                                      <Text style={styles.logCost}>${log.cost.toFixed(2)}</Text>
                                      <Text style={styles.logOdo}>{log.odometer} {selectedCar?.is_equipment ? 'hrs' : (selectedCar?.distance_unit || 'km')}</Text>
                                  </View>
                              </View>
                          );
                      })}
                  </ScrollView>
              </View>
          </View>
      </Modal>

      <Modal visible={isEditing} animationType="fade" transparent>
          <View style={styles.modalBg}>
              <View style={[styles.modalContent, {height:'auto', paddingBottom: 30, paddingTop: 40}]}>
                  <Text style={styles.modalTitle}>{selectedCar ? "EDIT ENTRY" : "NEW ENTRY"}</Text>
                  
                  <View style={[styles.toggleContainer, {marginBottom: 20}]}>
                      <TouchableOpacity style={[styles.toggleBtn, !formIsEquipment && styles.toggleActive]} onPress={() => setFormIsEquipment(false)}>
                          <Text style={[styles.toggleText, !formIsEquipment && {color: '#000'}]}>🚗 ROAD VEHICLE</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.toggleBtn, formIsEquipment && styles.toggleActive]} onPress={() => setFormIsEquipment(true)}>
                          <Text style={[styles.toggleText, formIsEquipment && {color: '#000'}]}>🚜 HEAVY EQUIPMENT</Text>
                      </TouchableOpacity>
                  </View>

                  <Text style={styles.label}>Nickname / Alias</Text>
                  <TextInput style={styles.input} value={formName} onChangeText={setFormName} placeholder={formIsEquipment ? "e.g. Yard Skid Steer" : "e.g. Work Truck"} placeholderTextColor="#666"/>
                  
                  <View style={{flexDirection:'row', justifyContent:'space-between', marginTop: 10}}>
                      <View style={{width:'48%'}}><Text style={styles.label}>Make</Text><TextInput style={styles.input} value={formMake} onChangeText={setFormMake} placeholder={formIsEquipment ? "CAT" : "Jeep"} placeholderTextColor="#666"/></View>
                      <View style={{width:'48%'}}><Text style={styles.label}>Model</Text><TextInput style={styles.input} value={formModel} onChangeText={setFormModel} placeholder={formIsEquipment ? "259D3" : "Grand Cherokee"} placeholderTextColor="#666"/></View>
                  </View>

                  <View style={{flexDirection:'row', justifyContent:'space-between', marginTop: 10}}>
                      <View style={{width:'48%'}}><Text style={styles.label}>Year</Text><TextInput style={styles.input} value={formYear} onChangeText={setFormYear} placeholder="2018" keyboardType="number-pad" placeholderTextColor="#666"/></View>
                      <View style={{width:'48%'}}>
                          <Text style={styles.label}>{formIsEquipment ? 'Base Hours' : 'Base Odometer'}</Text>
                          <TextInput style={styles.input} value={formOdo} onChangeText={setFormOdo} placeholder={formIsEquipment ? "2500" : "100000"} keyboardType="number-pad" placeholderTextColor="#666"/>
                      </View>
                  </View>

                  <View style={{flexDirection:'row', justifyContent:'space-between', marginTop: 10}}>
                      <View style={{width:'48%'}}>
                          <Text style={styles.label}>{formIsEquipment ? 'Last Service Hours' : 'Last Service Odo'}</Text>
                          <TextInput style={styles.input} value={formLastService} onChangeText={setFormLastService} placeholder={formIsEquipment ? "2450" : "95000"} keyboardType="number-pad" placeholderTextColor="#666"/>
                      </View>
                      <View style={{width:'48%'}}>
                          <Text style={styles.label}>{formIsEquipment ? 'Service Interval (Hours)' : 'Service Interval'}</Text>
                          <TextInput style={styles.input} value={formInterval} onChangeText={setFormInterval} placeholder={formIsEquipment ? "250" : "10000"} keyboardType="number-pad" placeholderTextColor="#666"/>
                      </View>
                  </View>

                  {!formIsEquipment && (
                      <View style={{flexDirection:'row', justifyContent:'space-between', marginTop: 15}}>
                          <View style={{width:'48%'}}>
                              <Text style={styles.label}>Distance Unit</Text>
                              <View style={styles.toggleContainer}>
                                  <TouchableOpacity style={[styles.toggleBtn, formDistanceUnit === 'km' && styles.toggleActive]} onPress={() => setFormDistanceUnit('km')}><Text style={[styles.toggleText, formDistanceUnit === 'km' && {color: '#000'}]}>KM</Text></TouchableOpacity>
                                  <TouchableOpacity style={[styles.toggleBtn, formDistanceUnit === 'mi' && styles.toggleActive]} onPress={() => setFormDistanceUnit('mi')}><Text style={[styles.toggleText, formDistanceUnit === 'mi' && {color: '#000'}]}>MILES</Text></TouchableOpacity>
                              </View>
                          </View>
                          <View style={{width:'48%'}}>
                              <Text style={styles.label}>Economy Display</Text>
                              <View style={styles.toggleContainer}>
                                  <TouchableOpacity style={[styles.toggleBtn, formEconomyDisplay === 'L/100km' && styles.toggleActive]} onPress={() => setFormEconomyDisplay('L/100km')}><Text style={[styles.toggleText, formEconomyDisplay === 'L/100km' && {color: '#000', fontSize: 10}]}>L/100km</Text></TouchableOpacity>
                                  <TouchableOpacity style={[styles.toggleBtn, formEconomyDisplay === 'MPG' && styles.toggleActive]} onPress={() => setFormEconomyDisplay('MPG')}><Text style={[styles.toggleText, formEconomyDisplay === 'MPG' && {color: '#000', fontSize: 10}]}>MPG</Text></TouchableOpacity>
                              </View>
                          </View>
                      </View>
                  )}

                  <View style={{marginTop: 5}}>
                      <Text style={styles.label}>Glovebox Specs & Parts (Optional)</Text>
                      <TextInput style={[styles.input, {height: 80, textAlignVertical: 'top'}]} value={formSpecs} onChangeText={setFormSpecs} placeholder={formIsEquipment ? "Hydraulic Fluid: AW32..." : "Oil: 5W-40, Filter: MANN..."} placeholderTextColor="#666" multiline={true}/>
                  </View>

                  <TouchableOpacity onPress={handleSaveVehicle} style={styles.saveBtn}><Text style={styles.saveText}>SAVE DETAILS</Text></TouchableOpacity>
                  
                  {selectedCar && <TouchableOpacity onPress={() => handleDelete(selectedCar.id)} style={{marginTop:15, alignItems:'center'}}><Text style={{color:'#D32F2F', fontWeight: 'bold'}}>Delete Item</Text></TouchableOpacity>}
                  <TouchableOpacity onPress={() => setIsEditing(false)} style={{marginTop:15, alignItems:'center'}}><Text style={{color:'#666'}}>Cancel</Text></TouchableOpacity>
              </View>
          </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', paddingTop: 60, paddingHorizontal: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }, header: { color: '#FFF', fontSize: 24, fontWeight: 'bold' },
  sectionHeader: { color: '#888', fontSize: 12, fontWeight: 'bold', marginBottom: 10, marginTop: 5 },
  card: { backgroundColor: '#1E1E1E', padding: 20, borderRadius: 15, marginBottom: 15 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  icon: { fontSize: 30, marginRight: 15 }, name: { color: '#FFF', fontSize: 18, fontWeight: 'bold' }, model: { color: '#888', fontSize: 14 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#333', paddingTop: 15 },
  stat: { flex: 1 }, statLabel: { color: '#666', fontSize: 10, fontWeight: 'bold', marginBottom: 5 }, statValue: { color: '#CCC', fontSize: 14 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1E1E1E', borderRadius: 20, height: '85%', padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }, modalTitle: { color: '#FFF', fontSize: 22, fontWeight: 'bold' },
  specsVault: { backgroundColor: '#2A1B0A', padding: 15, borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#FF9800' },
  toggleContainer: { flexDirection: 'row', backgroundColor: '#121212', borderRadius: 8, borderWidth: 1, borderColor: '#333' },
  toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 6 }, toggleActive: { backgroundColor: '#FF9800' }, toggleText: { color: '#888', fontWeight: 'bold', fontSize: 12 },
  actionBtn: { backgroundColor: '#FF9800', padding: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  logRow: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#333', paddingVertical: 10 },
  logDate: { color: '#888', fontSize: 12 }, logType: { color: '#FFF', fontWeight: 'bold' }, logCost: { color: '#4CAF50', fontWeight: 'bold' }, logOdo: { color: '#666', fontSize: 12 },
  label: { color: '#888', fontSize: 12, marginBottom: 5 }, input: { backgroundColor: '#121212', color: '#FFF', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#333' },
  saveBtn: { backgroundColor: '#FF9800', padding: 18, borderRadius: 10, alignItems: 'center', marginTop: 10 }, saveText: { fontWeight: 'bold', color: '#000', fontSize: 16 }
});
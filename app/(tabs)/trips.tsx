import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';

export default function TripsScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);

  const [trips, setTrips] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [smartLocations, setSmartLocations] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Form States
  const [entryDate, setEntryDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [isBusiness, setIsBusiness] = useState(true);
  
  const [startOdo, setStartOdo] = useState('');
  const [endOdo, setEndOdo] = useState('');
  
  const [location, setLocation] = useState('');
  const [purpose, setPurpose] = useState('');
  
  const [odoPhoto, setOdoPhoto] = useState<{uri: string, base64: string} | null>(null);

  // Quick Location Modal States
  const [isAddingLocation, setIsAddingLocation] = useState(false);
  const [newLocName, setNewLocName] = useState('');
  const [newLocAddress, setNewLocAddress] = useState('');
  const [newLocDist, setNewLocDist] = useState('');

  // Camera & Modal States
  const [isScanning, setIsScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'LOG' | 'HISTORY'>('LOG');

  const fetchData = async () => {
    setRefreshing(true);

    // 1. Session Guard (Prevents ghost data bug)
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (!user || authErr) {
        await supabase.auth.signOut();
        return;
    }
    
    // 2. Fetch data from Supabase Cloud
    const { data: locData } = await supabase.from('quick_locations').select('*').order('created_at', { ascending: true });
    if (locData) setSmartLocations(locData);

    const { data: vData } = await supabase.from('vehicles').select('*').order('is_default', { ascending: false });
    const { data: jData } = await supabase.from('jobs').select('*').eq('is_active', true);
    const { data: allLogs } = await supabase.from('vehicle_logs').select('*').order('created_at', { ascending: false });

    if (vData) {
      const enrichedVehicles = vData.map(v => {
        const carLogs = allLogs ? allLogs.filter(l => l.vehicle_id === v.id) : [];
        const maxOdoFromLogs = carLogs.length > 0 ? Math.max(...carLogs.map(l => l.odometer || 0)) : 0;
        const maxStartOdoFromLogs = carLogs.length > 0 ? Math.max(...carLogs.map(l => l.start_odometer || 0)) : 0;
        const currentOdo = Math.max(v.odometer || 0, maxOdoFromLogs, maxStartOdoFromLogs);
        return { ...v, currentOdo };
      });

      setVehicles(enrichedVehicles);

      if (enrichedVehicles.length > 0) {
        const initialCar = selectedVehicle 
          ? enrichedVehicles.find(ev => ev.id === selectedVehicle.id) || enrichedVehicles[0]
          : enrichedVehicles[0];
          
        setSelectedVehicle(initialCar);
        setStartOdo(initialCar.currentOdo.toString());
      }
    }
    
    if (jData) setJobs(jData);
    if (allLogs) setTrips(allLogs.filter(l => l.log_type === 'TRIP'));
    setRefreshing(false);
  };

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const handleVehicleSelect = (v: any) => {
    setSelectedVehicle(v);
    const vehicleCurrentOdo = v.currentOdo ?? v.odometer ?? 0;
    setStartOdo(vehicleCurrentOdo.toString());
    setEndOdo(''); 
  };

  const handleProjectSelect = (job: any) => {
      setSelectedJob(job);
      if (!job) {
          setLocation('');
          return;
      }
      
      const newLocation = job.address ? `${job.name} - ${job.address}` : job.name;
      setLocation(newLocation);

      if (job.default_distance && startOdo) {
          const autoEnd = parseInt(startOdo) + parseInt(job.default_distance);
          setEndOdo(autoEnd.toString());
      }
  };

  const handleSmartLocationSelect = (loc: any) => {
      setLocation(loc.name);

      if (loc.distance && loc.distance > 0 && startOdo) {
          const autoEnd = parseInt(startOdo) + parseInt(loc.distance);
          setEndOdo(autoEnd.toString());
      }
  };

  const handleSaveNewLocation = async () => {
      if (!newLocName) return Alert.alert("Missing", "Please enter a location name.");
      const { data: { user } } = await supabase.auth.getUser();
      
      const newLoc = {
          user_id: user?.id,
          name: newLocName.trim(),
          address: newLocAddress.trim(),
          distance: newLocDist ? parseFloat(newLocDist) : 0
      };

      const { data, error } = await supabase.from('quick_locations').insert([newLoc]).select();
      
      if (error) {
          Alert.alert("Error", error.message);
      } else if (data && data.length > 0) {
          const updatedLocs = [...smartLocations, data[0]];
          setSmartLocations(updatedLocs);
          handleSmartLocationSelect(data[0]);
      }

      setNewLocName('');
      setNewLocAddress('');
      setNewLocDist('');
      setIsAddingLocation(false);
  };

  const calculatedDistance = (endOdo && startOdo) ? Math.max(0, parseInt(endOdo) - parseInt(startOdo)) : 0;

  const openCamera = () => {
    if (!permission?.granted) { requestPermission(); return; }
    setIsScanning(true);
  };

  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.5 });
        setOdoPhoto({ uri: photo.uri, base64: photo.base64 });
        setIsScanning(false);
      } catch (e) { Alert.alert("Camera Error", "Failed to capture odometer."); }
    }
  };

  const handleSaveTrip = async () => {
    if (!startOdo || !endOdo) return Alert.alert("Missing Odometer", "Enter both starting and ending readings.");
    if (!location) return Alert.alert("Missing Location", "Please enter a destination or location.");
    if (!purpose) return Alert.alert("Missing Purpose", "CRA and IRS audits require a clear business purpose.");
    if (calculatedDistance <= 0) return Alert.alert("Invalid Math", "Ending odometer must be greater than starting odometer.");

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser(); 

      let odoUrl = null;
      if (odoPhoto) {
        const fileName = `receipts/trip_odo_${Date.now()}.jpg`;
        try {
          const binaryString = atob(odoPhoto.base64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
          await supabase.storage.from('receipts').upload(fileName, bytes.buffer, { contentType: 'image/jpeg' });
          odoUrl = supabase.storage.from('receipts').getPublicUrl(fileName).data.publicUrl;
        } catch (atobError) {
           console.log("atob not found", atobError);
        }
      }

      const auditNotes = `Location: ${location} | Purpose: ${purpose}`;

      const payload = {
        created_at: entryDate.toISOString(),
        log_type: 'TRIP',
        expense_category: 'TRIP',
        cost: 0, 
        start_odometer: parseInt(startOdo),
        odometer: parseInt(endOdo),
        distance: calculatedDistance,
        is_business: isBusiness,
        vehicle_id: selectedVehicle?.id || null,
        vehicle_name: selectedVehicle?.name || null,
        job_id: selectedJob?.id || null,
        job_name: selectedJob?.name || (isBusiness ? 'General Business Travel' : 'Personal Travel'),
        notes: auditNotes,
        odometer_image: odoUrl,
        user_id: user?.id 
      };

      const { error } = await supabase.from('vehicle_logs').insert(payload);
      if (error) throw error;

      Alert.alert("Success", `Logged ${calculatedDistance} ${selectedVehicle?.distance_unit || 'km'} trip!`);
      
      setStartOdo(endOdo); 
      setEndOdo('');
      setLocation('');
      setPurpose('');
      setSelectedJob(null);
      setOdoPhoto(null);
      setActiveTab('HISTORY');
      fetchData();
    } catch (e: any) {
      Alert.alert("Save Error", e.message);
    } finally {
      setSaving(false);
    }
  };

  // --- STRICT MATH FILTERING ---
  const selectedVehicleTrips = trips.filter(t => t.vehicle_id === selectedVehicle?.id);
  
  const baseOdo = selectedVehicle?.odometer || 0;
  const currentOdo = selectedVehicle?.currentOdo || baseOdo;
  const totalDistanceDriven = Math.max(0, currentOdo - baseOdo);

  const totalBusinessKm = selectedVehicleTrips.filter(t => t.is_business).reduce((sum, t) => sum + (t.distance || 0), 0);
  const totalPersonalKm = Math.max(0, totalDistanceDriven - totalBusinessKm);

  if (isScanning) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView style={{ flex: 1 }} ref={cameraRef} />
        <View style={styles.cameraControls}>
           <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsScanning(false)}><Text style={styles.cancelText}>CANCEL</Text></TouchableOpacity>
           <TouchableOpacity style={styles.captureBtn} onPress={takePicture}><View style={styles.captureInner} /></TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { paddingTop: insets.top + 20 }]} contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>MILEAGE & TRIPS</Text>
        <View style={styles.tabToggle}>
          <TouchableOpacity style={[styles.miniTab, activeTab === 'LOG' && styles.miniTabActive]} onPress={() => setActiveTab('LOG')}><Text style={[styles.miniTabText, activeTab === 'LOG' && {color: '#000'}]}>NEW</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.miniTab, activeTab === 'HISTORY' && styles.miniTabActive]} onPress={() => setActiveTab('HISTORY')}><Text style={[styles.miniTabText, activeTab === 'HISTORY' && {color: '#000'}]}>LOGS</Text></TouchableOpacity>
        </View>
      </View>

      <View style={styles.summaryCard}>
        <View style={{flex: 1}}>
          <Text style={styles.label}>💼 BUSINESS</Text>
          <Text style={[styles.bigNum, {color: '#4CAF50'}]}>{totalBusinessKm.toLocaleString()} {selectedVehicle?.distance_unit || 'km'}</Text>
        </View>
        <View style={{flex: 1, alignItems: 'flex-end'}}>
          <Text style={styles.label}>🏠 PERSONAL</Text>
          <Text style={[styles.bigNum, {color: '#9C27B0'}]}>{totalPersonalKm.toLocaleString()} {selectedVehicle?.distance_unit || 'km'}</Text>
        </View>
      </View>

      {activeTab === 'LOG' ? (
        <View>
          <View style={styles.card}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15}}>
              <Text style={styles.label}>TRIP DATE</Text>
              <TouchableOpacity onPress={() => setShowDatePicker(true)}>
                <Text style={{color: '#FF9800', fontWeight: 'bold'}}>📅 {entryDate.toLocaleDateString()}</Text>
              </TouchableOpacity>
            </View>
            {(showDatePicker || Platform.OS === 'ios') && (
              <DateTimePicker value={entryDate} mode="date" display="default" onChange={(e: any, d: any) => { setShowDatePicker(Platform.OS === 'ios'); if(d) setEntryDate(d); }} themeVariant="dark" />
            )}

            <Text style={styles.label}>SELECT VEHICLE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillContainer}>
              {vehicles.map(v => (
                <TouchableOpacity key={v.id} style={[styles.pill, selectedVehicle?.id === v.id && styles.activeVehicle]} onPress={() => handleVehicleSelect(v)}>
                  <Text style={styles.toggleText}>🚙 {v.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={[styles.row, {marginTop: 10}]}>
               <TouchableOpacity style={[styles.toggleBtn, isBusiness && styles.activeBiz]} onPress={() => setIsBusiness(true)}><Text style={styles.toggleText}>💼 BUSINESS</Text></TouchableOpacity>
               <TouchableOpacity style={[styles.toggleBtn, !isBusiness && styles.activePersonal]} onPress={() => setIsBusiness(false)}><Text style={styles.toggleText}>🏠 PERSONAL</Text></TouchableOpacity>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>LINK TO PROJECT (Optional Autofill)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillContainer}>
              <TouchableOpacity style={[styles.pill, !selectedJob && {backgroundColor: '#FF9800'}]} onPress={() => handleProjectSelect(null)}><Text style={[styles.toggleText, !selectedJob && {color: '#000'}]}>None (General)</Text></TouchableOpacity>
              {jobs.filter(j => j.is_business === isBusiness && j.name !== 'General Overhead').map(j => (
                <TouchableOpacity key={j.id} style={[styles.pill, selectedJob?.id === j.id && {backgroundColor: '#FF9800'}]} onPress={() => handleProjectSelect(j)}>
                  <Text style={[styles.toggleText, selectedJob?.id === j.id && {color: '#000'}]}>{j.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15, marginBottom: 8}}>
               <Text style={styles.label}>QUICK LOCATIONS</Text>
               <TouchableOpacity onPress={() => setIsAddingLocation(true)}>
                   <Text style={{color: '#FF9800', fontWeight: 'bold', fontSize: 12}}>+ NEW</Text>
               </TouchableOpacity>
            </View>

            {smartLocations.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillContainer}>
                  {smartLocations.map(loc => (
                    <TouchableOpacity key={loc.id} style={[styles.pill, {backgroundColor: '#2196F3'}]} onPress={() => handleSmartLocationSelect(loc)}>
                      <Text style={styles.toggleText}>📍 {loc.name}{loc.distance ? ` (${loc.distance})` : ''}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
            )}
            
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15, marginBottom: 5}}>
               <Text style={styles.label}>DESTINATION / LOCATION</Text>
            </View>
            <TextInput style={[styles.input, {marginBottom: 10}]} value={location} onChangeText={setLocation} placeholder="e.g., Home Depot" placeholderTextColor="#666" />

            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5, marginBottom: 5}}>
               <Text style={styles.label}>AUDIT PURPOSE</Text>
            </View>
            <TextInput style={[styles.input, {marginBottom: 5}]} value={purpose} onChangeText={setPurpose} placeholder="e.g., Picking up drywall" placeholderTextColor="#666" />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>ODOMETER TRACKING</Text>
            <View style={{flexDirection: 'row', gap: 10, marginBottom: 15}}>
               <View style={{flex: 1}}><Text style={styles.label}>Start Odometer</Text><TextInput style={styles.input} value={startOdo} onChangeText={setStartOdo} keyboardType="number-pad" placeholder="e.g. 45000" placeholderTextColor="#666" /></View>
               <View style={{flex: 1}}><Text style={styles.label}>End Odometer</Text><TextInput style={styles.input} value={endOdo} onChangeText={setEndOdo} keyboardType="number-pad" placeholder="e.g. 45045" placeholderTextColor="#666" /></View>
            </View>

            <View style={styles.distanceBox}>
              <Text style={{color: '#888', fontWeight: 'bold', fontSize: 12}}>CALCULATED TRIP DISTANCE</Text>
              <Text style={{color: '#FF9800', fontSize: 28, fontWeight: '900'}}>{calculatedDistance} {selectedVehicle?.distance_unit || 'km'}</Text>
            </View>

            <TouchableOpacity style={[styles.photoBtn, odoPhoto && {borderColor: '#4CAF50'}]} onPress={openCamera}>
              <Ionicons name="camera" size={20} color={odoPhoto ? "#4CAF50" : "#FF9800"} style={{marginRight: 8}} />
              <Text style={{color: odoPhoto ? '#4CAF50' : '#FFF', fontWeight: 'bold', fontSize: 12}}>{odoPhoto ? "ODOMETER PHOTO ATTACHED" : "CAPTURE ODOMETER PHOTO (AUDIT READY)"}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={handleSaveTrip} disabled={saving}>
            {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveText}>SAVE AUDIT-READY TRIP</Text>}
          </TouchableOpacity>
        </View>
      ) : (
        <View>
          <FlatList
            data={selectedVehicleTrips}
            keyExtractor={item => item.id.toString()}
            scrollEnabled={false}
            renderItem={({ item }) => {
              const bColor = item.is_business ? '#4CAF50' : '#9C27B0';
              return (
                <View style={[styles.card, {borderLeftWidth: 5, borderLeftColor: bColor}]}>
                  <View style={styles.row}>
                    <View>
                      <Text style={{color: '#888', fontSize: 11}}>{new Date(item.created_at).toLocaleDateString()} {item.vehicle_name ? `• ${item.vehicle_name}` : ''}</Text>
                      <Text style={{color: bColor, fontWeight: 'bold', fontSize: 10, marginTop: 2}}>{item.is_business ? '💼 BUSINESS' : '🏠 PERSONAL'} {item.job_name ? `• ${item.job_name}` : ''}</Text>
                    </View>
                    <Text style={{color: '#FFF', fontSize: 20, fontWeight: 'bold'}}>{item.distance} {selectedVehicle?.distance_unit || 'km'}</Text>
                  </View>
                  <Text style={{color: '#CCC', fontSize: 14, marginVertical: 8, fontStyle: 'italic'}}>"{item.notes}"</Text>
                  <Text style={{color: '#666', fontSize: 10}}>Odometer: {item.start_odometer} ➔ {item.odometer}</Text>
                </View>
              );
            }}
            ListEmptyComponent={<Text style={{color: '#666', textAlign: 'center', marginTop: 30}}>No trips logged yet for this vehicle.</Text>}
          />
        </View>
      )}

      {/* MODAL FOR ADDING QUICK LOCATIONS CLEANLY */}
      <Modal visible={isAddingLocation} animationType="fade" transparent>
          <View style={styles.modalBg}>
              <View style={[styles.modalContent, {height: 'auto', paddingBottom: 40}]}>
                  <Text style={styles.modalTitle}>New Quick Location</Text>
                  
                  <Text style={[styles.label, {marginTop: 15}]}>Location Name</Text>
                  <TextInput style={[styles.input, {marginBottom: 10}]} value={newLocName} onChangeText={setNewLocName} placeholder="e.g. Home Depot" placeholderTextColor="#666" autoFocus />
                  
                  <Text style={styles.label}>Address (Optional)</Text>
                  <TextInput style={[styles.input, {marginBottom: 10}]} value={newLocAddress} onChangeText={setNewLocAddress} placeholder="e.g. 123 Industrial Ave" placeholderTextColor="#666" />

                  <Text style={styles.label}>Default Distance (Optional)</Text>
                  <TextInput style={[styles.input, {marginBottom: 20}]} value={newLocDist} onChangeText={setNewLocDist} placeholder="e.g. 15" keyboardType="number-pad" placeholderTextColor="#666" />

                  <TouchableOpacity onPress={handleSaveNewLocation} style={[styles.saveBtn, {marginTop: 0, padding: 15}]}><Text style={styles.saveText}>SAVE LOCATION</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => setIsAddingLocation(false)} style={{marginTop:15, alignItems:'center'}}><Text style={{color:'#666'}}>Cancel</Text></TouchableOpacity>
              </View>
          </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', paddingHorizontal: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  header: { color: '#FFF', fontSize: 24, fontWeight: 'bold' },
  tabToggle: { flexDirection: 'row', backgroundColor: '#1E1E1E', borderRadius: 8, borderWidth: 1, borderColor: '#333', overflow: 'hidden' },
  miniTab: { paddingVertical: 6, paddingHorizontal: 12 },
  miniTabActive: { backgroundColor: '#FF9800' },
  miniTabText: { color: '#888', fontWeight: 'bold', fontSize: 10 },
  summaryCard: { backgroundColor: '#1E1E1E', padding: 15, borderRadius: 15, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15, borderWidth: 1, borderColor: '#333' },
  label: { color: '#888', fontSize: 10, fontWeight: 'bold', marginBottom: 8 },
  bigNum: { fontSize: 20, fontWeight: '900' },
  card: { backgroundColor: '#1E1E1E', padding: 20, borderRadius: 15, marginBottom: 15, borderWidth: 1, borderColor: '#333' },
  cardTitle: { color: '#888', fontSize: 12, fontWeight: 'bold', marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  input: { backgroundColor: '#121212', color: '#FFF', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#333', fontSize: 16 },
  toggleBtn: { flex: 1, backgroundColor: '#333', paddingVertical: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  toggleText: { color: '#FFF', fontWeight: 'bold', fontSize: 10, textAlign: 'center' },
  activeBiz: { backgroundColor: '#4CAF50' }, activePersonal: { backgroundColor: '#9C27B0' },
  pillContainer: { flexDirection: 'row', marginBottom: 5 }, 
  pill: { backgroundColor: '#333', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 10 },
  activeVehicle: { backgroundColor: '#2196F3' },
  distanceBox: { backgroundColor: '#121212', padding: 15, borderRadius: 10, alignItems: 'center', marginBottom: 15, borderWidth: 1, borderColor: '#333' },
  photoBtn: { flexDirection: 'row', backgroundColor: '#121212', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#555', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  saveBtn: { backgroundColor: '#FF9800', padding: 18, borderRadius: 10, alignItems: 'center', marginBottom: 40 },
  saveText: { fontWeight: 'bold', color: '#000', fontSize: 16 },
  cameraControls: { position: 'absolute', bottom: 50, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', zIndex: 20 },
  captureBtn: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center' },
  captureInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FF9800', borderWidth: 2, borderColor: '#FFF' },
  cancelBtn: { padding: 15 }, cancelText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1E1E1E', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 25, borderWidth: 1, borderColor: '#333' },
  modalTitle: { color: '#FFF', fontSize: 24, fontWeight: 'bold', marginBottom: 15 }
});
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Modal, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';

const GOOGLE_VISION_API_KEY = 'AIzaSyB2f1zXok9GAphUErr9QCeqA03e4m0QJ3k'; 

export default function ScannerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const params = useLocalSearchParams();

  const [isScanning, setIsScanning] = useState(false);
  const [scanMode, setScanMode] = useState<'receipt' | 'odometer'>('receipt');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [region, setRegion] = useState<'CA' | 'US'>('CA');
  
  const [zoomLevel, setZoomLevel] = useState(0);
  const [editId, setEditId] = useState<string | null>(null);

  const [entryDate, setEntryDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  const [cost, setCost] = useState('');
  const [snackDeduction, setSnackDeduction] = useState(''); 
  const [tax, setTax] = useState('');
  const [liters, setLiters] = useState('');
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [odometer, setOdometer] = useState('');
  
  const [shopHours, setShopHours] = useState('');
  const [shopRate, setShopRate] = useState('');
  const [partsCost, setPartsCost] = useState(''); 
  const [vendor, setVendor] = useState('');
  const [notes, setNotes] = useState('');
  
  const [logType, setLogType] = useState<'FUEL' | 'MAINTENANCE' | 'MATERIALS' | 'LABOUR'>('FUEL');
  const [isBusiness, setIsBusiness] = useState(true);
  const [isFullTank, setIsFullTank] = useState(true); 
  
  const [receiptPhoto, setReceiptPhoto] = useState<{uri: string, base64: string} | null>(null);
  const [odometerPhoto, setOdometerPhoto] = useState<{uri: string, base64: string} | null>(null);

  const [vehicles, setVehicles] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);
  const [selectedJob, setSelectedJob] = useState<any>(null);

  const [isAddingJob, setIsAddingJob] = useState(false);
  const [newJobName, setNewJobName] = useState('');

  useFocusEffect(useCallback(() => { 
      fetchDropdownData(); 
  }, [params.prefillJob, params.prefillVehicle, params.logType, params.editId]));

  const fetchDropdownData = async () => {
    const { data: vData } = await supabase.from('vehicles').select('*').order('is_default', { ascending: false });
    const { data: jData } = await supabase.from('jobs').select('*').eq('is_active', true).order('created_at', { ascending: true });
    
    if (vData) setVehicles(vData);
    if (jData) setJobs(jData);

    if (params.editId) {
        const { data: logData } = await supabase.from('vehicle_logs').select('*').eq('id', params.editId).single();
        if (logData) {
            setEditId(logData.id.toString());
            setLogType(logData.log_type);
            setIsBusiness(logData.is_business);
            setIsFullTank(logData.is_full_tank ?? true); 
            setCost(logData.cost?.toString() || '');
            setTax(logData.gst_amount?.toString() || ''); 
            setLiters(logData.liters?.toString() || '');
            setOdometer(logData.odometer?.toString() || '');
            setShopHours(logData.hours?.toString() || '');
            setShopRate(logData.hourly_rate?.toString() || '');
            setPartsCost(logData.parts_cost?.toString() || '');
            setVendor(logData.vendor || '');
            setNotes(logData.notes || '');
            setEntryDate(new Date(logData.created_at));
            
            if (vData) setSelectedVehicle(vData.find((v: any) => v.id === logData.vehicle_id) || null);
            if (jData) setSelectedJob(jData.find((j: any) => j.id === logData.job_id) || null);
            return; 
        }
    }

    if (vData) { 
        if (params.prefillVehicle) {
            const matchedVehicle = vData.find((v: any) => v.id.toString() === params.prefillVehicle);
            if (matchedVehicle) setSelectedVehicle(matchedVehicle);
        } else if (vData.length > 0) {
            setSelectedVehicle(vData[0]); 
        }
    }
    
    if (jData) {
        if (params.prefillJob) {
            const matchedJob = jData.find((j: any) => j.id.toString() === params.prefillJob);
            if (matchedJob) {
                setSelectedJob(matchedJob);
                setIsBusiness(params.isBiz === 'true');
                setLogType('MATERIALS'); 
            }
        } else {
            const defaultBiz = jData.find((j: any) => j.name === 'General Business');
            if (defaultBiz) setSelectedJob(defaultBiz);
        }
    }
    if (params.logType) setLogType(params.logType as any);
  };

  const handleToggleLogType = (type: 'FUEL' | 'MAINTENANCE' | 'MATERIALS' | 'LABOUR') => {
      setLogType(type);
      if (type === 'MATERIALS' || type === 'LABOUR') handleBusinessToggle(true);
  };

  const handleBusinessToggle = (isBiz: boolean) => {
      setIsBusiness(isBiz);
      const targetName = isBiz ? 'General Business' : 'General Personal';
      const defaultJob = jobs.find(j => j.name === targetName);
      setSelectedJob(defaultJob || null);
  };

  const handleSaveNewJob = async () => {
      if (!newJobName) return Alert.alert("Missing", "Please enter a name.");
      const { data, error } = await supabase.from('jobs').insert([{ name: newJobName, is_business: isBusiness, is_active: true }]).select();
      if (error) Alert.alert("Error", error.message);
      else {
          setNewJobName(''); setIsAddingJob(false); await fetchDropdownData();
          if (data && data.length > 0) setSelectedJob(data[0]); 
      }
  };

  const handleTriangleMath = (changedField: 'cost' | 'liters' | 'price', value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return;
    const adjustedCost = parseFloat(cost || '0') - parseFloat(snackDeduction || '0');

    if (changedField === 'cost') {
      setCost(value);
      const newAdjustedCost = num - parseFloat(snackDeduction || '0');
      if (liters && !pricePerUnit) setPricePerUnit((newAdjustedCost / parseFloat(liters)).toFixed(3));
      else if (pricePerUnit && !liters) setLiters((newAdjustedCost / parseFloat(pricePerUnit)).toFixed(2));
    } 
    else if (changedField === 'liters') {
      setLiters(value);
      if (pricePerUnit) setCost(((num * parseFloat(pricePerUnit)) + parseFloat(snackDeduction || '0')).toFixed(2));
      else if (adjustedCost > 0) setPricePerUnit((adjustedCost / num).toFixed(3));
    } 
    else if (changedField === 'price') {
      setPricePerUnit(value);
      if (liters) setCost(((num * parseFloat(liters)) + parseFloat(snackDeduction || '0')).toFixed(2));
      else if (adjustedCost > 0) setLiters((adjustedCost / num).toFixed(2));
    }
  };

  const openCamera = (mode: 'receipt' | 'odometer') => {
    if (!permission?.granted) { requestPermission(); return; }
    setZoomLevel(0); 
    setScanMode(mode); setIsScanning(true);
  };

  const takePicture = async () => {
    if (cameraRef.current) {
      setLoading(true);
      try {
        const photo = await (cameraRef.current as any).takePictureAsync({ base64: true, quality: 0.5 });
        if (scanMode === 'receipt') {
          setReceiptPhoto({ uri: photo.uri, base64: photo.base64 });
          await scanImage(photo.base64, 'receipt');
        } else {
          setOdometerPhoto({ uri: photo.uri, base64: photo.base64 });
          await scanImage(photo.base64 as string, 'odometer');
        }
      } catch (e) { Alert.alert("Camera Error", "Failed to take picture."); } finally { setLoading(false); setIsScanning(false); }
    }
  };

  const scanImage = async (base64String: string, mode: 'receipt' | 'odometer') => {
    try {
      const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: [{ image: { content: base64String }, features: [{ type: 'TEXT_DETECTION' }] }] })
      });
      const result = await response.json();
      const text = result.responses[0]?.fullTextAnnotation?.text || '';
      
      if (mode === 'receipt') {
        const lines = text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
        let foundVendor = lines[0] || '';
        const badHeaders = ['transaction record', 'interac', 'approved', 'welcome', 'preauth', 'customer copy', '****', '----'];
        
        for (let i = 0; i < Math.min(lines.length, 6); i++) {
            const lowerLine = lines[i].toLowerCase();
            if (!badHeaders.some((bh: string) => lowerLine.includes(bh)) && !lowerLine.match(/^[0-9\*\#\-\.\:\s\/]+$/)) {
                foundVendor = lines[i];
                break;
            }
        }
        setVendor(foundVendor);

        const costMatch = text.match(/\b\d+\.\d{2}\b/g);
        let foundCost = costMatch ? Math.max(...costMatch.map((val: any) => Number(val))) : 0;
        
        const decimals3 = text.match(/\b\d+\.\d{3}/g); 
        if (decimals3 && decimals3.length >= 2) {
            const nums = decimals3.map((val: any) => Number(val)).sort((a: number, b: number) => b - a);
            setLiters(nums[0].toString());       
            setPricePerUnit(nums[1].toString()); 
            if (foundCost === 0) foundCost = parseFloat((nums[0] * nums[1]).toFixed(2));
        }
        if (foundCost > 0) setCost(foundCost.toString());
      } else {
        const cleanText = text.replace(/[,.]/g, '');
        const odoMatches = cleanText.match(/\d{4,7}/g);
        if (odoMatches) {
            const bestOdo = Math.max(...odoMatches.map(Number));
            setOdometer(bestOdo.toString());
        }
      }
    } catch (e) { console.log("OCR Error:", e); }
  };

  const calculateTax = (gstRate: number, totalTaxRate: number) => { 
      const adjustedCost = parseFloat(cost || '0') - parseFloat(snackDeduction || '0');
      if (adjustedCost > 0) {
          const subtotal = adjustedCost / (1 + totalTaxRate);
          setTax((subtotal * gstRate).toFixed(2)); 
      } 
  };

  const clearForm = () => {
      setEditId(null);
      setCost(''); setSnackDeduction(''); setTax(''); setLiters(''); setPricePerUnit(''); setOdometer(''); 
      setShopHours(''); setShopRate(''); setPartsCost(''); setVendor(''); setNotes('');
      setReceiptPhoto(null); setOdometerPhoto(null); setEntryDate(new Date()); setIsFullTank(true);
      
      const defaultBiz = jobs.find((j: any) => j.name === 'General Business');
      if (defaultBiz) { setSelectedJob(defaultBiz); setIsBusiness(true); }
  };

  const handleSave = async () => {
    if (!cost) return Alert.alert("Missing Info", "Enter a receipt total.");
    if (logType !== 'MATERIALS' && logType !== 'LABOUR' && !selectedVehicle) return Alert.alert("Missing Info", "Select a fleet item.");
    if (!selectedJob) return Alert.alert("Missing Project", "Select a Project or Trip.");
    
    setSaving(true);
    try {
      let receiptUrl = null; let odoUrl = null;
      if (receiptPhoto) {
          const fileName = `receipts/r_${Date.now()}.jpg`;
          const binaryString = atob(receiptPhoto.base64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
          await supabase.storage.from('receipts').upload(fileName, bytes.buffer, { contentType: 'image/jpeg' });
          receiptUrl = supabase.storage.from('receipts').getPublicUrl(fileName).data.publicUrl;
      }
      if (odometerPhoto) {
          const fileName = `receipts/o_${Date.now()}.jpg`;
          const binaryString = atob(odometerPhoto.base64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
          await supabase.storage.from('receipts').upload(fileName, bytes.buffer, { contentType: 'image/jpeg' });
          odoUrl = supabase.storage.from('receipts').getPublicUrl(fileName).data.publicUrl;
      }

      const finalCost = parseFloat(cost) - (parseFloat(snackDeduction) || 0);
      
      const payload = {
        created_at: entryDate.toISOString(), 
        cost: finalCost, 
        gst_amount: tax ? parseFloat(tax) : 0, 
        liters: liters ? parseFloat(liters) : null, 
        odometer: odometer ? parseInt(odometer) : null, 
        hours: shopHours ? parseFloat(shopHours) : null, 
        hourly_rate: shopRate ? parseFloat(shopRate) : null,
        parts_cost: partsCost ? parseFloat(partsCost) : null,
        log_type: logType, 
        vendor: vendor, 
        notes: notes, 
        is_business: isBusiness, 
        vehicle_id: selectedVehicle?.id || null, 
        vehicle_name: selectedVehicle?.name || null,
        job_id: selectedJob?.id || null, 
        job_name: selectedJob?.name || 'General', 
        currency: region === 'US' ? 'USD' : 'CAD',
        is_full_tank: isFullTank
      };

      if (editId) {
          if (receiptUrl) Object.assign(payload, { receipt_url: receiptUrl });
          if (odoUrl) Object.assign(payload, { odometer_image: odoUrl });
          
          const { error } = await supabase.from('vehicle_logs').update(payload).eq('id', editId);
          if (error) throw error;
          Alert.alert("Updated!", "Entry modified successfully.");
      } else {
          Object.assign(payload, { receipt_url: receiptUrl, odometer_image: odoUrl });
          const { error } = await supabase.from('vehicle_logs').insert(payload);
          if (error) throw error;
          
          if (logType === 'MAINTENANCE' && odometer && selectedVehicle) {
              await supabase.from('vehicles').update({ last_service_odo: parseInt(odometer) }).eq('id', selectedVehicle.id);
          }
          Alert.alert("Saved!", "Entry added.");
      }

      clearForm();
      router.setParams({ prefillJob: '', prefillVehicle: '', logType: '', editId: '' }); 
    } catch (e: any) { Alert.alert("Error saving", e.message); } finally { setSaving(false); }
  };

  if (isScanning) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView style={{ flex: 1 }} ref={cameraRef} zoom={zoomLevel} />
        <View style={styles.zoomControls}>
           <TouchableOpacity style={styles.zoomBtn} onPress={() => setZoomLevel(prev => Math.max(prev - 0.1, 0))}><Text style={styles.zoomText}>-</Text></TouchableOpacity>
           <View style={{width: 1, backgroundColor: '#555', marginVertical: 10}} />
           <TouchableOpacity style={styles.zoomBtn} onPress={() => setZoomLevel(prev => Math.min(prev + 0.1, 1))}><Text style={styles.zoomText}>+</Text></TouchableOpacity>
        </View>
        <View style={styles.cameraControls}>
           <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsScanning(false)}><Text style={styles.cancelText}>CANCEL</Text></TouchableOpacity>
           <TouchableOpacity style={styles.captureBtn} onPress={takePicture}>{loading ? <ActivityIndicator color="#000" /> : <View style={styles.captureInner} />}</TouchableOpacity>
        </View>
      </View>
    );
  }

  const filteredJobs = jobs.filter((j: any) => j.is_business === isBusiness);
  const activeColor = isBusiness ? styles.activeBiz : styles.activePersonal;

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <ScrollView 
        style={[styles.container, { paddingBottom: insets.bottom }]} 
        contentContainerStyle={{paddingBottom: Math.max(100, insets.bottom + 20)}}
      >
        <View style={styles.headerRow}>
           <View>
              <Text style={styles.header}>{editId ? "EDIT ENTRY" : "NEW ENTRY"}</Text>
              <TouchableOpacity onPress={() => setShowDatePicker(true)}>
                  <Text style={{color: '#FF9800', fontWeight: 'bold', marginTop: 5}}>📅 {entryDate.toLocaleDateString()}</Text>
              </TouchableOpacity>
           </View>
           {!editId && (
               <View style={styles.regionToggle}>
                  <TouchableOpacity style={[styles.regionBtn, region === 'CA' && styles.regionActive]} onPress={() => setRegion('CA')}><Text style={styles.regionText}>🇨🇦 CA</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.regionBtn, region === 'US' && styles.regionActive]} onPress={() => setRegion('US')}><Text style={styles.regionText}>🇺🇸 US</Text></TouchableOpacity>
               </View>
           )}
        </View>

        {(showDatePicker || Platform.OS === 'ios') && (
          <DateTimePicker value={entryDate} mode="date" display="default" onChange={(e, d) => { setShowDatePicker(Platform.OS === 'ios'); if(d) setEntryDate(d); }} themeVariant="dark" />
        )}

        {!editId && (
            <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15, gap: 10}}>
               <TouchableOpacity style={[styles.fullWidthCameraBtn, receiptPhoto ? {borderColor: '#4CAF50'} : null]} onPress={() => openCamera('receipt')}>
                  <Ionicons name="receipt" size={24} color={receiptPhoto ? "#4CAF50" : "#FF9800"} style={{marginBottom: 8}}/>
                  <Text style={{color: receiptPhoto ? '#4CAF50' : '#FFF', fontWeight: 'bold', fontSize: 12, textAlign: 'center'}}>{receiptPhoto ? "RECEIPT SCANNED" : "SCAN RECEIPT"}</Text>
               </TouchableOpacity>
               {logType !== 'MATERIALS' && logType !== 'LABOUR' && (
                   <TouchableOpacity style={[styles.fullWidthCameraBtn, odometerPhoto ? {borderColor: '#4CAF50'} : {borderColor: '#2196F3'}]} onPress={() => openCamera('odometer')}>
                      <Ionicons name="speedometer" size={24} color={odometerPhoto ? "#4CAF50" : "#2196F3"} style={{marginBottom: 8}}/>
                      <Text style={{color: odometerPhoto ? '#4CAF50' : '#FFF', fontWeight: 'bold', fontSize: 12, textAlign: 'center'}}>{odometerPhoto ? "ODOMETER SCANNED" : "SCAN ODOMETER"}</Text>
                   </TouchableOpacity>
               )}
            </View>
        )}

        <View style={styles.card}>
          <View style={styles.row}>
             <TouchableOpacity style={[styles.toggleBtn, logType === 'FUEL' && styles.activeToggle]} onPress={() => handleToggleLogType('FUEL')}><Text style={styles.toggleText}>⛽ FUEL</Text></TouchableOpacity>
             <TouchableOpacity style={[styles.toggleBtn, logType === 'MAINTENANCE' && styles.activeToggle]} onPress={() => handleToggleLogType('MAINTENANCE')}><Text style={styles.toggleText}>🔧 REPAIRS</Text></TouchableOpacity>
             <TouchableOpacity style={[styles.toggleBtn, logType === 'MATERIALS' && styles.activeToggle]} onPress={() => handleToggleLogType('MATERIALS')}><Text style={styles.toggleText}>🧱 MATERIALS</Text></TouchableOpacity>
             <TouchableOpacity style={[styles.toggleBtn, logType === 'LABOUR' && styles.activeToggle]} onPress={() => handleToggleLogType('LABOUR')}><Text style={styles.toggleText}>⏱️ LABOUR</Text></TouchableOpacity>
          </View>
          <View style={[styles.row, {marginTop: 10}]}>
             <TouchableOpacity style={[styles.toggleBtn, isBusiness && styles.activeBiz]} onPress={() => handleBusinessToggle(true)}><Text style={styles.toggleText}>💼 BUSINESS</Text></TouchableOpacity>
             <TouchableOpacity style={[styles.toggleBtn, !isBusiness && styles.activePersonal]} onPress={() => handleBusinessToggle(false)}><Text style={styles.toggleText}>🏠 PERSONAL</Text></TouchableOpacity>
          </View>

          {logType !== 'MATERIALS' && (
             <>
               <Text style={[styles.label, {marginTop: 15}]}>Select Fleet Item {logType === 'LABOUR' ? '(Optional)' : ''}</Text>
               <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillContainer}>
               {vehicles.map((v: any) => (
                   <TouchableOpacity key={v.id} style={[styles.pill, selectedVehicle?.id === v.id && styles.activeVehicle]} onPress={() => setSelectedVehicle(v)}>
                       <Text style={styles.toggleText}>{v.is_equipment ? '🚜' : '🚙'} {v.name}</Text>
                   </TouchableOpacity>
               ))}
               </ScrollView>
             </>
           )}

           <Text style={[styles.label, {marginTop: 15}]}>Select Project / Trip</Text>
           <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillContainer}>
              {filteredJobs.map((j: any) => (
                <TouchableOpacity key={j.id} style={[styles.pill, selectedJob?.id === j.id && activeColor]} onPress={() => setSelectedJob(j)}>
                   <Text style={styles.toggleText}>{j.name}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={[styles.pill, {backgroundColor: '#FF9800', marginLeft: 10}]} onPress={() => setIsAddingJob(true)}>
                 <Text style={[styles.toggleText, {color: '#000'}]}>+ ADD NEW</Text>
              </TouchableOpacity>
           </ScrollView>
        </View>

        {logType !== 'MATERIALS' && logType !== 'LABOUR' && (
          <View style={styles.card}>
              <Text style={styles.label}>{selectedVehicle?.is_equipment ? 'Machine Hours' : 'Odometer Reading'}</Text>
              <TextInput style={styles.input} value={odometer} onChangeText={setOdometer} keyboardType="number-pad" placeholder={selectedVehicle?.is_equipment ? "Current hours" : "Current odometer"} placeholderTextColor="#666" />
          </View>
        )}

        <View style={styles.card}>
          <View style={{flexDirection: 'row', gap: 10}}>
             <View style={{flex: 1}}><Text style={styles.label}>Total Amount ($)</Text><TextInput style={styles.input} value={cost} onChangeText={setCost} onBlur={() => handleTriangleMath('cost', cost)} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#666" /></View>
             <View style={{flex: 1}}><Text style={styles.label}>Deduct Non-Project ($)</Text><TextInput style={styles.input} value={snackDeduction} onChangeText={setSnackDeduction} onBlur={() => handleTriangleMath('cost', cost)} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#666" /></View>
          </View>

          {logType !== 'LABOUR' && (
            <View style={{marginTop: 15}}>
                <Text style={styles.label}>Tax ($)</Text>
                <TextInput style={styles.input} value={tax} onChangeText={setTax} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#666" />
            </View>
          )}

          {region === 'CA' && logType !== 'LABOUR' && (
            <View style={{flexDirection: 'row', marginTop: 10, gap: 5, flexWrap: 'wrap'}}>
                <TouchableOpacity style={styles.taxBtn} onPress={() => calculateTax(0.05, 0.05)}><Text style={styles.taxText}>5% Tax (AB/Fuel)</Text></TouchableOpacity>
                <TouchableOpacity style={styles.taxBtn} onPress={() => calculateTax(0.05, 0.12)}><Text style={styles.taxText}>12% Combo (BC/MB)</Text></TouchableOpacity>
                <TouchableOpacity style={styles.taxBtn} onPress={() => calculateTax(0.13, 0.13)}><Text style={styles.taxText}>13% HST (ON)</Text></TouchableOpacity>
                <TouchableOpacity style={styles.taxBtn} onPress={() => calculateTax(0.15, 0.15)}><Text style={styles.taxText}>15% HST (East)</Text></TouchableOpacity>
            </View>
          )}
        </View>

        {logType === 'FUEL' && (
          <View style={[styles.card, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
            <View>
              <Text style={[styles.label, { marginBottom: 0, color: '#FFF' }]}>Filled to 100% Full?</Text>
              <Text style={{color: '#666', fontSize: 10, marginTop: 4}}>Required for accurate MPG math.</Text>
            </View>
            <Switch value={isFullTank} onValueChange={setIsFullTank} trackColor={{ false: "#767577", true: "#4CAF50" }} />
          </View>
        )}

        <View style={styles.card}>
           {logType === 'FUEL' && (
             <View style={{flexDirection: 'row', gap: 10, marginBottom: 15}}>
                <View style={{flex: 1}}><Text style={styles.label}>Volume (Liters/Gals)</Text><TextInput style={styles.input} value={liters} onChangeText={setLiters} onBlur={() => handleTriangleMath('liters', liters)} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#666" /></View>
                <View style={{flex: 1}}><Text style={styles.label}>Price per Unit</Text><TextInput style={styles.input} value={pricePerUnit} onChangeText={setPricePerUnit} onBlur={() => handleTriangleMath('price', pricePerUnit)} keyboardType="decimal-pad" placeholder="0.000" placeholderTextColor="#666" /></View>
             </View>
           )}
           {logType === 'MAINTENANCE' && (
             <>
                 <View style={{flexDirection: 'row', gap: 10, marginBottom: 15}}>
                    <View style={{flex: 1}}><Text style={styles.label}>Shop Hours (Opt)</Text><TextInput style={styles.input} value={shopHours} onChangeText={setShopHours} keyboardType="decimal-pad" placeholder="e.g. 2.5" placeholderTextColor="#666" /></View>
                    <View style={{flex: 1}}><Text style={styles.label}>Shop Rate ($)</Text><TextInput style={styles.input} value={shopRate} onChangeText={setShopRate} keyboardType="decimal-pad" placeholder="e.g. 120" placeholderTextColor="#666" /></View>
                 </View>
                 <View style={{width:'100%', marginTop: 5, marginBottom: 15}}>
                     <Text style={styles.label}>Parts Cost ($)</Text>
                     <TextInput style={styles.input} value={partsCost} onChangeText={setPartsCost} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#666"/>
                 </View>
             </>
           )}
           {logType === 'LABOUR' && (
             <View style={{flexDirection: 'row', gap: 10, marginBottom: 15}}>
                 <View style={{flex: 1}}>
                     <Text style={styles.label}>Labour Hours</Text>
                     <TextInput style={styles.input} value={shopHours} onChangeText={(v) => { setShopHours(v); if(shopRate) setCost((parseFloat(v||'0') * parseFloat(shopRate||'0')).toFixed(2)); }} keyboardType="decimal-pad" placeholder="e.g. 8.5" placeholderTextColor="#666" />
                 </View>
                 <View style={{flex: 1}}>
                     <Text style={styles.label}>Hourly Rate ($)</Text>
                     <TextInput style={styles.input} value={shopRate} onChangeText={(v) => { setShopRate(v); if(shopHours) setCost((parseFloat(shopHours||'0') * parseFloat(v||'0')).toFixed(2)); }} keyboardType="decimal-pad" placeholder="e.g. 65" placeholderTextColor="#666" />
                 </View>
             </View>
           )}
           <TextInput style={[styles.input, {marginBottom: 15}]} value={vendor} onChangeText={setVendor} placeholder={logType === 'LABOUR' ? "Client / Site" : "Location / Vendor"} placeholderTextColor="#666" />
           <TextInput style={styles.input} value={notes} onChangeText={setNotes} placeholder="Notes (Optional)" placeholderTextColor="#666" />
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
           {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveText}>{editId ? "UPDATE ENTRY" : "SAVE ENTRY"}</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={clearForm} style={{alignItems: 'center', marginTop: 15, marginBottom: 40}}><Text style={{color: '#666', fontWeight: 'bold'}}>CANCEL / CLEAR</Text></TouchableOpacity>

        <Modal visible={isAddingJob} transparent animationType="fade">
            <View style={styles.modalBg}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>Add New {isBusiness ? 'Business' : 'Personal'} Project</Text>
                    <TextInput style={styles.input} value={newJobName} onChangeText={setNewJobName} placeholder="Project Name" placeholderTextColor="#666" autoFocus />
                    <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 20}}>
                        <TouchableOpacity onPress={() => setIsAddingJob(false)} style={[styles.actionBtn, {backgroundColor: '#333', width: '48%'}]}><Text style={{color: '#FFF', fontWeight: 'bold'}}>CANCEL</Text></TouchableOpacity>
                        <TouchableOpacity onPress={handleSaveNewJob} style={[styles.actionBtn, {width: '48%'}]}><Text style={{color: '#000', fontWeight: 'bold'}}>SAVE</Text></TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
      </ScrollView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', paddingHorizontal: 20, paddingTop: 60 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  header: { color: '#FFF', fontSize: 24, fontWeight: 'bold' },
  regionToggle: { flexDirection: 'row', backgroundColor: '#333', borderRadius: 8, overflow: 'hidden' },
  regionBtn: { paddingVertical: 6, paddingHorizontal: 12 },
  regionActive: { backgroundColor: '#FF9800' },
  regionText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  card: { backgroundColor: '#1E1E1E', padding: 20, borderRadius: 15, marginBottom: 15, borderWidth: 1, borderColor: '#333' },
  label: { color: '#888', fontSize: 12, fontWeight: 'bold', marginBottom: 8 },
  input: { backgroundColor: '#121212', color: '#FFF', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#333', fontSize: 16 },
  row: { flexDirection: 'row', gap: 10 },
  toggleBtn: { flex: 1, backgroundColor: '#333', paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  toggleText: { color: '#FFF', fontWeight: 'bold', fontSize: 10, textAlign: 'center' },
  activeToggle: { backgroundColor: '#FF9800' }, activeBiz: { backgroundColor: '#4CAF50' }, activePersonal: { backgroundColor: '#9C27B0' }, activeVehicle: { backgroundColor: '#2196F3' },
  pillContainer: { flexDirection: 'row', marginBottom: 5 }, 
  pill: { backgroundColor: '#333', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, marginRight: 10 },
  taxBtn: { flex: 1, backgroundColor: '#333', paddingVertical: 10, borderRadius: 6, alignItems: 'center', borderWidth: 1, borderColor: '#555', minWidth: '45%' }, 
  taxText: { color: '#FF9800', fontSize: 10, fontWeight: 'bold', textAlign: 'center' },
  fullWidthCameraBtn: { flex: 1, backgroundColor: '#1E1E1E', padding: 15, borderRadius: 15, borderWidth: 2, borderColor: '#555', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  saveBtn: { backgroundColor: '#FF9800', padding: 18, borderRadius: 10, alignItems: 'center', marginTop: 10 }, 
  saveText: { fontWeight: 'bold', color: '#000', fontSize: 16 },
  cameraControls: { position: 'absolute', bottom: 50, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', zIndex: 20 },
  captureBtn: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center' }, 
  captureInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FF9800', borderWidth: 2, borderColor: '#FFF' },
  cancelBtn: { padding: 15 }, cancelText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  zoomControls: { position: 'absolute', bottom: 140, alignSelf: 'center', flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 25, paddingHorizontal: 10, alignItems: 'center' },
  zoomBtn: { paddingHorizontal: 20, paddingVertical: 10 },
  zoomText: { color: '#FFF', fontSize: 28, fontWeight: 'bold', bottom: 2 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1E1E1E', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#333' },
  modalTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginBottom: 15 },
  actionBtn: { padding: 15, borderRadius: 10, alignItems: 'center', backgroundColor: '#FF9800' }
});

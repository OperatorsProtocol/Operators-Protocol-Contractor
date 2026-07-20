import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../supabase';

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function HistoryScreen() {
  const router = useRouter();
  const [logs, setLogs] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  
  const [refreshing, setRefreshing] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null); 
  const [filterDate, setFilterDate] = useState(new Date());
  const [viewPhoto, setViewPhoto] = useState<string | null>(null);

  // PILL FILTERS
  const [selectedVehicle, setSelectedVehicle] = useState<string>('ALL');
  const [selectedJobFilter, setSelectedJobFilter] = useState<'ALL' | 'ALL_BIZ' | 'ALL_PERS' | string>('ALL');

  const fetchHistory = async () => {
    setRefreshing(true);
    const startOfMonth = new Date(filterDate.getFullYear(), filterDate.getMonth(), 1).toISOString();
    const endOfMonth = new Date(filterDate.getFullYear(), filterDate.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();

    const { data, error } = await supabase.from('vehicle_logs').select('*').gte('created_at', startOfMonth).lte('created_at', endOfMonth).order('created_at', { ascending: false });
    const { data: vData } = await supabase.from('vehicles').select('*');
    const { data: jData } = await supabase.from('jobs').select('*');

    if (error) Alert.alert("Error", error.message);
    else setLogs(data || []);
    if (vData) setVehicles(vData);
    if (jData) setJobs(jData);

    setRefreshing(false);
  };

  useFocusEffect(useCallback(() => { fetchHistory(); }, [filterDate]));

  const handlePrevMonth = () => setFilterDate(new Date(filterDate.getFullYear(), filterDate.getMonth() - 1, 1));
  const handleNextMonth = () => setFilterDate(new Date(filterDate.getFullYear(), filterDate.getMonth() + 1, 1));

  const handleDeleteLog = (id: number) => {
      Alert.alert("Delete Entry", "Are you sure you want to delete this log?", [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: async () => {
              const { error } = await supabase.from('vehicle_logs').delete().eq('id', id);
              if (error) Alert.alert("Error", error.message);
              else fetchHistory(); 
          }}
      ]);
  };

  // EDIT JUMP ROUTING
  const editLog = (id: number) => {
      router.navigate({ pathname: '/(tabs)', params: { editId: id.toString() } });
  };

  const handleAttachPhoto = async (logId: number, type: 'receipt' | 'odometer') => {
    Alert.alert(`Attach ${type === 'receipt' ? 'Receipt' : 'Odometer'}`, "Where is the photo?", [
      { text: "Cancel", style: "cancel" },
      { text: "Take Photo", onPress: () => pickImage('camera', logId, type) },
      { text: "Choose from Gallery", onPress: () => pickImage('gallery', logId, type) }
    ]);
  };

  const pickImage = async (source: 'camera' | 'gallery', logId: number, type: 'receipt' | 'odometer') => {
    let result;
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return Alert.alert("Permission needed", "We need camera access.");
      result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.5 });
    } else {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return Alert.alert("Permission needed", "We need gallery access.");
      result = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.5 });
    }
    if (!result.canceled && result.assets[0].base64) await uploadMissingPhoto(result.assets[0].base64, logId, type);
  };

  const uploadMissingPhoto = async (base64Image: string, logId: number, type: 'receipt' | 'odometer') => {
    setUploadingId(`${logId}-${type}`);
    try {
      const fileName = `receipts/retro_${type}_${Date.now()}.jpg`;
      const binaryString = atob(base64Image);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

      const { error: uploadError } = await supabase.storage.from('receipts').upload(fileName, bytes.buffer, { contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;

      const publicUrl = supabase.storage.from('receipts').getPublicUrl(fileName).data.publicUrl;
      const updateData = type === 'receipt' ? { receipt_url: publicUrl } : { odometer_image: publicUrl };

      const { error: dbError } = await supabase.from('vehicle_logs').update(updateData).eq('id', logId);
      if (dbError) throw dbError;

      Alert.alert("Success", "Photo attached!");
      fetchHistory(); 
    } catch (error: any) { Alert.alert("Upload Failed", error.message); } finally { setUploadingId(null); }
  };

  const triggerExport = () => {
      Alert.alert("Export Filtered View", "Export the currently selected data timeframe:", [
          { text: "Cancel", style: "cancel" },
          { text: `This Month (${MONTHS[filterDate.getMonth()]})`, onPress: () => handleExportLedger('month') },
          { text: `This Year (${filterDate.getFullYear()})`, onPress: () => handleExportLedger('year') },
          { text: "All-Time", onPress: () => handleExportLedger('all') }
      ]);
  };

  const handleExportLedger = async (range: 'month' | 'year' | 'all') => {
      let query = supabase.from('vehicle_logs').select('*').order('created_at', { ascending: false });
      
      // Apply Date Ranges
      if (range === 'month') {
          const start = new Date(filterDate.getFullYear(), filterDate.getMonth(), 1).toISOString();
          const end = new Date(filterDate.getFullYear(), filterDate.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
          query = query.gte('created_at', start).lte('created_at', end);
      } else if (range === 'year') {
          const start = new Date(filterDate.getFullYear(), 0, 1).toISOString();
          const end = new Date(filterDate.getFullYear(), 11, 31, 23, 59, 59, 999).toISOString();
          query = query.gte('created_at', start).lte('created_at', end);
      }

      // Apply Pill Filters to Export
      if (selectedVehicle !== 'ALL') query = query.eq('vehicle_id', selectedVehicle);
      if (selectedJobFilter === 'ALL_BIZ') query = query.eq('is_business', true);
      else if (selectedJobFilter === 'ALL_PERS') query = query.eq('is_business', false);
      else if (selectedJobFilter !== 'ALL') query = query.eq('job_id', selectedJobFilter);

      const { data, error } = await query;
      if (error || !data || data.length === 0) return Alert.alert("Empty", `No logs to export for this selection.`);

      let csv = `Filtered Ledger Export\nExport Date,${new Date().toLocaleDateString()}\nRange,${range}\n\n`;
      csv += 'Date,Log Type,Tax Category,Project/Job,Vehicle,Total Cost,Tax Extracted,Currency,Vendor/Location,Notes,Digital Receipt Link\n';
      
      data.forEach(l => {
          const date = new Date(l.created_at).toISOString().split('T')[0];
          let type = l.log_type || 'General';
          if (type === 'MAINTENANCE') type = 'Vehicle Repairs & Maintenance';
          if (type === 'MATERIALS') type = 'Materials & Supplies';
          if (type === 'FUEL') type = 'Fuel & Oil';

          const taxCat = l.is_business ? 'Business (Deductible)' : 'Personal';
          const job = (l.job_name || 'General').replace(/,/g, ' ');
          const vehicle = (l.vehicle_name || 'N/A').replace(/,/g, ' ');
          const cost = l.cost ? l.cost.toFixed(2) : '0.00';
          const gst = l.gst_amount ? l.gst_amount.toFixed(2) : '0.00';
          const currency = l.currency || 'CAD';
          const vendor = (l.vendor || '').replace(/,/g, ' ');
          const notes = (l.notes || '').replace(/,/g, ' ');
          const receipt = l.receipt_url || 'No Image Attached';

          csv += `${date},${type},${taxCat},${job},${vehicle},${cost},${gst},${currency},${vendor},${notes},${receipt}\n`;
      });

      const fileName = `Operators_Protocol_Filtered_${range}.csv`;
      const fileUri = FileSystem.documentDirectory + fileName;
      await FileSystem.writeAsStringAsync(fileUri, csv); 
      
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(fileUri);
      else Alert.alert("Error", "Sharing is not available.");
  };

  let filteredLogs = logs;
  if (selectedVehicle !== 'ALL') filteredLogs = filteredLogs.filter(l => l.vehicle_id?.toString() === selectedVehicle);
  
  if (selectedJobFilter === 'ALL_BIZ') filteredLogs = filteredLogs.filter(l => l.is_business === true);
  else if (selectedJobFilter === 'ALL_PERS') filteredLogs = filteredLogs.filter(l => l.is_business === false);
  else if (selectedJobFilter !== 'ALL') filteredLogs = filteredLogs.filter(l => l.job_id?.toString() === selectedJobFilter);

  const renderLog = ({ item }: any) => {
    const borderColor = item.is_business ? '#4CAF50' : '#9C27B0'; 
    const isFuel = item.log_type === 'FUEL';
    const pricePerUnit = (isFuel && item.liters && item.cost) ? (item.cost / item.liters).toFixed(3) : null;

    return (
      <View style={[styles.card, { borderLeftColor: borderColor }]}>
        <View style={styles.row}>
            <View>
                <Text style={styles.date}>{new Date(item.created_at).toLocaleDateString()} • {item.vehicle_name || 'No Vehicle'}</Text>
                <Text style={[styles.jobTag, {color: borderColor}]}>
                    {item.is_business ? "💼 BUSINESS" : "🏠 PERSONAL"}
                    {item.job_name ? ` • ${item.job_name}` : ''}
                </Text>
            </View>
            <View style={{alignItems: 'flex-end', flexDirection: 'row'}}>
                <TouchableOpacity onPress={() => editLog(item.id)} style={{marginRight: 15, marginTop: 5}}>
                    <Ionicons name="pencil-outline" size={20} color="#888" />
                </TouchableOpacity>
                <View style={{alignItems: 'flex-end'}}>
                    <Text style={styles.cost}>${item.cost.toFixed(2)}</Text>
                    <TouchableOpacity onPress={() => handleDeleteLog(item.id)} style={{marginTop: 8}}>
                        <Ionicons name="trash-outline" size={18} color="#FF5252" />
                    </TouchableOpacity>
                </View>
            </View>
        </View>
        
        {item.vendor ? <Text style={styles.vendor}>📍 {item.vendor}</Text> : null}
        {item.notes ? <Text style={styles.notes}>"{item.notes}"</Text> : null}

        <View style={styles.footer}>
             <Text style={styles.detailText}>
                 {isFuel ? `⛽ Fuel: ${item.liters || 0} Vol ${pricePerUnit ? `($${pricePerUnit}/Vol)` : ''}` : item.log_type === 'LABOUR' ? `⏱️ LABOUR` : item.log_type === 'MAINTENANCE' ? `🔧 REPAIRS & MAINT.` : `🧱 MATERIALS & SUPPLIES`}
             </Text>
             <Text style={styles.detailText}>{item.odometer ? `${item.odometer} dist` : ''}</Text>
        </View>

        <View style={{flexDirection: 'row', marginTop: 10}}>
            {item.receipt_url ? (
                <TouchableOpacity style={[styles.receiptBtn, {backgroundColor: borderColor, marginRight: 10}]} onPress={() => setViewPhoto(item.receipt_url)}>
                    <Text style={styles.btnText}>📄 RECEIPT</Text>
                </TouchableOpacity>
            ) : (
                <TouchableOpacity style={[styles.receiptBtn, styles.dashedBtn, {marginRight: 10}]} onPress={() => handleAttachPhoto(item.id, 'receipt')} disabled={uploadingId === `${item.id}-receipt`}>
                    {uploadingId === `${item.id}-receipt` ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.btnText}>📎 ATTACH</Text>}
                </TouchableOpacity>
            )}
            
            {item.odometer_image ? (
                <TouchableOpacity style={[styles.receiptBtn, {backgroundColor: '#555'}]} onPress={() => setViewPhoto(item.odometer_image)}>
                    <Text style={styles.btnText}>📸 ODO PIC</Text>
                </TouchableOpacity>
            ) : item.log_type !== 'MATERIALS' ? (
                <TouchableOpacity style={[styles.receiptBtn, styles.dashedBtn]} onPress={() => handleAttachPhoto(item.id, 'odometer')} disabled={uploadingId === `${item.id}-odometer`}>
                    {uploadingId === `${item.id}-odometer` ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.btnText}>📎 ODO PIC</Text>}
                </TouchableOpacity>
            ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.header}>LOG HISTORY</Text>
        <TouchableOpacity onPress={triggerExport} style={styles.exportBtn}>
            <Text style={{color: '#FFF', fontWeight: 'bold', fontSize: 12}}>📤 EXPORT CURRENT</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
          <TouchableOpacity onPress={handlePrevMonth} style={styles.arrowBtn}><Ionicons name="chevron-back" size={24} color="#FF9800" /></TouchableOpacity>
          <Text style={styles.monthText}>{MONTHS[filterDate.getMonth()]} {filterDate.getFullYear()}</Text>
          <TouchableOpacity onPress={handleNextMonth} style={styles.arrowBtn}><Ionicons name="chevron-forward" size={24} color="#FF9800" /></TouchableOpacity>
      </View>

      <View style={{ marginBottom: 15 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 10, paddingRight: 20 }}>
              <TouchableOpacity style={[styles.pill, selectedVehicle === 'ALL' && styles.pillActive]} onPress={() => setSelectedVehicle('ALL')}><Text style={[styles.pillText, selectedVehicle === 'ALL' && styles.pillTextActive]}>ALL FLEET</Text></TouchableOpacity>
              {vehicles.map(v => (
                  <TouchableOpacity key={v.id} style={[styles.pill, selectedVehicle === v.id.toString() && styles.pillActive]} onPress={() => setSelectedVehicle(v.id.toString())}>
                      <Text style={[styles.pillText, selectedVehicle === v.id.toString() && styles.pillTextActive]}>{v.name}</Text>
                  </TouchableOpacity>
              ))}
          </ScrollView>
      </View>

      <View style={{ marginBottom: 20 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 10, paddingRight: 20 }}>
              <TouchableOpacity style={[styles.pill, selectedJobFilter === 'ALL' && styles.pillActive]} onPress={() => setSelectedJobFilter('ALL')}><Text style={[styles.pillText, selectedJobFilter === 'ALL' && styles.pillTextActive]}>ALL</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.pill, selectedJobFilter === 'ALL_BIZ' && styles.pillActive]} onPress={() => setSelectedJobFilter('ALL_BIZ')}><Text style={[styles.pillText, selectedJobFilter === 'ALL_BIZ' && styles.pillTextActive]}>💼 ALL BIZ</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.pill, selectedJobFilter === 'ALL_PERS' && styles.pillActive]} onPress={() => setSelectedJobFilter('ALL_PERS')}><Text style={[styles.pillText, selectedJobFilter === 'ALL_PERS' && styles.pillTextActive]}>🏠 ALL PERS</Text></TouchableOpacity>
              {jobs.map(j => (
                  <TouchableOpacity key={j.id} style={[styles.pill, selectedJobFilter === j.id.toString() && styles.pillActive]} onPress={() => setSelectedJobFilter(j.id.toString())}>
                      <Text style={[styles.pillText, selectedJobFilter === j.id.toString() && styles.pillTextActive]}>{j.name}</Text>
                  </TouchableOpacity>
              ))}
          </ScrollView>
      </View>
      
      <FlatList
        data={filteredLogs}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderLog}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchHistory} tintColor="#FF9800" />}
        ListEmptyComponent={<Text style={styles.emptyText}>No logs found.</Text>}
      />

      <Modal visible={!!viewPhoto} transparent={true} animationType="fade">
        <View style={styles.modalBackground}>
          <TouchableOpacity style={styles.closeButton} onPress={() => setViewPhoto(null)}><Ionicons name="close-circle" size={40} color="#FFF" /></TouchableOpacity>
          {viewPhoto && <Image source={{ uri: viewPhoto }} style={styles.fullImage} resizeMode="contain" />}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', paddingTop: 60, paddingHorizontal: 20 },
  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  header: { color: '#FFF', fontSize: 24, fontWeight: 'bold' },
  exportBtn: { backgroundColor: '#333', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#555' },
  filterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1E1E1E', padding: 15, borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: '#333' },
  arrowBtn: { paddingHorizontal: 10 }, monthText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  pill: { backgroundColor: '#1E1E1E', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: '#333', justifyContent: 'center', alignSelf: 'flex-start', flexShrink: 0 },
  pillActive: { backgroundColor: '#FF9800', borderColor: '#FF9800' },
  pillText: { color: '#888', fontWeight: 'bold', fontSize: 10 },
  pillTextActive: { color: '#000' },
  emptyText: { color: '#666', textAlign: 'center', marginTop: 40, fontSize: 16 },
  card: { backgroundColor: '#1E1E1E', padding: 20, borderRadius: 15, marginBottom: 15, borderLeftWidth: 5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  date: { color: '#888', fontSize: 12, marginBottom: 4 }, jobTag: { fontSize: 10, fontWeight: 'bold', marginTop: 2 },
  cost: { color: '#FFF', fontSize: 24, fontWeight: 'bold' }, vendor: { color: '#AAA', fontSize: 12, marginBottom: 4, fontWeight: 'bold' },
  notes: { color: '#CCC', fontStyle: 'italic', marginBottom: 10, fontSize: 14 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#333', paddingTop: 10 },
  detailText: { color: '#888', fontSize: 12, fontWeight: 'bold' },
  receiptBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, alignItems: 'center', justifyContent: 'center', flex: 1 },
  dashedBtn: { backgroundColor: '#333', borderWidth: 1, borderColor: '#555', borderStyle: 'dashed' },
  btnText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  modalBackground: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  fullImage: { width: '90%', height: '80%' }, closeButton: { position: 'absolute', top: 50, right: 20, zIndex: 10 }
});
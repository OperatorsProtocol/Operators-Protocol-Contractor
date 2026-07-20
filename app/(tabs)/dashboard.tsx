import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../supabase';

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function DashboardScreen() {
  const router = useRouter(); 
  const [refreshing, setRefreshing] = useState(false);
  const [filterDate, setFilterDate] = useState(new Date());
  
  const [timeFrame, setTimeFrame] = useState<'MONTH' | '3_MONTHS' | 'YEAR' | 'ALL'>('MONTH');

  const [logs, setLogs] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  
  const [selectedVehicle, setSelectedVehicle] = useState<string>('ALL');
  const [selectedJobFilter, setSelectedJobFilter] = useState<'ALL' | 'ALL_BIZ' | 'ALL_PERS' | string>('ALL');

  const fetchData = async () => {
    setRefreshing(true);

    let logQuery = supabase.from('vehicle_logs').select('*');

    if (timeFrame === 'MONTH') {
        const start = new Date(filterDate.getFullYear(), filterDate.getMonth(), 1).toISOString();
        const end = new Date(filterDate.getFullYear(), filterDate.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
        logQuery = logQuery.gte('created_at', start).lte('created_at', end);
    } else if (timeFrame === '3_MONTHS') {
        const d = new Date();
        d.setMonth(d.getMonth() - 3);
        logQuery = logQuery.gte('created_at', d.toISOString());
    } else if (timeFrame === 'YEAR') {
        const start = new Date(new Date().getFullYear(), 0, 1).toISOString();
        logQuery = logQuery.gte('created_at', start);
    }

    const { data: logData } = await logQuery;
    const { data: vehData } = await supabase.from('vehicles').select('*').order('is_default', {ascending: false});
    const { data: jobData } = await supabase.from('jobs').select('*').eq('is_active', true).order('created_at', { ascending: false });

    if (logData) setLogs(logData);
    if (vehData) setVehicles(vehData);
    if (jobData) setJobs(jobData);

    setRefreshing(false);
  };

  useFocusEffect(useCallback(() => { fetchData(); }, [filterDate, timeFrame]));

  const handlePrevMonth = () => setFilterDate(new Date(filterDate.getFullYear(), filterDate.getMonth() - 1, 1));
  const handleNextMonth = () => setFilterDate(new Date(filterDate.getFullYear(), filterDate.getMonth() + 1, 1));

  let filteredLogs = logs;
  if (selectedVehicle !== 'ALL') filteredLogs = filteredLogs.filter(l => l.vehicle_id?.toString() === selectedVehicle);
  
  if (selectedJobFilter === 'ALL_BIZ') filteredLogs = filteredLogs.filter(l => l.is_business === true);
  else if (selectedJobFilter === 'ALL_PERS') filteredLogs = filteredLogs.filter(l => l.is_business === false);
  else if (selectedJobFilter !== 'ALL') filteredLogs = filteredLogs.filter(l => l.job_id?.toString() === selectedJobFilter);

  let bizTotal = 0; let persTotal = 0; let gstTotal = 0;
  let fuel = 0; let materials = 0; let labour = 0; let repair = 0;

  filteredLogs.forEach(l => {
      const cost = l.cost || 0;
      if (l.is_business) { bizTotal += cost; gstTotal += (l.gst_amount || 0); }
      else persTotal += cost;

      if (l.log_type === 'FUEL') fuel += cost; 
      else if (l.log_type === 'MATERIALS') materials += cost;
      else if (l.log_type === 'LABOUR') labour += cost;
      else if (l.log_type === 'MAINTENANCE') repair += cost;
  });

  let roadDistance = 0; let roadLiters = 0; let roadSpend = 0;
  let equipHours = 0; let equipLiters = 0; let equipSpend = 0;

  vehicles.forEach(v => {
      if (selectedVehicle !== 'ALL' && v.id.toString() !== selectedVehicle) return;
      
      const vLogs = filteredLogs.filter(l => l.vehicle_id === v.id);
      const vOdoLogs = vLogs.filter(l => l.odometer > 0);
      
      // THIS IS THE MATH FIX: Only sum liters for MPG if the tank was actually marked full
      const vFuelVol = vLogs
        .filter(l => l.log_type === 'FUEL' && l.is_full_tank !== false)
        .reduce((sum, l) => sum + (l.liters || 0), 0);
        
      const vTotalSpend = vLogs.reduce((sum, l) => sum + (l.cost || 0), 0);

      let delta = 0;
      if (vOdoLogs.length > 0) {
          const vMax = Math.max(...vOdoLogs.map(l => l.odometer));
          const vMin = Math.min(...vOdoLogs.map(l => l.odometer));
          if (vMax > vMin) delta = vMax - vMin;
          else if (vMax > (v.odometer || 0)) delta = vMax - (v.odometer || 0);
      }

      if (v.is_equipment) {
          equipHours += delta;
          equipLiters += vFuelVol;
          equipSpend += vTotalSpend;
      } else {
          roadDistance += delta;
          roadLiters += vFuelVol;
          roadSpend += vTotalSpend;
      }
  });

  const isEquipmentSelected = selectedVehicle !== 'ALL' && vehicles.find(v => v.id.toString() === selectedVehicle)?.is_equipment;

  let metric1Label = isEquipmentSelected ? "🚜 Machine Hours Logged" : "📏 Distance Logged";
  let metric1Value = isEquipmentSelected ? (equipHours > 0 ? equipHours : 'N/A') : (roadDistance > 0 ? roadDistance.toLocaleString() : 'N/A');

  let metric2Label = isEquipmentSelected ? "💸 Fleet Cost Per Hour" : "💸 Fleet Cost Per Distance";
  let metric2Value = 'N/A';
  if (isEquipmentSelected && equipHours > 0) metric2Value = '$' + (equipSpend / equipHours).toFixed(2);
  else if (!isEquipmentSelected && roadDistance > 0) metric2Value = '$' + (roadSpend / roadDistance).toFixed(2);

  let metric3Label = isEquipmentSelected ? "⛽ Liters per Hour (CA)" : "🍁 Fuel Econ (CA)";
  let metric3Value = 'N/A';
  if (isEquipmentSelected && equipHours > 0 && equipLiters > 0) metric3Value = (equipLiters / equipHours).toFixed(2) + ' L/hr';
  else if (!isEquipmentSelected && roadDistance > 0 && roadLiters > 0) metric3Value = ((roadLiters / roadDistance) * 100).toFixed(1) + ' L/100km';

  let metric4Label = isEquipmentSelected ? "⛽ Gallons per Hour (US)" : "🦅 Fuel Econ (US)";
  let metric4Value = 'N/A';
  if (isEquipmentSelected && equipHours > 0 && equipLiters > 0) metric4Value = ((equipLiters * 0.264172) / equipHours).toFixed(2) + ' Gal/hr';
  else if (!isEquipmentSelected && roadDistance > 0 && roadLiters > 0) metric4Value = (235.215 / ((roadLiters / roadDistance) * 100)).toFixed(1) + ' MPG';

  return (
    <View style={styles.container}>
      
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
          <Text style={{ color: '#FFF', fontSize: 24, fontWeight: 'bold' }}>METRICS</Text>
          <TouchableOpacity onPress={() => router.push('/settings')} style={{ padding: 5 }}>
              <Ionicons name="settings-outline" size={28} color="#888" />
          </TouchableOpacity>
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

      <View style={styles.selectorsWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 5, paddingRight: 20, marginBottom: 10 }}>
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

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 5, paddingRight: 20, marginBottom: 10 }}>
              <TouchableOpacity style={[styles.pill, selectedVehicle === 'ALL' && styles.pillActive]} onPress={() => setSelectedVehicle('ALL')}>
                  <Text style={[styles.pillText, selectedVehicle === 'ALL' && styles.pillTextActive]}>ALL FLEET</Text>
              </TouchableOpacity>
              {vehicles.map(v => (
                  <TouchableOpacity key={v.id} style={[styles.pill, selectedVehicle === v.id.toString() && styles.pillActive]} onPress={() => setSelectedVehicle(v.id.toString())}>
                      <Text style={[styles.pillText, selectedVehicle === v.id.toString() && styles.pillTextActive]}>{v.is_equipment ? '🚜' : '🚙'} {v.name.trim()}</Text>
                  </TouchableOpacity>
              ))}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 5, paddingRight: 20 }}>
              <TouchableOpacity style={[styles.pill, selectedJobFilter === 'ALL' && styles.pillActive]} onPress={() => setSelectedJobFilter('ALL')}>
                <Text style={[styles.pillText, selectedJobFilter === 'ALL' && styles.pillTextActive]}>ALL</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.pill, selectedJobFilter === 'ALL_BIZ' && styles.pillActive]} onPress={() => setSelectedJobFilter('ALL_BIZ')}>
                <Text style={[styles.pillText, selectedJobFilter === 'ALL_BIZ' && styles.pillTextActive]}>💼 ALL BIZ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.pill, selectedJobFilter === 'ALL_PERS' && styles.pillActive]} onPress={() => setSelectedJobFilter('ALL_PERS')}>
                <Text style={[styles.pillText, selectedJobFilter === 'ALL_PERS' && styles.pillTextActive]}>🏠 ALL PERS</Text>
              </TouchableOpacity>
              {jobs.map(j => (
                  <TouchableOpacity key={j.id} style={[styles.pill, selectedJobFilter === j.id.toString() && styles.pillActive]} onPress={() => setSelectedJobFilter(j.id.toString())}>
                      <Text style={[styles.pillText, selectedJobFilter === j.id.toString() && styles.pillTextActive]}>{j.name.trim()}</Text>
                  </TouchableOpacity>
              ))}
          </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchData} tintColor="#FF9800"/>}>
          
          <View style={styles.card}>
              <Text style={styles.cardTitle}>SPEND DATA ({selectedVehicle === 'ALL' && selectedJobFilter === 'ALL' ? 'GLOBAL' : 'ISOLATED'})</Text>
              <View style={styles.splitRow}>
                  <View style={styles.splitHalf}>
                      <Text style={styles.label}>💼 BUSINESS (DEDUCTIBLE)</Text>
                      <Text style={[styles.bigNumber, {color: '#4CAF50'}]}>${bizTotal.toFixed(2)}</Text>
                  </View>
                  <View style={styles.splitHalf}>
                      <Text style={styles.label}>🏠 PERSONAL</Text>
                      <Text style={[styles.bigNumber, {color: '#9C27B0'}]}>${persTotal.toFixed(2)}</Text>
                  </View>
              </View>
              <View style={styles.gstBox}>
                  <Text style={styles.label}>🏦 EXTRACTED TAX (BUSINESS)</Text>
                  <Text style={[styles.bigNumber, {fontSize: 20, color: '#FF9800'}]}>${gstTotal.toFixed(2)}</Text>
              </View>
          </View>

          <View style={styles.card}>
              <Text style={styles.cardTitle}>EFFICIENCY & PERFORMANCE</Text>
              <View style={styles.statRow}><Text style={styles.statLabel}>{metric1Label}</Text><Text style={styles.statValue}>{metric1Value}</Text></View>
              <View style={styles.statRow}><Text style={styles.statLabel}>{metric2Label}</Text><Text style={[styles.statValue, {color: '#4CAF50'}]}>{metric2Value}</Text></View>
              <View style={styles.statRow}><Text style={styles.statLabel}>{metric3Label}</Text><Text style={styles.statValue}>{metric3Value}</Text></View>
              <View style={styles.statRow}><Text style={styles.statLabel}>{metric4Label}</Text><Text style={styles.statValue}>{metric4Value}</Text></View>
          </View>

          <View style={styles.card}>
              <Text style={styles.cardTitle}>CATEGORY BREAKDOWN</Text>
              <View style={styles.statRow}><Text style={styles.statLabel}>⛽ Fuel & Oil</Text><Text style={styles.statValue}>${fuel.toFixed(2)}</Text></View>
              <View style={styles.statRow}><Text style={styles.statLabel}>🧱 Materials</Text><Text style={styles.statValue}>${materials.toFixed(2)}</Text></View>
              <View style={styles.statRow}><Text style={styles.statLabel}>⏱️ Labour</Text><Text style={styles.statValue}>${labour.toFixed(2)}</Text></View>
              <View style={styles.statRow}><Text style={styles.statLabel}>🔧 Repairs & Maint.</Text><Text style={styles.statValue}>${repair.toFixed(2)}</Text></View>
          </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', paddingTop: 60, paddingHorizontal: 20 },
  filterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1E1E1E', padding: 15, borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: '#333' },
  arrowBtn: { paddingHorizontal: 10 }, monthText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  selectorsWrapper: { marginBottom: 20 },
  pill: { backgroundColor: '#1E1E1E', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: '#333', justifyContent: 'center', alignSelf: 'flex-start', flexShrink: 0 },
  pillActive: { backgroundColor: '#FF9800', borderColor: '#FF9800' },
  pillText: { color: '#888', fontWeight: 'bold', fontSize: 10 },
  pillTextActive: { color: '#000' },
  card: { backgroundColor: '#1E1E1E', padding: 20, borderRadius: 15, marginBottom: 15, borderWidth: 1, borderColor: '#333' },
  cardTitle: { color: '#888', fontSize: 12, fontWeight: 'bold', marginBottom: 15, letterSpacing: 1 },
  splitRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  splitHalf: { flex: 1 }, label: { color: '#666', fontSize: 10, fontWeight: 'bold', marginBottom: 5 }, bigNumber: { fontSize: 24, fontWeight: '900' },
  gstBox: { borderTopWidth: 1, borderTopColor: '#333', paddingTop: 15 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  statLabel: { color: '#CCC', fontSize: 14, fontWeight: 'bold' }, statValue: { color: '#FFF', fontSize: 16, fontWeight: 'bold' }
});
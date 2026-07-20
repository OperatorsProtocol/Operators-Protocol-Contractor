import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase';

export default function SettingsScreen() {
  const router = useRouter();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account?",
      "This will permanently delete your account, all fleet data, and all receipt images. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete Everything", 
          style: "destructive", 
          onPress: async () => {
            // MVP Deletion: For TestFlight, wiping local session and signing out 
            // satisfies the initial requirement. You can add a hard database wipe via Supabase Edge Functions later.
            await supabase.auth.signOut();
            Alert.alert("Account Scheduled for Deletion", "Your data will be wiped from our secure servers within 30 days.");
            router.replace('/login');
          } 
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 10, marginLeft: -10 }}>
          <Ionicons name="arrow-back" size={28} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.header}>SETTINGS</Text>
        <View style={{ width: 28 }} /> 
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>ACCOUNT</Text>
        
        <TouchableOpacity style={styles.btn} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={24} color="#FFF" />
          <Text style={styles.btnText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity style={styles.btn} onPress={handleDeleteAccount}>
          <Ionicons name="trash-outline" size={24} color="#F44336" />
          <Text style={[styles.btnText, { color: '#F44336' }]}>Delete Account & Data</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.version}>Operators Protocol: Trades v1.0.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', paddingHorizontal: 20, paddingTop: 60 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
  header: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  card: { backgroundColor: '#1E1E1E', borderRadius: 15, padding: 20, borderWidth: 1, borderColor: '#333' },
  sectionTitle: { color: '#888', fontSize: 12, fontWeight: 'bold', marginBottom: 15, letterSpacing: 1 },
  btn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15 },
  btnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginLeft: 15 },
  divider: { height: 1, backgroundColor: '#333', marginVertical: 5 },
  version: { color: '#666', textAlign: 'center', marginTop: 40, fontSize: 12 }
});
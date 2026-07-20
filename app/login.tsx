import { router } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  async function handleAuth() {
    if (!email || !password) return Alert.alert('Missing Info', 'Please enter your email and password.');
    setLoading(true);

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) Alert.alert('Sign Up Failed', error.message);
      else {
        Alert.alert('Welcome!', 'Account created successfully.');
        setIsSignUp(false);
        router.replace('/onboarding');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) Alert.alert('Login Failed', error.message);
      else router.replace('/(tabs)');
    }
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <View style={styles.brandContainer}>
        <Text style={styles.logo}>OPERATORS</Text>
        <Text style={styles.subLogo}>PROTOCOL</Text>
      </View>

      <View style={styles.formContainer}>
        <Text style={styles.header}>{isSignUp ? 'Create an Account' : 'System Login'}</Text>
        
        <Text style={styles.label}>Email Address</Text>
        <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="journeyman@example.com" placeholderTextColor="#666" autoCapitalize="none" keyboardType="email-address" />

        <Text style={styles.label}>Password</Text>
        <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor="#666" secureTextEntry />

        <TouchableOpacity style={styles.authBtn} onPress={handleAuth} disabled={loading}>
          {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.authBtnText}>{isSignUp ? 'INITIALIZE ACCOUNT' : 'ACCESS VAULT'}</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)} style={styles.toggleContainer}>
          <Text style={styles.toggleText}>{isSignUp ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', justifyContent: 'center', padding: 20 },
  brandContainer: { alignItems: 'center', marginBottom: 50 },
  logo: { fontSize: 42, fontWeight: '900', color: '#FFF', letterSpacing: 2 },
  subLogo: { fontSize: 18, fontWeight: 'bold', color: '#FF9800', letterSpacing: 5, marginTop: -5 },
  formContainer: { backgroundColor: '#1E1E1E', padding: 25, borderRadius: 15, borderWidth: 1, borderColor: '#333' },
  header: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  label: { color: '#888', fontSize: 12, fontWeight: 'bold', marginBottom: 8 },
  input: { backgroundColor: '#121212', color: '#FFF', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#333', fontSize: 16, marginBottom: 20 },
  authBtn: { backgroundColor: '#FF9800', padding: 18, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  authBtnText: { fontWeight: 'bold', color: '#000', fontSize: 16, letterSpacing: 1 },
  toggleContainer: { marginTop: 25, alignItems: 'center' }, toggleText: { color: '#888', fontWeight: 'bold', fontSize: 14 },
});
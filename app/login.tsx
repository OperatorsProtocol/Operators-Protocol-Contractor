import { router } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  // Reset Password States
  const [isResetting, setIsResetting] = useState(false);
  const [resetStep, setResetStep] = useState<'REQUEST' | 'VERIFY'>('REQUEST');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');

  async function handleAuth() {
    if (!email) return Alert.alert('Missing Info', 'Please enter your email address.');
    if (!isSignUp && !password) return Alert.alert('Missing Info', 'Please enter your password.');
    
    setLoading(true);

    if (isSignUp) {
      if (!password) {
        setLoading(false);
        return Alert.alert('Missing Info', 'Please enter a password to sign up.');
      }
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

  async function handleSendResetCode() {
    if (!email) {
      return Alert.alert('Enter Email', 'Please enter your email address above first.');
    }

    try {
      setLoading(true);
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) throw error;
      Alert.alert('Code Sent', 'Check your email for the 6-digit reset code.');
      setResetStep('VERIFY');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send password reset code.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyAndReset() {
    if (!resetCode || !newPassword) {
      return Alert.alert('Missing Info', 'Please enter both the 6-digit code and your new password.');
    }

    try {
      setLoading(true);
      // 1. Verify the 6-digit recovery OTP
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: resetCode.trim(),
        type: 'recovery',
      });
      if (verifyError) throw verifyError;

      // 2. Update the password once verified
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw updateError;

      Alert.alert('Success', 'Your password has been reset successfully. You can now log in.');
      setIsResetting(false);
      setResetStep('REQUEST');
      setResetCode('');
      setNewPassword('');
    } catch (error: any) {
      Alert.alert('Reset Failed', error.message || 'Invalid code or failed to update password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <View style={styles.brandContainer}>
        <Text style={styles.logo}>OPERATORS</Text>
        <Text style={styles.subLogo}>PROTOCOL</Text>
      </View>

      <View style={styles.formContainer}>
        <Text style={styles.header}>
          {isResetting ? 'Reset Password' : isSignUp ? 'Create an Account' : 'System Login'}
        </Text>
        
        <Text style={styles.label}>Email Address</Text>
        <TextInput 
          style={[styles.input, isResetting && resetStep === 'VERIFY' && { opacity: 0.6 }]} 
          value={email} 
          onChangeText={setEmail} 
          placeholder="journeyman@example.com" 
          placeholderTextColor="#666" 
          autoCapitalize="none" 
          keyboardType="email-address" 
          editable={!isResetting || resetStep === 'REQUEST'}
        />

        {/* NORMAL LOGIN / SIGNUP VIEW */}
        {!isResetting && (
          <>
            <Text style={styles.label}>Password</Text>
            <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor="#666" secureTextEntry />

            <TouchableOpacity style={styles.authBtn} onPress={handleAuth} disabled={loading}>
              {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.authBtnText}>{isSignUp ? 'INITIALIZE ACCOUNT' : 'ACCESS VAULT'}</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setIsResetting(true)} style={styles.forgotContainer}>
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)} style={styles.toggleContainer}>
              <Text style={styles.toggleText}>{isSignUp ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}</Text>
            </TouchableOpacity>
          </>
        )}

        {/* PASSWORD RESET FLOW */}
        {isResetting && resetStep === 'REQUEST' && (
          <>
            <TouchableOpacity style={styles.authBtn} onPress={handleSendResetCode} disabled={loading}>
              {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.authBtnText}>SEND 6-DIGIT CODE</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => { setIsResetting(false); setResetStep('REQUEST'); }} style={styles.forgotContainer}>
              <Text style={styles.forgotText}>Back to Login</Text>
            </TouchableOpacity>
          </>
        )}

        {isResetting && resetStep === 'VERIFY' && (
          <>
            <Text style={styles.label}>6-Digit Code from Email</Text>
            <TextInput style={styles.input} value={resetCode} onChangeText={setResetCode} placeholder="123456" placeholderTextColor="#666" keyboardType="number-pad" />

            <Text style={styles.label}>New Password</Text>
            <TextInput style={styles.input} value={newPassword} onChangeText={setNewPassword} placeholder="••••••••" placeholderTextColor="#666" secureTextEntry />

            <TouchableOpacity style={styles.authBtn} onPress={handleVerifyAndReset} disabled={loading}>
              {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.authBtnText}>UPDATE PASSWORD</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => { setIsResetting(false); setResetStep('REQUEST'); }} style={styles.forgotContainer}>
              <Text style={styles.forgotText}>Cancel / Back to Login</Text>
            </TouchableOpacity>
          </>
        )}

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
  forgotContainer: { marginTop: 15, alignItems: 'center' },
  forgotText: { color: '#FF9800', fontSize: 13, fontWeight: 'bold' },
  toggleContainer: { marginTop: 25, alignItems: 'center' }, 
  toggleText: { color: '#888', fontWeight: 'bold', fontSize: 14 },
});
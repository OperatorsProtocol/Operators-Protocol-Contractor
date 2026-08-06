import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { supabase } from '../supabase';

// Keep the native splash screen visible while we calculate the routing
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [session, setSession] = useState<any>(null);
  const [isReady, setIsReady] = useState(false);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);
  
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState(); 

  // 1. Fetch initial state from device memory and Supabase
  useEffect(() => {
    // --- REVENUECAT INITIALIZATION ---
    if (Platform.OS === 'ios') {
      Purchases.configure({ apiKey: 'appl_lgKvKPPqhlvgSHBVGSNWkMkoRfp' });
    } else if (Platform.OS === 'android') {
      Purchases.configure({ apiKey: 'goog_RpQNNwaPVxvarJLCHCDShGJpDWQ' });
    }
    // ----------------------------------

    const fetchState = async () => {
      const [seenStr, { data: { session: currentSession } }] = await Promise.all([
        AsyncStorage.getItem('hasSeenOnboarding'),
        supabase.auth.getSession()
      ]);

      setHasSeenOnboarding(seenStr === 'true');
      setSession(currentSession);
      setIsReady(true); 
    };

    fetchState();

    // Listen for sign outs / sign ins
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 2. The Traffic Cop
  useEffect(() => {
    // Wait until we have the auth data AND the router is fully awake
    if (!isReady || !navigationState?.key) return;

    const inOnboarding = String(segments[0]) === 'onboarding';
    const inLogin = String(segments[0]) === 'login';
    const inPaywall = String(segments[0]) === 'paywall'; // <-- Added Paywall check

    // RULE 1: If they are logged in, get them into the app (Tabs).
    if (session && (inLogin || inOnboarding || inPaywall)) {
      router.replace('/(tabs)');
    } 
    // RULE 2: Not logged in, haven't seen slides, and not actively on slides, login, or paywall
    else if (!session && !hasSeenOnboarding && !inOnboarding && !inLogin && !inPaywall) {
      router.replace('/onboarding');
    } 
    // RULE 3: Not logged in, HAVE seen slides, and not in login or paywall
    else if (!session && hasSeenOnboarding && !inLogin && !inPaywall) {
      router.replace('/login');
    }

    // Routing is decided. Drop the splash screen!
    SplashScreen.hideAsync();

  }, [session, isReady, segments, navigationState?.key, hasSeenOnboarding]);

  // Render the stack wrapped in Safe Area for Android navigation buttons
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="login" options={{ presentation: 'modal' }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal' }} /> {/* <-- Added Paywall Screen */}
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="settings" />
      </Stack>
    </SafeAreaProvider>
  );
}
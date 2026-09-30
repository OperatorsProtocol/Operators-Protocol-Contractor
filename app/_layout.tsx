import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import Purchases from 'react-native-purchases';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { supabase } from '../supabase';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [appState, setAppState] = useState<'CHECKING' | 'ONBOARDING' | 'LOGGED_OUT' | 'PAYWALL' | 'AUTHORIZED'>('CHECKING');
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    let isMounted = true;

    const checkUserAccess = async (currentSession: any) => {
      if (!currentSession?.user) {
         await AsyncStorage.removeItem('hasActiveSubscription');
         const seen = await AsyncStorage.getItem('hasSeenOnboarding');
         if (isMounted) setAppState(seen === 'true' ? 'LOGGED_OUT' : 'ONBOARDING');
         return;
      }

      try {
         await Purchases.logIn(currentSession.user.id);
         const customerInfo = await Purchases.getCustomerInfo();
         const active = Object.keys(customerInfo.entitlements.active).length > 0;
         
         if (active) {
            await AsyncStorage.setItem('hasActiveSubscription', 'true');
            if (isMounted) setAppState('AUTHORIZED');
         } else {
            await AsyncStorage.removeItem('hasActiveSubscription');
            if (isMounted) setAppState('PAYWALL');
         }
      } catch (e) {
         const cachedSub = await AsyncStorage.getItem('hasActiveSubscription');
         if (cachedSub === 'true' && isMounted) {
             setAppState('AUTHORIZED');
         } else if (isMounted) {
             setAppState('PAYWALL');
         }
      }
    };

    const initApp = async () => {
      try {
        if (Platform.OS === 'ios') Purchases.configure({ apiKey: 'appl_lgKvKPPqhlvgSHBVGSNWkMkoRfp' });
        else if (Platform.OS === 'android') Purchases.configure({ apiKey: 'goog_RpQNNwaPVxvarJLCHCDShGJpDWQ' });
      } catch (e) {}

      const { data: { session } } = await supabase.auth.getSession();
      await checkUserAccess(session);
    };

    initApp();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (event === 'SIGNED_IN') {
          setAppState('CHECKING'); 
          await checkUserAccess(newSession);
      } else if (event === 'SIGNED_OUT') {
          await AsyncStorage.removeItem('hasActiveSubscription');
          const seen = await AsyncStorage.getItem('hasSeenOnboarding');
          setAppState(seen === 'true' ? 'LOGGED_OUT' : 'ONBOARDING');
      }
    });

    Purchases.addCustomerInfoUpdateListener((customerInfo) => {
        const active = Object.keys(customerInfo.entitlements.active).length > 0;
        if (active && isMounted) {
            AsyncStorage.setItem('hasActiveSubscription', 'true');
            setAppState('AUTHORIZED');
        }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (appState === 'CHECKING') return;

    const rootSegment = segments[0];

    if (appState === 'ONBOARDING' && rootSegment !== 'onboarding' && rootSegment !== 'login') router.replace('/onboarding');
    else if (appState === 'LOGGED_OUT' && rootSegment !== 'login' && rootSegment !== 'onboarding') router.replace('/login');
    else if (appState === 'PAYWALL' && rootSegment !== 'paywall') router.replace('/paywall');
    else if (appState === 'AUTHORIZED' && rootSegment !== '(tabs)') router.replace('/(tabs)');

    SplashScreen.hideAsync();
  }, [appState, segments]);

  if (appState === 'CHECKING') {
      return (
          <View style={{ flex: 1, backgroundColor: '#121212', justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#FF9800" />
          </View>
      );
  }

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="login" options={{ presentation: 'modal' }} />
        <Stack.Screen name="paywall" options={{ gestureEnabled: false }} />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </SafeAreaProvider>
  );
}
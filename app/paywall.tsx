import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Purchases, { PurchasesPackage } from 'react-native-purchases';

export default function PaywallScreen() {
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const router = useRouter();

  // Fetch the Offerings from RevenueCat when the screen loads
  useEffect(() => {
    const getPackages = async () => {
      try {
        // Safety check: If they somehow got here but are already subscribed, let them in.
        const customerInfo = await Purchases.getCustomerInfo();
        if (Object.keys(customerInfo.entitlements.active).length > 0) {
          router.replace('/(tabs)');
          return;
        }

        const offerings = await Purchases.getOfferings();
        if (offerings.current !== null && offerings.current.availablePackages.length !== 0) {
          setPackages(offerings.current.availablePackages);
        }
      } catch (e: any) {
        console.log('Error fetching offers', e.message);
      }
    };

    getPackages();
  }, []);

  // The function that runs when they press "Subscribe"
  const purchasePackage = async (pack: PurchasesPackage) => {
    try {
      setIsPurchasing(true);
      const { customerInfo } = await Purchases.purchasePackage(pack);

      // Check for ANY active entitlement, bypassing the need for exact naming
      if (Object.keys(customerInfo.entitlements.active).length > 0) {
        router.replace('/(tabs)'); 
      }
    } catch (e: any) {
      if (!e.userCancelled) {
        // FIX: If RevenueCat says "Already Subscribed" (throws an error), catch it here!
        const customerInfo = await Purchases.getCustomerInfo();
        if (Object.keys(customerInfo.entitlements.active).length > 0) {
          router.replace('/(tabs)');
        } else {
          Alert.alert('Purchase Error', e.message);
        }
      }
    } finally {
      setIsPurchasing(false);
    }
  };

  // REQUIRED BY APPLE & GOOGLE: Restore Purchases
  const restorePurchases = async () => {
    try {
      setIsPurchasing(true);
      const customerInfo = await Purchases.restorePurchases();
      
      if (Object.keys(customerInfo.entitlements.active).length > 0) {
        router.replace('/(tabs)');
      } else {
        Alert.alert("No Subscription Found", "We couldn't find an active subscription tied to your account.");
      }
    } catch (e: any) {
      Alert.alert('Restore Error', e.message);
    } finally {
      setIsPurchasing(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Unlock Full Access</Text>
      <Text style={styles.subtitle}>
        Operators Protocol requires an active subscription to log mileage, track expenses, and manage project vaults.
      </Text>

      <View style={styles.featureBox}>
        <Text style={styles.featureItem}>✓ Unlimited Business & Personal Mileage Logs</Text>
        <Text style={styles.featureItem}>✓ OCR Receipt & Fuel Odometer Scanning</Text>
        <Text style={styles.featureItem}>✓ Tax & CRA/IRS Compliant CSV Exports</Text>
        <Text style={styles.featureItem}>✓ Automated Vehicle Fleet Cost Metrics</Text>
      </View>

      {packages.length === 0 ? (
        <ActivityIndicator size="large" color="#FF9800" style={{ marginTop: 20 }} />
      ) : (
        packages.map((pack) => (
          <TouchableOpacity 
            key={pack.identifier} 
            style={styles.purchaseButton}
            onPress={() => purchasePackage(pack)}
            disabled={isPurchasing}
          >
            <Text style={styles.buttonText}>
              {isPurchasing ? "Processing..." : `SUBSCRIBE NOW • ${pack.product.priceString}/mo`}
            </Text>
          </TouchableOpacity>
        ))
      )}
      
      {/* REQUIRED BY APPLE */}
      <TouchableOpacity onPress={restorePurchases} style={styles.restoreButton}>
        <Text style={styles.restoreText}>Already subscribed? Restore Purchases</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', justifyContent: 'center', alignItems: 'center', padding: 30 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#ffffff', marginBottom: 15, textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#aaaaaa', textAlign: 'center', marginBottom: 30, lineHeight: 20 },
  featureBox: { backgroundColor: '#1E1E1E', padding: 20, borderRadius: 15, width: '100%', marginBottom: 30, borderWidth: 1, borderColor: '#333' },
  featureItem: { color: '#FFF', fontSize: 14, fontWeight: 'bold', marginBottom: 12 },
  purchaseButton: { backgroundColor: '#FF9800', paddingVertical: 18, borderRadius: 12, width: '100%', alignItems: 'center', marginBottom: 15 },
  buttonText: { color: '#000000', fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },
  restoreButton: { padding: 15, marginTop: 10 },
  restoreText: { color: '#888888', fontSize: 14, textDecorationLine: 'underline' }
});
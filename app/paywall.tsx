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
        const offerings = await Purchases.getOfferings();
        if (offerings.current !== null && offerings.current.availablePackages.length !== 0) {
          setPackages(offerings.current.availablePackages);
        }
      } catch (e: any) {
        Alert.alert('Error fetching offers', e.message);
      }
    };

    getPackages();
  }, []);

  // The function that runs when they press "Subscribe"
  const purchasePackage = async (pack: PurchasesPackage) => {
    try {
      setIsPurchasing(true);
      const { customerInfo } = await Purchases.purchasePackage(pack);

      if (typeof customerInfo.entitlements.active['premium_access'] !== "undefined") {
        Alert.alert("Success!", "Welcome to Premium.");
        router.back(); 
      }
    } catch (e: any) {
      if (!e.userCancelled) {
        Alert.alert('Purchase Error', e.message);
      }
    } finally {
      setIsPurchasing(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Upgrade to Premium</Text>
      <Text style={styles.subtitle}>Unlock all features and maximize your workflow.</Text>

      {packages.length === 0 ? (
        <ActivityIndicator size="large" color="#007bff" style={{ marginTop: 20 }} />
      ) : (
        packages.map((pack) => (
          <TouchableOpacity 
            key={pack.identifier} 
            style={styles.purchaseButton}
            onPress={() => purchasePackage(pack)}
            disabled={isPurchasing}
          >
            <Text style={styles.buttonText}>
              {isPurchasing ? "Processing..." : `Subscribe ${pack.product.priceString} / mo`}
            </Text>
          </TouchableOpacity>
        ))
      )}
      
      <TouchableOpacity onPress={() => router.back()} style={styles.cancelButton}>
        <Text style={styles.cancelText}>Not right now</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#ffffff', marginBottom: 10 },
  subtitle: { fontSize: 16, color: '#aaaaaa', textAlign: 'center', marginBottom: 40 },
  purchaseButton: { backgroundColor: '#007bff', paddingVertical: 15, paddingHorizontal: 40, borderRadius: 8, width: '100%', alignItems: 'center', marginBottom: 15 },
  buttonText: { color: '#ffffff', fontSize: 18, fontWeight: '600' },
  cancelButton: { padding: 15 },
  cancelText: { color: '#aaaaaa', fontSize: 16 }
});
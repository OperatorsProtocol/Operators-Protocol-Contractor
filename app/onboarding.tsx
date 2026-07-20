import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    id: '1',
    title: 'DITCH THE SHOEBOX',
    description: 'Stop losing money to faded receipts, forgotten miles, and the year-end tax panic. Every untracked expense is money out of your pocket.',
    icon: 'archive-outline',
    color: '#F44336'
  },
  {
    id: '2',
    title: '10-SECOND LOGGING',
    description: 'Snap a photo at the pump or the hardware store. Our AI instantly extracts the cost, tax, and odometer. Fuel, materials, repairs, and labour—tracked before you leave the lot.',
    icon: 'flash-outline',
    color: '#FF9800'
  },
  {
    id: '3',
    title: 'AUDIT-PROOF LOGS',
    description: 'Export CRA & IRS-ready Excel ledgers for your accountant in one tap. Print comprehensive digital service histories to maximize your fleet\'s resale value.',
    icon: 'document-text-outline',
    color: '#4CAF50'
  }
];

export default function OnboardingScreen() {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);

  // Mark onboarding as complete and go to Login
  const completeOnboarding = async () => {
    try {
      await AsyncStorage.setItem('hasSeenOnboarding', 'true');
      router.replace('/login'); 
    } catch (error) {
      console.log('Error saving onboarding status:', error);
      router.replace('/login'); // Failsafe: send to login anyway
    }
  };

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      completeOnboarding();
    }
  };

  const slide = SLIDES[currentIndex];

  return (
    <View style={styles.container}>
      
      {/* SKIP BUTTON */}
      <TouchableOpacity style={styles.skipBtn} onPress={completeOnboarding}>
        <Text style={styles.skipText}>SKIP</Text>
      </TouchableOpacity>

      {/* CONTENT */}
      <View style={styles.content}>
        <View style={[styles.iconContainer, { borderColor: slide.color }]}>
          <Ionicons name={slide.icon as any} size={80} color={slide.color} />
        </View>
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.description}>{slide.description}</Text>
      </View>

      {/* FOOTER */}
      <View style={styles.footer}>
        <View style={styles.dotContainer}>
          {SLIDES.map((_, index) => (
            <View 
              key={index} 
              style={[
                styles.dot, 
                currentIndex === index ? [styles.dotActive, { backgroundColor: slide.color }] : null
              ]} 
            />
          ))}
        </View>

        <TouchableOpacity 
            style={[styles.nextBtn, { backgroundColor: currentIndex === SLIDES.length - 1 ? '#4CAF50' : '#FF9800' }]} 
            onPress={handleNext}
        >
          <Text style={styles.nextText}>
            {currentIndex === SLIDES.length - 1 ? "GET STARTED" : "NEXT"}
          </Text>
        </TouchableOpacity>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  skipBtn: { position: 'absolute', top: 60, right: 20, zIndex: 10 },
  skipText: { color: '#888', fontWeight: 'bold', fontSize: 14, letterSpacing: 1 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 },
  iconContainer: { width: 160, height: 160, borderRadius: 80, borderWidth: 4, justifyContent: 'center', alignItems: 'center', marginBottom: 40, backgroundColor: '#1E1E1E' },
  title: { color: '#FFF', fontSize: 28, fontWeight: '900', marginBottom: 15, textAlign: 'center', letterSpacing: 1 },
  description: { color: '#AAA', fontSize: 16, textAlign: 'center', lineHeight: 24 },
  footer: { paddingHorizontal: 30, paddingBottom: 60 },
  dotContainer: { flexDirection: 'row', justifyContent: 'center', marginBottom: 30 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#333', marginHorizontal: 5 },
  dotActive: { width: 20 },
  nextBtn: { paddingVertical: 18, borderRadius: 12, alignItems: 'center' },
  nextText: { color: '#000', fontSize: 16, fontWeight: 'bold', letterSpacing: 1 }
});
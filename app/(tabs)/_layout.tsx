import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  // This automatically measures the height of the Android 3-buttons or iPhone notch
  const insets = useSafeAreaInsets(); 

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#1E1E1E',
          borderTopColor: '#333',
          // Base height of 60 PLUS the exact height of the system buttons
          height: 60 + insets.bottom,
          // Push the icons up by the exact height of the system buttons
          paddingBottom: insets.bottom,
        },
        tabBarActiveTintColor: '#FF9800',
        tabBarInactiveTintColor: '#888',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Scanner',
          tabBarIcon: ({ color, size }) => <Ionicons name="scan" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Metrics',
          tabBarIcon: ({ color, size }) => <Ionicons name="bar-chart" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color, size }) => <Ionicons name="list" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="jobs"
        options={{
          title: 'Projects',
          tabBarIcon: ({ color, size }) => <Ionicons name="briefcase" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="vehicles"
        options={{
          title: 'Fleet',
          tabBarIcon: ({ color, size }) => <Ionicons name="car-sport" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
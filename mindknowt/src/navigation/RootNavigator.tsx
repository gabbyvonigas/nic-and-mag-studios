import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet, Text } from 'react-native';

import { AlarmScreen } from '../screens/AlarmScreen';
import { AddKnowtScreen } from '../screens/AddKnowtScreen';
import { AllKnowtsScreen } from '../screens/AllKnowtsScreen';
import { DevScreen } from '../screens/DevScreen';
import { KnowtDetailScreen } from '../screens/KnowtDetailScreen';
import { RingingScreen } from '../screens/RingingScreen';
import { ScanScreen } from '../screens/ScanScreen';
import { TodayScreen } from '../screens/TodayScreen';
import { theme } from '../theme';
import type { RootStackParamList, TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function tabIcon(label: string) {
  return function TabLabel({ color }: { color: string }) {
    return <Text style={[styles.tabLabel, { color }]}>{label}</Text>;
  };
}

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.color.textPrimary,
        tabBarInactiveTintColor: theme.color.textMuted,
        tabBarStyle: styles.tabBar,
      }}>
      <Tab.Screen
        name="Today"
        component={TodayScreen}
        options={{ tabBarIcon: tabIcon('Today'), tabBarLabel: () => null }}
      />
      <Tab.Screen
        name="AllKnowts"
        component={AllKnowtsScreen}
        options={{ tabBarIcon: tabIcon('Knowts'), tabBarLabel: () => null }}
      />
      <Tab.Screen
        name="Dev"
        component={DevScreen}
        options={{ tabBarIcon: tabIcon('Dev'), tabBarLabel: () => null }}
      />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={Tabs} />
      <Stack.Screen
        name="AddKnowt"
        component={AddKnowtScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen name="KnowtDetail" component={KnowtDetailScreen} />
      <Stack.Screen
        name="Ringing"
        component={RingingScreen}
        options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
      />
      <Stack.Screen name="NfcHarness" component={ScanScreen} />
      <Stack.Screen name="AlarmHarness" component={AlarmScreen} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: theme.color.background,
    borderTopColor: theme.color.border,
  },
  tabLabel: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    fontWeight: theme.font.weight.medium,
  },
});

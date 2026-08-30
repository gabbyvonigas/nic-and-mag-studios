import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet } from 'react-native';

import { AlarmScreen } from '../screens/AlarmScreen';
import { AddKnowtScreen } from '../screens/AddKnowtScreen';
import { AllKnowtsScreen } from '../screens/AllKnowtsScreen';
import { ApplySetScreen } from '../screens/ApplySetScreen';
import { BrowseSetsScreen } from '../screens/BrowseSetsScreen';
import { DevScreen } from '../screens/DevScreen';
import { LegalDocumentScreen } from '../screens/LegalDocumentScreen';
import { LegalScreen } from '../screens/LegalScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { KnowtDetailScreen } from '../screens/KnowtDetailScreen';
import { RingingScreen } from '../screens/RingingScreen';
import { ScanScreen } from '../screens/ScanScreen';
import { TodayScreen } from '../screens/TodayScreen';
import { theme } from '../theme';
import type { RootStackParamList, TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.color.textPrimary,
        tabBarInactiveTintColor: theme.color.textMuted,
        tabBarStyle: styles.tabBar,
        // There are no icons, so the label is the whole control. Rendering text
        // through tabBarIcon clips it, because the icon slot is sized for a glyph.
        tabBarIconStyle: styles.hidden,
        tabBarLabelStyle: styles.tabLabel,
      }}>
      <Tab.Screen
        name="Today"
        component={TodayScreen}
        options={{ tabBarLabel: 'Today' }}
      />
      <Tab.Screen
        name="AllKnowts"
        component={AllKnowtsScreen}
        options={{ tabBarLabel: 'Knowts' }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ tabBarLabel: 'Settings' }}
      />
      <Tab.Screen
        name="Dev"
        component={DevScreen}
        options={{ tabBarLabel: 'Dev' }}
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
      <Stack.Screen name="BrowseSets" component={BrowseSetsScreen} />
      <Stack.Screen name="ApplySet" component={ApplySetScreen} />
      <Stack.Screen name="Legal" component={LegalScreen} />
      <Stack.Screen name="LegalDocument" component={LegalDocumentScreen} />
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
  hidden: { display: 'none' },
  tabLabel: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    fontWeight: theme.font.weight.medium,
  },
});

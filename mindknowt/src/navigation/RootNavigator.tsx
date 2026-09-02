import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AlarmScreen } from '../screens/AlarmScreen';
import { AddKnowtScreen } from '../screens/AddKnowtScreen';
import { AllKnowtsScreen } from '../screens/AllKnowtsScreen';
import { ApplySetScreen } from '../screens/ApplySetScreen';
import { BrowseSetsScreen } from '../screens/BrowseSetsScreen';
import { DevScreen } from '../screens/DevScreen';
import { LegalDocumentScreen } from '../screens/LegalDocumentScreen';
import { LegalScreen } from '../screens/LegalScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { EditKnowtScreen } from '../screens/EditKnowtScreen';
import { KnowtDetailScreen } from '../screens/KnowtDetailScreen';
import { RingingScreen } from '../screens/RingingScreen';
import { ScanScreen } from '../screens/ScanScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { CapsuleTabBar } from './CapsuleTabBar';
import type { RootStackParamList, TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function Tabs() {
  return (
    <Tab.Navigator
      // A floating capsule, drawn by hand. The default bar cannot be given a
      // detached shape, and rendering labels through tabBarIcon clipped them.
      tabBar={(props) => <CapsuleTabBar {...props} />}
      screenOptions={{ headerShown: false }}>
      <Tab.Screen
        name="Daily"
        component={DashboardScreen}
        options={{ tabBarLabel: 'Daily' }}
      />
      <Tab.Screen
        name="AllKnowts"
        component={AllKnowtsScreen}
        options={{ tabBarLabel: 'Knowts' }}
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
        name="EditKnowt"
        component={EditKnowtScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen
        name="Ringing"
        component={RingingScreen}
        options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
      />
      <Stack.Screen name="BrowseSets" component={BrowseSetsScreen} />
      <Stack.Screen name="ApplySet" component={ApplySetScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="Dev" component={DevScreen} />
      <Stack.Screen name="Legal" component={LegalScreen} />
      <Stack.Screen name="LegalDocument" component={LegalDocumentScreen} />
      <Stack.Screen name="NfcHarness" component={ScanScreen} />
      <Stack.Screen name="AlarmHarness" component={AlarmScreen} />
    </Stack.Navigator>
  );
}

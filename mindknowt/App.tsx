import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { AlarmScreen } from './src/screens/AlarmScreen';
import { ScanScreen } from './src/screens/ScanScreen';
import { theme } from './src/theme';

type Tab = 'nfc' | 'alarms';

const TABS: { key: Tab; label: string }[] = [
  { key: 'nfc', label: 'NFC' },
  { key: 'alarms', label: 'Alarms' },
];

/**
 * Two hardware-proving harnesses behind a plain switch. This is deliberately
 * not navigation: the real screens come with build-order step 3, and pulling in
 * a navigator now would be scaffolding we throw away.
 */
export default function App() {
  const [tab, setTab] = useState<Tab>('nfc');

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      <View style={styles.body}>
        {tab === 'nfc' ? <ScanScreen /> : <AlarmScreen />}
      </View>

      <View style={styles.tabBar}>
        {TABS.map(({ key, label }) => {
          const active = tab === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setTab(key)}
              style={[styles.tab, active && styles.tabActive]}>
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.background },
  body: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xxl,
    borderTopWidth: 1,
    borderTopColor: theme.color.border,
  },
  tab: {
    flex: 1,
    height: 40,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: { backgroundColor: theme.color.surfaceMuted },
  tabText: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    fontWeight: theme.font.weight.medium,
    color: theme.color.textMuted,
  },
  tabTextActive: { color: theme.color.textPrimary },
});

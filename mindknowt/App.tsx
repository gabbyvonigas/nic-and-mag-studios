import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View, type AppStateStatus } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { alarmScheduler } from './src/alarms';
import { publishLaunch } from './src/alarms/launchStore';
import { getDatabase, seedIfEmpty, sweepMissed } from './src/db';
import { linking } from './src/navigation/linking';
import { navigateToRinging, navigationRef } from './src/navigation/navigationRef';
import { RootNavigator } from './src/navigation/RootNavigator';
import { theme } from './src/theme';

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // Opening the database also runs migrations and stamps app_meta.
        await getDatabase();
        await seedIfEmpty();
        // Spec section 6 wants `missed` at end of day; with no background
        // execution the next launch is the earliest honest moment to write it.
        await sweepMissed();
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  /**
   * The single consumer of the AlarmKit launch payload. Reading it clears it
   * natively, so this must not be duplicated elsewhere. Everything else reads
   * the published copy. The payload carries the knowt id, which is how the
   * alarm selects which Ringing screen to open.
   */
  useEffect(() => {
    const consume = async () => {
      const launch = await alarmScheduler.consumeLaunch();
      if (!launch) return;
      publishLaunch(launch);
      if (launch.payload) navigateToRinging(launch.payload);
    };

    void consume();

    // An alarm can fire while the app is already running, so a foreground
    // transition is as much a launch signal as a cold start.
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void consume();
    });
    return () => sub.remove();
  }, [ready]);

  if (!ready) {
    return (
      <View style={styles.splash}>
        <StatusBar style="dark" />
        <ActivityIndicator color={theme.color.textSecondary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.splash}>
        <StatusBar style="dark" />
        <Text style={styles.error}>The database could not be opened.</Text>
        <Text style={styles.errorDetail}>{error}</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer ref={navigationRef} linking={linking}>
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: theme.color.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
  },
  error: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.lg,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.dangerText,
  },
  errorDetail: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    color: theme.color.textBody,
    textAlign: 'center',
  },
});

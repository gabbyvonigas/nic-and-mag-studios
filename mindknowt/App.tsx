import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View, type AppStateStatus } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import {
  alarmScheduler,
  pruneFiredAlarms,
  syncScheduledAlarms,
} from './src/alarms';
import { publishLaunch } from './src/alarms/launchStore';
import { destroyDatabase, getDatabase, seedIfEmpty, sweepMissed } from './src/db';
import { linking } from './src/navigation/linking';
import { navigateToRinging, navigationRef } from './src/navigation/navigationRef';
import { resolveResumeRinging, resolveRinging } from './src/ringing/ringGate';
import { importSnoozesQuietly } from './src/alarms/importSnoozes';
import { RootNavigator } from './src/navigation/RootNavigator';
import { Button } from './src/components/ui';
import { theme } from './src/theme';

type StartupError = { stage: string; message: string };

function describe(err: unknown): string {
  if (err instanceof Error) {
    const name = err.constructor?.name || err.name || 'Error';
    return err.message ? `${name}: ${err.message}` : name;
  }
  return String(err);
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<StartupError | null>(null);
  const [resetting, setResetting] = useState(false);

  const bootstrap = useCallback(async () => {
    setError(null);
    setReady(false);

    try {
      // Opening the database also runs migrations and stamps app_meta.
      await getDatabase();
    } catch (err) {
      setError({ stage: 'Opening the database', message: describe(err) });
      setReady(true);
      return;
    }

    try {
      await seedIfEmpty();
    } catch (err) {
      setError({ stage: 'Adding the example Knowts', message: describe(err) });
      setReady(true);
      return;
    }

    try {
      // Spec section 6 wants `missed` at end of day; with no background
      // execution the next launch is the earliest honest moment to write it.
      // Housekeeping, so a failure here must not keep the app from starting.
      await sweepMissed();
      // An alarm whose time has passed already rang, so it is no longer
      // pending. Without this the dashboard would claim things are armed that
      // are not.
      await pruneFiredAlarms();
      // A snooze taken on the Lock Screen never launched the app, so this is
      // the first chance to hear about it. Before sync, because a snooze is
      // one of the things sync reads.
      await importSnoozesQuietly();
      // The only moment the app can put its schedules back in front of the
      // system. There is no background execution, so a schedule that is not
      // armed here is a knowt that does not ring.
      await syncScheduledAlarms();
    } catch {
      // Ignored on purpose.
    }

    setReady(true);
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  /** Last resort when a database cannot be opened or migrated. */
  const resetDatabase = useCallback(async () => {
    setResetting(true);
    try {
      await destroyDatabase();
      await bootstrap();
    } catch (err) {
      setError({ stage: 'Resetting the database', message: describe(err) });
    } finally {
      setResetting(false);
    }
  }, [bootstrap]);

  /**
   * The single consumer of the AlarmKit launch payload. Reading it clears it
   * natively, so this must not be duplicated elsewhere. Everything else reads
   * the published copy. The payload carries the knowt id, which is how the
   * alarm selects which Ringing screen to open.
   *
   * A recurring alarm cannot skip an occurrence, so one can fire for something
   * already checked off. The screen that demands a tag scan is not opened for
   * it. The payload is still published either way: the dev harness reports what
   * fired, and suppressing a screen is not the same as hiding the firing.
   */
  // Occurrences the app has already offered to open. One attempt each: after
  // that the screen belongs to whoever is holding the phone.
  const offered = useRef(new Set<string>());

  useEffect(() => {
    const consume = async () => {
      const launch = await alarmScheduler.consumeLaunch();

      if (launch) {
        publishLaunch(launch);
        if (!launch.payload) return;
        // A Lock Screen snooze sets the same launch payload as a Stop, and the
        // payload has no field saying which button ran. The snooze record does:
        // the snooze intent writes one and the dismiss intent removes it, so
        // importing first is what keeps a snooze from reopening the screen for
        // something the person just put off.
        await importSnoozesQuietly();
        const target = await resolveRinging(launch.payload);
        if (target.present) {
          navigateToRinging(launch.payload, target.scheduleId);
        }
        return;
      }

      // No payload. Tapping the banner or the Dynamic Island runs no App
      // Intent, so this is what an alarm tapped rather than answered looks
      // like. A Lock Screen snooze may also have landed, so take those in
      // first: a snoozed Knowt counts as answered and must not be opened.
      await importSnoozesQuietly();
      const resume = await resolveResumeRinging(offered.current);
      if (!resume) return;
      offered.current.add(resume.key);
      const target = await resolveRinging(resume.knowtId);
      if (target.present) {
        navigateToRinging(resume.knowtId, resume.scheduleId);
      }
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
        <Text style={styles.error}>{error.stage} failed.</Text>
        <Text style={styles.errorDetail}>{error.message}</Text>
        <View style={styles.errorActions}>
          <Button
            label={resetting ? 'Resetting' : 'Try again'}
            variant="secondary"
            disabled={resetting}
            onPress={() => void bootstrap()}
          />
          <Button
            label="Erase data and start over"
            variant="quiet"
            disabled={resetting}
            onPress={() => void resetDatabase()}
          />
        </View>
        <Text style={styles.errorDetail}>
          Erasing removes every knowt on this device. It is the way out when the
          database itself cannot be repaired.
        </Text>
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
  errorActions: {
    alignSelf: 'stretch',
    gap: theme.spacing.sm,
    marginVertical: theme.spacing.lg,
  },
});

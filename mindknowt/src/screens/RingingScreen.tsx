import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../components/ui';
import { getKnowt, logCompletion } from '../db';
import { useQuery } from '../db/useQuery';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'Ringing'>;

/**
 * The screen AlarmKit reopens the app to. Deliberately minimal: build-order
 * step 5 owns scan-to-stop, snooze, override and the re-fire loop. What exists
 * here is the routing target and the note, which spec section 5.7 calls the
 * highest-value real estate in the app.
 */
export function RingingScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const { data: knowt, loading } = useQuery(
    () => getKnowt(params.knowtId),
    [params.knowtId],
  );

  const done = async () => {
    if (knowt) {
      await logCompletion({ knowtId: knowt.id, scheduleId: null, method: 'tap' });
    }
    navigation.navigate('Tabs', { screen: 'Today' });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={theme.color.textSecondary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>RINGING</Text>
        <Text style={styles.name}>{knowt?.name ?? 'Unknown knowt'}</Text>
        {knowt?.location_note ? (
          <Text style={styles.location}>{knowt.location_note}</Text>
        ) : null}

        {knowt?.notes ? (
          <View style={styles.notes}>
            <Text style={styles.notesText}>{knowt.notes}</Text>
          </View>
        ) : null}

        <Text style={styles.stub}>
          Scan to stop, snooze, override and the re-fire loop arrive with build
          order step 5. For now this screen only proves the alarm can route here.
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <Button label="Done" onPress={() => void done()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.background },
  content: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.xxl,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  label: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.xs,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.dangerText,
    letterSpacing: 1,
  },
  name: {
    fontFamily: theme.font.body,
    fontSize: 36,
    fontWeight: theme.font.weight.bold,
    color: theme.color.textPrimary,
    letterSpacing: -0.5,
  },
  location: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    color: theme.color.textSecondary,
  },
  notes: {
    marginTop: theme.spacing.lg,
    backgroundColor: theme.color.surfaceMuted,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
  },
  notesText: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.lg,
    lineHeight: 26,
    color: theme.color.textPrimary,
  },
  stub: {
    marginTop: theme.spacing.xl,
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    lineHeight: 19,
    color: theme.color.textMuted,
  },
  footer: { paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.sm },
});

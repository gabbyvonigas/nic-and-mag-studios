import { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, ScreenHeader } from '../components/ui';
import { destroyDatabase, getAllAppMeta, listKnowts, reseed, seedIfEmpty } from '../db';
import { useQuery } from '../db/useQuery';
import { listSets, setContentErrors } from '../sets';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function DevScreen() {
  const navigation = useNavigation<Nav>();
  const { data: meta, reload: reloadMeta } = useQuery(() => getAllAppMeta(), []);
  const { data: knowts, reload: reloadKnowts } = useQuery(() => listKnowts(), []);
  const [busy, setBusy] = useState(false);

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
      await reloadMeta();
      await reloadKnowts();
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader title="Dev" subtitle="Test harnesses and database tools" />

        <Text style={styles.sectionTitle}>app_meta</Text>
        <Card>
          {Object.entries(meta ?? {}).length === 0 ? (
            <Text style={styles.body}>Empty.</Text>
          ) : (
            Object.entries(meta ?? {}).map(([key, value]) => (
              <View key={key} style={styles.metaRow}>
                <Text style={styles.metaKey}>{key}</Text>
                <Text style={styles.metaValue} selectable>
                  {key === 'first_launch_at'
                    ? new Date(Number(value)).toLocaleString()
                    : value}
                </Text>
              </View>
            ))
          )}
        </Card>
        <Text style={styles.hint}>
          install_generation is written once with INSERT OR IGNORE and is never
          overwritten. Reseeding leaves it alone; only a full reset clears it.
        </Text>

        <Text style={styles.sectionTitle}>Database</Text>
        <Text style={styles.body}>{knowts?.length ?? 0} knowts</Text>
        <Button
          label="Wipe and reseed"
          variant="secondary"
          disabled={busy}
          onPress={() => void run(reseed)}
        />
        <Button
          label="Delete database and start over"
          variant="quiet"
          disabled={busy}
          onPress={() =>
            void run(async () => {
              await destroyDatabase();
              await seedIfEmpty();
            })
          }
        />
        <Text style={styles.hint}>
          Wipe and reseed replaces the example content. Delete removes the file
          entirely, so the next read is a genuine first launch and app_meta is
          stamped again.
        </Text>

        <Text style={styles.sectionTitle}>Starter sets</Text>
        <Card>
          <Text style={styles.body}>
            {listSets().length} set{listSets().length === 1 ? '' : 's'} loaded from
            assets/starter-sets.json
          </Text>
          {setContentErrors().length === 0 ? (
            <Text style={styles.hint}>No content problems.</Text>
          ) : (
            setContentErrors().map((error) => (
              <Text key={error} style={styles.contentError}>
                {error}
              </Text>
            ))
          )}
        </Card>
        <Text style={styles.hint}>
          Content is validated at load. Anything listed here is a problem in the
          JSON, not in the app.
        </Text>

        <Text style={styles.sectionTitle}>Hardware harnesses</Text>
        <Button
          label="NFC"
          variant="secondary"
          onPress={() => navigation.navigate('NfcHarness')}
        />
        <Button
          label="Alarms"
          variant="secondary"
          onPress={() => navigation.navigate('AlarmHarness')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.background },
  content: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.sm,
  },
  sectionTitle: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: theme.spacing.lg,
  },
  body: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    color: theme.color.textBody,
  },
  hint: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    lineHeight: 19,
    color: theme.color.textMuted,
  },
  contentError: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    lineHeight: 18,
    color: theme.color.dangerText,
  },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.md },
  metaKey: {
    fontFamily: theme.font.mono,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  metaValue: {
    fontFamily: theme.font.mono,
    fontSize: theme.font.size.sm,
    color: theme.color.textPrimary,
    flexShrink: 1,
    textAlign: 'right',
  },
});

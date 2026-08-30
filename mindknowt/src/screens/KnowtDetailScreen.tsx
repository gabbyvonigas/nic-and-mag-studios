import { useEffect, useState } from 'react';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Pill, ScreenHeader } from '../components/ui';
import { armKnowtAlarm } from '../alarms';
import {
  archiveKnowt,
  attachTag,
  describeRepeat,
  getKnowt,
  listEvents,
  logCompletion,
  ModeUnavailableError,
  setMode,
  TagInUseError,
  updateNotes,
  type KnowtMode,
} from '../db';
import { NfcScanError, nfcReader } from '../nfc';
import { useQuery } from '../db/useQuery';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'KnowtDetail'>;

export function KnowtDetailScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const { data: knowt, loading, reload } = useQuery(
    () => getKnowt(params.knowtId),
    [params.knowtId],
  );
  const { data: events, reload: reloadEvents } = useQuery(
    () => listEvents(params.knowtId),
    [params.knowtId],
  );

  const [draftNotes, setDraftNotes] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (knowt && !dirty) setDraftNotes(knowt.notes ?? '');
  }, [knowt, dirty]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ActivityIndicator color={theme.color.textSecondary} />
      </SafeAreaView>
    );
  }

  if (!knowt) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.content}>
          <Text style={styles.body}>That knowt no longer exists.</Text>
          <Button label="Back" variant="quiet" onPress={() => navigation.goBack()} />
        </View>
      </SafeAreaView>
    );
  }

  const saveNotes = async () => {
    await updateNotes(knowt.id, draftNotes);
    setDirty(false);
    await reload();
  };

  /**
   * Spec section 5.6: attaching a tag promotes an Open knowt in place. Name,
   * notes, schedules and history all survive. Only the UID and mode change.
   * The same path re-scans a replacement tag onto an already-tagged knowt.
   */
  const scanToAttach = async () => {
    setNotice(null);
    setBusy(true);
    try {
      const tag = await nfcReader.scanTag();
      await attachTag(knowt.id, tag.rawUid);
      await reload();
      setNotice(`Tag attached. ${knowt.name} is now strict.`);
    } catch (err) {
      if (err instanceof TagInUseError) {
        setNotice(`That tag is already ${err.knowtName}. Scan a different one.`);
      } else if (err instanceof NfcScanError && err.reason === 'cancelled') {
        // Backing out is not a failure.
      } else {
        setNotice(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const changeMode = async (mode: KnowtMode) => {
    setNotice(null);
    try {
      await setMode(knowt.id, mode);
      await reload();
    } catch (err) {
      setNotice(
        err instanceof ModeUnavailableError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err),
      );
    }
  };

  const testAlarm = async () => {
    setNotice(null);
    setBusy(true);
    try {
      await armKnowtAlarm({
        knowtId: knowt.id,
        title: knowt.name,
        firesAt: new Date(Date.now() + 60_000),
      });
      setNotice('Alarm set for one minute from now. Lock the phone.');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const checkIn = async () => {
    // Spec section 3: a completion with no alarm pending is a valid check-in.
    await logCompletion({ knowtId: knowt.id, scheduleId: null, method: 'tap' });
    await reloadEvents();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          title={knowt.name}
          subtitle={knowt.location_note ?? undefined}
        />

        <View style={styles.pills}>
          {knowt.category ? (
            <Pill label={knowt.category.name} color={knowt.category.color} />
          ) : null}
          <Pill label={knowt.mode} />
          {knowt.tag_uid ? <Pill label="Tagged" /> : <Pill label="No tag" />}
        </View>

        <Text style={styles.sectionTitle}>Notes</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={draftNotes}
          onChangeText={(text) => {
            setDraftNotes(text);
            setDirty(true);
          }}
          placeholder="Anything worth knowing when this goes off."
          placeholderTextColor={theme.color.textMuted}
          multiline
          textAlignVertical="top"
        />
        {dirty ? <Button label="Save notes" onPress={() => void saveNotes()} /> : null}

        {notice ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Mode</Text>
        <View style={styles.modeRow}>
          {(['strict', 'soft', 'open'] as KnowtMode[]).map((mode) => {
            const selected = knowt.mode === mode;
            return (
              <Pressable
                key={mode}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => void changeMode(mode)}
                style={[styles.modeChip, selected && styles.modeChipSelected]}>
                <Text
                  style={[styles.modeText, selected && styles.modeTextSelected]}>
                  {mode}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>
          Strict and soft both need a tag. Open completes by tapping done.
        </Text>

        <Button
          label={knowt.tag_uid ? 'Replace tag' : 'Add a tag to this'}
          variant="secondary"
          disabled={busy}
          onPress={() => void scanToAttach()}
        />
        {knowt.tag_uid ? (
          <Text style={styles.tagUid} selectable>
            {knowt.tag_uid}
          </Text>
        ) : null}

        <Button
          label="Ring this in 1 minute"
          variant="quiet"
          disabled={busy}
          onPress={() => void testAlarm()}
        />

        <Text style={styles.sectionTitle}>Schedules</Text>
        {knowt.schedules.length === 0 ? (
          <Text style={styles.body}>No schedules yet.</Text>
        ) : (
          knowt.schedules.map((schedule) => (
            <Card key={schedule.id}>
              <Text style={styles.cardTitle}>
                {schedule.time}
                {schedule.label ? ` · ${schedule.label}` : ''}
              </Text>
              <Text style={styles.body}>{describeRepeat(schedule)}</Text>
            </Card>
          ))
        )}

        <Text style={styles.sectionTitle}>History</Text>
        {(events ?? []).length === 0 ? (
          <Text style={styles.body}>Nothing recorded yet.</Text>
        ) : (
          (events ?? []).map((event) => (
            <View key={event.id} style={styles.eventRow}>
              <Text style={styles.body}>
                {event.completed_at
                  ? new Date(event.completed_at).toLocaleString()
                  : 'Not completed'}
              </Text>
              <Text style={styles.meta}>{event.method ?? ''}</Text>
            </View>
          ))
        )}

        <View style={styles.actions}>
          <Button label="I just did this" variant="secondary" onPress={() => void checkIn()} />
          <Button
            label="Archive"
            variant="quiet"
            onPress={async () => {
              await archiveKnowt(knowt.id);
              navigation.goBack();
            }}
          />
        </View>
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
    gap: theme.spacing.md,
  },
  pills: { flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' },
  sectionTitle: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: theme.spacing.md,
  },
  cardTitle: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.lg,
    fontWeight: theme.font.weight.medium,
    color: theme.color.textPrimary,
  },
  body: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    color: theme.color.textBody,
  },
  meta: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.xs,
    color: theme.color.textMuted,
  },
  input: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  multiline: { minHeight: 100 },
  eventRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.color.surfaceMuted,
  },
  actions: { gap: theme.spacing.sm, marginTop: theme.spacing.lg },
  notice: {
    backgroundColor: theme.color.warningSurface,
    borderColor: theme.color.warningBorder,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
  },
  noticeText: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    color: theme.color.warningText,
  },
  modeRow: { flexDirection: 'row', gap: theme.spacing.sm },
  modeChip: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing.sm,
  },
  modeChipSelected: {
    borderColor: theme.color.accent,
    backgroundColor: theme.color.surfaceMuted,
  },
  modeText: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    color: theme.color.textMuted,
  },
  modeTextSelected: {
    color: theme.color.textPrimary,
    fontWeight: theme.font.weight.semibold,
  },
  hint: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    color: theme.color.textMuted,
  },
  tagUid: {
    fontFamily: theme.font.mono,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
});

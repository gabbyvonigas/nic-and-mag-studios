import { useCallback, useEffect, useState } from 'react';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
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

import { Button, Card, Pill, SubScreenHeader } from '../components/ui';
import {
  cancelKnowtOneShots,
  describeError,
  pendingForKnowt,
  rearmKnowtAlarm,
  resyncAlarmsQuietly,
  settled,
} from '../alarms';
import { Icon } from '../components/Icon';
import { completeOccurrence } from '../knowts/completeOccurrence';
import { openOccurrence } from '../knowts/completions';
import { MODE_CHOICES, modeChoice, modeLabel, requiresScan } from '../knowts/modes';
import { buildSnoozed } from '../knowts/snoozed';
import {
  archiveKnowt,
  attachTag,
  deleteKnowt,
  detachTag,
  findKnowtByTagUid,
  reassignTag,
  finishDraft,
  restoreKnowt,
  describeRepeat,
  formatTime,
  getKnowt,
  isDueOn,
  listEvents,
  ModeUnavailableError,
  setMode,
  setPinned,
  TagInUseError,
  updateNotes,
  type KnowtMode,
} from '../db';
import { askToDelete, sayTagFreed } from '../knowts/deletePrompt';
import { askToReassign, askToUnassign } from '../knowts/tagConflict';
import { NfcScanError, nfcReader } from '../nfc';
import { useQuery } from '../db/useQuery';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Just the clock, the way a person would say it.
 *
 * The full locale string carried a date, seconds and often a timezone, which
 * is more than a history row needs to be read at a glance.
 */
function clockTime(at: number): string {
  const date = new Date(at);
  const hours = date.getHours();
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`;
}
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
  // What is armed for this Knowt right now, which is how the screen knows it
  // was opened from the Snoozed section rather than from the list.
  const { data: pending, reload: reloadPending } = useQuery(
    () => pendingForKnowt(params.knowtId),
    [params.knowtId],
  );

  const [draftNotes, setDraftNotes] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  // Closed by default. History is the least urgent thing on this screen and it
  // grows without limit, so it should not push everything else off the top.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (knowt && !dirty) setDraftNotes(knowt.notes ?? '');
  }, [knowt, dirty]);

  // Coming back from the editor lands on a screen that already rendered, so
  // the query has to run again or it shows the values from before the edit.
  useFocusEffect(
    useCallback(() => {
      void reload();
      void reloadEvents();
      void reloadPending();
    }, [reload, reloadEvents, reloadPending]),
  );

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
          <SubScreenHeader onBack={() => navigation.goBack()} />
          <Text style={styles.body}>That Knowt no longer exists.</Text>
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
      const owner = await findKnowtByTagUid(tag.rawUid);
      if (owner && owner.id !== knowt.id) {
        // Interrupts at the scan rather than reporting it somewhere the person
        // is not looking. Tags are rewritable, so a conflict is a choice.
        if (!(await askToReassign(owner.name, knowt.name))) return;
        await reassignTag(tag.rawUid, knowt.id);
        await reload();
        return;
      }
      await attachTag(knowt.id, tag.rawUid);
      await reload();
      setNotice(`Tag attached. ${knowt.name} is now strict.`);
    } catch (err) {
      if (err instanceof NfcScanError && err.reason === 'canceled') {
        // Backing out is not a failure.
      } else if (err instanceof NfcScanError && err.reason === 'canceled') {
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

  /**
   * Whether there is anything to check in against yet.
   *
   * "I just did this" on a knowt that rings at eight, read at seven, is an
   * invitation to log a thing that has not happened. It appears once the knowt
   * has actually come due: a schedule whose time has passed today, an alarm
   * that fired and was never closed, or no schedule at all, which is the
   * untimed case where any moment is as good as another.
   */
  const dueYet = (() => {
    if (knowt.schedules.length === 0) return true;
    if ((events ?? []).some((e) => e.fired_at && !e.completed_at)) return true;

    const now = new Date();
    const minutesNow = now.getHours() * 60 + now.getMinutes();
    return knowt.schedules.some((schedule) => {
      if (!isDueOn(schedule, now)) return false;
      const [hour, minute] = schedule.time.split(':').map(Number);
      return (hour ?? 0) * 60 + (minute ?? 0) <= minutesNow;
    });
  })();

  /**
   * Where Edit goes. The Schedules card goes to the same place through the same
   * function on purpose: two call sites navigating to "the editor" by hand is
   * how they end up on different screens after a rename.
   */
  const openEditor = () =>
    navigation.navigate('EditKnowt', { knowtId: knowt.id });

  /**
   * Whether this Knowt is sitting under a snooze.
   *
   * `buildSnoozed` is the same rule Daily's Snoozed section uses, over the one
   * Knowt instead of all of them, so the screen you land on from that section
   * agrees with the section you tapped.
   */
  const snoozed =
    buildSnoozed({
      alarms: pending ?? [],
      knowts: [knowt],
      now: Date.now(),
    }).length > 0;

  /**
   * Done.
   *
   * `completeOccurrence` records it, clears the Knowt's one-shots, which is
   * what takes it out of the Snoozed section, and resyncs so the next
   * occurrence is armed. Then the screen closes: this is the primary action,
   * and a primary action that leaves you looking at the same screen reads as
   * having done nothing. Bounded for the same reason the Ringing screen's is.
   */
  const finishNow = async () => {
    setNotice(null);
    // Spec section 3: a completion with no alarm pending is a valid check-in,
    // which is why the schedule can still come out null here.
    //
    // When one of today's occurrences is what is being checked in against,
    // though, it has to be named. Recording every check-in against no schedule
    // meant Daily went on showing the knowt as not done and the alarm armed for
    // it went on ringing.
    const open = openOccurrence({
      schedules: knowt.schedules,
      events: events ?? [],
    });
    const done = await settled(
      completeOccurrence({
        knowtId: knowt.id,
        scheduleId: open?.id ?? null,
        method: 'tap',
      }),
    );
    if (!done.ok) {
      setNotice(`That could not be recorded. ${describeError(done.error)}`);
      await reloadEvents();
      return;
    }
    navigation.navigate('Tabs', { screen: 'Daily' });
  };

  /** Puts it off again, for the Knowt's own snooze length. */
  const snoozeAgain = async () => {
    setNotice(null);
    const armed = await settled(
      rearmKnowtAlarm({
        knowtId: knowt.id,
        title: knowt.name,
        minutes: knowt.snooze_minutes,
        kind: 'snooze',
        requiresScan: requiresScan(knowt.mode),
        snoozeMinutes: knowt.snooze_minutes,
      }),
    );
    if (!armed.ok) {
      setNotice(`That could not be snoozed. ${describeError(armed.error)}`);
      return;
    }
    navigation.navigate('Tabs', { screen: 'Daily' });
  };

  /**
   * Stops it asking again today without saying it was done.
   *
   * The one-shots are what is left of today's firing, so clearing them is the
   * whole of it: nothing is marked complete, the Log still shows it as not
   * done, and the recurring alarm is untouched, so tomorrow is unaffected.
   * There is no stored "skipped" state and this does not invent one.
   */
  const skipToday = async () => {
    setNotice(null);
    const cleared = await settled(cancelKnowtOneShots(knowt.id));
    if (!cleared.ok) {
      setNotice(`That could not be cleared. ${describeError(cleared.error)}`);
      return;
    }
    await settled(resyncAlarmsQuietly());
    navigation.navigate('Tabs', { screen: 'Daily' });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <SubScreenHeader
          title={knowt.name}
          subtitle={knowt.location_note ?? undefined}
          onBack={() => navigation.goBack()}
          action={
            <Pressable
              accessibilityRole="button"
              hitSlop={12}
              onPress={openEditor}>
              <Text style={styles.editLink}>Edit</Text>
            </Pressable>
          }
        />

        <View style={styles.pills}>
          {knowt.category ? (
            <Pill label={knowt.category.name} color={knowt.category.color} />
          ) : null}
          <Pill label={modeLabel(knowt.mode)} />
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

        {knowt.is_draft ? (
          <View style={styles.draft}>
            <Text style={styles.draftText}>
              This is a draft. It does not ring and it is not in your knowts
              yet.
            </Text>
            {/* Into the same guided setup a new knowt gets, rather than just
                flipping the flag: a draft has no time and no tag, which is
                exactly what that screen asks for. */}
            <Button
              label="Finish setting it up"
              variant="highlight"
              onPress={() =>
                navigation.navigate('SetupKnowt', {
                  name: knowt.name,
                  categoryId: knowt.category_id,
                  notes: knowt.notes,
                  draftId: knowt.id,
                })
              }
            />
            <Button
              label="Keep it as it is"
              variant="quiet"
              onPress={async () => {
                await finishDraft(knowt.id);
                // It may already carry a schedule that nothing has armed.
                await resyncAlarmsQuietly();
                await reload();
              }}
            />
          </View>
        ) : null}

        {knowt.archived ? (
          <View style={styles.draft}>
            <Text style={styles.draftText}>
              Archived. Nothing here rings until it is back.
            </Text>
            <Button
              label="Restore"
              variant="secondary"
              onPress={async () => {
                await restoreKnowt(knowt.id);
                await resyncAlarmsQuietly();
                await reload();
              }}
            />
          </View>
        ) : null}

        {notice ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>How it stops</Text>
        <View style={styles.modeRow}>
          {MODE_CHOICES.map((choice) => {
            const selected = modeChoice(knowt.mode) === choice.value;
            const blocked = choice.value === 'strict' && !knowt.tag_uid;
            // One value for both, so the icon and its label always agree. The
            // selected chip is lime, which is an active state and so is exactly
            // what the neon is for, and near-black is the only thing that goes
            // on top of it.
            const tint = blocked
              ? theme.color.textMuted
              : selected
                ? theme.color.onHighlight
                : theme.color.textSecondary;
            return (
              <Pressable
                key={choice.value}
                accessibilityRole="button"
                accessibilityLabel={choice.label}
                accessibilityState={{ selected, disabled: blocked }}
                disabled={blocked}
                onPress={() => void changeMode(choice.value)}
                style={[
                  styles.modeChip,
                  selected && styles.modeChipSelected,
                  blocked && styles.modeChipBlocked,
                ]}>
                {choice.value === 'strict' ? (
                  <Icon name="scan" size={16} color={tint} />
                ) : (
                  <Icon name="alarm" size={16} color={tint} />
                )}
                <Text
                  style={[
                    styles.modeText,
                    selected && styles.modeTextSelected,
                    blocked && styles.modeTextBlocked,
                  ]}>
                  {choice.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>
          {knowt.tag_uid
            ? 'Alarm Only can still be scanned if you want to, it just does not have to be.'
            : 'Scan Knowt needs a tag attached first.'}
        </Text>

        <Button
          label={
            knowt.tag_uid
              ? 'Replace the Knowt tag'
              : 'Add a Knowt tag to scan'
          }
          variant="secondary"
          disabled={busy}
          onPress={() => void scanToAttach()}
        />
        {knowt.tag_uid ? (
          <>
            <Text style={styles.tagUid} selectable>
              {knowt.tag_uid}
            </Text>
            {/* The tags are rewritable hardware, so one stuck on the wrong
                thing is a label to peel off, not a permanent pairing. */}
            <Button
              label="Free this tag for something else"
              variant="quiet"
              disabled={busy}
              onPress={async () => {
                if (!(await askToUnassign(knowt.name))) return;
                await detachTag(knowt.id);
                await reload();
                setNotice(
                  `${knowt.name} is Alarm Only now. The tag is free to use.`,
                );
              }}
            />
          </>
        ) : null}

        <Text style={styles.sectionTitle}>Schedules</Text>
        {knowt.schedules.length === 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a schedule"
            onPress={() =>
              navigation.navigate('EditSchedule', { knowtId: knowt.id })
            }
            style={({ pressed }) => [styles.addRow, pressed && styles.pressed]}>
            <Text style={styles.addRowText}>Tap to add a schedule</Text>
          </Pressable>
        ) : (
          knowt.schedules.map((schedule) => (
            // The card was the one part of this screen that showed a schedule
            // and did nothing when tapped, which left Edit at the top right as
            // the only way in. The chevron is there so it reads as a way in
            // before it is tapped rather than after.
            <Pressable
              key={schedule.id}
              accessibilityRole="button"
              accessibilityLabel={`Edit the ${formatTime(schedule.time)} schedule`}
              onPress={openEditor}
              style={({ pressed }) => [pressed && styles.pressed]}>
              <Card>
                <View style={styles.scheduleRow}>
                  <View style={styles.scheduleMain}>
                    <Text style={styles.cardTitle}>
                      {formatTime(schedule.time)}
                      {schedule.label ? ` · ${schedule.label}` : ''}
                    </Text>
                    <Text style={styles.body}>{describeRepeat(schedule)}</Text>
                  </View>
                  <Icon name="forward" size={18} />
                </View>
              </Card>
            </Pressable>
          ))
        )}

        {/* A brand new knowt has no history, and a heading over the words
            "nothing recorded yet" is a divider around an absence. */}
        {(events ?? []).length > 0 ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: historyOpen }}
              accessibilityLabel={`History, ${(events ?? []).length} entries`}
              onPress={() => setHistoryOpen((open) => !open)}
              style={({ pressed }) => [
                styles.historyHead,
                pressed && styles.pressed,
              ]}>
              <Text style={styles.sectionTitle}>History</Text>
              <Icon name={historyOpen ? 'collapse' : 'expand'} size={14} color={theme.color.textSecondary} />
            </Pressable>

            {historyOpen
              ? (events ?? []).map((event) => (
                  <View key={event.id} style={styles.eventRow}>
                    <Text style={styles.body}>
                      {event.completed_at
                        ? clockTime(event.completed_at)
                        : 'Not completed'}
                    </Text>
                  </View>
                ))
              : null}
          </>
        ) : null}

        <View style={styles.actions}>
          {/* Done leads, filled and full width, the same control the Ringing
              screen leads with. It was a white secondary button reading "I
              just did this", which left the one thing you came here to do
              looking like the same weight as Archive. Putting it off is the
              quieter choice, so those sit under it as outlined buttons. */}
          {dueYet ? (
            <Button label="Done" onPress={() => void finishNow()} />
          ) : null}
          {snoozed ? (
            <>
              <Button
                label={`Snooze ${knowt.snooze_minutes} min again`}
                variant="secondary"
                onPress={() => void snoozeAgain()}
              />
              <Button
                label="Skip for today"
                variant="secondary"
                onPress={() => void skipToday()}
              />
            </>
          ) : null}
          {/* The list's long press is a shortcut, not an affordance, so the
              control has to exist somewhere it can be found. */}
          <Button
            label={knowt.is_pinned === 1 ? 'Unpin' : 'Pin to the top'}
            variant="secondary"
            onPress={async () => {
              await setPinned(knowt.id, knowt.is_pinned !== 1);
              await reload();
            }}
          />

          {/* Two different promises, so two buttons. Archive pauses something
              and keeps it whole. Delete is for something you are finished
              with, and it still lands somewhere you can reach. */}
          <Button
            label="Archive"
            variant="quiet"
            onPress={async () => {
              await archiveKnowt(knowt.id);
              // An archived knowt must stop ringing.
              await resyncAlarmsQuietly();
              navigation.goBack();
            }}
          />
          <Button
            label="Delete"
            variant="quiet"
            onPress={async () => {
              if (!(await askToDelete(knowt.name))) return;
              const { tagFreed } = await deleteKnowt(knowt.id);
              // A deleted knowt must stop ringing, the same as an archived one.
              await resyncAlarmsQuietly();
              if (tagFreed) sayTagFreed();
              navigation.goBack();
            }}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  draft: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  draftText: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.md,
    color: theme.color.textSecondary,
  },
  addRow: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.color.border,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.lg,
    alignItems: 'center',
  },
  addRowText: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.md,
    color: theme.color.accent,
  },
  editLink: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  container: { flex: 1, backgroundColor: theme.color.background },
  content: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.md,
  },
  pills: { flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' },
  historyHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: theme.spacing.md,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  scheduleMain: { flex: 1 },
  cardTitle: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.lg,
    color: theme.color.textPrimary,
    ...theme.font.tabular,
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
  modeChipBlocked: { backgroundColor: theme.color.surfaceMuted },
  modeTextBlocked: { color: theme.color.textMuted },
  modeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing.sm,
  },
  modeChipSelected: {
    borderColor: theme.color.highlight,
    backgroundColor: theme.color.highlight,
  },
  modeText: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    color: theme.color.textSecondary,
  },
  modeTextSelected: { color: theme.color.onHighlight },
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

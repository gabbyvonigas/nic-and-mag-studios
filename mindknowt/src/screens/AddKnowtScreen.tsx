import { useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, SubScreenHeader } from '../components/ui';
import { TimeWheel } from '../components/TimeWheel';
import { resyncAlarmsQuietly } from '../alarms';
import {
  createKnowt,
  listCategories,
  formatTime,
  toISODate,
  type RepeatType,
} from '../db';
import { useQuery } from '../db/useQuery';
import { categoryShades, theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const REPEATS: { value: RepeatType; label: string }[] = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekends', label: 'Weekends' },
  { value: 'once', label: 'Once' },
];

const SUGGESTED = ['Vitamins', 'Water the plants', 'Take the garbage out', 'Retinol'];

/**
 * Adding a knowt, on one page.
 *
 * It used to be four steps, one decision per screen, which is a good rule when
 * the decisions are hard and a bad one when three of the four are optional.
 * Stepping through three screens to skip them is work, not guidance. Everything
 * is here at once, only the name is required, and the rest can be ignored.
 *
 * Backing out no longer throws the work away: anything with a name in it is
 * kept as a draft, which is a real row carrying `is_draft = 1`. It cannot ring
 * and it appears nowhere but the Drafts section on Knowts.
 */
export function AddKnowtScreen() {
  const navigation = useNavigation<Nav>();
  const { data: categories } = useQuery(() => listCategories(), []);

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [locationNote, setLocationNote] = useState('');
  const [notes, setNotes] = useState('');
  /**
   * Off until asked for. Nothing here guesses a time: the wheel only appears
   * once a schedule has been asked for, and its starting position is a control
   * position rather than a saved value.
   */
  const [scheduled, setScheduled] = useState(false);
  const [time, setTime] = useState('08:00');
  const [repeatType, setRepeatType] = useState<RepeatType>('daily');
  const [saving, setSaving] = useState(false);

  // Set once the row exists, so leaving cannot write a second copy of it.
  const settled = useRef(false);

  const ready = name.trim().length > 0;

  const write = async (asDraft: boolean) => {
    const id = await createKnowt({
      name: name.trim(),
      categoryId,
      locationNote: locationNote.trim() || null,
      notes: notes.trim() || null,
      mode: 'open',
      isDraft: asDraft,
      schedule: scheduled
        ? {
            // The wheel deals only in 24 hour HH:MM, which is what is stored.
            time,
            repeatType,
            startDate: repeatType === 'once' ? toISODate(new Date()) : undefined,
          }
        : undefined,
    });
    settled.current = true;
    return id;
  };

  const done = async () => {
    if (!ready || saving) return;
    setSaving(true);
    try {
      const id = await write(false);
      // The knowt may carry a schedule, which nothing has armed yet.
      await resyncAlarmsQuietly();
      navigation.replace('KnowtDetail', { knowtId: id });
    } finally {
      setSaving(false);
    }
  };

  /**
   * Leaving with something typed keeps it. An empty form is not a draft, it is
   * someone who opened the wrong thing, and saving that would fill Drafts with
   * rows nobody made.
   */
  const leave = () => {
    if (ready && !settled.current) void write(true);
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.content}
          // Tapping the page puts the keyboard away, which was otherwise only
          // possible by guessing at the return key.
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={Keyboard.dismiss}>
          <SubScreenHeader
            title="Add a knowt"
            subtitle="Only the name is needed. Everything else can wait."
            onBack={leave}
            backLabel="Close"
          />

          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.replace('BrowseSets')}
            style={({ pressed }) => [styles.presets, pressed && styles.pressed]}>
            <Text style={styles.presetsText}>Browse Presets</Text>
            <Text style={styles.presetsMeta}>
              Ready-made knowts, add only what you want
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="none"
            onPress={Keyboard.dismiss}
            style={styles.sheet}>
            <Text style={styles.question}>What is it?</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Vitamins"
              placeholderTextColor={theme.color.textMuted}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
            <View style={styles.chips}>
              {SUGGESTED.map((suggestion) => (
                <Pressable
                  key={suggestion}
                  accessibilityRole="button"
                  onPress={() => setName(suggestion)}
                  style={styles.chip}>
                  <Text style={styles.chipText}>{suggestion}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Category</Text>
            <View style={styles.chips}>
              {(categories ?? []).map((category) => {
                const selected = categoryId === category.id;
                const shades = categoryShades(category);
                return (
                  <Pressable
                    key={category.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setCategoryId(selected ? null : category.id)}
                    style={[
                      styles.chip,
                      selected && {
                        backgroundColor: shades.fill,
                        borderColor: shades.color,
                      },
                    ]}>
                    <Text
                      style={[
                        styles.chipText,
                        selected && { color: shades.ink },
                      ]}>
                      {category.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label}>Where it lives</Text>
            <TextInput
              style={styles.input}
              value={locationNote}
              onChangeText={setLocationNote}
              placeholder="Kitchen, medicine shelf"
              placeholderTextColor={theme.color.textMuted}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />

            <Text style={styles.label}>Notes</Text>
            <Text style={styles.hint}>
              Filter size, product name, dosage, phone number.
            </Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Anything worth knowing when this goes off."
              placeholderTextColor={theme.color.textMuted}
              multiline
              textAlignVertical="top"
            />

            <Text style={styles.label}>When</Text>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: scheduled }}
              accessibilityLabel="Add a schedule"
              onPress={() => {
                Keyboard.dismiss();
                setScheduled((on) => !on);
              }}
              style={({ pressed }) => [
                styles.scheduleToggle,
                scheduled && styles.scheduleToggleOn,
                pressed && styles.pressed,
              ]}>
              <Text
                style={[
                  styles.scheduleToggleText,
                  scheduled && styles.scheduleToggleTextOn,
                ]}>
                {scheduled ? 'Remove the schedule' : 'Add a schedule'}
              </Text>
            </Pressable>

            {!scheduled ? (
              <Text style={styles.hint}>
                Without one this never rings on its own, and completes by
                tapping done. You can add one later from the knowt itself.
              </Text>
            ) : (
              <>
                <TimeWheel value={time} onChange={setTime} />
                <View style={styles.chips}>
                  {REPEATS.map((repeat) => {
                    const selected = repeatType === repeat.value;
                    return (
                      <Pressable
                        key={repeat.value}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => setRepeatType(repeat.value)}
                        style={[styles.chip, selected && styles.chipSelected]}>
                        <Text
                          style={[
                            styles.chipText,
                            selected && styles.chipTextSelected,
                          ]}>
                          {repeat.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.hint}>
                  {formatTime(time)},{' '}
                  {REPEATS.find((r) => r.value === repeatType)?.label.toLowerCase()}.
                </Text>
              </>
            )}
          </Pressable>
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label={saving ? 'Saving' : 'Done'}
            variant="highlight"
            disabled={!ready || saving}
            onPress={() => void done()}
          />
          <Button label="Cancel" variant="quiet" onPress={leave} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.background },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  pressed: { opacity: 0.7 },
  // Inverted, the same as on Knowts, so the way in to a preset looks the same
  // wherever it is offered.
  presets: {
    backgroundColor: theme.color.primary,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    gap: 2,
  },
  presetsText: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.lg,
    color: theme.color.onPrimary,
  },
  presetsMeta: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.border,
  },
  sheet: { gap: theme.spacing.sm },
  question: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.xl,
    color: theme.color.textPrimary,
  },
  label: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: theme.spacing.lg,
  },
  hint: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    lineHeight: 20,
    color: theme.color.textMuted,
  },
  input: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.lg,
    color: theme.color.textPrimary,
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  multiline: { minHeight: 100 },
  scheduleToggle: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  scheduleToggleOn: {
    backgroundColor: theme.color.highlight,
    borderColor: theme.color.highlight,
  },
  scheduleToggleText: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  scheduleToggleTextOn: { color: theme.color.onHighlight },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  chip: {
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  chipSelected: {
    backgroundColor: theme.color.highlight,
    borderColor: theme.color.highlight,
  },
  chipText: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    color: theme.color.textSecondary,
  },
  chipTextSelected: { color: theme.color.onHighlight },
  footer: {
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
});

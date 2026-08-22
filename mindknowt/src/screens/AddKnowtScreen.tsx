import { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
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

import { Button, ScreenHeader } from '../components/ui';
import { createKnowt, listCategories, toISODate, type RepeatType } from '../db';
import { useQuery } from '../db/useQuery';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Spec section 5.5 is one decision per screen. Build-order step 3 is Open mode
 * only, so the tag question and the strictness question are both absent — they
 * arrive with steps 5 and 6.
 */
const STEPS = ['name', 'category', 'notes', 'when'] as const;
type Step = (typeof STEPS)[number];

const REPEATS: { value: RepeatType; label: string }[] = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekends', label: 'Weekends' },
  { value: 'once', label: 'Once' },
];

const SUGGESTED = ['Vitamins', 'Water the plants', 'Take the bins out', 'Retinol'];

export function AddKnowtScreen() {
  const navigation = useNavigation<Nav>();
  const { data: categories } = useQuery(() => listCategories(), []);

  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [locationNote, setLocationNote] = useState('');
  const [notes, setNotes] = useState('');
  const [time, setTime] = useState('08:00');
  const [repeatType, setRepeatType] = useState<RepeatType>('daily');
  const [saving, setSaving] = useState(false);

  const step: Step = STEPS[stepIndex] ?? 'name';
  const canAdvance = step === 'name' ? name.trim().length > 0 : true;

  const save = async () => {
    setSaving(true);
    try {
      const id = await createKnowt({
        name: name.trim(),
        categoryId,
        locationNote: locationNote.trim() || null,
        notes: notes.trim() || null,
        mode: 'open',
        schedule: {
          time,
          repeatType,
          startDate: repeatType === 'once' ? toISODate(new Date()) : undefined,
        },
      });
      navigation.replace('KnowtDetail', { knowtId: id });
    } finally {
      setSaving(false);
    }
  };

  const next = () => {
    if (stepIndex < STEPS.length - 1) setStepIndex(stepIndex + 1);
    else void save();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          <ScreenHeader
            title="Add a knowt"
            subtitle={`Step ${stepIndex + 1} of ${STEPS.length}`}
          />

          {step === 'name' && (
            <View style={styles.section}>
              <Text style={styles.question}>What is it?</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Vitamins"
                placeholderTextColor={theme.color.textMuted}
                autoFocus
                returnKeyType="next"
              />
              <View style={styles.chips}>
                {SUGGESTED.map((suggestion) => (
                  <Pressable
                    key={suggestion}
                    onPress={() => setName(suggestion)}
                    style={styles.chip}>
                    <Text style={styles.chipText}>{suggestion}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {step === 'category' && (
            <View style={styles.section}>
              <Text style={styles.question}>Where does it belong?</Text>
              <View style={styles.chips}>
                {(categories ?? []).map((category) => {
                  const selected = categoryId === category.id;
                  return (
                    <Pressable
                      key={category.id}
                      onPress={() => setCategoryId(selected ? null : category.id)}
                      style={[
                        styles.chip,
                        selected && { borderColor: category.color },
                      ]}>
                      <Text
                        style={[
                          styles.chipText,
                          selected && { color: category.color },
                        ]}>
                        {category.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>Where does it live?</Text>
              <TextInput
                style={styles.input}
                value={locationNote}
                onChangeText={setLocationNote}
                placeholder="Kitchen · medicine shelf"
                placeholderTextColor={theme.color.textMuted}
              />
            </View>
          )}

          {step === 'notes' && (
            <View style={styles.section}>
              <Text style={styles.question}>
                Anything you will want to know when this goes off?
              </Text>
              <Text style={styles.hint}>
                Filter size, product name, dosage, phone number.
              </Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={notes}
                onChangeText={setNotes}
                placeholder="20x25x1, MERV 11"
                placeholderTextColor={theme.color.textMuted}
                multiline
                textAlignVertical="top"
              />
            </View>
          )}

          {step === 'when' && (
            <View style={styles.section}>
              <Text style={styles.question}>When?</Text>
              <TextInput
                style={styles.input}
                value={time}
                onChangeText={setTime}
                placeholder="08:00"
                placeholderTextColor={theme.color.textMuted}
                keyboardType="numbers-and-punctuation"
              />
              <View style={styles.chips}>
                {REPEATS.map((repeat) => {
                  const selected = repeatType === repeat.value;
                  return (
                    <Pressable
                      key={repeat.value}
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
                No alarm is scheduled yet. This knowt completes by tapping done.
              </Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {stepIndex > 0 ? (
            <Button
              label="Back"
              variant="quiet"
              onPress={() => setStepIndex(stepIndex - 1)}
            />
          ) : null}
          <View style={styles.flex}>
            <Button
              label={stepIndex === STEPS.length - 1 ? 'Save' : 'Next'}
              onPress={next}
              disabled={!canAdvance || saving}
            />
          </View>
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
  section: { gap: theme.spacing.md },
  question: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.xl,
    fontWeight: theme.font.weight.medium,
    color: theme.color.textPrimary,
  },
  label: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: theme.spacing.md,
  },
  hint: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    lineHeight: 19,
    color: theme.color.textMuted,
  },
  input: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.lg,
    color: theme.color.textPrimary,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  multiline: { minHeight: 120 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  chipSelected: { borderColor: theme.color.accent },
  chipText: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    color: theme.color.textSecondary,
  },
  chipTextSelected: { color: theme.color.textPrimary },
  footer: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.sm,
  },
});

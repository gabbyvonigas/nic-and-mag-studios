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
import { createKnowt } from '../db';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const SUGGESTED = ['Vitamins', 'Water the plants', 'Take the garbage out', 'Retinol'];

/**
 * One question: what is it?
 *
 * Everything else moved into the setup screen, which is the same screen a
 * preset lands on. Both routes in now ask the same three things in the same
 * order, instead of a typed knowt getting one flow and a preset another.
 *
 * Backing out with something typed keeps it as a draft, so closing this by
 * accident does not throw the work away.
 */
export function AddKnowtScreen() {
  const navigation = useNavigation<Nav>();
  const [name, setName] = useState('');
  const ready = name.trim().length > 0;

  // Set once the flow has moved on, so leaving cannot also write a draft.
  const handedOff = useRef(false);

  const go = () => {
    if (!ready) return;
    handedOff.current = true;
    navigation.replace('SetupKnowt', { name: name.trim() });
  };

  /**
   * An empty form is not a draft, it is someone who opened the wrong thing,
   * and saving that would fill Drafts with rows nobody made.
   */
  const leave = () => {
    if (ready && !handedOff.current) {
      void createKnowt({ name: name.trim(), mode: 'open', isDraft: true });
    }
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={Keyboard.dismiss}>
          <SubScreenHeader
            title="What is it?"
            subtitle="Name it, then we will set up when and how it stops."
            onBack={leave}
            backLabel="Close"
          />

          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Vitamins"
            placeholderTextColor={theme.color.textMuted}
            autoFocus
            returnKeyType="next"
            onSubmitEditing={go}
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

          <View style={styles.presetRow}>
            <Text style={styles.presetNote}>Or start from something ready made</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.replace('BrowseSets')}
              style={({ pressed }) => [styles.presets, pressed && styles.pressed]}>
              <Text style={styles.presetsText}>Browse Presets</Text>
            </Pressable>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label="Continue"
            variant="highlight"
            disabled={!ready}
            onPress={go}
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
    gap: theme.spacing.md,
  },
  pressed: { opacity: 0.7 },
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  chip: {
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  chipText: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    color: theme.color.textSecondary,
  },
  presetRow: {
    marginTop: theme.spacing.xl,
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  presetNote: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textMuted,
  },
  presets: {
    backgroundColor: theme.color.primary,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.sm,
  },
  presetsText: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.md,
    color: theme.color.onPrimary,
  },
  footer: {
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
});

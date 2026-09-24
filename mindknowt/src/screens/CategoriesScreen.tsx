import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Alert,
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
import {
  CategoryLockedError,
  countKnowtsInCategory,
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
  type CategoryRow,
} from '../db';
import { useQuery } from '../db/useQuery';
import { categoryShades, CUSTOM_PALETTE, theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function Swatches({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <View style={styles.swatches}>
      {CUSTOM_PALETTE.map((color) => {
        const on = value.toLowerCase() === color.toLowerCase();
        return (
          <Pressable
            key={color}
            accessibilityRole="button"
            accessibilityLabel={`Color ${color}`}
            accessibilityState={{ selected: on }}
            onPress={() => onChange(color)}
            style={[
              styles.swatch,
              { backgroundColor: color },
              on && styles.swatchOn,
            ]}
          />
        );
      })}
    </View>
  );
}

function CategoryRowView({
  category,
  onRename,
  onRecolor,
  onDelete,
}: {
  category: CategoryRow;
  onRename: (name: string) => void;
  onRecolor: (color: string) => void;
  onDelete: () => void;
}) {
  const shades = categoryShades(category);
  const custom = category.is_custom === 1;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(category.name);

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={category.name}
        onPress={() => {
          setDraft(category.name);
          setOpen((prev) => !prev);
        }}
        style={styles.rowTop}>
        <View style={[styles.dot, { backgroundColor: shades.mark }]} />
        <Text style={styles.rowName}>{category.name}</Text>
        {!custom ? <Text style={styles.builtIn}>Built in</Text> : null}
      </Pressable>

      {open ? (
        <View style={styles.editor}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Category name"
            placeholderTextColor={theme.color.textMuted}
          />

          {custom ? (
            <Swatches value={category.color} onChange={onRecolor} />
          ) : (
            <Text style={styles.hint}>
              Built in categories keep their colors. Make your own to choose
              one.
            </Text>
          )}

          <View style={styles.editorActions}>
            <Button
              label="Save name"
              variant="secondary"
              disabled={draft.trim().length === 0 || draft === category.name}
              onPress={() => {
                onRename(draft);
                setOpen(false);
              }}
            />
            {custom ? (
              <Button label="Delete" variant="quiet" onPress={onDelete} />
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function CategoriesScreen() {
  const navigation = useNavigation<Nav>();
  const { data, reload } = useQuery(() => listCategories(), []);

  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(CUSTOM_PALETTE[0]);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const run = async (task: () => Promise<void>) => {
    setError(null);
    try {
      await task();
      await reload();
    } catch (err) {
      // CategoryLockedError carries copy meant for the person, so it is shown
      // as written rather than wrapped in anything.
      setError(
        err instanceof CategoryLockedError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err),
      );
    }
  };

  const add = () =>
    void run(async () => {
      await createCategory({ name, color });
      setName('');
      setColor(CUSTOM_PALETTE[0]);
    });

  const confirmDelete = async (category: CategoryRow) => {
    const count = await countKnowtsInCategory(category.id);
    const detail =
      count === 0
        ? 'Nothing is in it.'
        : `${count} knowt${count === 1 ? '' : 's'} will keep everything else and just lose the category.`;

    Alert.alert(`Delete ${category.name}?`, detail, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void run(() => deleteCategory(category.id)),
      },
    ]);
  };

  const categories = data ?? [];
  const custom = categories.filter((c) => c.is_custom === 1);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          <SubScreenHeader
            title="Categories"
            subtitle="Tap one to rename it. Yours can be recolored or removed."
            onBack={() => navigation.goBack()}
          />

          {error ? (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>{error}</Text>
            </View>
          ) : null}

          {categories.map((category) => (
            <CategoryRowView
              key={category.id}
              category={category}
              onRename={(next) =>
                void run(() => updateCategory(category.id, { name: next }))
              }
              onRecolor={(next) =>
                void run(() => updateCategory(category.id, { color: next }))
              }
              onDelete={() => void confirmDelete(category)}
            />
          ))}

          <Text style={styles.sectionTitle}>Add a category</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Garage, Studio, Pets"
            placeholderTextColor={theme.color.textMuted}
          />
          <Swatches value={color} onChange={setColor} />
          <Button
            label="Add category"
            disabled={name.trim().length === 0}
            onPress={add}
          />
          {custom.length === 0 ? (
            <Text style={styles.hint}>
              The six built in categories cover most things. Add your own when
              they do not.
            </Text>
          ) : null}
        </ScrollView>
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
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.sm,
  },
  row: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    minHeight: 28,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  rowName: {
    flex: 1,
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.lg,
    color: theme.color.textPrimary,
  },
  builtIn: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.xs,
    color: theme.color.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  editor: { marginTop: theme.spacing.md, gap: theme.spacing.md },
  editorActions: { gap: theme.spacing.sm },
  input: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.lg,
    color: theme.color.textPrimary,
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchOn: { borderColor: theme.color.textPrimary },
  sectionTitle: {
    marginTop: theme.spacing.xl,
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  hint: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textMuted,
  },
  banner: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.dangerBorder,
    backgroundColor: theme.color.dangerSurface,
    padding: theme.spacing.md,
  },
  bannerText: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.md,
    color: theme.color.dangerText,
  },
});

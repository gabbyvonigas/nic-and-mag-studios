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

import { CategoryDot } from '../components/KnowtCard';
import { Button, SubScreenHeader } from '../components/ui';
import {
  CategoryLockedError,
  countKnowtsInCategory,
  createCategory,
  deleteCategory,
  listCategories,
  reorderCategories,
  resetCategoryColor,
  updateCategory,
  type CategoryRow,
} from '../db';
import { canMove, moveCategory } from '../knowts/categoryOrder';
import { useQuery } from '../db/useQuery';
import { categoryShades, theme } from '../theme';
import { swatchGrid } from '../theme/colorGrid';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * The color picker.
 *
 * A generated grid rather than a hue wheel: a real picker means a gesture
 * driven control or a third party dependency, and neither is in this project.
 * The grid covers enough of the spectrum to make a category look like whatever
 * someone has in mind, and every swatch in it is checked to produce a readable
 * ink; see `colorGrid.ts`.
 */
function Swatches({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <View style={styles.swatchGrid}>
      {swatchGrid().map((row, index) => (
        <View key={index} style={styles.swatchRow}>
          {row.map((color) => {
            // Folded, because the grid writes uppercase and a stored color may
            // have come from anywhere.
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
      ))}
    </View>
  );
}

/** One step of the reorder control. Absent at the ends rather than dead. */
function MoveButton({
  direction,
  enabled,
  onPress,
}: {
  direction: 'up' | 'down';
  enabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Move ${direction}`}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.move,
        !enabled && styles.moveOff,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.moveGlyph, !enabled && styles.moveGlyphOff]}>
        {direction === 'up' ? '\u2191' : '\u2193'}
      </Text>
    </Pressable>
  );
}

function CategoryRowView({
  category,
  canUp,
  canDown,
  onRename,
  onRecolor,
  onResetColor,
  onMove,
  onDelete,
}: {
  category: CategoryRow;
  canUp: boolean;
  canDown: boolean;
  onRename: (name: string) => void;
  onRecolor: (color: string) => void;
  onResetColor: () => void;
  onMove: (direction: 'up' | 'down') => void;
  onDelete: () => void;
}) {
  const shades = categoryShades(category);
  const custom = category.is_custom === 1;
  const recolored = category.color_locked === 1;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(category.name);

  return (
    <View style={styles.row}>
      <View style={styles.rowLine}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={category.name}
          onPress={() => {
            setDraft(category.name);
            setOpen((prev) => !prev);
          }}
          style={styles.rowTop}>
          <CategoryDot shades={shades} size={12} />
          <Text style={styles.rowName}>{category.name}</Text>
        </Pressable>

        {/* The order here is the order on Knowts. Two controls rather than a
            drag: the strip they reorder scrolls sideways, and a drag inside it
            has to fight that scroll for every gesture. */}
        <View style={styles.moves}>
          <MoveButton
            direction="up"
            enabled={canUp}
            onPress={() => onMove('up')}
          />
          <MoveButton
            direction="down"
            enabled={canDown}
            onPress={() => onMove('down')}
          />
        </View>
      </View>

      {open ? (
        <View style={styles.editor}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Category name"
            placeholderTextColor={theme.color.textMuted}
          />

          <Swatches value={category.color} onChange={onRecolor} />

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
            {/* Only once there is something to go back to, and only for a
                shipped category, since a custom one has no default color. */}
            {!custom && recolored ? (
              <Button
                label="Reset color"
                variant="quiet"
                onPress={onResetColor}
              />
            ) : null}
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
  const [color, setColor] = useState<string>(swatchGrid()[1]?.[0] ?? '#FF4D3D');
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
      setColor(swatchGrid()[1]?.[0] ?? '#FF4D3D');
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

  /**
   * Writes the whole order rather than the one row that moved. Every category
   * shipped with sort 0, so the first move has to give all of them a value or
   * the list falls back to ordering by name.
   */
  const move = (id: string, direction: 'up' | 'down') =>
    void run(() =>
      reorderCategories(
        moveCategory(categories, id, direction).map((c) => c.id),
      ),
    );

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
            subtitle="Tap one to rename or recolor it. The arrows set the order they appear in."
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
              canUp={canMove(categories, category.id, 'up')}
              canDown={canMove(categories, category.id, 'down')}
              onRename={(next) =>
                void run(() => updateCategory(category.id, { name: next }))
              }
              onRecolor={(next) =>
                void run(() => updateCategory(category.id, { color: next }))
              }
              onResetColor={() =>
                void run(() => resetCategoryColor(category.id))
              }
              onMove={(direction) => move(category.id, direction)}
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
  rowLine: { flexDirection: 'row', alignItems: 'center' },
  rowTop: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    minHeight: 28,
  },
  moves: { flexDirection: 'row', gap: theme.spacing.xs },
  move: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surfaceMuted,
  },
  // Still drawn at the ends, and plainly out of action, so the row does not
  // change shape as a category moves up and down the list.
  moveOff: { backgroundColor: 'transparent' },
  moveGlyph: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  moveGlyphOff: { color: theme.color.border },
  pressed: { opacity: 0.6 },
  rowName: {
    flex: 1,
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.lg,
    color: theme.color.textPrimary,
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
  // Rows rather than a wrap, so the hues stay in spectrum order down the grid
  // and a color can be found by where it sits rather than by hunting.
  swatchGrid: { gap: theme.spacing.xs },
  swatchRow: { flexDirection: 'row', gap: theme.spacing.xs },
  swatch: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: theme.radius.sm,
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

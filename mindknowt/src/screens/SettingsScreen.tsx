import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '../components/Icon';
import { SubScreenHeader } from '../components/ui';
import { DISCLOSURE, openTagStore } from '../tags/store';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Spec section 5.9 lists more than this: permission status, default snooze
 * and re-fire, categories manager, browse sets, export history. Those arrive
 * with their own build-order steps; only Legal exists today.
 */
/**
 * One Settings entry: a tappable line, and the sentence under it.
 *
 * The note used to be a sibling of the row with a margin of its own. The row
 * carried sixteen points of bottom padding and the note added eight on top of
 * that, so the gap between a title and its description was twenty four, and
 * the note had nothing below it at all, which put it hard against the next
 * row's border. Holding both in one box is what makes the padding even.
 */
function SettingsRow({
  label,
  note,
  onPress,
}: {
  label: string;
  note?: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Icon name="forward" color={theme.color.textMuted} />
      </Pressable>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

export function SettingsScreen() {
  const navigation = useNavigation<Nav>();

  /**
   * One product, so no sheet to choose from: the row is the link. Sizes are
   * picked on Amazon's own page now.
   */
  const orderMore = () => {
    void (async () => {
      if (!(await openTagStore())) {
        Alert.alert(
          'Could not open Amazon',
          'Nothing on this phone would take the link.',
        );
      }
    })();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <SubScreenHeader title="Settings" onBack={() => navigation.goBack()} />

        <SettingsRow
          label="Your first 5 tags"
          note="Five NFC tags are included with the app. We post them."
          onPress={() => navigation.navigate('ClaimTags')}
        />

        {/* Not a row like the others. Reordering is the one thing on this
            screen that leaves the app and costs money, so it says why it is
            here and what it does before it is pressed. */}
        <View style={styles.section}>
          <Text style={styles.pitch}>
            Order more tags below until our Knowt Tags are back in stock.
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Order Knowt Tags on Amazon"
            accessibilityHint="Opens Amazon outside the app"
            onPress={orderMore}
            style={({ pressed }) => [styles.buy, pressed && styles.pressed]}>
            <Text style={styles.buyLabel}>Order Knowt Tags on Amazon</Text>
            <Icon name="openLink" color={theme.color.onHighlight} />
          </Pressable>

          {/* Required by the Associates program wherever the link is offered,
              so it sits with the button rather than somewhere further down. */}
          <Text style={styles.note}>
            Opens Amazon. We do not sell these ourselves. {DISCLOSURE}
          </Text>
        </View>

        <SettingsRow
          label="Legal"
          onPress={() => navigation.navigate('Legal')}
        />

        <SettingsRow
          label="Dev tools"
          note="Test harnesses and database tools. This goes before release."
          onPress={() => navigation.navigate('Dev')}
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
  },
  section: {
    borderTopWidth: 1,
    borderTopColor: theme.color.border,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.xs,
  },
  pressed: { opacity: 0.6 },
  pitch: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.lg,
    lineHeight: 25,
    color: theme.color.textPrimary,
  },
  // The brand lime with the ink that belongs on it. A pill, because it leaves
  // the app and should not look like the rows above it.
  buy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: 999,
    backgroundColor: theme.color.highlight,
  },
  buyLabel: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.md,
    color: theme.color.onHighlight,
  },
  rowLabel: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.lg,
    color: theme.color.textPrimary,
  },
  note: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    lineHeight: 19,
    color: theme.color.textMuted,
  },
});

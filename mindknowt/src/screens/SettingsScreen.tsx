import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SubScreenHeader } from '../components/ui';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Spec section 5.9 lists more than this: permission status, default snooze
 * and re-fire, categories manager, browse sets, export history. Those arrive
 * with their own build-order steps; only Legal exists today.
 */
export function SettingsScreen() {
  const navigation = useNavigation<Nav>();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <SubScreenHeader title="Settings" onBack={() => navigation.goBack()} />

        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('Legal')}
          style={styles.row}>
          <Text style={styles.rowLabel}>Legal</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('Dev')}
          style={styles.row}>
          <Text style={styles.rowLabel}>Dev tools</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <Text style={styles.note}>
          Test harnesses and database tools. This goes before release.
        </Text>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.color.border,
  },
  rowLabel: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.lg,
    color: theme.color.textPrimary,
  },
  note: {
    marginTop: theme.spacing.sm,
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textMuted,
  },
  chevron: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.xl,
    color: theme.color.textMuted,
  },
});

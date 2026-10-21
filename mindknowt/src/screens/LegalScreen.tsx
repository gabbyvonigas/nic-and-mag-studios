import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SubScreenHeader } from '../components/ui';
import { theme } from '../theme';
import type { LegalDocument, RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export const LEGAL_TITLES: Record<LegalDocument, string> = {
  terms: 'Terms of service',
  privacy: 'Privacy policy',
};

const DOCUMENTS: LegalDocument[] = ['terms', 'privacy'];

export function LegalScreen() {
  const navigation = useNavigation<Nav>();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <SubScreenHeader title="Legal" onBack={() => navigation.goBack()} />

        {DOCUMENTS.map((document) => (
          <Pressable
            key={document}
            accessibilityRole="button"
            onPress={() => navigation.navigate('LegalDocument', { document })}
            style={styles.row}>
            <Text style={styles.rowLabel}>{LEGAL_TITLES[document]}</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
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
  chevron: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.xl,
    color: theme.color.textMuted,
  },
});

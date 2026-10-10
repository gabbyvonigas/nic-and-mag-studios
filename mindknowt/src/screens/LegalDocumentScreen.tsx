import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SubScreenHeader } from '../components/ui';
import { LEGAL_TITLES } from './LegalScreen';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'LegalDocument'>;

/**
 * Placeholder. The body text is supplied by the owner and drops in here, in one
 * place, keyed by document. Nothing is drafted on their behalf, because these
 * are binding documents and inventing wording would be worse than an empty
 * screen.
 */
const BODIES: Partial<Record<keyof typeof LEGAL_TITLES, string>> = {};

export function LegalDocumentScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const title = LEGAL_TITLES[params.document];
  const body = BODIES[params.document];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <SubScreenHeader title={title} onBack={() => navigation.goBack()} />

        {body ? (
          <Text style={styles.body}>{body}</Text>
        ) : (
          <Text style={styles.pending}>
            Not added yet. This document will be in place before release.
          </Text>
        )}
      </ScrollView>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.background },
  content: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  body: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    lineHeight: 22,
    color: theme.color.textBody,
  },
  pending: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    color: theme.color.textMuted,
  },
});

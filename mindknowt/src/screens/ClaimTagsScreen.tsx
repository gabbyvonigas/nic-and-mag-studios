import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, SubScreenHeader } from '../components/ui';
import { getAppMeta, setAppMeta } from '../db';
import {
  claimFailureText,
  isClaimConfigured,
  submitTagClaim,
} from '../tags/claim';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Written once the row is confirmed stored, so the screen can say so later. */
const CLAIMED_AT = 'tag_claim_submitted_at';

export function ClaimTagsScreen() {
  const navigation = useNavigation<Nav>();

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');

  const [claimedAt, setClaimedAt] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setClaimedAt(await getAppMeta(CLAIMED_AT));
      })();
    }, []),
  );

  const filled =
    name.trim() &&
    address.trim() &&
    city.trim() &&
    state.trim() &&
    zip.trim();

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      await submitTagClaim({
        name: name.trim(),
        address: address.trim(),
        city: city.trim(),
        state: state.trim(),
        zip: zip.trim(),
      });

      // Only after Airtable confirms it stored the row. Writing this first
      // would mean telling someone their tags are coming when nothing sent.
      const at = new Date().toISOString();
      await setAppMeta(CLAIMED_AT, at);
      setClaimedAt(at);
      setSent(true);
    } catch (err) {
      setError(claimFailureText(err));
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <SubScreenHeader
            title="On its way"
            onBack={() => navigation.goBack()}
          />
          <Text style={styles.body}>
            Five tags are going out to {name.trim()}. We pack and post these
            ourselves, so give it a little time.
          </Text>
          <Text style={styles.hint}>
            Nothing else is needed from you. Stick one on the thing, then open
            a knowt and add the tag to it.
          </Text>
          <Button label="Done" onPress={() => navigation.goBack()} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          <SubScreenHeader
            title="Claim your free tags"
            subtitle="Five NFC tags, included with the app. We post them."
            onBack={() => navigation.goBack()}
          />

          {claimedAt ? (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>
                You already claimed on{' '}
                {new Date(claimedAt).toLocaleDateString()}. Sending this again
                adds a second request.
              </Text>
            </View>
          ) : null}

          {!isClaimConfigured() ? (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>
                This build cannot send the form. Nothing here will be sent.
              </Text>
            </View>
          ) : null}

          {error ? (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>{error}</Text>
            </View>
          ) : null}

          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Who the parcel is addressed to"
            placeholderTextColor={theme.color.textMuted}
            autoComplete="name"
            textContentType="name"
          />

          <Text style={styles.label}>Address</Text>
          <TextInput
            style={styles.input}
            value={address}
            onChangeText={setAddress}
            placeholder="Street address"
            placeholderTextColor={theme.color.textMuted}
            autoComplete="street-address"
            textContentType="fullStreetAddress"
          />

          <Text style={styles.label}>City</Text>
          <TextInput
            style={styles.input}
            value={city}
            onChangeText={setCity}
            placeholder="City"
            placeholderTextColor={theme.color.textMuted}
            textContentType="addressCity"
          />

          <View style={styles.pair}>
            <View style={styles.pairItem}>
              <Text style={styles.label}>State</Text>
              <TextInput
                style={styles.input}
                value={state}
                onChangeText={setState}
                placeholder="State"
                placeholderTextColor={theme.color.textMuted}
                autoCapitalize="characters"
                textContentType="addressState"
              />
            </View>
            <View style={styles.pairItem}>
              <Text style={styles.label}>Zip</Text>
              <TextInput
                style={styles.input}
                value={zip}
                onChangeText={setZip}
                placeholder="Zip"
                placeholderTextColor={theme.color.textMuted}
                keyboardType="number-pad"
                textContentType="postalCode"
              />
            </View>
          </View>

          <Text style={styles.hint}>
            Your address is used to post the tags and nothing else. It goes to
            our order list, not to any advertiser.
          </Text>
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label={sending ? 'Sending' : 'Send my address'}
            disabled={!filled || sending || !isClaimConfigured()}
            onPress={() => void send()}
          />
          <Button
            label="Not now"
            variant="quiet"
            onPress={() => navigation.goBack()}
          />
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
    gap: theme.spacing.sm,
  },
  label: {
    marginTop: theme.spacing.md,
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
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
  pair: { flexDirection: 'row', gap: theme.spacing.md },
  pairItem: { flex: 1 },
  body: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.lg,
    lineHeight: 26,
    color: theme.color.textPrimary,
  },
  hint: {
    marginTop: theme.spacing.md,
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textMuted,
  },
  notice: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.warningBorder,
    backgroundColor: theme.color.warningSurface,
    padding: theme.spacing.md,
  },
  noticeText: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.warningText,
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
  footer: {
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
});

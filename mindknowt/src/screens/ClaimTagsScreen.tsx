import { useCallback, useState } from 'react';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, SubScreenHeader } from '../components/ui';
import { getAppMeta, setAppMeta } from '../db';
import {
  claimFailureText,
  isClaimConfigured,
  submitTagClaim,
  validateClaim,
  type ClaimField,
  type TagClaim,
} from '../tags/claim';
import { CLAIMED_AT, markOfferAnswered } from '../tags/offer';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'ClaimTags'>;

const EMPTY: TagClaim = {
  name: '',
  email: '',
  address: '',
  city: '',
  state: '',
  zip: '',
};

/** One field, its label, and whatever is wrong with it. */
function Field({
  label,
  value,
  onChangeText,
  onBlur,
  problem,
  optional,
  ...input
}: {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  onBlur: () => void;
  problem?: string;
  optional?: boolean;
} & TextInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {optional ? <Text style={styles.optional}>{'  optional'}</Text> : null}
      </Text>
      <TextInput
        {...input}
        style={[styles.input, problem ? styles.inputProblem : null]}
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        placeholderTextColor={theme.color.textMuted}
      />
      {problem ? <Text style={styles.problem}>{problem}</Text> : null}
    </View>
  );
}

export function ClaimTagsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const isPrompt = route.params?.prompt === true;

  // The pitch is only for the one-time prompt. Reaching this from Settings was
  // already a choice, so it opens straight on the form.
  const [pitching, setPitching] = useState(isPrompt);
  const [draft, setDraft] = useState<TagClaim>(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<ClaimField, boolean>>>({});
  const [tried, setTried] = useState(false);

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

  const problems = validateClaim(draft);
  const complete = Object.keys(problems).length === 0;

  const set = (field: ClaimField) => (next: string) =>
    setDraft((prev) => ({ ...prev, [field]: next }));
  const blur = (field: ClaimField) => () =>
    setTouched((prev) => ({ ...prev, [field]: true }));
  // Held back until the field has been left, or until Send was reached, so
  // nothing is marked wrong while it is still being typed.
  const shownProblem = (field: ClaimField) =>
    touched[field] || tried ? problems[field] : undefined;

  const send = async () => {
    setTried(true);
    if (!complete) return;

    setSending(true);
    setError(null);
    try {
      await submitTagClaim({
        name: draft.name.trim(),
        email: draft.email.trim(),
        address: draft.address.trim(),
        city: draft.city.trim(),
        state: draft.state.trim(),
        zip: draft.zip.trim(),
      });

      // Only after Airtable confirms it stored the row. Writing this first
      // would mean telling someone their tags are coming when nothing sent.
      const at = new Date().toISOString();
      await setAppMeta(CLAIMED_AT, at);
      await markOfferAnswered();
      setClaimedAt(at);
      setSent(true);
    } catch (err) {
      setError(claimFailureText(err));
    } finally {
      setSending(false);
    }
  };

  /**
   * Declining is confirmed twice. The tags are already paid for, and there is
   * no second prompt, so a stray tap here costs someone five tags.
   */
  const decline = () => {
    Alert.alert(
      'Skip your free tags?',
      'They are included in what you paid. We will not ask again.',
      [
        { text: 'Go back', style: 'cancel' },
        {
          text: 'Skip them',
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              'Sure?',
              'Without a tag there is nothing to scan. You can still find this in Settings later.',
              [
                { text: 'Send them to me', onPress: () => setPitching(false) },
                {
                  text: 'Yes, skip',
                  style: 'destructive',
                  onPress: () => {
                    void markOfferAnswered();
                    navigation.goBack();
                  },
                },
              ],
            ),
        },
      ],
    );
  };

  if (sent) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <SubScreenHeader
            title="Five tags are on the way"
            onBack={() => navigation.goBack()}
          />
          <Text style={styles.body}>
            They are going out to {draft.name.trim()}. We pack and post these
            ourselves, so allow a couple of weeks.
          </Text>
          <Text style={styles.hint}>
            Nothing else is needed from you. When they arrive, stick one on the
            thing, then open a knowt and add the tag to it.
          </Text>
          <View style={styles.footerInline}>
            <Button label="Done" onPress={() => navigation.goBack()} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (pitching) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <SubScreenHeader
            title="Your first 5 tags, on us"
            onBack={() => navigation.goBack()}
            backLabel="Later"
          />
          <Text style={styles.body}>
            MindKnowt needs something to scan. Five NFC tags come with the app,
            and we post them to you.
          </Text>
          <Text style={styles.hint}>
            Stick one where a task actually lives: the fridge, the pill box, the
            front door. The alarm stops when you get there.
          </Text>

          {!isClaimConfigured() ? (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>
                This build cannot send the form. Nothing here will be sent.
              </Text>
            </View>
          ) : null}

          <View style={styles.footerInline}>
            <Button
              label="Send them to me"
              disabled={!isClaimConfigured()}
              onPress={() => setPitching(false)}
            />
            <Button label="No thanks" variant="quiet" onPress={decline} />
          </View>
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
            title="Where should we send them?"
            subtitle="Five NFC tags, included with the app."
            onBack={() => (isPrompt ? setPitching(true) : navigation.goBack())}
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

          <Field
            label="Name"
            value={draft.name}
            onChangeText={set('name')}
            onBlur={blur('name')}
            problem={shownProblem('name')}
            placeholder="Who the parcel is addressed to"
            autoComplete="name"
            textContentType="name"
          />

          <Field
            label="Email"
            optional
            value={draft.email}
            onChangeText={set('email')}
            onBlur={blur('email')}
            problem={shownProblem('email')}
            placeholder="So we can tell you it shipped"
            autoComplete="email"
            textContentType="emailAddress"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Field
            label="Address"
            value={draft.address}
            onChangeText={set('address')}
            onBlur={blur('address')}
            problem={shownProblem('address')}
            placeholder="Street address"
            // Line one, not the whole address. Saying fullStreetAddress told
            // iOS this one field held everything, so autofill correctly put
            // the city and zip in it too.
            autoComplete="address-line1"
            textContentType="streetAddressLine1"
          />

          <Field
            label="City"
            value={draft.city}
            onChangeText={set('city')}
            onBlur={blur('city')}
            problem={shownProblem('city')}
            placeholder="City"
            autoComplete="postal-address-locality"
            textContentType="addressCity"
          />

          <View style={styles.pair}>
            <View style={styles.pairItem}>
              <Field
                label="State"
                value={draft.state}
                onChangeText={set('state')}
                onBlur={blur('state')}
                problem={shownProblem('state')}
                placeholder="State"
                autoCapitalize="characters"
                autoComplete="postal-address-region"
                textContentType="addressState"
              />
            </View>
            <View style={styles.pairItem}>
              <Field
                label="Zip"
                value={draft.zip}
                onChangeText={set('zip')}
                onBlur={blur('zip')}
                problem={shownProblem('zip')}
                placeholder="Zip"
                keyboardType="number-pad"
                autoComplete="postal-code"
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
          {tried && !complete ? (
            <Text style={styles.footerNote}>
              Fill in the fields marked above.
            </Text>
          ) : null}
          <Button
            label={sending ? 'Sending' : 'Send my address'}
            disabled={!complete || sending || !isClaimConfigured()}
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
  field: { marginTop: theme.spacing.md, gap: theme.spacing.xs },
  label: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  optional: {
    fontFamily: theme.font.face.regular,
    color: theme.color.textMuted,
    textTransform: 'none',
    letterSpacing: 0,
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
  inputProblem: { borderColor: theme.color.dangerBorder },
  problem: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.dangerText,
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
  footerInline: { marginTop: theme.spacing.xl, gap: theme.spacing.sm },
  footerNote: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.dangerText,
    textAlign: 'center',
  },
});

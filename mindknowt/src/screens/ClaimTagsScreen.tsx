import { useCallback, useState } from 'react';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, SubScreenHeader } from '../components/ui';
import { LockIcon } from '../components/icons';
import { isShopConfigured } from '../shop/config';
import {
  claimState,
  markOfferAnswered,
  startFreeClaim,
  type ClaimState,
} from '../shop/freeTags';
import { ShopError } from '../shop/types';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'ClaimTags'>;

/**
 * The free starter pack.
 *
 * This used to be a six field postal address form that posted to Airtable.
 * Shopify checkout collects the address itself, so the form is gone rather
 * than ported, and no part of this app handles a postal address any more.
 *
 * What remains is the pitch and one button. The button opens a real checkout
 * for a real product, which means the failures are real too: an unpublished
 * product, a refused token, no network. Each one says what it was, because a
 * button that silently does nothing is the worst outcome available here.
 */
export function ClaimTagsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();

  /** Arriving from the once-only prompt on Daily rather than from Settings. */
  const prompted = route.params?.prompt === true;

  const [state, setState] = useState<ClaimState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void (async () => setState(await claimState()))();
    }, []),
  );

  const configured = isShopConfigured();

  const claim = () =>
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        await startFreeClaim();
        // Checkout is now in Safari. Coming back to a screen that still offers
        // the pack would read as the tap not having worked, so this reflects
        // what was just done and steps out of the way.
        setState(await claimState());
        if (prompted) navigation.goBack();
      } catch (err) {
        setError(
          err instanceof ShopError
            ? err.message
            : err instanceof Error
              ? `${err.constructor.name}: ${err.message}`
              : String(err),
        );
      } finally {
        setBusy(false);
      }
    })();

  const decline = () =>
    void (async () => {
      await markOfferAnswered();
      navigation.goBack();
    })();

  if (state === null) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ActivityIndicator color={theme.color.textSecondary} />
      </SafeAreaView>
    );
  }

  const taken = state !== 'unclaimed';

  /**
   * Sits directly above whatever sends someone to checkout, because that is the
   * moment they are about to type an address, and an assurance given anywhere
   * later is an assurance given too late.
   */
  const privacyNote = (
    <View style={styles.privacy}>
      <LockIcon size={12} color={theme.color.textMuted} />
      <Text style={styles.privacyText}>
        We use your address only to ship your Knowt Tags. We never sell it or
        share it for marketing.
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <SubScreenHeader
          title={taken ? 'Your starter tags' : 'Your first 5 tags, on us'}
          onBack={() => navigation.goBack()}
          backLabel={prompted ? 'Later' : undefined}
        />

        {taken ? (
          <>
            <Text style={styles.body}>
              {state === 'claimed'
                ? 'Your starter pack was already claimed. It is on its way, or already with you.'
                : 'Checkout was opened for your starter pack. If you finished it, the pack is on its way.'}
            </Text>
            {/* Checkout happens in Safari, so the app never hears the outcome.
                Offering it again is the honest answer to someone who closed it
                halfway rather than pretending to know they did not. */}
            {state === 'opened' ? (
              <>
                {privacyNote}
                <Button
                  label="Open checkout again"
                  variant="secondary"
                  disabled={!configured || busy}
                  onPress={claim}
                />
              </>
            ) : null}
          </>
        ) : (
          <>
            <Text style={styles.body}>
              MindKnowt needs something to scan. Five NFC tags come with the
              app, and we post them to you.
            </Text>
            <Text style={styles.hint}>
              Stick one where a task actually lives: the fridge, the pill box,
              the front door. The alarm stops when you get there.
            </Text>
          </>
        )}

        {!configured ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              The shop is not set up in this build, so nothing can be ordered.
            </Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>{error}</Text>
          </View>
        ) : null}

        {taken ? null : (
          <View style={styles.footer}>
            {privacyNote}
            <Button
              label={busy ? 'Opening checkout' : 'Send them to me'}
              disabled={!configured || busy}
              onPress={claim}
            />
            <Button label="No thanks" variant="quiet" onPress={decline} />
          </View>
        )}

        <Text style={styles.hint}>
          Checkout opens in Safari. Shipping details are entered there, not
          here.
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
    gap: theme.spacing.md,
  },
  body: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.md,
    lineHeight: 24,
    color: theme.color.textPrimary,
  },
  hint: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    lineHeight: 20,
    color: theme.color.textMuted,
  },
  banner: {
    backgroundColor: theme.color.warningSurface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.warningBorder,
    padding: theme.spacing.md,
  },
  bannerText: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    lineHeight: 20,
    color: theme.color.warningText,
  },
  privacy: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    // The lock is drawn from its top edge and the text from its cap height, so
    // a couple of points down lines the two up by eye.
    paddingTop: 2,
  },
  privacyText: {
    flex: 1,
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.xs,
    lineHeight: 17,
    color: theme.color.textMuted,
  },
  footer: { gap: theme.spacing.sm, marginTop: theme.spacing.sm },
});

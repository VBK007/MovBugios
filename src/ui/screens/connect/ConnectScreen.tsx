import { failureCopy } from '@/ui/failureCopy';
import React, { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  Amber,
  AmberBorderSoft,
  DirectPlay,
  Ink,
  OnInk,
  OnInkFaint,
  OnInkMuted,
  Radius,
  Space,
  TowerReadingMaxWidth,
  TowerType,
} from '@/theme';
import { ServiceLocator } from '@/di/serviceLocator';
import { SocialSignInProvider } from '@/auth/socialSignIn';
import {
  AmberButton,
  DataLabel,
  HairlineDivider,
  OutlineButton,
  StatusDot,
} from '@/ui/components/Primitives';
import { Field } from '@/ui/components/Field';
import { BuildStamp } from '@/ui/components/BuildStamp';

/** The connect screen's steps: find the server, then say who you are. */
type ConnectStep = 'ADDRESS' | 'SIGN_IN';

/**
 * Connect to the server, then sign in.
 *
 * Two steps rather than one form, because they fail for different reasons and a
 * combined form cannot tell you which went wrong — "wrong address" and "wrong
 * password" need different remedies.
 *
 * Ported from ui/screens/connect/ConnectScreen.kt. Sign-up and Google are part
 * of the remote auth layer and land with it; the address step and the sample
 * library are wired here.
 */
export function ConnectScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<ConnectStep>('ADDRESS');
  const [address, setAddress] = useState(ServiceLocator.DEFAULT_BASE_URL);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  /** Plain-English, because a stack trace helps nobody standing in a hallway. */
  const [error, setError] = useState<string | null>(null);
  const [serverName, setServerName] = useState<string | null>(null);

  /**
   * These strip newlines and surrounding space. Stopping the keyboard inserting
   * a newline is not enough — a pasted address routinely brings one with it, and
   * a trailing space is invisible in a field and fatal in a URL.
   */
  const clean = (raw: string) => raw.replace(/[\r\n]/g, '').trim();

  /**
   * Pairing always talks to the *remote* repository, never to whatever is
   * currently installed. On a cold start that is the sample library, whose
   * `pairManually` only checks the string looks like a URL — so connecting would
   * appear to succeed against an address that nothing answers on.
   */
  const connect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await ServiceLocator.remoteRepository().pairManually(clean(address));
      setServerName('Tower');
      setStep('SIGN_IN');
    } catch (e) {
      setError(failureCopy(e));
    } finally {
      setBusy(false);
    }
  }, [address]);

  const signIn = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await ServiceLocator.remoteRepository().login(clean(username), password);
      // Only now does the rest of the app start reading the real server.
      ServiceLocator.useRemote();
      onDone();
    } catch (e) {
      setError(failureCopy(e));
    } finally {
      setBusy(false);
    }
  }, [username, password, onDone]);

  const googleAvailable = SocialSignInProvider.current.isAvailable;

  const signInWithGoogle = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const outcome = await SocialSignInProvider.current.signInWithGoogle();
      // Dismissing the sheet is an ordinary thing to do; saying nothing is the
      // right response to it.
      if (outcome.type === 'CANCELLED') return;
      if (outcome.type === 'FAILED') {
        setError(outcome.message);
        return;
      }
      await ServiceLocator.remoteRepository().loginWithFirebase(outcome.idToken);
      ServiceLocator.useRemote();
      onDone();
    } catch (e) {
      setError('Google sign-in did not complete.');
    } finally {
      setBusy(false);
    }
  }, [onDone]);

  const useSampleData = useCallback(() => {
    ServiceLocator.useSampleData();
    onDone();
  }, [onDone]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Ink }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollOuter} keyboardShouldPersistTaps="handled">
        {/*
         * A sign-in form is reading-width content: full-bleed fields on a tablet
         * look like a web page, not an app.
         */}
        <View style={styles.column}>
          <Text style={[TowerType.titleScreen, { color: OnInk, marginTop: 40 }]}>
            {step === 'ADDRESS' ? 'Find your server' : 'Sign in'}
          </Text>

          <Text style={[TowerType.bodyProse, { color: OnInkMuted, marginTop: 10 }]}>
            {step === 'ADDRESS'
              ? 'Tower plays files from a machine you own. Enter its address, or the tunnel ' +
                'you are testing through.'
              : 'These are the details for the account on the server, not for anything online.'}
          </Text>

          {step === 'ADDRESS' ? (
            <>
              <Field
                value={address}
                onChange={setAddress}
                placeholder="http://192.168.1.14:8080 or a tunnel URL"
                keyboardType="url"
                onSubmitEditing={() => void connect()}
                style={{ marginTop: 22 }}
              />
              <AmberButton
                label={busy ? 'Checking…' : 'Connect'}
                onPress={() => void connect()}
                enabled={!busy}
                style={{ marginTop: 14 }}
              />
            </>
          ) : (
            <>
              {serverName != null && (
                <View style={styles.connectedRow}>
                  <StatusDot color={DirectPlay} />
                  <DataLabel text={`CONNECTED · ${serverName}`} technical={false} />
                </View>
              )}
              <Field
                value={username}
                onChange={setUsername}
                placeholder="Username or email"
                style={{ marginTop: 18 }}
              />
              <Field
                value={password}
                onChange={setPassword}
                placeholder="Password"
                isPassword
                onSubmitEditing={() => void signIn()}
                style={{ marginTop: 10 }}
              />
              <AmberButton
                label={busy ? 'Signing in…' : 'Sign in'}
                onPress={() => void signIn()}
                enabled={!busy}
                style={{ marginTop: 14 }}
              />
              {googleAvailable && (
                <>
                  {/*
                   * A hairline "or" rather than a second amber button: amber is
                   * the action, and two of them would make the screen ask twice.
                   */}
                  <View style={styles.orRow}>
                    <HairlineDivider style={{ flex: 1 }} />
                    <DataLabel text="OR" style={{ marginHorizontal: 12 }} />
                    <HairlineDivider style={{ flex: 1 }} />
                  </View>
                  <OutlineButton
                    label="Continue with Google"
                    onPress={() => void signInWithGoogle()}
                    fillWidth
                    style={{ marginTop: 14 }}
                  />
                </>
              )}

              <OutlineButton
                label="Use a different address"
                onPress={() => {
                  setStep('ADDRESS');
                  setError(null);
                }}
                fillWidth
                style={{ marginTop: 10 }}
              />
            </>
          )}

          {error != null && (
            <View style={styles.error}>
              <Text style={[TowerType.bodyProse, { color: Amber }]}>{error}</Text>
            </View>
          )}

          <OutlineButton
            label="Look around with sample data"
            onPress={useSampleData}
            fillWidth
            style={{ marginTop: 34 }}
          />

          {/*
           * The promise, and it is a real one: everything above talks to one
           * machine, and the app has no other server to talk to.
           */}
          <Text style={[TowerType.bodyNote, { color: OnInkFaint, marginTop: 22, marginBottom: 30 }]}>
            Tower only ever talks to the server you name here. Nothing about what you watch leaves
            the house.
          </Text>

          {/* Which bundle is running. See BuildStamp for why this earns its place. */}
          <BuildStamp style={{ marginBottom: 24 }} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollOuter: {
    flexGrow: 1,
    alignItems: 'center',
  },
  column: {
    width: '100%',
    maxWidth: TowerReadingMaxWidth,
    padding: Space.Screen,
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginTop: 18,
  },
  connectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 18,
  },
  error: {
    marginTop: 16,
    width: '100%',
    borderRadius: Radius.Default,
    borderWidth: 1,
    borderColor: AmberBorderSoft,
    padding: 14,
  },
});

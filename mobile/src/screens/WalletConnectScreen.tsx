import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Linking,
} from 'react-native';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../types/navigation';
import { useAuthStore } from '../stores/authStore';
import { authApi } from '../api/auth';

type Props = StackScreenProps<RootStackParamList, 'WalletConnect'>;

// WalletConnect / deep-link session state
type SessionStatus =
  | 'idle'
  | 'awaiting_wallet'   // deep-link sent, waiting for wallet to return
  | 'signing'           // wallet returned, verifying challenge
  | 'error';

const SESSION_TIMEOUT_MS = 3 * 60 * 1000; // 3 min — expire waiting sessions

export default function WalletConnectScreen({ navigation }: Props) {
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { setWalletAddress, setToken } = useAuthStore();

  // Pending challenge payload for the current WalletConnect session
  const pendingSession = useRef<{
    address: string;
    challenge: string;
    expiresAt: number;
  } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSession = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    pendingSession.current = null;
    timeoutRef.current = null;
  }, []);

  const expireSession = useCallback(() => {
    clearSession();
    setStatus('error');
    setErrorMessage('Wallet connection timed out. Please try again.');
  }, [clearSession]);

  // Handle deep-link callback from wallet (e.g. amana://wc-callback?address=G…&signed=…)
  const handleDeepLink = useCallback(
    async (url: string) => {
      if (!url.includes('wc-callback')) return;
      const parsed = new URL(url);
      const address = parsed.searchParams.get('address');
      const signed = parsed.searchParams.get('signed');

      const session = pendingSession.current;
      if (!session || !address || !signed) {
        setStatus('error');
        setErrorMessage('Invalid wallet response. Please try again.');
        return;
      }

      if (Date.now() > session.expiresAt) {
        expireSession();
        return;
      }

      if (address !== session.address) {
        setStatus('error');
        setErrorMessage('Wallet address mismatch. Please reconnect.');
        clearSession();
        return;
      }

      clearSession();
      setStatus('signing');
      try {
        const { token } = await authApi.verifyChallenge(address, signed);
        await setToken(token);
        setWalletAddress(address);
        navigation.replace('TradeList');
      } catch (err: unknown) {
        setStatus('error');
        setErrorMessage((err as Error)?.message ?? 'Verification failed. Please try again.');
      }
    },
    [clearSession, expireSession, navigation, setToken, setWalletAddress],
  );

  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url);
    });
    // Handle cold-start deep link
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });
    return () => {
      subscription.remove();
      clearSession();
    };
  }, [handleDeepLink, clearSession]);

  const initiateWalletConnect = async (address: string) => {
    if (!address.startsWith('G') || address.length < 56) {
      Alert.alert('Invalid address', 'Please enter a valid Stellar public key (starts with G, 56+ chars).');
      setStatus('idle');
      return;
    }

    try {
      const { challenge } = await authApi.generateChallenge(address);
      const expiresAt = Date.now() + SESSION_TIMEOUT_MS;

      pendingSession.current = { address, challenge, expiresAt };
      timeoutRef.current = setTimeout(expireSession, SESSION_TIMEOUT_MS);

      // Build deep-link URI for Stellar WalletConnect / LOBSTR / xBull compatible wallets
      // Wallets that support the Stellar Web Authentication (SEP-10) deep-link scheme
      // will sign the challenge XDR and redirect back via amana://wc-callback
      const callbackUri = encodeURIComponent(`amana://wc-callback?address=${address}`);
      const wcUri = `web+stellar:sign?xdr=${encodeURIComponent(challenge)}&callback=${callbackUri}`;

      const supported = await Linking.canOpenURL(wcUri);
      if (!supported) {
        // Fall back: show challenge for manual signing in wallets without deep-link support
        Alert.alert(
          'No wallet app found',
          'Install LOBSTR or xBull to sign transactions. If you have a wallet, use the address entry below.',
          [{ text: 'OK', onPress: () => { clearSession(); setStatus('idle'); } }],
        );
        return;
      }

      setStatus('awaiting_wallet');
      await Linking.openURL(wcUri);
    } catch (err: unknown) {
      clearSession();
      setStatus('error');
      setErrorMessage((err as Error)?.message ?? 'Failed to initiate wallet connection.');
    }
  };

  const handleConnect = () => {
    setStatus('idle');
    setErrorMessage(null);

    Alert.prompt(
      'Enter Wallet Address',
      'Paste your Stellar wallet public key (G…)',
      (address) => {
        if (!address) { setStatus('idle'); return; }
        initiateWalletConnect(address.trim());
      },
      'plain-text',
    );
  };

  const isLoading = status === 'awaiting_wallet' || status === 'signing';

  const statusLabel: Record<SessionStatus, string> = {
    idle: 'Connect Wallet',
    awaiting_wallet: 'Waiting for wallet…',
    signing: 'Verifying…',
    error: 'Retry',
  };

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.logo}>🌾</Text>
        <Text style={styles.title}>Amana</Text>
        <Text style={styles.subtitle}>Trust as a Service{'\n'}for Agricultural Products</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Connect your Stellar Wallet</Text>
        <Text style={styles.cardBody}>
          Link your wallet using WalletConnect or a Stellar deep-link compatible app (LOBSTR, xBull) to start trading securely with escrow-backed protection.
        </Text>

        {errorMessage ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {status === 'awaiting_wallet' ? (
          <View style={styles.awaitingBox}>
            <ActivityIndicator color="#2d6a2d" style={styles.awaitingSpinner} accessibilityLabel="Waiting for wallet" />
            <Text style={styles.awaitingText}>
              Your wallet app should have opened.{'\n'}Approve the sign request, then return here.
            </Text>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => { clearSession(); setStatus('idle'); setErrorMessage(null); }}
              accessibilityRole="button"
              accessibilityLabel="Cancel wallet connection"
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleConnect}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel="Connect Wallet"
            accessibilityState={{ disabled: isLoading, busy: isLoading }}
            accessible
          >
            {status === 'signing' ? (
              <ActivityIndicator color="#fff" accessibilityLabel="Signing with wallet" />
            ) : (
              <Text style={styles.buttonText}>{statusLabel[status]}</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f4f0',
    justifyContent: 'center',
    padding: 24,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    fontSize: 64,
    marginBottom: 8,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#1a3a1a',
  },
  subtitle: {
    fontSize: 16,
    color: '#4a6a4a',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a3a1a',
    marginBottom: 8,
  },
  cardBody: {
    fontSize: 14,
    color: '#555',
    lineHeight: 22,
    marginBottom: 24,
  },
  errorBox: {
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#991b1b',
    fontSize: 13,
    lineHeight: 20,
  },
  awaitingBox: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  awaitingSpinner: {
    marginBottom: 12,
  },
  awaitingText: {
    fontSize: 13,
    color: '#555',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 24,
  },
  cancelText: {
    color: '#2d6a2d',
    fontSize: 14,
    fontWeight: '500',
  },
  button: {
    backgroundColor: '#2d6a2d',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface WalletInfo {
  address: string;
  name: string;
  connected: boolean;
}

/**
 * WalletConnectScreen handles Stellar wallet connection
 * Supports deep-link handling for wallet callbacks
 */
export default function WalletConnectScreen() {
  const insets = useSafeAreaInsets();
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle deep-link callback from wallet
  const handleDeepLink = useCallback(async (url: string) => {
    // Parse the deep-link URL
    // Format: eziagric://wallet/callback?address=XXX&signature=XXX
    try {
      const parsedUrl = new URL(url);
      const params = parsedUrl.searchParams;
      
      if (params.has('address')) {
        const address = params.get('address');
        const name = params.get('name') || 'Connected Wallet';
        
        setWalletInfo({
          address: address!,
          name,
          connected: true,
        });
      }
    } catch (err) {
      console.error('Failed to parse deep-link:', err);
    }
  }, []);

  // Listen for deep-links
  useEffect(() => {
    const subscription = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    // Check if app was opened via deep-link
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink(url);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [handleDeepLink]);

  const connectWallet = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Simulate wallet connection
      // In production, this would use @stellar/freighter-api or @albedo.link
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // For demo, simulate successful connection
      setWalletInfo({
        address: 'GAC2ZUXLLFS7CIM2KOH6G3W7KXXXXX',
        name: 'My Wallet',
        connected: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect wallet');
    } finally {
      setLoading(false);
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    setWalletInfo(null);
  }, []);

  const copyAddress = useCallback(() => {
    // In production, use Clipboard API
    // Clipboard.setString(walletInfo?.address || '');
  }, [walletInfo]);

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#2d6a2d" />
        <Text style={styles.loadingText}>Connecting wallet...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Connect Wallet</Text>
      </View>

      <View style={styles.content}>
        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity 
              testID="retry-button" 
              style={styles.retryButton} 
              onPress={connectWallet}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : walletInfo?.connected ? (
          // Connected state
          <View style={styles.connectedCard}>
            <View style={styles.walletIcon}>
              <Text style={styles.walletIconText}>★</Text>
            </View>
            <Text style={styles.connectedTitle}>Wallet Connected</Text>
            <Text style={styles.walletName}>{walletInfo.name}</Text>
            
            <View style={styles.addressContainer}>
              <Text style={styles.addressLabel}>Address</Text>
              <TouchableOpacity 
                testID="copy-address-button"
                onPress={copyAddress}
                accessibilityLabel="Copy wallet address"
              >
                <Text style={styles.addressText} numberOfLines={2}>
                  {walletInfo.address}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              testID="disconnect-button"
              style={styles.disconnectButton}
              onPress={disconnectWallet}
            >
              <Text style={styles.disconnectButtonText}>Disconnect</Text>
            </TouchableOpacity>
          </View>
        ) : (
          // Disconnected state - show connect options
          <View style={styles.disconnectedCard}>
            <Text style={styles.subtitle}>
              Connect your Stellar wallet to manage your trades and vault
            </Text>

            <View style={styles.walletOptions}>
              <TouchableOpacity 
                testID="connect-freighter"
                style={styles.walletOption}
                onPress={connectWallet}
                accessibilityLabel="Connect Freighter wallet"
                accessibilityRole="button"
              >
                <View style={styles.walletOptionIcon}>
                  <Text style={styles.walletOptionIconText}>F</Text>
                </View>
                <View style={styles.walletOptionInfo}>
                  <Text style={styles.walletOptionName}>Freighter</Text>
                  <Text style={styles.walletOptionDesc}>Stellar wallet browser extension</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity 
                testID="connect-albedo"
                style={styles.walletOption}
                onPress={connectWallet}
                accessibilityLabel="Connect Albedo wallet"
                accessibilityRole="button"
              >
                <View style={styles.walletOptionIcon}>
                  <Text style={styles.walletOptionIconText}>A</Text>
                </View>
                <View style={styles.walletOptionInfo}>
                  <Text style={styles.walletOptionName}>Albedo</Text>
                  <Text style={styles.walletOptionDesc}>Web wallet with stellar.toml</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity 
                testID="connect-xbull"
                style={styles.walletOption}
                onPress={connectWallet}
                accessibilityLabel="Connect xBull wallet"
                accessibilityRole="button"
              >
                <View style={styles.walletOptionIcon}>
                  <Text style={styles.walletOptionIconText}>X</Text>
                </View>
                <View style={styles.walletOptionInfo}>
                  <Text style={styles.walletOptionName}>xBull</Text>
                  <Text style={styles.walletOptionDesc}>Mobile wallet for Stellar</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f7f4',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1f3d1f',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
  errorContainer: {
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#dc2626',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#2d6a2d',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  disconnectedCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  walletOptions: {
    gap: 12,
  },
  walletOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  walletOptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2d6a2d',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  walletOptionIconText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  walletOptionInfo: {
    flex: 1,
  },
  walletOptionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f3d1f',
  },
  walletOptionDesc: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  connectedCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  walletIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#2d6a2d',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  walletIconText: {
    fontSize: 28,
    color: '#fff',
  },
  connectedTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f3d1f',
    marginBottom: 4,
  },
  walletName: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 20,
  },
  addressContainer: {
    width: '100%',
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  addressLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 4,
  },
  addressText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#1f3d1f',
  },
  disconnectButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dc2626',
  },
  disconnectButtonText: {
    color: '#dc2626',
    fontWeight: '600',
  },
});
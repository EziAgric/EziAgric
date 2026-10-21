import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AdminErrorView } from '../api/errors';
import { formatRetryAfter } from '../api/errorInterceptor';

export interface AdminErrorBannerProps {
  /** Render-ready view produced by `viewForError` / `mapAdminErrorCode`. */
  view: AdminErrorView;
  /** Optional callback for `retry`, `refresh`, `wait_then_retry`. */
  onRetry?: () => void;
  /** Optional callback for `sign_out_required` (clears local auth). */
  onSignOut?: () => void;
  /** Optional callback for `go_back` (e.g. navigation.goBack). */
  onGoBack?: () => void;
  /** Optional callback for `contact_support` (opens mailto / share id). */
  onContactSupport?: () => void;
  /** Hide the action buttons entirely (caller renders its own UI). */
  hideActions?: boolean;
  /** Additional Tailwind-style override (kept as plain object for RN). */
  style?: object;
}

const SEVERITY_STYLES: Record<
  AdminErrorView['action'],
  { bg: string; border: string; text: string; icon: string }
> = {
  retry: { bg: '#fff7e6', border: '#d99a2b', text: '#7a5210', icon: '⟳' },
  wait_then_retry: { bg: '#fff7e6', border: '#d99a2b', text: '#7a5210', icon: '⏱' },
  contact_support: { bg: '#fdecec', border: '#c5493c', text: '#8a2a1f', icon: '⚠' },
  sign_out_required: { bg: '#fdecec', border: '#c5493c', text: '#8a2a1f', icon: '🔒' },
  refresh: { bg: '#eef5ff', border: '#3d6ea8', text: '#1e3a5f', icon: '↻' },
  go_back: { bg: '#eef5ff', border: '#3d6ea8', text: '#1e3a5f', icon: '←' },
  dismiss: { bg: '#f4f7f4', border: '#7e977e', text: '#2d6a2d', icon: 'ⓘ' },
};

/**
 * Inline, accessible banner that surfaces a backend admin error with
 * a button (or two) driven by `view.action`. Compose it above lists or
 * forms instead of modal alerts so it never blocks critical reads.
 */
export function AdminErrorBanner({
  view,
  onRetry,
  onSignOut,
  onGoBack,
  onContactSupport,
  hideActions,
  style,
}: AdminErrorBannerProps): React.ReactElement {
  const insets = useSafeAreaInsets();
  const sev = SEVERITY_STYLES[view.action];

  const primaryButton = resolvePrimaryButton(view, {
    onRetry,
    onSignOut,
    onGoBack,
    onContactSupport,
  });
  const secondaryButton = resolveSecondaryButton(view, {
    onRetry,
    onSignOut,
    onGoBack,
    onContactSupport,
  });

  const ctaText = primaryButton
    ? primaryButton.label
    : secondaryButton
      ? secondaryButton.label
      : null;
  const ctaOnPress = primaryButton?.onPress ?? secondaryButton?.onPress;

  return (
    <View
      accessibilityRole="alert"
      accessibilityLabel={`${view.title}. ${view.message}`}
      testID="admin-error-banner"
      style={[
        styles.container,
        {
          backgroundColor: sev.bg,
          borderColor: sev.border,
          marginTop: insets.top > 0 ? 0 : 12,
        },
        style,
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.icon, { color: sev.text }]}>{sev.icon}</Text>
        <Text style={[styles.title, { color: sev.text }]} numberOfLines={2}>
          {view.title}
        </Text>
      </View>

      <Text style={[styles.message, { color: sev.text }]}>{view.message}</Text>

      {view.retryAfterSeconds !== undefined ? (
        <Text style={[styles.meta, { color: sev.text }]}>
          Try again in {formatRetryAfter(view.retryAfterSeconds)}
        </Text>
      ) : null}

      {view.requestId ? (
        <Text style={[styles.meta, { color: sev.text }]} numberOfLines={1}>
          Request id:{' '}
          <Text style={styles.requestId} selectable testID="admin-error-request-id">
            {view.requestId}
          </Text>
        </Text>
      ) : null}

      {!hideActions && ctaText && ctaOnPress ? (
        <View style={styles.actionsRow}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={ctaText}
            testID={`admin-error-banner-primary-${view.action}`}
            onPress={ctaOnPress}
            style={[
              styles.primaryButton,
              { borderColor: sev.border, backgroundColor: sev.border },
            ]}
          >
            <Text style={styles.primaryButtonText}>{ctaText}</Text>
          </TouchableOpacity>

          {primaryButton && secondaryButton ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={secondaryButton.label}
              testID="admin-error-banner-secondary"
              onPress={secondaryButton.onPress}
              style={[styles.secondaryButton, { borderColor: sev.border }]}
            >
              <Text style={[styles.secondaryButtonText, { color: sev.text }]}>
                {secondaryButton.label}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

type Callbacks = Pick<
  AdminErrorBannerProps,
  'onRetry' | 'onSignOut' | 'onGoBack' | 'onContactSupport'
>;

interface ButtonSpec {
  label: string;
  onPress: () => void;
}

function resolvePrimaryButton(
  view: AdminErrorView,
  cb: Callbacks,
): ButtonSpec | null {
  switch (view.action) {
    case 'retry':
    case 'wait_then_retry':
    case 'refresh':
      return cb.onRetry ? { label: 'Try again', onPress: cb.onRetry } : null;
    case 'sign_out_required':
      return cb.onSignOut ? { label: 'Sign out', onPress: cb.onSignOut } : null;
    case 'go_back':
      return cb.onGoBack ? { label: 'Go back', onPress: cb.onGoBack } : null;
    case 'contact_support':
      return cb.onContactSupport
        ? { label: 'Contact support', onPress: cb.onContactSupport }
        : null;
    case 'dismiss':
      return null;
  }
}

function resolveSecondaryButton(
  view: AdminErrorView,
  cb: Callbacks,
): ButtonSpec | null {
  // Surface a "Contact support" link on any actionable error so users
  // always have an escape hatch with the request id attached.
  if (cb.onContactSupport && view.action !== 'contact_support' && view.action !== 'dismiss') {
    return { label: 'Contact support', onPress: cb.onContactSupport };
  }
  return null;
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  icon: { fontSize: 20, fontWeight: '700' },
  title: { fontSize: 16, fontWeight: '700', flex: 1 },
  message: { fontSize: 14, lineHeight: 20 },
  meta: { fontSize: 12, opacity: 0.85 },
  requestId: { fontFamily: 'Courier', fontWeight: '600' },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  primaryButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  secondaryButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  secondaryButtonText: { fontWeight: '600', fontSize: 14 },
});

export default AdminErrorBanner;

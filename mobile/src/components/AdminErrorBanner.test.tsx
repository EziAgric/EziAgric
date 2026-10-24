import { fireEvent, render } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { AdminErrorBanner } from './AdminErrorBanner';
import { AdminErrorView } from '../api/errors';
import { SUPPORT_EMAIL, buildSupportMailto } from '../constants/support';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const baseView: AdminErrorView = {
  title: 'Admin access required',
  message: 'You need to sign in as an admin to do that.',
  action: 'sign_out_required',
  code: 'AUTH_ERROR',
};

describe('AdminErrorBanner', () => {
  it('renders the title and message', () => {
    const { getByText } = render(<AdminErrorBanner view={baseView} />);
    expect(getByText('Admin access required')).toBeTruthy();
    expect(getByText('You need to sign in as an admin to do that.')).toBeTruthy();
  });

  it('renders a primary action button driven by the action', () => {
    const onSignOut = jest.fn();
    const { getByTestId } = render(
      <AdminErrorBanner view={baseView} onSignOut={onSignOut} />,
    );
    fireEvent.press(getByTestId('admin-error-banner-primary-sign_out_required'));
    expect(onSignOut).toHaveBeenCalled();
  });

  it('renders a secondary "Contact support" button when callback is provided', () => {
    const onContactSupport = jest.fn();
    const { getByTestId } = render(
      <AdminErrorBanner
        view={{ ...baseView, action: 'retry' }}
        onRetry={() => {}}
        onContactSupport={onContactSupport}
      />,
    );
    fireEvent.press(getByTestId('admin-error-banner-secondary'));
    expect(onContactSupport).toHaveBeenCalled();
  });

  it('does not render a secondary button when action is dismiss', () => {
    const onContactSupport = jest.fn();
    const { queryByTestId } = render(
      <AdminErrorBanner
        view={{ ...baseView, action: 'dismiss' }}
        onContactSupport={onContactSupport}
      />,
    );
    expect(queryByTestId('admin-error-banner-secondary')).toBeNull();
  });

  it('renders retry seconds when retryAfterSeconds is provided', () => {
    const { getByText } = render(
      <AdminErrorBanner
        view={{ ...baseView, action: 'wait_then_retry', retryAfterSeconds: 30 }}
      />,
    );
    expect(getByText(/try again in 30s/i)).toBeTruthy();
  });

  it('renders the requestId with the Contact support hint', () => {
    const { getByTestId } = render(
      <AdminErrorBanner view={{ ...baseView, requestId: 'req-trace-123' }} />,
    );
    expect(getByTestId('admin-error-request-id').props.children).toBe(
      'req-trace-123',
    );
  });

  it('respects hideActions and renders no buttons', () => {
    const { queryByTestId } = render(
      <AdminErrorBanner view={baseView} hideActions />,
    );
    expect(queryByTestId(/^admin-error-banner-primary-/)).toBeNull();
  });

  // INTEGRATION: the secondary "Contact support" button → parent
  // `onContactSupport` → `Linking.openURL(buildSupportMailto(...))` chain.
  //
  // Previously the secondary-button path was only verified at the
  // per-screen level via a `Linking` mock that asserted `openURL` was
  // called — never that the captured URL actually carries the
  // requestId in its body. This regression guard ensures future changes
  // to `buildSupportMailto` (e.g. accidental encoding mishaps, dropped
  // `Request id` field) cannot silently lose the correlation token.
  it('secondary "Contact support" button opens a mailto URL whose body contains the requestId', () => {
    // Spy rather than module-mock so the rest of `Linking` keeps its
    // production surface (mirrors how a parent screen invokes it).
    const openURL = jest.fn().mockResolvedValue(true);
    const spy = jest
      .spyOn(Linking, 'openURL')
      .mockImplementation(openURL);

    try {
      const view: AdminErrorView = {
        title: 'Network timed out',
        message: 'The Stellar network did not respond in time.',
        action: 'retry',
        code: 'ADMIN_OPERATION_TIMEOUT',
        requestId: 'req-trace-xyz-789',
      };

      // The parent screen wires `onContactSupport` exactly this way:
      // hand the canonical mailto off to `Linking.openURL`.
      const onContactSupport = () => {
        void Linking.openURL(buildSupportMailto(view, 'integration test'));
      };

      const { getByTestId } = render(
        <AdminErrorBanner
          view={view}
          onRetry={jest.fn()}
          onContactSupport={onContactSupport}
        />,
      );

      // The banner's primary button resolves to `action='retry'` → "Try
      // again"; the secondary is "Contact support".
      fireEvent.press(getByTestId('admin-error-banner-secondary'));
      expect(openURL).toHaveBeenCalledTimes(1);

      const [url] = openURL.mock.calls[0];

      // Sanity: it really is a mailto: link to the canonical inbox.
      expect(url.startsWith(`mailto:${SUPPORT_EMAIL}?`)).toBe(true);

      // Pull the percent-encoded body, decode it, and assert the
      // requestId + the underlying error code flow through into the
      // mail body. These are the two fields support needs to correlate
      // a user report with backend logs — a future regression that
      // dropped either of them (or percent-encoded twice) would fail
      // here without needing a manual log review.
      //
      // Intentionally NOT locking to "subject=Admin …" or "Request id:"
      // template prefixes: `buildSupportMailto`'s wording can be
      // retemplated without breaking the integration contract, and
      // those exact-string asserts would rot the moment the support
      // email template is rephrased.
      const bodyMatch = url.match(/(?:^|[?&])body=([^&]+)/);
      expect(bodyMatch).not.toBeNull();
      const decodedBody = decodeURIComponent(bodyMatch![1]);

      expect(decodedBody).toContain('req-trace-xyz-789');
      expect(decodedBody).toContain('ADMIN_OPERATION_TIMEOUT');
    } finally {
      spy.mockRestore();
    }
  });
});

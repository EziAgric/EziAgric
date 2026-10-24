import { buildAdminApiError, mapAdminErrorCode } from './adminErrorMap';

describe('mapAdminErrorCode', () => {
  it('maps ADMIN_QUOTA_EXCEEDED to wait_then_retry with retryAfterSeconds', () => {
    const view = mapAdminErrorCode('ADMIN_QUOTA_EXCEEDED', 30);
    expect(view.title).toBe('Too many admin actions');
    expect(view.action).toBe('wait_then_retry');
    expect(view.retryAfterSeconds).toBe(30);
    expect(view.code).toBe('ADMIN_QUOTA_EXCEEDED');
  });

  it('maps ADMIN_OPERATION_TIMEOUT to retry', () => {
    const view = mapAdminErrorCode('ADMIN_OPERATION_TIMEOUT');
    expect(view.action).toBe('retry');
    expect(view.title).toMatch(/timed out/i);
  });

  it('maps AUTH_ERROR to sign_out_required', () => {
    const view = mapAdminErrorCode('AUTH_ERROR');
    expect(view.action).toBe('sign_out_required');
  });

  it('maps CLAWBACK_TOO_LARGE to dismiss (form fix)', () => {
    const view = mapAdminErrorCode('CLAWBACK_TOO_LARGE');
    expect(view.title).toBe('Amount too large');
    expect(view.action).toBe('dismiss');
  });

  it('maps CLAWBACK_INVALID_AMOUNT to dismiss', () => {
    const view = mapAdminErrorCode('CLAWBACK_INVALID_AMOUNT');
    expect(view.action).toBe('dismiss');
  });

  it('maps NOT_FOUND to go_back', () => {
    const view = mapAdminErrorCode('NOT_FOUND');
    expect(view.action).toBe('go_back');
  });

  it('maps TRADE_ACCESS_DENIED to contact_support', () => {
    const view = mapAdminErrorCode('TRADE_ACCESS_DENIED');
    expect(view.action).toBe('contact_support');
  });

  it('maps RATE_LIMIT_EXCEEDED to wait_then_retry', () => {
    const view = mapAdminErrorCode('RATE_LIMIT_EXCEEDED', 60);
    expect(view.action).toBe('wait_then_retry');
    expect(view.retryAfterSeconds).toBe(60);
  });

  it('maps PAYMENT_INSUFFICIENT_FUNDS to contact_support', () => {
    const view = mapAdminErrorCode('PAYMENT_INSUFFICIENT_FUNDS');
    expect(view.action).toBe('contact_support');
  });

  it('falls back to contact_support for unknown codes', () => {
    const view = mapAdminErrorCode('SOMETHING_NEW_FROM_BACKEND');
    expect(view.action).toBe('contact_support');
    expect(view.code).toBe('SOMETHING_NEW_FROM_BACKEND');
  });

  it('falls back gracefully when code is undefined/empty', () => {
    const view = mapAdminErrorCode(undefined);
    expect(view.action).toBe('contact_support');
    expect(view.code).toBe('UNKNOWN');
  });

  it('maps INTERNAL_ERROR to contact_support (user should ask for help)', () => {
    const view = mapAdminErrorCode('INTERNAL_ERROR');
    expect(view.title).toBe('Something went wrong');
    expect(view.action).toBe('contact_support');
  });

  it('maps VALIDATION_ERROR to dismiss', () => {
    const view = mapAdminErrorCode('VALIDATION_ERROR');
    expect(view.action).toBe('dismiss');
  });

  it('maps DISPUTE_STATUS_TRANSITION_INVALID to refresh', () => {
    const view = mapAdminErrorCode('DISPUTE_STATUS_TRANSITION_INVALID');
    expect(view.action).toBe('refresh');
  });
});

describe('buildAdminApiError', () => {
  it('captures code, message, status, requestId, correlationId, path', () => {
    const err = buildAdminApiError(
      {
        code: 'ADMIN_QUOTA_EXCEEDED',
        message: 'quota exceeded',
        requestId: 'req-123',
        correlationId: 'corr-456',
        path: '/api/admin/streams',
        details: { retryAfterSeconds: 45 },
      },
      429,
      'fallback',
    );

    expect(err.name).toBe('AdminApiError');
    expect(err.code).toBe('ADMIN_QUOTA_EXCEEDED');
    expect(err.message).toBe('quota exceeded');
    expect(err.status).toBe(429);
    expect(err.requestId).toBe('req-123');
    expect(err.correlationId).toBe('corr-456');
    expect(err.path).toBe('/api/admin/streams');
    expect(err.retryAfterSeconds).toBe(45);
    expect(err.details).toEqual({ retryAfterSeconds: 45 });
  });

  it('falls back to INTERNAL_ERROR and a friendly message when body is empty', () => {
    const err = buildAdminApiError(undefined, 500, 'Server exploded');
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.status).toBe(500);
    expect(err.message).toBe('Server exploded');
  });

  it('supports retryAfter under alternate keys', () => {
    const err = buildAdminApiError(
      {
        code: 'ADMIN_QUOTA_EXCEEDED',
        message: 'quota',
        details: { retryAfter: 90 },
      },
      429,
      'fallback',
    );
    expect(err.retryAfterSeconds).toBe(90);
  });
});

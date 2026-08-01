import { AxiosError, AxiosResponse } from 'axios';
import {
  adminErrorResponseErrorInterceptor,
  formatRetryAfter,
  NETWORK_ERROR_CODE,
  TIMEOUT_ERROR_CODE,
  viewForError,
} from './errorInterceptor';
import { AdminApiError, RawBackendErrorBody } from './errors';

function makeAxiosError(opts: {
  status?: number;
  data?: unknown;
  message?: string;
  code?: string;
  headers?: Record<string, string>;
}): AxiosError<RawBackendErrorBody> {
  const err = new AxiosError<RawBackendErrorBody>(
    opts.message ?? 'Request failed',
    opts.code,
    undefined,
    undefined,
    opts.status === undefined
      ? undefined
      : ({
          status: opts.status,
          data: opts.data as RawBackendErrorBody,
          statusText: 'OK',
          headers: opts.headers ?? {},
          config: {} as never,
        } as AxiosResponse<RawBackendErrorBody>),
  );
  return err;
}

/**
 * Helper: run the interceptor and return the rejected value. Most
 * tests assert against the resolved promise's rejection directly.
 */
async function mapError(
  input: AxiosError<RawBackendErrorBody>,
): Promise<{ code: string; message: string; status?: number; requestId?: string; details?: unknown; retryAfterSeconds?: number }> {
  try {
    await adminErrorResponseErrorInterceptor(input);
    throw new Error('expected interceptor to reject');
  } catch (e: unknown) {
    const err = e as AdminApiError;
    return {
      code: err.code,
      message: err.message,
      status: err.status,
      requestId: err.requestId,
      details: err.details,
      retryAfterSeconds: err.retryAfterSeconds,
    };
  }
}

describe('adminErrorResponseErrorInterceptor — network failures', () => {
  it('synthesizes NETWORK_ERROR AdminApiError when there is no response (offline)', async () => {
    const mapped = await mapError(makeAxiosError({ message: 'Network Error' }));
    expect(mapped.code).toBe(NETWORK_ERROR_CODE);
    expect(mapped.message).toMatch(/offline|connection/i);
    expect(mapped.status).toBeUndefined();
  });

  it('synthesizes TIMEOUT_ERROR AdminApiError on ECONNABORTED', async () => {
    const mapped = await mapError(
      makeAxiosError({ message: 'timeout of 10000ms exceeded', code: 'ECONNABORTED' }),
    );
    expect(mapped.code).toBe(TIMEOUT_ERROR_CODE);
    expect(mapped.message).toMatch(/timed out|connection/i);
  });
});

describe('adminErrorResponseErrorInterceptor — HTTP status mapping', () => {
  it('maps 401 + AUTH_ERROR body to a friendly admin-auth error preserving requestId', async () => {
    const mapped = await mapError(
      makeAxiosError({
        status: 401,
        data: {
          code: 'AUTH_ERROR',
          message: 'Unauthorized',
          requestId: 'req-401',
          details: {},
          timestamp: new Date().toISOString(),
          path: '/api/admin/streams',
        },
      }),
    );
    expect(mapped.code).toBe('AUTH_ERROR');
    expect(mapped.status).toBe(401);
    expect(mapped.requestId).toBe('req-401');
  });

  it('preserves a specific backend code on 403 (e.g. TRADE_ACCESS_DENIED)', async () => {
    const mapped = await mapError(
      makeAxiosError({
        status: 403,
        data: { code: 'TRADE_ACCESS_DENIED', message: 'Forbidden' },
      }),
    );
    expect(mapped.code).toBe('TRADE_ACCESS_DENIED');
    expect(mapped.status).toBe(403);
    expect(mapped.message).toBe('Forbidden');
  });

  it('falls back to AUTH_ERROR code when 403 has no body code', async () => {
    const mapped = await mapError(makeAxiosError({ status: 403 }));
    expect(mapped.code).toBe('AUTH_ERROR');
    expect(mapped.status).toBe(403);
    expect(mapped.message).toMatch(/permission|sign in/i);
  });

  it('reads the Retry-After header on 429 and exposes retryAfterSeconds', async () => {
    const mapped = await mapError(
      makeAxiosError({
        status: 429,
        data: { code: 'ADMIN_QUOTA_EXCEEDED', message: 'quota', details: {} },
        headers: { 'retry-after': '45' },
      }),
    );
    expect(mapped.code).toBe('ADMIN_QUOTA_EXCEEDED');
    expect(mapped.retryAfterSeconds).toBe(45);
  });

  it('maps 500 with structured backend error and keeps requestId', async () => {
    const mapped = await mapError(
      makeAxiosError({
        status: 500,
        data: {
          code: 'INTERNAL_ERROR',
          message: 'rpc boom',
          requestId: 'req-500',
          details: {},
          timestamp: new Date().toISOString(),
          path: '/api/admin/streams',
        },
      }),
    );
    expect(mapped.code).toBe('INTERNAL_ERROR');
    expect(mapped.requestId).toBe('req-500');
  });

  it('synthesizes a friendly UNKNOWN for an unrecognized error body shape', async () => {
    const mapped = await mapError(
      makeAxiosError({ status: 502, data: 'gateway blew up' }),
    );
    expect(mapped.code).toBe('UNKNOWN');
    expect(mapped.status).toBe(502);
    expect(mapped.message).toMatch(/unexpected|try again/i);
  });
});

describe('viewForError', () => {
  it('returns a friendly retry view for network errors', () => {
    const err = new AdminApiError({ code: NETWORK_ERROR_CODE, message: 'offline' });
    const view = viewForError(err);
    expect(view.action).toBe('retry');
    expect(view.code).toBe(NETWORK_ERROR_CODE);
    expect(view.title).toMatch(/offline|connection/i);
  });

  it('returns a friendly retry view for timeout errors', () => {
    const err = new AdminApiError({ code: TIMEOUT_ERROR_CODE, message: 'timed out' });
    const view = viewForError(err);
    expect(view.action).toBe('retry');
  });

  it('returns sign_out_required for AUTH_ERROR', () => {
    const err = new AdminApiError({ code: 'AUTH_ERROR', message: 'denied', status: 403 });
    const view = viewForError(err);
    expect(view.action).toBe('sign_out_required');
  });

  it('propagates requestId from AdminApiError into the view', () => {
    const err = new AdminApiError({
      code: 'INTERNAL_ERROR',
      message: 'oops',
      status: 500,
      requestId: 'req-trace',
    });
    const view = viewForError(err);
    expect(view.requestId).toBe('req-trace');
    expect(view.action).toBe('contact_support');
  });

  it('falls back to a generic retry view for unknown error types', () => {
    const view = viewForError(new Error('boom'));
    expect(view.action).toBe('retry');
    expect(view.code).toBe('UNKNOWN');
  });

  it('falls back gracefully when given a non-Error value', () => {
    const view = viewForError('something bad');
    expect(view.action).toBe('retry');
  });
});

describe('formatRetryAfter', () => {
  it('formats seconds', () => {
    expect(formatRetryAfter(5)).toBe('5s');
  });
  it('formats minutes', () => {
    expect(formatRetryAfter(60)).toBe('1 minute');
    expect(formatRetryAfter(120)).toBe('2 minutes');
  });
  it('formats hours', () => {
    expect(formatRetryAfter(3600)).toBe('1 hour');
    expect(formatRetryAfter(7200)).toBe('2 hours');
  });
  it('returns "now" for non-positive seconds', () => {
    expect(formatRetryAfter(0)).toBe('now');
    expect(formatRetryAfter(-1)).toBe('now');
  });
});

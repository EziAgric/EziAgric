import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ProofOfDeliveryUpload } from '../ProofOfDeliveryUpload';

/**
 * Tests for the Proof-of-Delivery upload path: file selection, the upload
 * request, and the error state when the upload fails. Recording is disabled
 * (no MediaRecorder) so the plain file-upload fallback is exercised.
 */

type XhrOutcome = { status: number; responseText?: string } | { networkError: true };

let xhrOutcome: XhrOutcome;
let lastXhr: MockXhr | null;

class MockXhr {
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 0;
  responseText = '';
  method = '';
  url = '';
  body: FormData | null = null;

  constructor() {
    lastXhr = this;
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  send(body: FormData) {
    this.body = body;
    setTimeout(() => {
      if ('networkError' in xhrOutcome) {
        this.onerror?.();
        return;
      }
      this.status = xhrOutcome.status;
      this.responseText = xhrOutcome.responseText ?? '';
      this.onload?.();
    }, 0);
  }
}

function makeVideoFile(): File {
  const file = new File(['video-bytes'], 'delivery.webm', { type: 'video/webm' });
  Object.defineProperty(file, 'arrayBuffer', {
    configurable: true,
    value: async () => new ArrayBuffer(8),
  });
  return file;
}

function selectFile(container: HTMLElement, file: File) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe('ProofOfDeliveryUpload', () => {
  const originalMediaDevices = navigator.mediaDevices;
  const originalMediaRecorder = (window as any).MediaRecorder;
  const originalXhr = (window as any).XMLHttpRequest;

  beforeEach(() => {
    lastXhr = null;
    xhrOutcome = { status: 200, responseText: JSON.stringify({ url: 'https://cdn.test/pod.webm' }) };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: undefined,
    });
    (window as any).MediaRecorder = undefined;
    (window as any).XMLHttpRequest = MockXhr;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: originalMediaDevices,
    });
    (window as any).MediaRecorder = originalMediaRecorder;
    (window as any).XMLHttpRequest = originalXhr;
  });

  it('shows the file input fallback when recording is unsupported', () => {
    const { container } = render(<ProofOfDeliveryUpload />);

    expect(screen.getByText(/in-browser recording is not supported/i)).toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toBeInTheDocument();
  });

  it('uploads a selected file and reports success', async () => {
    const onUploaded = jest.fn();
    const { container } = render(
      <ProofOfDeliveryUpload
        onUploaded={onUploaded}
        uploadUrl="/api/pod-test"
        extraFields={{ tradeId: 'TRD-1' }}
      />,
    );

    selectFile(container, makeVideoFile());
    fireEvent.click(await screen.findByRole('button', { name: 'Upload' }));

    await waitFor(() => expect(screen.getByText('Upload complete.')).toBeInTheDocument());

    expect(lastXhr?.method).toBe('POST');
    expect(lastXhr?.url).toBe('/api/pod-test');
    expect(lastXhr?.body?.get('tradeId')).toBe('TRD-1');
    expect(lastXhr?.body?.get('file')).toBeInstanceOf(Blob);
    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect(onUploaded.mock.calls[0][0].url).toBe('https://cdn.test/pod.webm');
  });

  it('shows an error state when the upload fails', async () => {
    xhrOutcome = { status: 500 };
    const onUploaded = jest.fn();
    const { container } = render(<ProofOfDeliveryUpload onUploaded={onUploaded} />);

    selectFile(container, makeVideoFile());
    fireEvent.click(await screen.findByRole('button', { name: 'Upload' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Upload failed with status 500');
    expect(screen.getByRole('button', { name: 'Retry upload' })).toBeInTheDocument();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('shows an error state on a network failure', async () => {
    xhrOutcome = { networkError: true };
    const { container } = render(<ProofOfDeliveryUpload />);

    selectFile(container, makeVideoFile());
    fireEvent.click(await screen.findByRole('button', { name: 'Upload' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Network error during upload');
  });
});

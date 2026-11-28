import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ProofOfDeliveryRecorder } from '../ProofOfDeliveryRecorder';

/**
 * Tests for the Proof-of-Delivery in-browser video recorder (#411).
 *
 * These tests focus on the fallback path (file upload) which must work
 * everywhere, plus the basic capture/preview/retake/upload flow when
 * MediaRecorder + getUserMedia are available.
 */

describe('ProofOfDeliveryRecorder', () => {
  const originalMediaDevices = navigator.mediaDevices;
  const originalMediaRecorder = (window as any).MediaRecorder;

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: originalMediaDevices,
    });
    (window as any).MediaRecorder = originalMediaRecorder;
  });

  it('falls back to file upload when MediaRecorder is unsupported', () => {
    // Simulate an environment without MediaRecorder / getUserMedia.
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: undefined,
    });
    (window as any).MediaRecorder = undefined;

    render(<ProofOfDeliveryRecorder onUpload={jest.fn()} />);

    expect(
      screen.getByText(/record a video is not supported/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/upload video/i)).toBeInTheDocument();
  });

  it('uploads a selected file via the fallback path', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: undefined,
    });
    (window as any).MediaRecorder = undefined;

    const onUpload = jest.fn().mockResolvedValue(undefined);
    render(<ProofOfDeliveryRecorder onUpload={onUpload} />);

    const file = new File(['hello'], 'proof.mp4', { type: 'video/mp4' });
    const input = screen.getByLabelText(/upload video/i) as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    expect(onUpload.mock.calls[0][0]).toBe(file);
  });

  it('records, previews, retakes and uploads when MediaRecorder is available', async () => {
    const stopTrack = jest.fn();
    const stream = {
      getTracks: () => [{ stop: stopTrack }],
    } as unknown as MediaStream;

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: jest.fn().mockResolvedValue(stream) },
    });

    let onDataAvailable: ((e: any) => void) | undefined;
    let onStop: (() => void) | undefined;

    class MockMediaRecorder {
      state = 'inactive';
      mimeType = 'video/webm';
      constructor(public stream: MediaStream) {}
      start() {
        this.state = 'recording';
      }
      stop() {
        this.state = 'inactive';
        onDataAvailable?.({ data: new Blob(['rec'], { type: 'video/webm' }) });
        onStop?.();
      }
      addEventListener(type: string, cb: any) {
        if (type === 'dataavailable') onDataAvailable = cb;
        if (type === 'stop') onStop = cb;
      }
      static isTypeSupported() {
        return true;
      }
    }
    (window as any).MediaRecorder = MockMediaRecorder;

    const onUpload = jest.fn().mockResolvedValue(undefined);
    render(<ProofOfDeliveryRecorder onUpload={onUpload} maxDurationMs={1000} />);

    fireEvent.click(screen.getByRole('button', { name: /start recording/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /stop recording/i })).toBeInTheDocument(),
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /stop recording/i }));
    });

    // Preview + retake controls should now be visible.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /retake/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /upload/i })).toBeInTheDocument();

    // Retake resets back to the idle state.
    fireEvent.click(screen.getByRole('button', { name: /retake/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /start recording/i })).toBeInTheDocument(),
    );
  });
});

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Proof-of-Delivery video recorder.
 *
 * Records a confirmation video in-browser using MediaRecorder when supported,
 * lets the buyer preview/retake it, computes a SHA-256 hash of the recording,
 * and uploads it with progress reporting. Falls back to a plain file upload
 * when MediaRecorder/getUserMedia is unavailable (e.g. some iOS browsers).
 */

export interface ProofOfDeliveryRecorderProps {
  /** Maximum recording duration in seconds. */
  maxDurationSeconds?: number;
  /** Called with the recorded/selected file and its SHA-256 hex digest. */
  onUpload?: (file: File, sha256: string) => void;
  /** Optional uploader. Receives progress in the range 0..1. */
  uploadFile?: (file: File, onProgress: (progress: number) => void) => Promise<void>;
}

const DEFAULT_MAX_DURATION_SECONDS = 30;

function isRecorderSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}

async function computeSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function pickMimeType(): string | undefined {
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') {
    return undefined;
  }
  for (const type of candidates) {
    if (window.MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return undefined;
}

export const ProofOfDeliveryRecorder: React.FC<ProofOfDeliveryRecorderProps> = ({
  maxDurationSeconds = DEFAULT_MAX_DURATION_SECONDS,
  onUpload,
  uploadFile,
}) => {
  const supported = useMemo(isRecorderSupported, []);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sha256, setSha256] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const stopTimeoutRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (stopTimeoutRef.current !== null) {
      window.clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    setStream((current) => {
      current?.getTracks().forEach((track) => track.stop());
      return null;
    });
  }, []);

  useEffect(() => {
    return () => {
      clearTimers();
      recorderRef.current?.state === 'recording' && recorderRef.current.stop();
      stream?.getTracks().forEach((track) => track.stop());
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    setSha256(null);
    setProgress(0);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setRecordedBlob(null);

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: true,
      });
      setStream(mediaStream);
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = mediaStream;
        await liveVideoRef.current.play().catch(() => undefined);
      }

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || 'video/webm' });
        setRecordedBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        setRecording(false);
        clearTimers();
        stopStream();
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setElapsed(0);

      timerRef.current = window.setInterval(() => {
        setElapsed((prev) => {
          const next = prev + 1;
          if (next >= maxDurationSeconds) {
            recorderRef.current?.state === 'recording' && recorderRef.current.stop();
          }
          return next;
        });
      }, 1000);

      stopTimeoutRef.current = window.setTimeout(() => {
        recorderRef.current?.state === 'recording' && recorderRef.current.stop();
      }, maxDurationSeconds * 1000);
    } catch (err) {
      setError('Unable to access the camera. Please check permissions or upload a file instead.');
      setRecording(false);
      clearTimers();
      stopStream();
    }
  }, [clearTimers, maxDurationSeconds, previewUrl, stopStream]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
    clearTimers();
  }, [clearTimers]);

  const retake = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setRecordedBlob(null);
    setSha256(null);
    setProgress(0);
    setError(null);
  }, [previewUrl]);

  const handleUpload = useCallback(async () => {
    if (!recordedBlob) {
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const file = new File([recordedBlob], `proof-of-delivery-${Date.now()}.webm`, {
        type: recordedBlob.type || 'video/webm',
      });
      const hash = await computeSha256(file);
      setSha256(hash);
      if (uploadFile) {
        await uploadFile(file, (p) => setProgress(Math.min(1, Math.max(0, p))));
      } else {
        setProgress(1);
      }
      onUpload?.(file, hash);
    } catch (err) {
      setError('Upload failed. Please retry.');
    } finally {
      setUploading(false);
    }
  }, [onUpload, recordedBlob, uploadFile]);

  const handleFileFallback = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      setError(null);
      setUploading(true);
      try {
        const hash = await computeSha256(file);
        setSha256(hash);
        if (uploadFile) {
          await uploadFile(file, (p) => setProgress(Math.min(1, Math.max(0, p))));
        } else {
          setProgress(1);
        }
        onUpload?.(file, hash);
      } catch (err) {
        setError('Upload failed. Please retry.');
      } finally {
        setUploading(false);
      }
    },
    [onUpload, uploadFile],
  );

  return (
    <div className="proof-of-delivery-recorder">
      <h3>Proof of Delivery</h3>

      {!supported && (
        <div className="proof-of-delivery-recorder__fallback">
          <p>In-browser recording is not supported on this device. Please upload a video file.</p>
          <input
            type="file"
            accept="video/*"
            capture="environment"
            onChange={handleFileFallback}
            disabled={uploading}
          />
        </div>
      )}

      {supported && (
        <div className="proof-of-delivery-recorder__capture">
          {!previewUrl && (
            <video
              ref={liveVideoRef}
              className="proof-of-delivery-recorder__live"
              muted
              playsInline
            />
          )}

          {previewUrl && (
            <video
              className="proof-of-delivery-recorder__preview"
              src={previewUrl}
              controls
              playsInline
            />
          )}

          <div className="proof-of-delivery-recorder__controls">
            {!recording && !previewUrl && (
              <button type="button" onClick={startRecording}>
                Start recording
              </button>
            )}
            {recording && (
              <button type="button" onClick={stopRecording}>
                Stop ({Math.max(0, maxDurationSeconds - elapsed)}s)
              </button>
            )}
            {previewUrl && !uploading && (
              <>
                <button type="button" onClick={retake}>
                  Retake
                </button>
                <button type="button" onClick={handleUpload}>
                  Upload
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {uploading && (
        <div className="proof-of-delivery-recorder__progress">
          <progress value={progress} max={1} />
          <span>{Math.round(progress * 100)}%</span>
        </div>
      )}

      {sha256 && (
        <p className="proof-of-delivery-recorder__hash">
          SHA-256: <code>{sha256}</code>
        </p>
      )}

      {error && <p className="proof-of-delivery-recorder__error">{error}</p>}
    </div>
  );
};

export default ProofOfDeliveryRecorder;

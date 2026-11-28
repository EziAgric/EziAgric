import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Proof-of-Delivery uploader.
 *
 * Records a confirmation video in-browser using MediaRecorder when supported,
 * lets the buyer preview/retake it, then uploads with progress reporting and a
 * SHA-256 hash of the recording. Falls back to a plain file upload when
 * MediaRecorder / getUserMedia are unavailable (e.g. older browsers).
 */

export interface ProofOfDeliveryUploadProps {
  /** Called once the recording/file has been uploaded successfully. */
  onUploaded?: (result: { hash: string; url?: string; blob: Blob }) => void;
  /** Maximum recording duration in seconds. */
  maxDurationSeconds?: number;
  /** Upload endpoint. */
  uploadUrl?: string;
  /** Optional extra form fields sent alongside the file. */
  extraFields?: Record<string, string>;
}

type Status = 'idle' | 'recording' | 'preview' | 'uploading' | 'done' | 'error';

const DEFAULT_MAX_DURATION = 30;
const DEFAULT_UPLOAD_URL = '/api/proof-of-delivery';

function isRecorderSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}

async function sha256Hex(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback: no SubtleCrypto available.
  return '';
}

function pickMimeType(): string | undefined {
  if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') {
    return undefined;
  }
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return undefined;
}

function uploadWithProgress(
  url: string,
  blob: Blob,
  fields: Record<string, string>,
  onProgress: (percent: number) => void,
): Promise<{ url?: string }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    Object.entries(fields).forEach(([key, value]) => form.append(key, value));
    form.append('file', blob, 'proof-of-delivery.webm');

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        let parsed: { url?: string } = {};
        try {
          parsed = JSON.parse(xhr.responseText || '{}');
        } catch {
          parsed = {};
        }
        resolve(parsed);
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.onabort = () => reject(new Error('Upload aborted'));
    xhr.send(form);
  });
}

export const ProofOfDeliveryUpload: React.FC<ProofOfDeliveryUploadProps> = ({
  onUploaded,
  maxDurationSeconds = DEFAULT_MAX_DURATION,
  uploadUrl = DEFAULT_UPLOAD_URL,
  extraFields,
}) => {
  const supported = useMemo(isRecorderSupported, []);

  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [hash, setHash] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopStream();
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finalizeRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    stopStream();
  }, [stopStream]);

  const startRecording = useCallback(async () => {
    setError(null);
    setProgress(0);
    setElapsed(0);
    setHash(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setRecordedBlob(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: true,
      });
      streamRef.current = stream;
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        liveVideoRef.current.muted = true;
        await liveVideoRef.current.play().catch(() => undefined);
      }

      const mimeType = pickMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
        setRecordedBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        setStatus('preview');
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setStatus('recording');

      const startedAt = Date.now();
      timerRef.current = window.setInterval(() => {
        const seconds = Math.floor((Date.now() - startedAt) / 1000);
        setElapsed(seconds);
        if (seconds >= maxDurationSeconds) {
          finalizeRecording();
        }
      }, 250);
    } catch (err) {
      stopStream();
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Unable to access camera');
    }
  }, [finalizeRecording, maxDurationSeconds, previewUrl, stopStream]);

  const retake = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setRecordedBlob(null);
    setHash(null);
    setProgress(0);
    setElapsed(0);
    setError(null);
    setStatus('idle');
  }, [previewUrl]);

  const upload = useCallback(
    async (blob: Blob) => {
      setStatus('uploading');
      setError(null);
      setProgress(0);
      try {
        const digest = await sha256Hex(blob);
        setHash(digest);
        const fields: Record<string, string> = { ...(extraFields || {}) };
        if (digest) {
          fields.sha256 = digest;
        }
        const result = await uploadWithProgress(uploadUrl, blob, fields, setProgress);
        setStatus('done');
        onUploaded?.({ hash: digest, url: result.url, blob });
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Upload failed');
      }
    },
    [extraFields, onUploaded, uploadUrl],
  );

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setRecordedBlob(file);
      setPreviewUrl(URL.createObjectURL(file));
      setStatus('preview');
    },
    [],
  );

  const remaining = Math.max(0, maxDurationSeconds - elapsed);

  return (
    <div className="proof-of-delivery-upload">
      <h3>Proof of Delivery</h3>

      {status === 'idle' && supported && (
        <div>
          <p>Record a short confirmation video (max {maxDurationSeconds}s).</p>
          <button type="button" onClick={startRecording}>
            Start recording
          </button>
        </div>
      )}

      {status === 'recording' && (
        <div>
          <video ref={liveVideoRef} playsInline muted className="proof-of-delivery-preview" />
          <p>Recording… {remaining}s remaining</p>
          <button type="button" onClick={finalizeRecording}>
            Stop
          </button>
        </div>
      )}

      {status === 'preview' && previewUrl && (
        <div>
          <video src={previewUrl} controls playsInline className="proof-of-delivery-preview" />
          <div className="proof-of-delivery-actions">
            <button type="button" onClick={retake}>
              Retake
            </button>
            <button
              type="button"
              onClick={() => recordedBlob && upload(recordedBlob)}
              disabled={!recordedBlob}
            >
              Upload
            </button>
          </div>
        </div>
      )}

      {status === 'uploading' && (
        <div>
          <progress value={progress} max={100} />
          <span>{progress}%</span>
        </div>
      )}

      {status === 'done' && (
        <div>
          <p>Upload complete.</p>
          {hash && <p className="proof-of-delivery-hash">SHA-256: {hash}</p>}
        </div>
      )}

      {status === 'error' && (
        <div>
          <p role="alert">{error}</p>
          {recordedBlob && (
            <button type="button" onClick={() => upload(recordedBlob)}>
              Retry upload
            </button>
          )}
        </div>
      )}

      {!supported && (
        <div>
          <p>In-browser recording is not supported on this device. Please upload a video file.</p>
          <input type="file" accept="video/*" onChange={handleFileChange} />
          {status === 'preview' && recordedBlob && (
            <button type="button" onClick={() => upload(recordedBlob)}>
              Upload
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ProofOfDeliveryUpload;

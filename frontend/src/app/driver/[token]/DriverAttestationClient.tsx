'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type AttestationKind = 'pickup' | 'delivery';

type TokenState = 'loading' | 'valid' | 'expired' | 'invalid';

type Copy = {
  title: string;
  subtitle: string;
  pickup: string;
  delivery: string;
  confirm: string;
  recording: string;
  recordVideo: string;
  stopVideo: string;
  retake: string;
  submit: string;
  submitting: string;
  success: string;
  expiredTitle: string;
  expiredBody: string;
  invalidTitle: string;
  invalidBody: string;
  error: string;
  optional: string;
};

const COPY: Record<string, Copy> = {
  en: {
    title: 'Confirm your stop',
    subtitle: 'Tap one button to confirm.',
    pickup: 'Confirm pickup',
    delivery: 'Confirm delivery',
    confirm: 'Confirm',
    recording: 'Recording…',
    recordVideo: 'Record short video',
    stopVideo: 'Stop recording',
    retake: 'Retake',
    submit: 'Send confirmation',
    submitting: 'Sending…',
    success: 'Thank you. Confirmation sent.',
    expiredTitle: 'Link expired',
    expiredBody: 'Ask dispatch for a new link.',
    invalidTitle: 'Link not valid',
    invalidBody: 'Check the link or ask dispatch for help.',
    error: 'Something went wrong. Try again.',
    optional: 'Optional',
  },
  es: {
    title: 'Confirma tu parada',
    subtitle: 'Toca un botón para confirmar.',
    pickup: 'Confirmar recogida',
    delivery: 'Confirmar entrega',
    confirm: 'Confirmar',
    recording: 'Grabando…',
    recordVideo: 'Grabar video corto',
    stopVideo: 'Detener grabación',
    retake: 'Volver a grabar',
    submit: 'Enviar confirmación',
    submitting: 'Enviando…',
    success: 'Gracias. Confirmación enviada.',
    expiredTitle: 'Enlace expirado',
    expiredBody: 'Pide un nuevo enlace a la central.',
    invalidTitle: 'Enlace no válido',
    invalidBody: 'Revisa el enlace o pide ayuda a la central.',
    error: 'Algo salió mal. Inténtalo de nuevo.',
    optional: 'Opcional',
  },
};

function pickLocale(): string {
  if (typeof navigator === 'undefined') return 'en';
  const langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
  for (const lang of langs) {
    const base = (lang || '').toLowerCase().split('-')[0];
    if (COPY[base]) return base;
  }
  return 'en';
}

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL || '';
}

export default function DriverAttestationClient({ token }: { token: string }) {
  const [locale] = useState<string>(() => pickLocale());
  const t = useMemo<Copy>(() => COPY[locale] ?? COPY.en, [locale]);

  const [tokenState, setTokenState] = useState<TokenState>('loading');
  const [kind, setKind] = useState<AttestationKind | null>(null);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [recording, setRecording] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch(`${apiBase()}/driver/attestation/${encodeURIComponent(token)}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        if (cancelled) return;
        if (res.status === 410) {
          setTokenState('expired');
        } else if (res.ok) {
          setTokenState('valid');
        } else if (res.status === 404 || res.status === 400) {
          setTokenState('invalid');
        } else {
          setTokenState('invalid');
        }
      } catch {
        if (!cancelled) setTokenState('invalid');
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => stopStream, [stopStream]);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
        setVideoBlob(blob);
        stopStream();
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setError(t.error);
    }
  }, [stopStream, t.error]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }, []);

  const submit = useCallback(async () => {
    if (!kind) return;
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('kind', kind);
      if (videoBlob) form.append('video', videoBlob, 'attestation.webm');
      const res = await fetch(`${apiBase()}/driver/attestation/${encodeURIComponent(token)}`, {
        method: 'POST',
        body: form,
      });
      if (res.status === 410) {
        setTokenState('expired');
        return;
      }
      if (!res.ok) throw new Error('failed');
      setDone(true);
    } catch {
      setError(t.error);
    } finally {
      setSubmitting(false);
    }
  }, [kind, videoBlob, token, t.error]);

  if (tokenState === 'loading') {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6">
        <p className="text-lg text-gray-600" role="status" aria-live="polite">
          …
        </p>
      </main>
    );
  }

  if (tokenState === 'expired' || tokenState === 'invalid') {
    const expired = tokenState === 'expired';
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-bold text-gray-900">
          {expired ? t.expiredTitle : t.invalidTitle}
        </h1>
        <p className="text-lg text-gray-600">{expired ? t.expiredBody : t.invalidBody}</p>
      </main>
    );
  }

  if (done) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-bold text-gray-900" role="status" aria-live="polite">
          {t.success}
        </h1>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-gray-900">{t.title}</h1>
        <p className="text-base text-gray-600">{t.subtitle}</p>
      </header>

      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setKind('pickup')}
          aria-pressed={kind === 'pickup'}
          className={`min-h-[64px] rounded-xl px-6 py-4 text-xl font-semibold transition ${
            kind === 'pickup'
              ? 'bg-blue-700 text-white'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {t.pickup}
        </button>
        <button
          type="button"
          onClick={() => setKind('delivery')}
          aria-pressed={kind === 'delivery'}
          className={`min-h-[64px] rounded-xl px-6 py-4 text-xl font-semibold transition ${
            kind === 'delivery'
              ? 'bg-green-700 text-white'
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
        >
          {t.delivery}
        </button>
      </div>

      <section className="flex flex-col gap-3" aria-label={t.optional}>
        <p className="text-sm font-medium text-gray-500">{t.optional}</p>
        {recording ? (
          <button
            type="button"
            onClick={stopRecording}
            className="min-h-[56px] rounded-xl border-2 border-red-600 px-6 py-3 text-lg font-semibold text-red-700"
          >
            {t.stopVideo}
          </button>
        ) : (
          <button
            type="button"
            onClick={startRecording}
            className="min-h-[56px] rounded-xl border-2 border-gray-400 px-6 py-3 text-lg font-semibold text-gray-800"
          >
            {videoBlob ? t.retake : t.recordVideo}
          </button>
        )}
        {recording && (
          <p className="text-base text-red-700" role="status" aria-live="polite">
            {t.recording}
          </p>
        )}
      </section>

      {error && (
        <p className="text-base text-red-700" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={!kind || submitting}
        className="min-h-[64px] rounded-xl bg-gray-900 px-6 py-4 text-xl font-semibold text-white disabled:opacity-50"
      >
        {submitting ? t.submitting : t.submit}
      </button>
    </main>
  );
}

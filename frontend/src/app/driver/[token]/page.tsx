'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';

type AttestationKind = 'pickup' | 'delivery';

interface DriverCopy {
  title: string;
  pickup: string;
  delivery: string;
  record: string;
  stopRecording: string;
  retake: string;
  submit: string;
  submitting: string;
  success: string;
  expiredTitle: string;
  expiredBody: string;
  errorTitle: string;
  errorBody: string;
  retry: string;
  optionalVideo: string;
}

const COPY: Record<string, DriverCopy> = {
  en: {
    title: 'Confirm your stop',
    pickup: 'Confirm pickup',
    delivery: 'Confirm delivery',
    record: 'Record video',
    stopRecording: 'Stop recording',
    retake: 'Retake',
    submit: 'Submit',
    submitting: 'Submitting…',
    success: 'Thank you! Your confirmation was sent.',
    expiredTitle: 'Link expired',
    expiredBody: 'This link is no longer valid. Ask dispatch for a new link.',
    errorTitle: 'Something went wrong',
    errorBody: 'We could not load this stop. Please try again.',
    retry: 'Try again',
    optionalVideo: 'Optional: record a short video',
  },
  es: {
    title: 'Confirma tu parada',
    pickup: 'Confirmar recogida',
    delivery: 'Confirmar entrega',
    record: 'Grabar video',
    stopRecording: 'Detener grabación',
    retake: 'Volver a grabar',
    submit: 'Enviar',
    submitting: 'Enviando…',
    success: '¡Gracias! Tu confirmación fue enviada.',
    expiredTitle: 'Enlace expirado',
    expiredBody: 'Este enlace ya no es válido. Pide uno nuevo a la central.',
    errorTitle: 'Algo salió mal',
    errorBody: 'No pudimos cargar esta parada. Inténtalo de nuevo.',
    retry: 'Reintentar',
    optionalVideo: 'Opcional: graba un video corto',
  },
};

function resolveCopy(): DriverCopy {
  if (typeof navigator === 'undefined') return COPY.en;
  const lang = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return COPY[lang] ?? COPY.en;
}

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? '';
}

export default function DriverAttestationPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? '';
  const copy = useMemo(resolveCopy, []);

  const [status, setStatus] = useState<'loading' | 'ready' | 'expired' | 'error'>('loading');
  const [kind, setKind] = useState<AttestationKind | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [recording, setRecording] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch(`${apiBase()}/driver/attestation/${encodeURIComponent(token)}`);
      if (res.status === 410 || res.status === 404) {
        setStatus('expired');
        return;
      }
      if (!res.ok) throw new Error('load failed');
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [token]);

  useEffect(() => {
    if (token) void load();
  }, [token, load]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        setVideoBlob(new Blob(chunksRef.current, { type: 'video/webm' }));
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      setRecording(false);
    }
  }, []);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }, []);

  const submit = useCallback(
    async (selected: AttestationKind) => {
      setKind(selected);
      setSubmitting(true);
      try {
        const form = new FormData();
        form.append('kind', selected);
        if (videoBlob) form.append('video', videoBlob, 'attestation.webm');
        const res = await fetch(
          `${apiBase()}/driver/attestation/${encodeURIComponent(token)}`,
          { method: 'POST', body: form },
        );
        if (res.status === 410 || res.status === 404) {
          setStatus('expired');
          return;
        }
        if (!res.ok) throw new Error('submit failed');
        setDone(true);
      } catch {
        setStatus('error');
      } finally {
        setSubmitting(false);
      }
    },
    [token, videoBlob],
  );

  if (status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p role="status" aria-live="polite" className="text-lg">
          …
        </p>
      </main>
    );
  }

  if (status === 'expired') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-bold">{copy.expiredTitle}</h1>
        <p className="text-lg">{copy.expiredBody}</p>
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-bold">{copy.errorTitle}</h1>
        <p className="text-lg">{copy.errorBody}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="min-h-14 rounded-xl bg-blue-600 px-8 py-4 text-lg font-semibold text-white"
        >
          {copy.retry}
        </button>
      </main>
    );
  }

  if (done) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6 text-center">
        <p role="status" aria-live="polite" className="text-xl font-semibold">
          {copy.success}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-6">
      <h1 className="text-center text-2xl font-bold">{copy.title}</h1>

      <button
        type="button"
        disabled={submitting}
        onClick={() => void submit('pickup')}
        className="min-h-16 rounded-2xl bg-blue-600 px-6 py-5 text-xl font-bold text-white disabled:opacity-60"
      >
        {submitting && kind === 'pickup' ? copy.submitting : copy.pickup}
      </button>

      <button
        type="button"
        disabled={submitting}
        onClick={() => void submit('delivery')}
        className="min-h-16 rounded-2xl bg-green-600 px-6 py-5 text-xl font-bold text-white disabled:opacity-60"
      >
        {submitting && kind === 'delivery' ? copy.submitting : copy.delivery}
      </button>

      <section className="flex flex-col gap-3 rounded-2xl border border-gray-300 p-4">
        <p className="text-base font-medium">{copy.optionalVideo}</p>
        {videoBlob ? (
          <button
            type="button"
            onClick={() => setVideoBlob(null)}
            className="min-h-12 rounded-xl border border-gray-400 px-4 py-3 text-base font-semibold"
          >
            {copy.retake}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => (recording ? stopRecording() : void startRecording())}
            className="min-h-12 rounded-xl border border-gray-400 px-4 py-3 text-base font-semibold"
          >
            {recording ? copy.stopRecording : copy.record}
          </button>
        )}
      </section>
    </main>
  );
}

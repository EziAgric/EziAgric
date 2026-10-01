'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const CHANNELS = ['in-app', 'email', 'sms', 'push'] as const;
const EVENT_TYPES = [
  { id: 'task_assigned', label: 'Task assigned' },
  { id: 'task_completed', label: 'Task completed' },
  { id: 'comment_mention', label: 'Comment mention' },
  { id: 'due_date_reminder', label: 'Due date reminder' },
  { id: 'weekly_digest', label: 'Weekly digest' },
] as const;

type Channel = (typeof CHANNELS)[number];
type EventType = (typeof EVENT_TYPES)[number]['id'];
type Preferences = Record<EventType, Record<Channel, boolean>>;

const PREFERENCES_ENDPOINT = '/api/users/me/notification-preferences';

function buildDefaultPreferences(): Preferences {
  return EVENT_TYPES.reduce((acc, event) => {
    acc[event.id] = CHANNELS.reduce((channels, channel) => {
      channels[channel] = channel !== 'sms';
      return channels;
    }, {} as Record<Channel, boolean>);
    return acc;
  }, {} as Preferences);
}

function normalizePreferences(data: Partial<Preferences> | null | undefined): Preferences {
  const defaults = buildDefaultPreferences();
  if (!data) return defaults;
  return EVENT_TYPES.reduce((acc, event) => {
    acc[event.id] = CHANNELS.reduce((channels, channel) => {
      channels[channel] = data[event.id]?.[channel] ?? defaults[event.id][channel];
      return channels;
    }, {} as Record<Channel, boolean>);
    return acc;
  }, {} as Preferences);
}

export default function NotificationPreferences() {
  const [preferences, setPreferences] = useState<Preferences>(() => buildDefaultPreferences());
  const [savedPreferences, setSavedPreferences] = useState<Preferences>(() => buildDefaultPreferences());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPreferences() {
      try {
        const response = await fetch(PREFERENCES_ENDPOINT, { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to load notification preferences');
        const data = (await response.json()) as Partial<Preferences>;
        if (cancelled) return;
        const normalized = normalizePreferences(data);
        setPreferences(normalized);
        setSavedPreferences(normalized);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load notification preferences');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadPreferences();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(
    async (event: EventType, channel: Channel) => {
      const previous = preferences;
      const next: Preferences = {
        ...preferences,
        [event]: { ...preferences[event], [channel]: !preferences[event][channel] },
      };

      setPreferences(next);
      setIsSaving(true);
      setError(null);

      try {
        const response = await fetch(PREFERENCES_ENDPOINT, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        });
        if (!response.ok) throw new Error('Failed to save notification preferences');
        setSavedPreferences(next);
      } catch (err) {
        setPreferences(previous);
        setError(err instanceof Error ? err.message : 'Failed to save notification preferences');
      } finally {
        setIsSaving(false);
      }
    },
    [preferences],
  );

  const hasChanges = useMemo(
    () => JSON.stringify(preferences) !== JSON.stringify(savedPreferences),
    [preferences, savedPreferences],
  );

  return (
    <section className="notification-preferences" aria-labelledby="notification-preferences-heading">
      <header className="notification-preferences__header">
        <h2 id="notification-preferences-heading">Notification preferences</h2>
        <p>Choose which channels deliver each type of notification.</p>
      </header>

      {error ? (
        <p role="alert" className="notification-preferences__error">
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <p>Loading notification preferences…</p>
      ) : (
        <table className="notification-preferences__matrix">
          <thead>
            <tr>
              <th scope="col">Event</th>
              {CHANNELS.map((channel) => (
                <th key={channel} scope="col">
                  {channel}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {EVENT_TYPES.map((event) => (
              <tr key={event.id}>
                <th scope="row">{event.label}</th>
                {CHANNELS.map((channel) => (
                  <td key={channel}>
                    <input
                      type="checkbox"
                      checked={preferences[event.id][channel]}
                      disabled={isSaving}
                      aria-label={`${event.label} via ${channel}`}
                      onChange={() => toggle(event.id, channel)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="notification-preferences__status" aria-live="polite">
        {isSaving ? 'Saving…' : hasChanges ? 'Unsaved changes' : 'All changes saved'}
      </p>
    </section>
  );
}

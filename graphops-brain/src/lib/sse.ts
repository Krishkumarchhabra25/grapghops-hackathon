/**
 * Server-Sent Events hook for /runs/{id}/events.
 *
 * Behaviour:
 * - Opens an EventSource on mount, closes it on unmount.
 * - Registers listeners for each named event type our backend emits.
 * - Appends incoming events to a list (newest last).
 * - Auto-reconnects on network drop (browser default).
 * - Exposes `connected` so the UI can show a live/offline badge.
 */
import { useEffect, useRef, useState } from 'react';
import { openRunEvents } from './api';

/** Every event name the backend can emit. Must stay in sync with app/agents/events.py. */
export const RUN_EVENT_NAMES = [
  'run.started',
  'tool.started',
  'tool.completed',
  'graph.path_found',
  'memory.retrieved',
  'finding.created',
  'action.proposed',
  'approval.required',
  'approval.decided',
  'action.executed',
  'verification.completed',
  'memory.written',
  'run.completed',
  'run.failed',
  'run.cancelled',
] as const;

export type RunEventName = (typeof RUN_EVENT_NAMES)[number];

export type RunEvent = {
  seq: number;
  ts: number;
  event: string;
  /** Parsed JSON payload from the SSE `data:` field. */
  data: Record<string, any>;
};

type Options = {
  /** Stop polling once we see a terminal event. */
  stopOnTerminal?: boolean;
  /** Max events to keep in memory. Older events are dropped. */
  maxEvents?: number;
};

const TERMINAL = new Set(['run.completed', 'run.failed', 'run.cancelled']);

export function useRunEvents(runId: string | null, opts: Options = {}) {
  const { stopOnTerminal = false, maxEvents = 500 } = opts;
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (!runId) return;

    stoppedRef.current = false;
    setEvents([]);
    setError(null);
    setConnected(false);

    const es = openRunEvents(runId);
    sourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
      setError(null);
    };

    es.onerror = () => {
      // Browser auto-reconnects. We only surface the state.
      setConnected(false);
    };

    const handle = (rawEvent: MessageEvent, eventName: string) => {
      if (stoppedRef.current) return;
      let data: Record<string, any> = {};
      try {
        data = JSON.parse(rawEvent.data || '{}');
      } catch {
        // Malformed payload — keep the raw text.
        data = { _raw: rawEvent.data };
      }
      const seq = Number(data.seq ?? rawEvent.lastEventId ?? 0);
      const ts = Number(data.ts ?? Date.now());

      const evt: RunEvent = { seq, ts, event: eventName, data };
      setEvents(prev => {
        // Dedup by seq in case of reconnect overlap.
        if (prev.some(e => e.seq === seq && e.event === eventName)) return prev;
        const next = [...prev, evt];
        return next.length > maxEvents ? next.slice(-maxEvents) : next;
      });

      if (stopOnTerminal && TERMINAL.has(eventName)) {
        stoppedRef.current = true;
        es.close();
        setConnected(false);
      }
    };

    // Register a listener for each known event type. EventSource uses the
    // SSE `event:` field as the listener name.
    const listeners: Array<[string, (e: MessageEvent) => void]> = [];
    for (const name of RUN_EVENT_NAMES) {
      const fn = (e: MessageEvent) => handle(e, name);
      es.addEventListener(name, fn as EventListener);
      listeners.push([name, fn]);
    }
    // Also catch the default `message` event (unnamed frames).
    const messageFn = (e: MessageEvent) => handle(e, 'message');
    es.addEventListener('message', messageFn as EventListener);
    listeners.push(['message', messageFn]);

    return () => {
      stoppedRef.current = true;
      for (const [name, fn] of listeners) {
        es.removeEventListener(name, fn as EventListener);
      }
      es.close();
      sourceRef.current = null;
      setConnected(false);
    };
  }, [runId, stopOnTerminal, maxEvents]);

  return { events, connected, error };
}
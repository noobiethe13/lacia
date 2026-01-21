import { useState, useEffect, useRef } from 'react';

export type ToolCallRecord = {
  id: number;
  name: string;
  args: unknown;
  result: unknown;
  error?: string;
  status: 'running' | 'completed' | 'failed';
  timestamp: string;
};

export type LogRecord = {
  id: number;
  type: string;
  content: string;
  timestamp: string;
};

export function useIncidentStream(incidentId: number) {
  const [logs, setLogs] = useState<LogRecord[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCallRecord[]>([]);
  const [status, setStatus] = useState<string>('connecting');
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!incidentId) return;

    setLogs([]);
    setToolCalls([]);
    setStatus('connecting');

    const url = `/api/incidents/${incidentId}/stream`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
      setStatus('connected');
    };

    es.onerror = (err) => {
      console.error('SSE Error:', err);
      setConnected(false);
      setStatus('error');
      es.close();
    };

    es.addEventListener('log', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        setLogs(prev => [...prev, { ...data, timestamp: new Date().toISOString() }]);
      } catch (e) {
        console.error('Failed to parse log:', e);
      }
    });

    es.addEventListener('tool_call', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        setToolCalls(prev => {
          // Update existing tool call or append new one
          const existingIndex = prev.findIndex(tc => tc.id === data.id);
          if (existingIndex >= 0) {
            const newCalls = [...prev];
            newCalls[existingIndex] = { ...data, timestamp: new Date().toISOString() };
            return newCalls;
          }
          return [...prev, { ...data, timestamp: new Date().toISOString() }];
        });
      } catch (e) {
        console.error('Failed to parse tool_call', e);
      }
    });

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'done') {
          setStatus('done');
          es.close();
        }
      } catch {
        // Ignore non-JSON messages
      }
    };

    return () => {
      es.close();
      setConnected(false);
    };
  }, [incidentId]);

  return { logs, toolCalls, status, connected };
}

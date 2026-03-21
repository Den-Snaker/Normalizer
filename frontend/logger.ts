export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  details?: any;
}

let logs: LogEntry[] = [];
const listeners: ((logs: LogEntry[]) => void)[] = [];

const notify = () => {
  listeners.forEach(l => l([...logs]));
};

export const addLog = (level: LogLevel, message: string, details?: any) => {
  const safeDetails = (() => {
    if (details === undefined) return undefined;
    try {
      const json = JSON.stringify(details);
      if (json.length > 20000) {
        return { truncated: true, length: json.length };
      }
      return details;
    } catch {
      return { truncated: true, length: 0 };
    }
  })();

  const entry: LogEntry = {
    id: Math.random().toString(36).substr(2, 9),
    timestamp: Date.now(),
    level,
    message,
    details: safeDetails
  };
  
  logs = [entry, ...logs].slice(0, 100); // Keep last 100 logs
  notify();

  // Also log to console for debugging
  if (level === 'error') {
    console.error(`[${level.toUpperCase()}] ${message}`, details || '');
  } else if (level === 'warn') {
    console.warn(`[${level.toUpperCase()}] ${message}`, details || '');
  } else {
    console.log(`[${level.toUpperCase()}] ${message}`, details || '');
  }

  // Save to file via Vite dev server
  if (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    try {
      const payload = JSON.stringify(entry);
      if (payload.length > 20000) return;
      fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      }).catch(err => console.error("Failed to send log to server:", err));
    } catch (e) {
      // Ignore fetch errors if not in dev mode
    }
  }
};

export const clearLogs = () => {
  logs = [];
  notify();
};

export const subscribeLogs = (callback: (logs: LogEntry[]) => void) => {
  listeners.push(callback);
  callback([...logs]); // Initial call
  return () => {
    const index = listeners.indexOf(callback);
    if (index > -1) listeners.splice(index, 1);
  };
};

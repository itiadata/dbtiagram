/**
 * A small, generic auto-dismissing popup (spec 35). Carries no domain
 * knowledge — callers format `message` and decide what dismissal means.
 */
import { useEffect } from 'react';

export interface ToastProps {
  message: string;
  onDismiss: () => void;
  /** Milliseconds before auto-dismiss. Defaults to 8000. */
  durationMs?: number;
}

export function Toast({ message, onDismiss, durationMs = 8000 }: ToastProps): JSX.Element {
  useEffect(() => {
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [onDismiss, durationMs]);

  return (
    <div className="toast" role="status">
      <span className="toast__message">{message}</span>
      <button
        type="button"
        className="toast__dismiss"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

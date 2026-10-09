import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { NAVIGATE_MESSAGE, isReminderPath } from '@/core/push/reminders';

/**
 * A tap on a notification while Cockpit is open: the service worker asks the app to open
 * the matching page. Behind the lock screen the route changes, too – it shows after unlocking.
 */
export function PushNavigation() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent<unknown>) => {
      const data = event.data as { type?: unknown; path?: unknown } | null;
      if (data?.type === NAVIGATE_MESSAGE && isReminderPath(data.path)) void navigate(data.path);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);
  return null;
}

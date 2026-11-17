import React, { useState, useEffect } from 'react';
import { BellRing, X } from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';

const DISMISS_SESSION_KEY = 'selvee_notif_banner_dismissed_v1';

export const AllowNotificationBanner: React.FC = () => {
  const {
    permission,
    allNotificationsActive,
    enableAllNotificationsOneClick,
    customerVerificationBlockReason,
    isDrawerOpen,
  } = useNotifications();

  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(DISMISS_SESSION_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [visible, setVisible] = useState(false);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 300);
    return () => window.clearTimeout(timer);
  }, []);

  if (
    !visible ||
    dismissed ||
    isDrawerOpen ||
    allNotificationsActive ||
    customerVerificationBlockReason === 'unverified_email' ||
    permission === 'denied'
  ) {
    return null;
  }

  const handleAllow = async () => {
    setRequesting(true);
    try {
      await enableAllNotificationsOneClick();
      try {
        sessionStorage.setItem(DISMISS_SESSION_KEY, '1');
      } catch {
        // ignore
      }
      setDismissed(true);
    } finally {
      setRequesting(false);
    }
  };

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_SESSION_KEY, '1');
    } catch {
      // ignore
    }
    setDismissed(true);
  };

  return (
    <div
      role="dialog"
      aria-label="Allow Notifications"
      className="fixed bottom-20 md:bottom-5 right-4 left-4 sm:left-auto sm:w-[375px] z-40 animate-fade-in"
    >
      <div className="bg-white border border-neutral-200 rounded-2xl shadow-2xl p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center shrink-0 mt-0.5">
          <BellRing className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
              Allow Notifications
            </h3>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss notification prompt"
              className="p-0.5 text-neutral-400 hover:text-neutral-900 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-neutral-600 mt-1 leading-relaxed">
            Turn on mobile alerts for live order status updates, exclusive offers, and flash discounts.
          </p>

          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={handleAllow}
              disabled={requesting}
              className="px-4 py-2 bg-black text-white text-[11px] font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-60"
            >
              {requesting ? 'Requesting...' : 'Allow Notifications'}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="px-3 py-2 text-[11px] font-medium text-neutral-600 hover:text-black rounded-lg hover:bg-neutral-100 transition-colors cursor-pointer"
            >
              Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';

const PROMPT_HANDLED_KEY = 'selvee_notif_prompt_handled_v1';

export const AllowNotificationBanner: React.FC = () => {
  const {
    permission,
    enableAllNotificationsOneClick,
    customerVerificationBlockReason,
    isDrawerOpen,
  } = useNotifications();

  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(PROMPT_HANDLED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 250);
    return () => window.clearTimeout(timer);
  }, []);

  if (
    !visible ||
    dismissed ||
    isDrawerOpen ||
    permission !== 'default' ||
    customerVerificationBlockReason === 'unverified_email'
  ) {
    return null;
  }

  const handleAllow = async () => {
    try {
      localStorage.setItem(PROMPT_HANDLED_KEY, '1');
    } catch {
      // ignore
    }
    setDismissed(true);
    await enableAllNotificationsOneClick();
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem(PROMPT_HANDLED_KEY, '1');
    } catch {
      // ignore
    }
    setDismissed(true);
  };

  return (
    <div
      role="dialog"
      aria-label="Allow Notifications"
      className="fixed bottom-20 md:bottom-5 right-4 left-4 sm:left-auto sm:w-[350px] z-40 animate-fade-in"
    >
      <div className="bg-white border border-neutral-200 rounded-xl shadow-xl p-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center shrink-0">
            <Bell className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-neutral-900">Get Order &amp; Offer Alerts</p>
            <p className="text-[11px] text-neutral-500 truncate">Turn on browser notifications</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleAllow}
            className="px-3.5 py-2 bg-black text-white text-[11px] font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            Allow
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Close"
            className="p-1.5 text-neutral-400 hover:text-neutral-900 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

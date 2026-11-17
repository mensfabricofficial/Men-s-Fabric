import React, { useState } from 'react';
import { Download, Smartphone, X, Share } from 'lucide-react';
import { usePWAInstall, useOnlineStatus } from '../../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  compact = false,
  className = '',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={
          className ||
          (compact
            ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black text-white text-[11px] font-semibold hover:bg-neutral-800 transition-colors cursor-pointer'
            : 'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-black text-white text-xs font-semibold uppercase tracking-wider hover:bg-neutral-800 transition-colors cursor-pointer')
        }
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>Install Selvee App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={
            className ||
            (compact
              ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-300 bg-white text-neutral-900 text-[11px] font-semibold hover:border-black transition-colors cursor-pointer'
              : 'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-neutral-300 bg-white text-neutral-900 text-xs font-semibold uppercase tracking-wider hover:border-black transition-colors cursor-pointer')
          }
        >
          <Smartphone className="w-3.5 h-3.5 shrink-0" />
          <span>Add App to Home Screen</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-neutral-200 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
                  Install on iPhone / iPad
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 text-neutral-400 hover:text-black cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Install Selvee to your Home Screen to unlock mobile order &amp; offer alerts on iOS:
              </p>
              <ol className="space-y-2.5 text-xs text-neutral-800 bg-neutral-50 p-3.5 rounded-xl border border-neutral-200">
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-black text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                    1
                  </span>
                  <span>
                    Tap the <strong className="inline-flex items-center gap-1"><Share className="w-3 h-3 inline" /> Share</strong> button at the bottom of Safari.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-black text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                    2
                  </span>
                  <span>
                    Scroll down and tap <strong>Add to Home Screen</strong>.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-black text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                    3
                  </span>
                  <span>
                    Open Selvee from your Home Screen and tap <strong>Enable Alerts</strong>.
                  </span>
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2.5 rounded-lg bg-black text-white text-xs font-semibold uppercase tracking-wider hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 md:bottom-5 left-4 z-50 flex items-center gap-2 rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-[11px] font-medium text-white shadow-lg">
      <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
      <span>Offline Mode — Showing saved catalog &amp; orders</span>
    </div>
  );
};

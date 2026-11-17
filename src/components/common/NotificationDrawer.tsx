import React, { useState, useEffect } from 'react';
import {
  Bell,
  BellOff,
  BellRing,
  X,
  Package,
  Truck,
  Tag,
  Megaphone,
  CreditCard,
  Check,
  CheckCheck,
  Copy,
  ArrowRight,
  Ticket,
  ShoppingBag,
} from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';
import { AppNotification, NotificationType } from '../../types';
import { PWAInstallButton } from './PWAInstallButton';

interface NotificationDrawerProps {
  onNavigate: (route: string) => void;
}

const getNotificationIcon = (type: NotificationType) => {
  switch (type) {
    case 'admin_new_order':
      return <ShoppingBag className="w-4 h-4 text-emerald-700" />;
    case 'order_placed':
      return <Package className="w-4 h-4 text-neutral-900" />;
    case 'order_status':
      return <Truck className="w-4 h-4 text-neutral-900" />;
    case 'payment_update':
      return <CreditCard className="w-4 h-4 text-emerald-700" />;
    case 'coupon':
      return <Ticket className="w-4 h-4 text-emerald-700" />;
    case 'offer':
      return <Tag className="w-4 h-4 text-neutral-900" />;
    case 'announcement':
    default:
      return <Megaphone className="w-4 h-4 text-neutral-900" />;
  }
};

const formatRelativeTime = (ms?: number): string => {
  if (!ms) return 'Just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  const days = Math.floor(diffSec / 86400);
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({ onNavigate }) => {
  const {
    notifications,
    readIds,
    unreadCount,
    isDrawerOpen,
    setIsDrawerOpen,
    permission,
    isMuted,
    isApprovedAdminDevice,
    allNotificationsActive,
    customerVerificationBlockReason,
    enableAllNotificationsOneClick,
    toggleMute,
    markAsRead,
    markAllAsRead,
    activeToast,
    dismissToast,
  } = useNotifications();

  const [filter, setFilter] = useState<'all' | 'orders' | 'offers'>('all');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (!isDrawerOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [isDrawerOpen, setIsDrawerOpen]);

  const handleEnablePush = async () => {
    setRequesting(true);
    try {
      await enableAllNotificationsOneClick();
    } finally {
      setRequesting(false);
    }
  };

  const handleItemClick = (n: AppNotification) => {
    markAsRead(n.id);
    setIsDrawerOpen(false);
    if (n.actionUrl) {
      onNavigate(n.actionUrl);
    }
  };

  const handleCopyCode = (e: React.MouseEvent, code: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 1800);
  };

  const filteredList = notifications.filter((n) => {
    if (filter === 'orders') {
      return (
        n.type === 'admin_new_order' ||
        n.type === 'order_placed' ||
        n.type === 'order_status' ||
        n.type === 'payment_update'
      );
    }
    if (filter === 'offers') {
      return n.type === 'offer' || n.type === 'coupon' || n.type === 'announcement';
    }
    return true;
  });

  return (
    <>
      {/* Live Floating Notification Toast */}
      {activeToast && !isDrawerOpen && (
        <div className="fixed top-20 right-4 left-4 sm:left-auto sm:w-96 z-50 animate-fade-in">
          <div
            onClick={() => {
              markAsRead(activeToast.id);
              dismissToast();
              if (activeToast.actionUrl) onNavigate(activeToast.actionUrl);
            }}
            className="bg-black text-white rounded-xl p-4 shadow-2xl border border-neutral-800 flex items-start gap-3 cursor-pointer hover:bg-neutral-900 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center shrink-0 mt-0.5">
              <BellRing className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              {activeToast.type === 'admin_new_order' && (
                <span className="inline-block text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500 text-white mb-1">
                  Authorized Device • New Order
                </span>
              )}
              <p className="text-xs font-bold leading-snug">{activeToast.title}</p>
              <p className="text-[11px] text-neutral-300 mt-0.5 line-clamp-2 leading-relaxed">
                {activeToast.message}
              </p>
              {activeToast.actionUrl && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-white/90 mt-2">
                  <span>View Details</span>
                  <ArrowRight className="w-3 h-3" />
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                dismissToast();
              }}
              aria-label="Dismiss notification"
              className="p-1 text-neutral-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Slide-over Notification Center Drawer */}
      {isDrawerOpen && (
        <div
          className="fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label="Notifications"
        >
          {/* Backdrop */}
          <div
            onClick={() => setIsDrawerOpen(false)}
            className="fixed inset-0 bg-black/55 backdrop-blur-xs transition-opacity"
          />

          {/* Drawer Container */}
          <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl flex flex-col z-50 animate-fade-in">
            {/* Drawer Header */}
            <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-2.5">
                <Bell className="w-5 h-5 text-neutral-900" />
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
                    Notifications
                  </h2>
                  <p className="text-[11px] text-neutral-500">
                    {unreadCount > 0 ? `${unreadCount} unread update${unreadCount > 1 ? 's' : ''}` : 'Order updates & latest offers'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllAsRead}
                    className="px-2.5 py-1.5 text-[11px] font-medium text-neutral-700 hover:text-black hover:bg-neutral-100 rounded-md flex items-center gap-1 cursor-pointer"
                    title="Mark all as read"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>Mark read</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  aria-label="Close notifications"
                  className="p-1.5 text-neutral-500 hover:text-black rounded-lg hover:bg-neutral-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Mobile & PC Alert Permission Card */}
            <div className="p-4 bg-neutral-50 border-b border-neutral-200 space-y-2.5 shrink-0">
              {customerVerificationBlockReason === 'unverified_email' && !isApprovedAdminDevice ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-[11px] text-amber-900 leading-relaxed">
                  Verify your email address first to unlock order updates and mobile/PC alerts.
                </div>
              ) : !allNotificationsActive || customerVerificationBlockReason === 'other_device' ? (
                <div className="bg-white border border-neutral-200 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center shrink-0">
                      <BellRing className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-neutral-900">
                        Turn On All Notifications (PC &amp; Mobile)
                      </p>
                      <p className="text-[11px] text-neutral-500 mt-0.5 leading-relaxed">
                        Enable order tracking, payment verification &amp; offer alerts on this device in one click.
                      </p>
                    </div>
                  </div>

                  {permission === 'denied' && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                      OS popups are blocked in browser settings; clicking below still turns on live sound &amp; in-app alerts.
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={handleEnablePush}
                    disabled={requesting}
                    className="w-full py-2 bg-black text-white text-xs font-semibold uppercase tracking-wider rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {requesting ? 'Activating...' : 'Turn On All Notifications'}
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between bg-white border border-neutral-200 rounded-xl px-3.5 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isMuted ? 'bg-neutral-400' : 'bg-emerald-500'}`} />
                    <span className="text-xs font-medium text-neutral-800">
                      {isMuted ? 'All Notifications Paused' : 'All Notifications Active (PC & Mobile)'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={toggleMute}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-neutral-600 hover:text-black cursor-pointer"
                  >
                    {isMuted ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
                    <span>{isMuted ? 'Resume' : 'Pause'}</span>
                  </button>
                </div>
              )}

              <PWAInstallButton />
            </div>

            {/* Category Filter Tabs */}
            <div className="px-4 py-2.5 border-b border-neutral-100 flex items-center gap-2 shrink-0 bg-white">
              {[
                { id: 'all' as const, label: 'All' },
                { id: 'orders' as const, label: 'Order Updates' },
                { id: 'offers' as const, label: 'Offers & Codes' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    filter === tab.id
                      ? 'bg-neutral-900 text-white'
                      : 'text-neutral-600 hover:bg-neutral-100 hover:text-black'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Notification List */}
            <div className="flex-1 overflow-y-auto divide-y divide-neutral-100">
              {filteredList.length === 0 ? (
                <div className="py-16 px-6 text-center">
                  <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-3 text-neutral-400">
                    <Bell className="w-5 h-5" />
                  </div>
                  <p className="text-sm font-semibold text-neutral-900">No notifications yet</p>
                  <p className="text-xs text-neutral-500 mt-1 max-w-xs mx-auto leading-relaxed">
                    Order status progress, delivery alerts, and new promo offers will appear right here.
                  </p>
                </div>
              ) : (
                filteredList.map((n) => {
                  const isUnread = !readIds.has(n.id);
                  return (
                    <div
                      key={n.id}
                      onClick={() => handleItemClick(n)}
                      className={`p-4 flex items-start gap-3 transition-colors cursor-pointer ${
                        isUnread ? 'bg-neutral-50/90 hover:bg-neutral-100/80' : 'bg-white hover:bg-neutral-50'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-full bg-neutral-100 border border-neutral-200/80 flex items-center justify-center shrink-0 mt-0.5">
                        {getNotificationIcon(n.type)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-xs leading-snug ${isUnread ? 'font-bold text-neutral-900' : 'font-semibold text-neutral-800'}`}>
                            {n.title}
                          </p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[10px] text-neutral-400 tabular-nums">
                              {formatRelativeTime(n.createdAtMs)}
                            </span>
                            {isUnread && <span className="w-2 h-2 rounded-full bg-black" />}
                          </div>
                        </div>

                        <p className="text-xs text-neutral-600 mt-1 leading-relaxed">
                          {n.message}
                        </p>

                        {n.couponCode && (
                          <div className="mt-2 inline-flex items-center gap-2 bg-neutral-100 border border-neutral-200 rounded-md px-2.5 py-1">
                            <span className="font-mono text-[11px] font-bold text-neutral-900">
                              {n.couponCode}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => handleCopyCode(e, n.couponCode!)}
                              className="text-[10px] font-semibold text-neutral-600 hover:text-black flex items-center gap-1 cursor-pointer"
                            >
                              {copiedCode === n.couponCode ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  <span className="text-emerald-700">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

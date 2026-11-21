import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  LayoutDashboard, 
  Package, 
  FolderTree, 
  ShoppingBag, 
  Users, 
  MessageSquare, 
  Ticket, 
  Truck, 
  Image as ImageIcon, 
  Settings, 
  ShieldCheck, 
  LogOut, 
  ExternalLink, 
  Menu, 
  X,
  History,
  Smartphone,
  Bell,
  BellRing,
  Receipt,
  ShoppingCart,
  Building2,
  Wallet,
  TrendingUp,
  RotateCcw,
  FileSpreadsheet,
  AlertTriangle,
  Boxes,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { BrandLogo } from '../components/common/BrandLogo';
import { adminDeviceService } from '../services/adminDeviceService';
import {
  notificationService,
  getReadNotificationIds,
  saveReadNotificationIds,
} from '../services/notificationService';
import { orderService } from '../services/orderService';
import { productService } from '../services/productService';
import { posService } from '../services/posService';
import { AppNotification, Order, Product } from '../types';
import { formatDateTime } from '../lib/dateFormat';

export type AdminTab =
  | 'dashboard'
  | 'pos'
  | 'desk_order_verify'
  | 'desk_payment_verify'
  | 'desk_stock_packing'
  | 'desk_delivery_dispatch'
  | 'pipeline'
  | 'sales_history'
  | 'returns'
  | 'products'
  | 'stock'
  | 'categories'
  | 'purchases'
  | 'suppliers'
  | 'expenses'
  | 'pnl'
  | 'customers'
  | 'coupons'
  | 'delivery'
  | 'reviews'
  | 'banners'
  | 'notifications'
  | 'admins'
  | 'audit'
  | 'settings';

interface AdminHeaderContextValue {
  headerTitleNode: HTMLDivElement | null;
  headerActionsNode: HTMLDivElement | null;
}

const AdminHeaderContext = React.createContext<AdminHeaderContextValue>({
  headerTitleNode: null,
  headerActionsNode: null,
});

export const useAdminHeaderSlots = () => React.useContext(AdminHeaderContext);

interface AdminPageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}

export const AdminPageHeader: React.FC<AdminPageHeaderProps> = ({ title, subtitle, actions }) => {
  const { headerTitleNode, headerActionsNode } = useAdminHeaderSlots();

  const titleBlock = (
    <div className="min-w-0">
      <h1 className="text-lg xl:text-xl font-extrabold uppercase tracking-tight text-neutral-900 truncate">
        {title}
      </h1>
      {subtitle && (
        <p className="text-xs text-neutral-500 truncate">
          {subtitle}
        </p>
      )}
    </div>
  );

  const actionsBlock = actions ? (
    <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
  ) : null;

  return (
    <>
      {headerTitleNode && createPortal(titleBlock, headerTitleNode)}
      {headerActionsNode && actionsBlock && createPortal(actionsBlock, headerActionsNode)}

      <div className="lg:hidden flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {titleBlock}
        {actionsBlock}
      </div>
    </>
  );
};

interface AdminLayoutProps {
  currentTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
  onNavigateHome: () => void;
  children: React.ReactNode;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  currentTab,
  onSelectTab,
  onNavigateHome,
  children,
}) => {
  const { currentUser, staffProfile, isSuperAdmin, hasMenuPermission, logOut } = useAuth();
  const { permission, requestMobileAlerts } = useNotifications();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('selvee_sidebar_collapsed') === '1';
    } catch {
      return false;
    }
  });
  const [headerTitleNode, setHeaderTitleNode] = useState<HTMLDivElement | null>(null);
  const [headerActionsNode, setHeaderActionsNode] = useState<HTMLDivElement | null>(null);
  const [pendingDeviceCount, setPendingDeviceCount] = useState(0);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [adminAlerts, setAdminAlerts] = useState<AppNotification[]>([]);
  const [readAlertIds, setReadAlertIds] = useState<Set<string>>(() => getReadNotificationIds());
  const [liveOrders, setLiveOrders] = useState<Order[]>(() => orderService.getInstantOrders());
  const [products, setProducts] = useState<Product[]>(() => productService.getInstantAllProducts());
  const [lowStockLimit, setLowStockLimit] = useState<number>(
    () => posService.getInstantTargets().lowStockThresholdDefault || 5
  );

  useEffect(() => {
    const unsub = adminDeviceService.subscribeToRegistry((devices) => {
      setPendingDeviceCount(devices.filter((d) => d.status === 'pending').length);
    });
    const unsubAlerts = notificationService.subscribeToAllNotifications((list) => {
      setAdminAlerts(list.filter((n) => n.audience === 'authorized_devices').slice(0, 20));
    });
    const unsubOrders = orderService.subscribeToAllOrdersAdmin(setLiveOrders);
    const unsubProds = productService.subscribeToAllProductsAdmin(setProducts);
    const unsubTargets = posService.subscribeToTargets((cfg) => {
      setLowStockLimit(cfg.lowStockThresholdDefault || 5);
    });
    return () => {
      unsub();
      unsubAlerts();
      unsubOrders();
      unsubProds();
      unsubTargets();
    };
  }, []);

  const firstPermittedWorkflowTab: AdminTab | null = hasMenuPermission('pipeline')
    ? 'pipeline'
    : hasMenuPermission('desk_order_verify')
    ? 'desk_order_verify'
    : hasMenuPermission('desk_payment_verify')
    ? 'desk_payment_verify'
    : hasMenuPermission('desk_stock_packing')
    ? 'desk_stock_packing'
    : hasMenuPermission('desk_delivery_dispatch')
    ? 'desk_delivery_dispatch'
    : null;

  const isWorkflowTabActive =
    currentTab === 'pipeline' ||
    currentTab === 'desk_order_verify' ||
    currentTab === 'desk_payment_verify' ||
    currentTab === 'desk_stock_packing' ||
    currentTab === 'desk_delivery_dispatch';

  const activeOrderNotifications = liveOrders.filter((ord) => {
    const st = orderService.getOrderPipelineStage(ord);
    return st !== 'completed' && st !== 'cancelled' && st !== 'returned';
  }).length;

  const unreadWorkflowCount = adminAlerts.filter((a) => !readAlertIds.has(a.id)).length;
  const lowOrOutStockProducts = products.filter((p) => {
    const s = Math.max(0, Number(p.totalStock) || 0);
    const lim = typeof p.minStock === 'number' && p.minStock > 0 ? p.minStock : lowStockLimit;
    return s <= lim;
  });
  const totalBellBadge = unreadWorkflowCount + (lowOrOutStockProducts.length > 0 ? 1 : 0);

  const handleMarkAlertsRead = () => {
    const next = new Set(readAlertIds);
    adminAlerts.forEach((a) => next.add(a.id));
    setReadAlertIds(next);
    saveReadNotificationIds(next);
  };

  const allMenuItems: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'pos', label: 'Point of Sale', icon: <Receipt className="w-4 h-4" /> },
    { id: 'pipeline', label: 'Orders', icon: <ShoppingBag className="w-4 h-4" /> },
    { id: 'sales_history', label: 'Sales History', icon: <FileSpreadsheet className="w-4 h-4" /> },
    { id: 'returns', label: 'Returns', icon: <RotateCcw className="w-4 h-4" /> },
    { id: 'products', label: 'Products', icon: <Package className="w-4 h-4" /> },
    { id: 'stock', label: 'Stock', icon: <Boxes className="w-4 h-4" /> },
    { id: 'categories', label: 'Categories', icon: <FolderTree className="w-4 h-4" /> },
    { id: 'purchases', label: 'Purchases', icon: <ShoppingCart className="w-4 h-4" /> },
    { id: 'suppliers', label: 'Suppliers', icon: <Building2 className="w-4 h-4" /> },
    { id: 'expenses', label: 'Expenses', icon: <Wallet className="w-4 h-4" /> },
    { id: 'pnl', label: 'Profit & Loss', icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'customers', label: 'Customers', icon: <Users className="w-4 h-4" /> },
    { id: 'coupons', label: 'Coupons', icon: <Ticket className="w-4 h-4" /> },
    { id: 'delivery', label: 'Delivery Zones', icon: <Truck className="w-4 h-4" /> },
    { id: 'reviews', label: 'Reviews', icon: <MessageSquare className="w-4 h-4" /> },
    { id: 'banners', label: 'Banners', icon: <ImageIcon className="w-4 h-4" /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell className="w-4 h-4" /> },
    { id: 'admins', label: 'Staff & Roles', icon: <ShieldCheck className="w-4 h-4" /> },
    { id: 'audit', label: 'Audit Logs', icon: <History className="w-4 h-4" /> },
    { id: 'settings', label: 'Store Settings', icon: <Settings className="w-4 h-4" /> },
  ];

  const menuItems = allMenuItems.filter((item) =>
    item.id === 'pipeline' ? Boolean(firstPermittedWorkflowTab) : hasMenuPermission(item.id)
  );

  const toggleDesktopSidebar = () => {
    setDesktopSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('selvee_sidebar_collapsed', next ? '1' : '0');
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  const handleOpenDeviceApprovals = () => {
    if (!hasMenuPermission('settings')) return;
    sessionStorage.setItem('selvee_open_devices_tab', '1');
    onSelectTab('settings');
  };

  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col lg:flex-row text-neutral-900">
      
      {/* Mobile Admin Header */}
      <div className="lg:hidden bg-black text-white px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 text-neutral-300 hover:text-white"
          >
            {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
          <BrandLogo variant="light" size="sm" />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAlertsOpen((o) => !o)}
            className="relative p-1.5 text-neutral-300 hover:text-white cursor-pointer"
            title="Admin Alerts"
          >
            <Bell className="w-5 h-5" />
            {totalBellBadge > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-red-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center font-mono">
                {totalBellBadge}
              </span>
            )}
          </button>
          <span className="text-[10px] font-bold bg-neutral-800 text-neutral-300 px-2 py-0.5 rounded uppercase">
            Admin
          </span>
        </div>
      </div>

      {/* Mobile Backdrop Overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-30 lg:hidden"
        />
      )}

      {/* Admin Sidebar - Permanently pinned and sticky on desktop, collapsible via top toggle */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-black text-white flex flex-col justify-between transition-all duration-300 lg:sticky lg:top-0 lg:h-screen shrink-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } ${
          desktopSidebarCollapsed
            ? 'lg:w-0 lg:min-w-0 lg:overflow-hidden lg:opacity-0 lg:pointer-events-none'
            : 'lg:translate-x-0 lg:w-64 lg:opacity-100'
        }`}
      >
        <div className="flex flex-col flex-1 min-h-0">
          {/* Logo & Brand Header */}
          <div className="p-4 border-b border-neutral-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <BrandLogo variant="light" size="sm" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold tracking-widest uppercase bg-neutral-900 border border-neutral-700 px-2 py-0.5 rounded text-neutral-300">
                Admin
              </span>
            </div>
          </div>

          {/* Navigation Items - Scrollable if screen is short */}
          <nav className="p-3 space-y-1 overflow-y-auto flex-1 custom-scrollbar">
            {menuItems.map((item) => {
              const isActive = item.id === 'pipeline' ? isWorkflowTabActive : currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    const target = item.id === 'pipeline' && firstPermittedWorkflowTab ? firstPermittedWorkflowTab : item.id;
                    onSelectTab(target);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-white text-black'
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    {item.icon}
                    <span>{item.label}</span>
                  </span>
                  {item.id === 'pipeline' && activeOrderNotifications > 0 && (
                    <span
                      className={`px-1.5 py-0.5 text-[10px] font-extrabold rounded-full font-mono ${
                        isActive ? 'bg-black text-white' : 'bg-red-600 text-white'
                      }`}
                    >
                      {activeOrderNotifications}
                    </span>
                  )}
                  {item.id === 'settings' && pendingDeviceCount > 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-extrabold rounded-full bg-amber-500 text-white">
                      {pendingDeviceCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-neutral-800 space-y-2 bg-neutral-950">
          <button
            onClick={onNavigateHome}
            className="w-full flex items-center justify-between px-3 py-2 rounded text-xs text-neutral-400 hover:text-white hover:bg-neutral-900 cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <ExternalLink className="w-3.5 h-3.5" /> View Store
            </span>
          </button>
          
          <div className="pt-2 border-t border-neutral-900 flex items-center justify-between text-xs text-neutral-400">
            <div className="truncate mr-2">
              <p className="font-semibold text-neutral-200 text-[11px] truncate">
                {staffProfile?.name || currentUser?.email || 'Administrator'}
              </p>
              <p className="text-[10px] text-neutral-500 truncate">
                {staffProfile?.designation || (isSuperAdmin ? 'Super Administrator' : 'Staff Member')}
              </p>
            </div>
            <button
              onClick={() => logOut()}
              title="Logout"
              className="p-1.5 text-red-400 hover:text-red-300 rounded hover:bg-neutral-900 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main
        className={`flex-1 min-w-0 w-full relative transition-all duration-300 flex flex-col ${
          currentTab === 'pos'
            ? 'p-4 sm:p-5 lg:px-6 lg:pt-5 lg:pb-4 lg:h-screen lg:overflow-hidden max-w-none'
            : `p-4 sm:p-6 lg:p-8 overflow-y-auto mx-auto ${
                desktopSidebarCollapsed ? 'max-w-[1600px]' : 'max-w-7xl'
              }`
        }`}
      >
        {/* Compact Desktop Top Utility Bar with Sidebar Slide Toggle, Active Page Header & Live Admin Alerts */}
        <div className="hidden lg:flex items-center justify-between gap-4 mb-4 pb-3 border-b border-neutral-200/80 text-xs shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              type="button"
              onClick={toggleDesktopSidebar}
              title={desktopSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
              aria-label={desktopSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
              className="w-8 h-8 rounded-lg bg-neutral-200/80 hover:bg-neutral-300 text-neutral-700 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              {desktopSidebarCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
            </button>
            <div ref={setHeaderTitleNode} className="min-w-0 flex-1" />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div ref={setHeaderActionsNode} className="flex items-center gap-2 shrink-0" />
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setAlertsOpen((o) => !o)}
                className="px-3 py-2 bg-white border border-neutral-200 hover:border-black rounded-lg text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
              >
                <Bell className="w-3.5 h-3.5 text-neutral-700" />
                <span>Alerts</span>
                {totalBellBadge > 0 && (
                  <span className="px-1.5 py-0.5 bg-red-600 text-white text-[10px] font-mono font-bold rounded-full">
                    {totalBellBadge}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Admin Alerts Dropdown Popover */}
        {alertsOpen && (
          <div className="fixed lg:absolute top-14 lg:top-16 right-4 lg:right-8 z-50 w-80 sm:w-96 bg-white border border-neutral-200 rounded-xl shadow-xl overflow-hidden text-xs">
            <div className="p-3.5 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
              <span className="font-bold uppercase tracking-wider text-neutral-900">
                Admin Alerts &amp; Stock Monitor
              </span>
              <div className="flex items-center gap-2">
                {unreadWorkflowCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAlertsRead}
                    className="text-[10px] font-bold text-neutral-600 hover:text-black cursor-pointer"
                  >
                    Mark Read
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setAlertsOpen(false)}
                  className="p-1 text-neutral-400 hover:text-black cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-neutral-100">
              {lowOrOutStockProducts.length > 0 && (hasMenuPermission('stock') || hasMenuPermission('products')) && (
                <button
                  type="button"
                  onClick={() => {
                    setAlertsOpen(false);
                    onSelectTab(hasMenuPermission('stock') ? 'stock' : 'products');
                  }}
                  className="w-full text-left p-3 bg-amber-50/70 hover:bg-amber-100/70 transition-colors flex items-start gap-2.5 cursor-pointer"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-amber-950">
                      {lowOrOutStockProducts.length} Low / Out-of-Stock Products
                    </p>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      Click to open Stock &amp; Low-Stock Control →
                    </p>
                  </div>
                </button>
              )}

              {adminAlerts.length === 0 ? (
                <div className="p-6 text-center text-neutral-400">
                  No new workflow alerts yet.
                </div>
              ) : (
                adminAlerts.map((alert) => {
                  const unread = !readAlertIds.has(alert.id);
                  return (
                    <button
                      key={alert.id}
                      type="button"
                      onClick={() => {
                        const next = new Set(readAlertIds);
                        next.add(alert.id);
                        setReadAlertIds(next);
                        saveReadNotificationIds(next);
                        setAlertsOpen(false);
                        if (firstPermittedWorkflowTab) {
                          onSelectTab(firstPermittedWorkflowTab);
                        }
                      }}
                      className={`w-full text-left p-3 hover:bg-neutral-50 transition-colors cursor-pointer ${
                        unread ? 'bg-neutral-50/80' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-bold text-neutral-900 truncate">{alert.title}</p>
                        {unread && (
                          <span className="px-1.5 py-0.5 bg-black text-white text-[9px] font-bold uppercase rounded shrink-0">
                            New
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-neutral-600 mt-0.5 line-clamp-2">{alert.message}</p>
                      <p className="text-[10px] font-mono text-neutral-400 mt-1">
                        {formatDateTime(alert.createdAtMs || alert.createdAt)}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {permission === 'default' && (
          <div className="mb-5 p-3.5 bg-neutral-900 text-white rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <BellRing className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                <b>Admin Browser Notifications:</b> Enable browser notifications on this approved device to get instant alerts whenever a customer places an order.
              </span>
            </div>
            <button
              type="button"
              data-notif-trigger="true"
              onClick={() => requestMobileAlerts()}
              className="px-3.5 py-1.5 bg-white text-black font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-200 transition-colors cursor-pointer w-fit text-[11px] shrink-0"
            >
              Enable Browser Notifications
            </button>
          </div>
        )}
        {pendingDeviceCount > 0 && currentTab !== 'settings' && hasMenuPermission('settings') && (
          <div className="mb-5 p-3.5 bg-amber-50 border border-amber-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 text-amber-900">
              <Smartphone className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <b>{pendingDeviceCount}</b> {pendingDeviceCount === 1 ? 'device is' : 'devices are'} waiting for your Admin Panel approval.
              </span>
            </div>
            <button
              type="button"
              onClick={handleOpenDeviceApprovals}
              className="px-3.5 py-1.5 bg-amber-600 text-white font-bold uppercase tracking-wider rounded-lg hover:bg-amber-700 transition-colors cursor-pointer w-fit text-[11px]"
            >
              Review & Approve
            </button>
          </div>
        )}
        <AdminHeaderContext.Provider value={{ headerTitleNode, headerActionsNode }}>
          {children}
        </AdminHeaderContext.Provider>
      </main>

    </div>
  );
};

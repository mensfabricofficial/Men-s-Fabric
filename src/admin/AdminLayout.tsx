import React, { useState, useEffect } from 'react';
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
  GitBranch,
  ShoppingCart,
  Building2,
  Wallet,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { BrandLogo } from '../components/common/BrandLogo';
import { adminDeviceService } from '../services/adminDeviceService';

export type AdminTab =
  | 'dashboard'
  | 'pos'
  | 'pnl'
  | 'pipeline'
  | 'orders'
  | 'products'
  | 'purchases'
  | 'suppliers'
  | 'expenses'
  | 'categories'
  | 'customers'
  | 'reviews'
  | 'coupons'
  | 'delivery'
  | 'banners'
  | 'notifications'
  | 'settings'
  | 'admins'
  | 'audit';

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
  const [pendingDeviceCount, setPendingDeviceCount] = useState(0);

  useEffect(() => {
    const unsub = adminDeviceService.subscribeToRegistry((devices) => {
      setPendingDeviceCount(devices.filter((d) => d.status === 'pending').length);
    });
    return () => unsub();
  }, []);

  const allMenuItems: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'POS Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'pos', label: 'POS Counter Sale', icon: <Receipt className="w-4 h-4" /> },
    { id: 'pnl', label: 'Profit & Loss / Targets', icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'pipeline', label: 'Order Workflow', icon: <GitBranch className="w-4 h-4" /> },
    { id: 'orders', label: 'Orders & Invoices', icon: <ShoppingBag className="w-4 h-4" /> },
    { id: 'products', label: 'Products & Stock', icon: <Package className="w-4 h-4" /> },
    { id: 'purchases', label: 'Purchases', icon: <ShoppingCart className="w-4 h-4" /> },
    { id: 'suppliers', label: 'Suppliers', icon: <Building2 className="w-4 h-4" /> },
    { id: 'expenses', label: 'Expenses Entry', icon: <Wallet className="w-4 h-4" /> },
    { id: 'categories', label: 'Categories', icon: <FolderTree className="w-4 h-4" /> },
    { id: 'customers', label: 'Customers', icon: <Users className="w-4 h-4" /> },
    { id: 'reviews', label: 'Reviews', icon: <MessageSquare className="w-4 h-4" /> },
    { id: 'coupons', label: 'Coupons', icon: <Ticket className="w-4 h-4" /> },
    { id: 'delivery', label: 'Delivery Zones', icon: <Truck className="w-4 h-4" /> },
    { id: 'banners', label: 'Banners', icon: <ImageIcon className="w-4 h-4" /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell className="w-4 h-4" /> },
    { id: 'settings', label: 'Store Settings', icon: <Settings className="w-4 h-4" /> },
    { id: 'admins', label: 'Staff & Roles', icon: <ShieldCheck className="w-4 h-4" /> },
    { id: 'audit', label: 'Audit Logs', icon: <History className="w-4 h-4" /> },
  ];

  const menuItems = allMenuItems.filter((item) => hasMenuPermission(item.id));

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

      {/* Admin Sidebar - Permanently pinned and sticky on desktop */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-black text-white flex flex-col justify-between transition-transform duration-300 lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen shrink-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
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
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onSelectTab(item.id);
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
                  currentTab === item.id
                    ? 'bg-white text-black'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
                }`}
              >
                <span className="flex items-center gap-3">
                  {item.icon}
                  <span>{item.label}</span>
                </span>
                {item.id === 'settings' && pendingDeviceCount > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-extrabold rounded-full bg-amber-500 text-white">
                    {pendingDeviceCount}
                  </span>
                )}
              </button>
            ))}
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
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto max-w-7xl mx-auto w-full">
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
        {children}
      </main>

    </div>
  );
};

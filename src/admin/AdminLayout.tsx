import React, { useState } from 'react';
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
  History
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { BrandLogo } from '../components/common/BrandLogo';

export type AdminTab =
  | 'dashboard'
  | 'products'
  | 'categories'
  | 'orders'
  | 'customers'
  | 'reviews'
  | 'coupons'
  | 'delivery'
  | 'banners'
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
  const { currentUser, logOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const menuItems: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'products', label: 'Products', icon: <Package className="w-4 h-4" /> },
    { id: 'categories', label: 'Categories', icon: <FolderTree className="w-4 h-4" /> },
    { id: 'orders', label: 'Orders', icon: <ShoppingBag className="w-4 h-4" /> },
    { id: 'customers', label: 'Customers', icon: <Users className="w-4 h-4" /> },
    { id: 'reviews', label: 'Reviews', icon: <MessageSquare className="w-4 h-4" /> },
    { id: 'coupons', label: 'Coupons', icon: <Ticket className="w-4 h-4" /> },
    { id: 'delivery', label: 'Delivery Zones', icon: <Truck className="w-4 h-4" /> },
    { id: 'banners', label: 'Banners', icon: <ImageIcon className="w-4 h-4" /> },
    { id: 'settings', label: 'Store Settings', icon: <Settings className="w-4 h-4" /> },
    { id: 'admins', label: 'Admins & Staff', icon: <ShieldCheck className="w-4 h-4" /> },
    { id: 'audit', label: 'Audit Logs', icon: <History className="w-4 h-4" /> },
  ];

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
        <span className="text-[10px] font-bold bg-neutral-800 text-neutral-300 px-2 py-0.5 rounded uppercase">
          Admin
        </span>
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
            <span className="text-[10px] font-bold tracking-widest uppercase bg-neutral-900 border border-neutral-700 px-2 py-0.5 rounded text-neutral-300">
              Admin
            </span>
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
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
                  currentTab === item.id
                    ? 'bg-white text-black'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
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
              <p className="font-semibold text-neutral-200 text-[11px] truncate">{currentUser?.email}</p>
              <p className="text-[10px] text-neutral-500">Super Administrator</p>
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
        {children}
      </main>

    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { WishlistProvider } from './context/WishlistContext';
import { NotificationProvider } from './context/NotificationContext';

import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import { CartDrawer } from './components/cart/CartDrawer';
import { OfflineIndicator } from './components/common/PWAInstallButton';
import { MobileBottomNav } from './components/layout/MobileBottomNav';
import { BrandLogo } from './components/common/BrandLogo';
import { ErrorBoundary } from './components/common/ErrorBoundary';

import { HomePage } from './pages/HomePage';
import { ShopPage } from './pages/ShopPage';
import { ProductDetailsPage } from './pages/ProductDetailsPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { OrderConfirmationPage } from './pages/OrderConfirmationPage';
import { TrackOrderPage } from './pages/TrackOrderPage';
import { AccountPage } from './pages/AccountPage';
import { WishlistPage } from './pages/WishlistPage';
import { StaticPage } from './pages/StaticPages';

// Admin views & Device Access Security
import { AdminLayout, AdminTab } from './admin/AdminLayout';
import { AdminLogin } from './admin/AdminLogin';
import { AdminDeviceGate } from './admin/AdminDeviceGate';
import { AdminDashboard } from './admin/AdminDashboard';
import { AdminPosTerminal } from './admin/AdminPosTerminal';
import { AdminSalesHistory } from './admin/AdminSalesHistory';
import { AdminReturns } from './admin/AdminReturns';
import { AdminProfitLoss } from './admin/AdminProfitLoss';
import { AdminOrderPipeline } from './admin/AdminOrderPipeline';
import { AdminPurchases } from './admin/AdminPurchases';
import { AdminSuppliers } from './admin/AdminSuppliers';
import { AdminExpenses } from './admin/AdminExpenses';
import { AdminProducts } from './admin/AdminProducts';
import { AdminStock } from './admin/AdminStock';
import { AdminCategories } from './admin/AdminCategories';
import { AdminCoupons } from './admin/AdminCoupons';
import { AdminDelivery } from './admin/AdminDelivery';
import { AdminBanners } from './admin/AdminBanners';
import { AdminNotifications } from './admin/AdminNotifications';
import { AdminCustomers } from './admin/AdminCustomers';
import { AdminReviews } from './admin/AdminReviews';
import { AdminSettings } from './admin/AdminSettings';
import { AdminAdmins } from './admin/AdminAdmins';
import { AdminAudit } from './admin/AdminAudit';

const VALID_ADMIN_TABS: AdminTab[] = [
  'dashboard',
  'pos',
  'desk_order_verify',
  'desk_payment_verify',
  'desk_stock_packing',
  'desk_delivery_dispatch',
  'pipeline',
  'sales_history',
  'returns',
  'products',
  'stock',
  'categories',
  'purchases',
  'suppliers',
  'expenses',
  'pnl',
  'customers',
  'coupons',
  'delivery',
  'reviews',
  'banners',
  'notifications',
  'admins',
  'audit',
  'settings',
];

const getInitialAdminTabFromUrl = (): AdminTab => {
  if (typeof window === 'undefined') return 'dashboard';
  try {
    if (window.location.pathname.startsWith('/admin')) {
      const rawTab = new URLSearchParams(window.location.search).get('tab');
      const mapped = (rawTab === 'orders' ? 'pipeline' : rawTab) as AdminTab | null;
      if (mapped && VALID_ADMIN_TABS.includes(mapped)) {
        return mapped;
      }
    }
  } catch {
    // ignore
  }
  return 'dashboard';
};

const AppContent: React.FC = () => {
  const { currentUser, isAdmin, loading: authLoading, hasMenuPermission } = useAuth();
  const [currentRoute, setCurrentRoute] = useState<string>(window.location.pathname + window.location.search);
  const [adminTab, setAdminTab] = useState<AdminTab>(getInitialAdminTabFromUrl);

  const validAdminTabs = VALID_ADMIN_TABS;

  const firstAllowedTab = validAdminTabs.find((t) => hasMenuPermission(t)) || 'dashboard';
  const effectiveAdminTab: AdminTab = hasMenuPermission(adminTab) ? adminTab : firstAllowedTab;

  useEffect(() => {
    if (currentRoute.startsWith('/admin')) {
      const search = currentRoute.includes('?') ? currentRoute.split('?')[1] : '';
      const rawTab = new URLSearchParams(search).get('tab');
      const mapped = (rawTab === 'orders' ? 'pipeline' : rawTab) as AdminTab | null;
      if (mapped && validAdminTabs.includes(mapped) && hasMenuPermission(mapped)) {
        setAdminTab(mapped);
      }
    }
  }, [currentRoute, hasMenuPermission]);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentRoute(window.location.pathname + window.location.search);
    };
    const handleCustomNavigate = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail) {
        window.history.pushState({}, '', detail);
        setCurrentRoute(detail);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('selvee_navigate', handleCustomNavigate);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('selvee_navigate', handleCustomNavigate);
    };
  }, []);

  const navigate = (route: string) => {
    window.history.pushState({}, '', route);
    setCurrentRoute(route);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const pathname = currentRoute.split('?')[0];

  // ================= ADMIN ROUTE GUARD =================
  if (pathname.startsWith('/admin')) {
    if (authLoading) {
      return (
        <div className="min-h-screen bg-black flex items-center justify-center text-white text-xs font-semibold uppercase tracking-widest">
          Verifying Credentials...
        </div>
      );
    }

    if (!isAdmin) {
      return <AdminLogin onNavigateHome={() => navigate('/')} />;
    }

    const handleSelectAdminTab = (tab: AdminTab) => {
      if (hasMenuPermission(tab)) {
        setAdminTab(tab);
      }
    };

    return (
      <AdminDeviceGate onNavigateHome={() => navigate('/')}>
        <AdminLayout
          currentTab={effectiveAdminTab}
          onSelectTab={handleSelectAdminTab}
          onNavigateHome={() => navigate('/')}
        >
          <ErrorBoundary inline label="Admin Section" resetKeys={[effectiveAdminTab]}>
            {effectiveAdminTab === 'dashboard' && <AdminDashboard onNavigateTab={handleSelectAdminTab} />}
            {effectiveAdminTab === 'pos' && <AdminPosTerminal />}
            {(effectiveAdminTab === 'pipeline' ||
              effectiveAdminTab === 'desk_order_verify' ||
              effectiveAdminTab === 'desk_payment_verify' ||
              effectiveAdminTab === 'desk_stock_packing' ||
              effectiveAdminTab === 'desk_delivery_dispatch') && <AdminOrderPipeline />}
            {effectiveAdminTab === 'sales_history' && <AdminSalesHistory />}
            {effectiveAdminTab === 'returns' && <AdminReturns />}
            {effectiveAdminTab === 'products' && <AdminProducts />}
            {effectiveAdminTab === 'stock' && <AdminStock />}
            {effectiveAdminTab === 'categories' && <AdminCategories />}
            {effectiveAdminTab === 'purchases' && <AdminPurchases />}
            {effectiveAdminTab === 'suppliers' && <AdminSuppliers />}
            {effectiveAdminTab === 'expenses' && <AdminExpenses />}
            {effectiveAdminTab === 'pnl' && <AdminProfitLoss onNavigateTab={handleSelectAdminTab} />}
            {effectiveAdminTab === 'customers' && <AdminCustomers />}
            {effectiveAdminTab === 'coupons' && <AdminCoupons />}
            {effectiveAdminTab === 'delivery' && <AdminDelivery />}
            {effectiveAdminTab === 'reviews' && <AdminReviews />}
            {effectiveAdminTab === 'banners' && <AdminBanners />}
            {effectiveAdminTab === 'notifications' && <AdminNotifications />}
            {effectiveAdminTab === 'admins' && <AdminAdmins />}
            {effectiveAdminTab === 'audit' && <AdminAudit />}
            {effectiveAdminTab === 'settings' && <AdminSettings />}
          </ErrorBoundary>
        </AdminLayout>
      </AdminDeviceGate>
    );
  }

  // ================= STANDALONE AUTH PAGE (UNAUTHENTICATED) =================
  if (pathname === '/account' && !currentUser) {
    if (authLoading) {
      return (
        <div className="min-h-screen bg-white flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-neutral-200 border-t-black rounded-full animate-spin" />
        </div>
      );
    }
    return <AccountPage onNavigate={navigate} />;
  }

  // ================= CUSTOMER ROUTES =================
  let PageComponent: React.ReactNode = null;

  if (pathname === '/' || pathname === '') {
    PageComponent = <HomePage onNavigate={navigate} />;
  } else if (pathname === '/shop') {
    PageComponent = <ShopPage currentRoute={currentRoute} onNavigate={navigate} />;
  } else if (pathname.startsWith('/category/')) {
    const catSlug = pathname.replace('/category/', '');
    PageComponent = <ShopPage currentRoute={currentRoute} onNavigate={navigate} initialCategory={catSlug} />;
  } else if (pathname.startsWith('/product/')) {
    const rawParam = pathname.replace(/^\/product\/?/, '').replace(/\/+$/, '');
    const prodIdOrSlug = decodeURIComponent(rawParam).trim();
    PageComponent = <ProductDetailsPage key={prodIdOrSlug} productIdOrSlug={prodIdOrSlug} onNavigate={navigate} />;
  } else if (pathname === '/checkout' || pathname === '/cart') {
    PageComponent = <CheckoutPage onNavigate={navigate} />;
  } else if (pathname === '/order-confirmation') {
    PageComponent = <OrderConfirmationPage currentRoute={currentRoute} onNavigate={navigate} />;
  } else if (pathname === '/track-order') {
    PageComponent = <TrackOrderPage currentRoute={currentRoute} onNavigate={navigate} />;
  } else if (pathname === '/account') {
    PageComponent = <AccountPage onNavigate={navigate} />;
  } else if (pathname === '/wishlist') {
    PageComponent = <WishlistPage onNavigate={navigate} />;
  } else if (pathname === '/about') {
    PageComponent = <StaticPage type="about" onNavigate={navigate} />;
  } else if (pathname === '/contact') {
    PageComponent = <StaticPage type="contact" onNavigate={navigate} />;
  } else if (pathname === '/faq') {
    PageComponent = <StaticPage type="faq" onNavigate={navigate} />;
  } else if (pathname === '/size-guide') {
    PageComponent = <StaticPage type="size-guide" onNavigate={navigate} />;
  } else if (pathname === '/shipping-policy') {
    PageComponent = <StaticPage type="shipping" onNavigate={navigate} />;
  } else if (pathname === '/return-policy') {
    PageComponent = <StaticPage type="return" onNavigate={navigate} />;
  } else if (pathname === '/privacy-policy') {
    PageComponent = <StaticPage type="privacy" onNavigate={navigate} />;
  } else if (pathname === '/terms') {
    PageComponent = <StaticPage type="terms" onNavigate={navigate} />;
  } else {
    // 404 Not Found Page
    PageComponent = (
      <div className="max-w-xl mx-auto px-4 py-24 text-center">
        <div className="mb-4 flex justify-center">
          <BrandLogo variant="dark" size="md" />
        </div>
        <h1 className="text-4xl font-extrabold text-neutral-900 tracking-tight mb-2">404</h1>
        <p className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-6">Page Not Found</p>
        <p className="text-xs text-neutral-500 max-w-sm mx-auto mb-8">
          The page you are looking for does not exist or has been relocated in our boutique catalog.
        </p>
        <div className="flex justify-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2.5 bg-black text-white text-xs font-semibold uppercase tracking-wider rounded-lg"
          >
            Back Home
          </button>
          <button
            onClick={() => navigate('/shop')}
            className="px-6 py-2.5 border border-neutral-300 text-neutral-700 text-xs font-semibold uppercase tracking-wider rounded-lg hover:border-black"
          >
            Explore Shop
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white text-neutral-900 selection:bg-black selection:text-white">
      <Header currentRoute={currentRoute} onNavigate={navigate} />
      <CartDrawer onNavigate={navigate} />
      <OfflineIndicator />
      <main className="flex-1">
        <ErrorBoundary inline label="Page" resetKeys={[currentRoute]}>
          {PageComponent}
        </ErrorBoundary>
      </main>
      <Footer onNavigate={navigate} />
      <MobileBottomNav currentRoute={currentRoute} onNavigate={navigate} />
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary label="Storefront">
      <AuthProvider>
        <CartProvider>
          <WishlistProvider>
            <NotificationProvider>
              <ErrorBoundary label="Application">
                <AppContent />
              </ErrorBoundary>
            </NotificationProvider>
          </WishlistProvider>
        </CartProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { WishlistProvider } from './context/WishlistContext';

import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import { CartDrawer } from './components/cart/CartDrawer';

import { HomePage } from './pages/HomePage';
import { ShopPage } from './pages/ShopPage';
import { ProductDetailsPage } from './pages/ProductDetailsPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { OrderConfirmationPage } from './pages/OrderConfirmationPage';
import { TrackOrderPage } from './pages/TrackOrderPage';
import { AccountPage } from './pages/AccountPage';
import { WishlistPage } from './pages/WishlistPage';
import { StaticPage } from './pages/StaticPages';

// Admin views
import { AdminLayout, AdminTab } from './admin/AdminLayout';
import { AdminLogin } from './admin/AdminLogin';
import { AdminDashboard } from './admin/AdminDashboard';
import { AdminProducts } from './admin/AdminProducts';
import { AdminCategories } from './admin/AdminCategories';
import { AdminOrders } from './admin/AdminOrders';
import { AdminCoupons } from './admin/AdminCoupons';
import { AdminDelivery } from './admin/AdminDelivery';
import { AdminBanners } from './admin/AdminBanners';
import { AdminCustomers } from './admin/AdminCustomers';
import { AdminReviews } from './admin/AdminReviews';
import { AdminSettings } from './admin/AdminSettings';
import { AdminAudit } from './admin/AdminAudit';

const AppContent: React.FC = () => {
  const { currentUser, isAdmin, loading: authLoading } = useAuth();
  const [currentRoute, setCurrentRoute] = useState<string>(window.location.pathname + window.location.search);
  const [adminTab, setAdminTab] = useState<AdminTab>('dashboard');

  useEffect(() => {
    const handlePopState = () => {
      setCurrentRoute(window.location.pathname + window.location.search);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
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

    if (!currentUser || !isAdmin) {
      return <AdminLogin onNavigateHome={() => navigate('/')} />;
    }

    return (
      <AdminLayout
        currentTab={adminTab}
        onSelectTab={setAdminTab}
        onNavigateHome={() => navigate('/')}
      >
        {adminTab === 'dashboard' && <AdminDashboard onNavigateTab={setAdminTab} />}
        {adminTab === 'products' && <AdminProducts />}
        {adminTab === 'categories' && <AdminCategories />}
        {adminTab === 'orders' && <AdminOrders />}
        {adminTab === 'coupons' && <AdminCoupons />}
        {adminTab === 'delivery' && <AdminDelivery />}
        {adminTab === 'banners' && <AdminBanners />}
        {adminTab === 'customers' && <AdminCustomers />}
        {adminTab === 'reviews' && <AdminReviews />}
        {adminTab === 'settings' && <AdminSettings />}
        {adminTab === 'audit' && <AdminAudit />}
      </AdminLayout>
    );
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
    const prodIdOrSlug = pathname.replace('/product/', '');
    PageComponent = <ProductDetailsPage productIdOrSlug={prodIdOrSlug} onNavigate={navigate} />;
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
        <div className="inline-block bg-black p-2.5 rounded mb-4">
          <img src="/logo.jpg" alt="MEN'S FABRIC" className="h-9 object-contain" />
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
      <main className="flex-1">
        {PageComponent}
      </main>
      <Footer onNavigate={navigate} />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <WishlistProvider>
          <AppContent />
        </WishlistProvider>
      </CartProvider>
    </AuthProvider>
  );
}

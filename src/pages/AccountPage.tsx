import React, { useState, useEffect } from 'react';
import { 
  User, 
  Package, 
  Heart, 
  LogOut, 
  Lock, 
  Mail, 
  Phone, 
  MapPin, 
  AlertCircle, 
  CheckCircle,
  Clock,
  Eye,
  ShieldCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Order } from '../types';
import { orderService } from '../services/orderService';
import { EmptyState } from '../components/common/EmptyState';

interface AccountPageProps {
  onNavigate: (route: string) => void;
}

export const AccountPage: React.FC<AccountPageProps> = ({ onNavigate }) => {
  const { currentUser, customerProfile, isAdmin, signIn, signUp, logOut, resetPassword } = useAuth();

  // Auth Form State
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [resetSent, setResetSent] = useState(false);

  // Authenticated State
  const [activeTab, setActiveTab] = useState<'orders' | 'profile'>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  useEffect(() => {
    if (currentUser) {
      setOrdersLoading(true);
      orderService.getCustomerOrders(currentUser.uid)
        .then(setOrders)
        .finally(() => setOrdersLoading(false));
    }
  }, [currentUser]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    try {
      if (authMode === 'login') {
        await signIn(email, password);
      } else {
        if (!name.trim()) throw new Error('Please enter your full name.');
        await signUp(email, password, name.trim(), phone.trim());
      }
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email.trim()) {
      setAuthError('Please enter your email address to receive password reset instructions.');
      return;
    }
    setAuthLoading(true);
    setAuthError('');
    try {
      await resetPassword(email);
      setResetSent(true);
    } catch (err: any) {
      setAuthError(err.message || 'Failed to send password reset email.');
    } finally {
      setAuthLoading(false);
    }
  };

  // If user is not authenticated, show modern high-fashion Auth Screen
  if (!currentUser) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 sm:py-24">
        <div className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-8 shadow-sm">
          
          {/* Logo / Header */}
          <div className="text-center mb-6">
            <div className="inline-block bg-black p-2 rounded mb-3">
              <img src="/logo.jpg" alt="MEN'S FABRIC" className="h-8 object-contain" />
            </div>
            <h1 className="text-xl font-bold uppercase tracking-tight text-neutral-900">
              {authMode === 'login' ? 'Customer Sign In' : 'Create Customer Account'}
            </h1>
            <p className="text-xs text-neutral-500 mt-1">
              Access your order history, track deliveries, and manage your wishlist.
            </p>
          </div>

          {/* Tab Switcher */}
          <div className="grid grid-cols-2 p-1 bg-neutral-100 rounded-lg mb-6 text-xs font-semibold uppercase tracking-wider">
            <button
              onClick={() => { setAuthMode('login'); setAuthError(''); }}
              className={`py-2 rounded-md transition-all cursor-pointer ${
                authMode === 'login' ? 'bg-white text-black shadow-xs' : 'text-neutral-500 hover:text-black'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setAuthMode('register'); setAuthError(''); }}
              className={`py-2 rounded-md transition-all cursor-pointer ${
                authMode === 'register' ? 'bg-white text-black shadow-xs' : 'text-neutral-500 hover:text-black'
              }`}
            >
              Register
            </button>
          </div>

          {authError && (
            <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          {resetSent && (
            <div className="p-3 mb-4 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>Password reset link sent to your email!</span>
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {authMode === 'register' && (
              <>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Tanvir Ahmed"
                    className="w-full px-3.5 py-2.5 text-xs bg-neutral-50 border border-neutral-300 rounded-lg focus:outline-none focus:border-black"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700 mb-1">
                    Phone Number (Optional)
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="01XXXXXXXXX"
                    className="w-full px-3.5 py-2.5 text-xs bg-neutral-50 border border-neutral-300 rounded-lg focus:outline-none focus:border-black"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700 mb-1">
                Email Address *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full px-3.5 py-2.5 text-xs bg-neutral-50 border border-neutral-300 rounded-lg focus:outline-none focus:border-black"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700">
                  Password *
                </label>
                {authMode === 'login' && (
                  <button
                    type="button"
                    onClick={handlePasswordReset}
                    className="text-[11px] text-neutral-500 hover:text-black hover:underline cursor-pointer"
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 text-xs bg-neutral-50 border border-neutral-300 rounded-lg focus:outline-none focus:border-black"
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-3 bg-black text-white text-xs font-bold uppercase tracking-widest rounded-lg hover:bg-neutral-800 transition-colors shadow-md disabled:bg-neutral-400 cursor-pointer"
            >
              {authLoading ? 'Authenticating...' : authMode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

        </div>
      </div>
    );
  }

  // Authenticated Customer Dashboard
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
      
      {/* Account Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-8 border-b border-neutral-200 gap-4 mb-8">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-neutral-400">Customer Account</span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 tracking-tight mt-1">
            Welcome, {currentUser.displayName || customerProfile?.name || 'Customer'}
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">{currentUser.email}</p>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => onNavigate('/admin')}
              className="px-4 py-2 bg-neutral-900 text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-black transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Admin Panel</span>
            </button>
          )}
          <button
            onClick={() => onNavigate('/wishlist')}
            className="px-4 py-2 border border-neutral-300 text-neutral-700 text-xs font-semibold uppercase tracking-wider rounded-lg hover:border-black transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Heart className="w-3.5 h-3.5" />
            <span>Wishlist</span>
          </button>
          <button
            onClick={() => logOut()}
            className="px-4 py-2 border border-red-200 text-red-600 text-xs font-semibold uppercase tracking-wider rounded-lg hover:bg-red-50 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-neutral-200 mb-8">
        <button
          onClick={() => setActiveTab('orders')}
          className={`pb-3 text-xs font-bold uppercase tracking-wider border-b-2 -mb-px transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'orders' ? 'border-black text-black' : 'border-transparent text-neutral-400 hover:text-black'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>My Orders ({orders.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('profile')}
          className={`pb-3 text-xs font-bold uppercase tracking-wider border-b-2 -mb-px transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'profile' ? 'border-black text-black' : 'border-transparent text-neutral-400 hover:text-black'
          }`}
        >
          <User className="w-4 h-4" />
          <span>Profile Details</span>
        </button>
      </div>

      {/* Orders Tab */}
      {activeTab === 'orders' && (
        <div>
          {ordersLoading ? (
            <p className="text-xs text-neutral-500 py-8">Loading your order history...</p>
          ) : orders.length === 0 ? (
            <EmptyState
              icon={<Package className="w-8 h-8 text-neutral-400" />}
              title="No orders found"
              description="You haven't placed any orders yet. Discover our premium menswear collection today."
              actionText="Shop Now"
              onAction={() => onNavigate('/shop')}
            />
          ) : (
            <div className="space-y-4">
              {orders.map((o) => (
                <div
                  key={o.id}
                  className="bg-white border border-neutral-200 rounded-xl p-5 hover:border-neutral-400 transition-all shadow-xs"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-neutral-100 gap-2 text-xs">
                    <div>
                      <span className="font-mono font-bold text-sm text-neutral-900">{o.orderNumber}</span>
                      <span className="text-neutral-400 ml-3">
                        {o.createdAt?.toDate ? o.createdAt.toDate().toLocaleDateString('en-BD') : 'Recently'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${
                        o.orderStatus === 'delivered' ? 'bg-emerald-100 text-emerald-800' :
                        o.orderStatus === 'cancelled' ? 'bg-red-100 text-red-800' :
                        'bg-neutral-100 text-neutral-800'
                      }`}>
                        {o.orderStatus}
                      </span>
                      <button
                        onClick={() => onNavigate(`/track-order?number=${o.orderNumber}&phone=${o.customerPhone}`)}
                        className="px-3 py-1 bg-black text-white text-[11px] font-semibold rounded hover:bg-neutral-800 cursor-pointer"
                      >
                        Track Status
                      </button>
                    </div>
                  </div>

                  {/* Items preview */}
                  <div className="py-3 divide-y divide-neutral-50">
                    {o.items.map((item, idx) => (
                      <div key={idx} className="py-2 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3">
                          <img
                            src={item.productImage || '/logo.jpg'}
                            alt={item.productName}
                            className="w-10 h-12 object-cover rounded bg-neutral-100"
                          />
                          <div>
                            <p className="font-semibold text-neutral-900">{item.productName}</p>
                            <p className="text-[11px] text-neutral-500">
                              Size: {item.size} • Color: {item.color} • Qty: {item.quantity}
                            </p>
                          </div>
                        </div>
                        <span className="font-bold text-neutral-900">
                          ৳{item.totalPrice.toLocaleString('en-BD')}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Summary row */}
                  <div className="pt-3 border-t border-neutral-100 flex items-center justify-between text-xs">
                    <span className="text-neutral-500">
                      Payment: <b>Cash on Delivery</b> ({o.paymentStatus})
                    </span>
                    <span className="text-sm font-bold text-neutral-900">
                      Total: ৳{o.total.toLocaleString('en-BD')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div className="max-w-xl bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900 mb-2">Personal Information</h3>
          <div className="space-y-3 text-xs">
            <div>
              <span className="text-neutral-400 block mb-0.5">Full Name</span>
              <p className="font-semibold text-neutral-900">{currentUser.displayName || customerProfile?.name || 'Not provided'}</p>
            </div>
            <div>
              <span className="text-neutral-400 block mb-0.5">Email</span>
              <p className="font-semibold text-neutral-900">{currentUser.email}</p>
            </div>
            <div>
              <span className="text-neutral-400 block mb-0.5">Phone</span>
              <p className="font-semibold text-neutral-900">{customerProfile?.phone || 'Not provided'}</p>
            </div>
            <div>
              <span className="text-neutral-400 block mb-0.5">Default Shipping Address</span>
              <p className="font-semibold text-neutral-900">{customerProfile?.address || 'Saved upon checkout'}</p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

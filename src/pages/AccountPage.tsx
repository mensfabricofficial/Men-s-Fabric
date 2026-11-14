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
  ShieldCheck,
  RefreshCw,
  Save,
  Send,
  Building,
  Key,
  FileText
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Order } from '../types';
import { orderService } from '../services/orderService';
import { EmptyState } from '../components/common/EmptyState';
import { A4InvoiceModal } from '../components/common/A4InvoiceModal';
import { BrandLogo } from '../components/common/BrandLogo';
import { getCleanAuthErrorMessage } from '../lib/authErrorHelper';

interface AccountPageProps {
  onNavigate: (route: string) => void;
}

const BD_DIVISIONS = [
  'Dhaka',
  'Chattogram',
  'Rajshahi',
  'Khulna',
  'Barishal',
  'Sylhet',
  'Rangpur',
  'Mymensingh',
];

export const AccountPage: React.FC<AccountPageProps> = ({ onNavigate }) => {
  const { 
    currentUser, 
    customerProfile, 
    isAdmin, 
    signIn, 
    signUp, 
    logOut, 
    resetPassword,
    sendVerificationEmail,
    reloadCurrentUser,
    updateCustomerProfile,
    requestEmailChange
  } = useAuth();

  // Auth Form State
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [resetSent, setResetSent] = useState(false);

  // Verification Pending State
  const [verifying, setVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [verificationFeedback, setVerificationFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Authenticated State
  const [activeTab, setActiveTab] = useState<'orders' | 'profile'>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selectedInvoiceOrder, setSelectedInvoiceOrder] = useState<Order | null>(null);

  // Profile Edit Form State
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileAddress, setProfileAddress] = useState('');
  const [profileDivision, setProfileDivision] = useState('Dhaka');
  const [profileDistrict, setProfileDistrict] = useState('');
  const [profilePostalCode, setProfilePostalCode] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileStatus, setProfileStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Email Change State
  const [showEmailChangeModal, setShowEmailChangeModal] = useState(false);
  const [newEmailInput, setNewEmailInput] = useState('');
  const [emailChangeLoading, setEmailChangeLoading] = useState(false);
  const [emailChangeStatus, setEmailChangeStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Password Reset in Profile State
  const [passResetStatus, setPassResetStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [passResetLoading, setPassResetLoading] = useState(false);

  // Sync profile data into form inputs
  useEffect(() => {
    if (customerProfile || currentUser) {
      setProfileName(customerProfile?.name || currentUser?.displayName || '');
      setProfilePhone(customerProfile?.phone || '');
      setProfileAddress(customerProfile?.address || '');
      setProfileDivision(customerProfile?.division || 'Dhaka');
      setProfileDistrict(customerProfile?.district || customerProfile?.city || '');
      setProfilePostalCode(customerProfile?.postalCode || '');
    }
  }, [customerProfile, currentUser]);

  // Load orders with multi-identifier lookup (UID, email, and phone)
  useEffect(() => {
    if (currentUser) {
      setOrdersLoading(true);
      orderService.getCustomerOrders(
        currentUser.uid,
        currentUser.email || undefined,
        customerProfile?.phone || undefined
      )
        .then(setOrders)
        .finally(() => setOrdersLoading(false));
    }
  }, [currentUser, customerProfile]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    try {
      const isRedirectCheckout = window.location.search.includes('redirect=checkout');
      const adminEmails = ['mensfabricofficial@gmail.com', 'me@admin.com'];
      const enteredEmail = email.toLowerCase().trim();

      if (authMode === 'login') {
        const user = await signIn(email, password);
        if (adminEmails.includes(enteredEmail)) {
          onNavigate('/admin');
          return;
        }
        if (!user.emailVerified) {
          // Keep on page to show email verification requirement
          setVerificationFeedback({
            type: 'error',
            message: 'Your email address is not verified yet. Please check your inbox and verify your email.'
          });
          return;
        }
      } else {
        // Register Mode
        if (!name.trim()) throw new Error('Please enter your full name.');
        
        // Strict Phone Number Requirement & Validation (Bangladesh 11 digits format)
        const cleanPhone = phone.trim().replace(/^(\+88|88)/, '');
        const bdPhoneRegex = /^01[3-9]\d{8}$/;
        if (!bdPhoneRegex.test(cleanPhone)) {
          throw new Error('Please enter a valid 11-digit Bangladeshi mobile number (e.g. 01712345678).');
        }

        await signUp(email, password, name.trim(), cleanPhone);
        setVerificationFeedback({
          type: 'success',
          message: 'Account created! A verification link has been sent to your email.'
        });
        return;
      }

      if (isRedirectCheckout) {
        onNavigate('/checkout');
      }
    } catch (err: any) {
      setAuthError(getCleanAuthErrorMessage(err));
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
      setAuthError(getCleanAuthErrorMessage(err));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleCheckEmailVerified = async () => {
    setVerifying(true);
    setVerificationFeedback(null);
    try {
      const refreshedUser = await reloadCurrentUser();
      if (refreshedUser?.emailVerified) {
        setVerificationFeedback({
          type: 'success',
          message: 'Email verified successfully! Welcome to MEN\'S FABRIC.'
        });
        if (window.location.search.includes('redirect=checkout')) {
          onNavigate('/checkout');
        }
      } else {
        setVerificationFeedback({
          type: 'error',
          message: 'Email is not yet verified. Please check your inbox and spam folder, click the link, and try again.'
        });
      }
    } catch (err: any) {
      setVerificationFeedback({
        type: 'error',
        message: err.message || 'Could not verify status. Please try again.'
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleResendVerification = async () => {
    if (resendCooldown > 0) return;
    setVerificationFeedback(null);
    try {
      await sendVerificationEmail();
      setResendCooldown(60);
      setVerificationFeedback({
        type: 'success',
        message: 'A fresh verification email has been sent. Please check your inbox and spam folder.'
      });
    } catch (err: any) {
      setVerificationFeedback({
        type: 'error',
        message: err.message || 'Failed to resend verification email. Please try again shortly.'
      });
    }
  };

  // Save Customer Profile updates
  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileStatus(null);

    if (!profileName.trim()) {
      setProfileStatus({ type: 'error', message: 'Full Name cannot be empty.' });
      return;
    }

    const cleanPhone = profilePhone.trim().replace(/^(\+88|88)/, '');
    const bdPhoneRegex = /^01[3-9]\d{8}$/;
    if (!bdPhoneRegex.test(cleanPhone)) {
      setProfileStatus({
        type: 'error',
        message: 'Please enter a valid 11-digit phone number (e.g. 01712345678).'
      });
      return;
    }

    setProfileSaving(true);
    try {
      await updateCustomerProfile({
        name: profileName.trim(),
        phone: cleanPhone,
        address: profileAddress.trim(),
        division: profileDivision,
        district: profileDistrict.trim(),
        city: profileDistrict.trim(),
        postalCode: profilePostalCode.trim()
      });
      setProfileStatus({
        type: 'success',
        message: 'Your profile and delivery details have been saved successfully!'
      });
    } catch (err: any) {
      setProfileStatus({
        type: 'error',
        message: err.message || 'Failed to update profile.'
      });
    } finally {
      setProfileSaving(false);
    }
  };

  // Profile Password Reset Request
  const handleProfilePasswordReset = async () => {
    if (!currentUser?.email) return;
    setPassResetLoading(true);
    setPassResetStatus(null);
    try {
      await resetPassword(currentUser.email);
      setPassResetStatus({
        type: 'success',
        message: `Password reset link dispatched to ${currentUser.email}. Check your inbox to set a new password.`
      });
    } catch (err: any) {
      setPassResetStatus({
        type: 'error',
        message: err.message || 'Failed to send password reset email.'
      });
    } finally {
      setPassResetLoading(false);
    }
  };

  // Email Change Request
  const handleEmailChangeRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmailInput.trim()) return;
    setEmailChangeLoading(true);
    setEmailChangeStatus(null);
    try {
      await requestEmailChange(newEmailInput.trim());
      setEmailChangeStatus({
        type: 'success',
        message: `Verification link sent to ${newEmailInput.trim()}. Please click the link to confirm and update your account email.`
      });
      setNewEmailInput('');
    } catch (err: any) {
      setEmailChangeStatus({
        type: 'error',
        message: err.message || 'Failed to send verification link to the new email address.'
      });
    } finally {
      setEmailChangeLoading(false);
    }
  };

  // 1. Unauthenticated Screen
  if (!currentUser) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 sm:py-24">
        <div className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-8 shadow-sm">
          
          {/* Logo / Header */}
          <div className="text-center mb-6 space-y-3">
            <div className="flex justify-center pb-1">
              <BrandLogo variant="dark" size="lg" />
            </div>
            <h1 className="text-lg font-extrabold uppercase tracking-tight text-neutral-900">
              {authMode === 'login' ? 'Customer Sign In' : 'Create Customer Account'}
            </h1>
            <p className="text-xs text-neutral-500">
              Access your order history, track deliveries, and manage your wishlist.
            </p>
          </div>

          {window.location.search.includes('redirect=checkout') && (
            <div className="p-3 mb-5 bg-neutral-900 text-white rounded-xl text-xs flex items-center gap-2.5">
              <Package className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>Please sign in or create an account to proceed with your order checkout.</span>
            </div>
          )}

          {/* Tab Switcher */}
          <div className="grid grid-cols-2 p-1 bg-neutral-100 rounded-lg mb-6 text-xs font-semibold uppercase tracking-wider">
            <button
              onClick={() => { setAuthMode('login'); setAuthError(''); setResetSent(false); }}
              className={`py-2 rounded-md transition-all cursor-pointer ${
                authMode === 'login' ? 'bg-white text-black shadow-xs' : 'text-neutral-500 hover:text-black'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setAuthMode('register'); setAuthError(''); setResetSent(false); }}
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
                    Phone Number (Mandatory) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-neutral-400">
                      +88
                    </span>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="017XXXXXXXX"
                      className="w-full pl-12 pr-3.5 py-2.5 text-xs bg-neutral-50 border border-neutral-300 rounded-lg focus:outline-none focus:border-black font-medium"
                    />
                  </div>
                  <p className="text-[10px] text-neutral-400 mt-1">
                    Required for courier delivery updates and verification.
                  </p>
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
              {authMode === 'register' && (
                <p className="text-[10px] text-neutral-400 mt-1">
                  A verification link will be sent to this email upon registration.
                </p>
              )}
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
              {authLoading ? 'Processing...' : authMode === 'login' ? 'Sign In' : 'Create Account & Send Verification'}
            </button>
          </form>

        </div>
      </div>
    );
  }

  // 2. Email Verification Pending Screen (Enforced for customers until verified)
  const isPrimaryAdmin = ['mensfabricofficial@gmail.com', 'me@admin.com'].includes(currentUser.email?.toLowerCase() || '');
  if (!currentUser.emailVerified && !isAdmin && !isPrimaryAdmin) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 sm:py-24">
        <div className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-8 shadow-sm text-center">
          
          <div className="w-14 h-14 bg-amber-50 border border-amber-200 rounded-full flex items-center justify-center mx-auto mb-4 text-amber-600">
            <Mail className="w-7 h-7" />
          </div>

          <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
            Action Required
          </span>

          <h2 className="text-xl font-extrabold uppercase tracking-tight text-neutral-900 mt-3 mb-2">
            Verify Your Email Address
          </h2>

          <p className="text-xs text-neutral-600 leading-relaxed mb-4">
            We have sent an activation link to:
            <br />
            <strong className="text-neutral-900 font-bold">{currentUser.email}</strong>
          </p>

          <p className="text-[11px] text-neutral-500 mb-6 bg-neutral-50 p-3 rounded-lg border border-neutral-200 text-left">
            Please check your inbox (and spam/promotions folder) and click the verification link to activate your account. Once verified, you can access your profile and complete orders.
          </p>

          {verificationFeedback && (
            <div className={`p-3 mb-5 rounded-lg text-xs flex items-center gap-2 text-left ${
              verificationFeedback.type === 'success' 
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {verificationFeedback.type === 'success' ? (
                <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              )}
              <span>{verificationFeedback.message}</span>
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={handleCheckEmailVerified}
              disabled={verifying}
              className="w-full py-3 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:bg-neutral-400"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${verifying ? 'animate-spin' : ''}`} />
              <span>{verifying ? 'Checking Status...' : "I've Clicked The Link (Refresh)"}</span>
            </button>

            <button
              onClick={handleResendVerification}
              disabled={resendCooldown > 0}
              className="w-full py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-bold uppercase tracking-wider rounded-lg border border-neutral-300 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Verification Link'}</span>
            </button>

            <button
              onClick={() => logOut()}
              className="w-full py-2 text-neutral-500 hover:text-black text-xs font-semibold cursor-pointer"
            >
              Sign Out & Switch Account
            </button>
          </div>

        </div>
      </div>
    );
  }

  // 3. Authenticated Customer Dashboard
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
      
      {/* Account Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-8 border-b border-neutral-200 gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-widest text-neutral-400">Customer Account</span>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
              <CheckCircle className="w-3 h-3 text-emerald-600" />
              Verified
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 tracking-tight">
            Welcome, {profileName || currentUser.displayName || customerProfile?.name || 'Customer'}
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">{currentUser.email}</p>
        </div>

        <div className="flex items-center gap-2">
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
      <div className="flex gap-6 border-b border-neutral-200 mb-8">
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
          <span>Profile & Delivery Settings</span>
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
                    <div className="flex flex-wrap items-center gap-2 pt-1 sm:pt-0">
                      <span className={`px-2.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${
                        o.orderStatus === 'delivered' ? 'bg-emerald-100 text-emerald-800' :
                        o.orderStatus === 'cancelled' ? 'bg-red-100 text-red-800' :
                        'bg-neutral-100 text-neutral-800'
                      }`}>
                        {o.orderStatus}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedInvoiceOrder(o)}
                        className="px-2.5 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-[11px] font-semibold rounded flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <FileText className="w-3 h-3 text-neutral-600" />
                        <span>A4 Invoice</span>
                      </button>
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
                            src={item.productImage || '/assets/aistudio/selvee1_8ff37f5b.jpg'}
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
                  <div className="pt-3 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-neutral-500">Payment:</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        o.paymentMethod === 'bkash' ? 'bg-[#D12053]/10 text-[#D12053]' :
                        o.paymentMethod === 'nagad' ? 'bg-[#F7941D]/10 text-[#D97706]' :
                        o.paymentMethod === 'rocket' ? 'bg-[#8C3494]/10 text-[#8C3494]' :
                        'bg-neutral-100 text-neutral-700'
                      }`}>
                        {o.paymentMethod === 'cod' ? 'Cash On Delivery' : o.paymentMethod.toUpperCase()}
                      </span>
                      {o.paymentDetails?.transactionId && (
                        <span className="font-mono text-[10px] text-neutral-600 bg-neutral-100 px-1.5 py-0.5 rounded">
                          Trx: {o.paymentDetails.transactionId}
                        </span>
                      )}
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        o.paymentStatus === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {o.paymentStatus}
                      </span>
                    </div>
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

      {/* Profile & Settings Tab */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Profile Form */}
          <div className="lg:col-span-2 bg-white border border-neutral-200 rounded-2xl p-6 sm:p-8 shadow-xs">
            <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900 mb-1 flex items-center gap-2">
              <User className="w-4 h-4" />
              <span>Customer Profile & Default Shipping</span>
            </h3>
            <p className="text-xs text-neutral-500 mb-6">
              Keep your contact and address details up to date for fast order placement and doorstep delivery.
            </p>

            {profileStatus && (
              <div className={`p-3.5 mb-6 rounded-xl text-xs flex items-center gap-2.5 ${
                profileStatus.type === 'success' 
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {profileStatus.type === 'success' ? (
                  <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                )}
                <span>{profileStatus.message}</span>
              </div>
            )}

            <form onSubmit={handleProfileSubmit} className="space-y-5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold uppercase text-[11px] text-neutral-700 mb-1.5">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="Your Full Name"
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded-lg focus:outline-none focus:border-black font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold uppercase text-[11px] text-neutral-700 mb-1.5">
                    Phone Number (Mandatory) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-neutral-400">
                      +88
                    </span>
                    <input
                      type="tel"
                      required
                      value={profilePhone}
                      onChange={(e) => setProfilePhone(e.target.value)}
                      placeholder="01XXXXXXXXX"
                      className="w-full pl-12 pr-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded-lg focus:outline-none focus:border-black font-medium"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold uppercase text-[11px] text-neutral-700 mb-1.5">
                  Delivery Address (Street, House, Road, Sector)
                </label>
                <textarea
                  rows={2}
                  value={profileAddress}
                  onChange={(e) => setProfileAddress(e.target.value)}
                  placeholder="e.g. House 24, Road 7, Block B, Banani"
                  className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded-lg focus:outline-none focus:border-black"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-bold uppercase text-[11px] text-neutral-700 mb-1.5">
                    Division
                  </label>
                  <select
                    value={profileDivision}
                    onChange={(e) => setProfileDivision(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded-lg focus:outline-none focus:border-black font-medium"
                  >
                    {BD_DIVISIONS.map((div) => (
                      <option key={div} value={div}>{div}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold uppercase text-[11px] text-neutral-700 mb-1.5">
                    District / City
                  </label>
                  <input
                    type="text"
                    value={profileDistrict}
                    onChange={(e) => setProfileDistrict(e.target.value)}
                    placeholder="e.g. Dhaka"
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded-lg focus:outline-none focus:border-black"
                  />
                </div>

                <div>
                  <label className="block font-bold uppercase text-[11px] text-neutral-700 mb-1.5">
                    Postal Code
                  </label>
                  <input
                    type="text"
                    value={profilePostalCode}
                    onChange={(e) => setProfilePostalCode(e.target.value)}
                    placeholder="e.g. 1213"
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded-lg focus:outline-none focus:border-black"
                  />
                </div>
              </div>

              <div className="pt-3">
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="px-6 py-2.5 bg-black text-white font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 transition-colors flex items-center gap-2 cursor-pointer shadow-xs disabled:bg-neutral-400"
                >
                  <Save className="w-4 h-4" />
                  <span>{profileSaving ? 'Saving Changes...' : 'Save Profile Changes'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Account Security & Email Verification Card */}
          <div className="space-y-6">
            <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-xs space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Account Security</span>
              </h3>

              <div className="space-y-3 text-xs">
                <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200">
                  <span className="text-[10px] uppercase font-bold text-neutral-400 block mb-0.5">Primary Email</span>
                  <p className="font-semibold text-neutral-900">{currentUser.email}</p>
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      <CheckCircle className="w-3 h-3 text-emerald-600" />
                      Email Verified
                    </span>
                  </div>
                </div>

                {/* Password reset button */}
                <div className="pt-2">
                  <button
                    type="button"
                    disabled={passResetLoading}
                    onClick={handleProfilePasswordReset}
                    className="w-full py-2 px-3 border border-neutral-300 hover:border-black rounded-lg text-xs font-semibold text-neutral-800 flex items-center justify-center gap-2 cursor-pointer transition-colors"
                  >
                    <Key className="w-3.5 h-3.5 text-neutral-600" />
                    <span>{passResetLoading ? 'Sending...' : 'Send Password Reset Link'}</span>
                  </button>
                  {passResetStatus && (
                    <p className={`mt-2 text-[11px] p-2 rounded ${
                      passResetStatus.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'
                    }`}>
                      {passResetStatus.message}
                    </p>
                  )}
                </div>

                {/* Change Email Trigger */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowEmailChangeModal(true)}
                    className="w-full py-2 px-3 bg-neutral-100 hover:bg-neutral-200 rounded-lg text-xs font-semibold text-neutral-800 flex items-center justify-center gap-2 cursor-pointer transition-colors"
                  >
                    <Mail className="w-3.5 h-3.5 text-neutral-600" />
                    <span>Update Email Address</span>
                  </button>
                </div>

              </div>
            </div>

            {/* Support Note */}
            <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-5 text-xs space-y-1.5 text-neutral-600">
              <p className="font-bold text-neutral-900 uppercase text-[11px]">Need Assistance?</p>
              <p className="text-[11px] leading-relaxed">
                For order inquiries or custom garment tailoring adjustments, reach out to our concierge via WhatsApp or phone.
              </p>
            </div>
          </div>

        </div>
      )}

      {/* Modal: Change Email with Verification */}
      {showEmailChangeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-fade-in border border-neutral-200">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div>
                <h3 className="font-bold text-sm text-neutral-900 uppercase tracking-tight">Update Account Email</h3>
                <p className="text-[11px] text-neutral-500">A verification link will be sent to the new address.</p>
              </div>
              <button
                onClick={() => { setShowEmailChangeModal(false); setEmailChangeStatus(null); }}
                className="p-1 text-neutral-400 hover:text-black cursor-pointer"
              >
                ✕
              </button>
            </div>

            {emailChangeStatus && (
              <div className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                emailChangeStatus.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {emailChangeStatus.type === 'success' ? (
                  <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                )}
                <span>{emailChangeStatus.message}</span>
              </div>
            )}

            <form onSubmit={handleEmailChangeRequest} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase text-neutral-700 mb-1">
                  New Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={newEmailInput}
                  onChange={(e) => setNewEmailInput(e.target.value)}
                  placeholder="newemail@example.com"
                  className="w-full px-3.5 py-2.5 text-xs bg-neutral-50 border border-neutral-300 rounded-lg focus:outline-none focus:border-black"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowEmailChangeModal(false); setEmailChangeStatus(null); }}
                  className="flex-1 py-2 text-xs font-semibold text-neutral-600 bg-neutral-100 hover:bg-neutral-200 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={emailChangeLoading}
                  className="flex-1 py-2 text-xs font-bold text-white bg-black hover:bg-neutral-800 rounded-lg cursor-pointer disabled:bg-neutral-400"
                >
                  {emailChangeLoading ? 'Sending Link...' : 'Send Verification'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* A4 Invoice Modal */}
      {selectedInvoiceOrder && (
        <A4InvoiceModal
          order={selectedInvoiceOrder}
          isOpen={Boolean(selectedInvoiceOrder)}
          onClose={() => setSelectedInvoiceOrder(null)}
        />
      )}

    </div>
  );
};

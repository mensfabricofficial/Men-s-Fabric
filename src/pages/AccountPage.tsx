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
  EyeOff,
  X,
  ChevronLeft,
  ShieldCheck,
  RefreshCw,
  Save,
  Send,
  Building,
  Key,
  FileText,
  BellRing,
  BellOff
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { Order } from '../types';
import { orderService } from '../services/orderService';
import { EmptyState } from '../components/common/EmptyState';
import { A4InvoiceModal } from '../components/common/A4InvoiceModal';
import { BrandLogo } from '../components/common/BrandLogo';
import { PWAInstallButton } from '../components/common/PWAInstallButton';
import { FloatingInput, FloatingTextarea, FloatingSelect } from '../components/common/FloatingInput';
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
    signInWithGoogle,
    signInWithFacebook,
    logOut, 
    resetPassword,
    sendVerificationEmail,
    reloadCurrentUser,
    updateCustomerProfile,
    requestEmailChange
  } = useAuth();
  const {
    permission: notifPermission,
    isMuted: notifMuted,
    allNotificationsActive,
    isCustomerDeviceBlocked,
    customerVerificationBlockReason,
    enableAllNotificationsOneClick,
    toggleMute: toggleNotifMute,
  } = useNotifications();
  const [enablingNotifs, setEnablingNotifs] = useState(false);

  // Auth Form State
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'facebook' | null>(null);
  const [authError, setAuthError] = useState('');
  const [resetSent, setResetSent] = useState(false);

  // Verification Pending State
  const [verifying, setVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [verificationFeedback, setVerificationFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Authenticated State
  const [activeTab, setActiveTab] = useState<'profile' | 'orders' | 'addresses'>(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('tab');
    if (t === 'orders' || t === 'addresses' || t === 'profile') return t;
    return 'profile';
  });
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersPage, setOrdersPage] = useState(1);
  const [selectedInvoiceOrder, setSelectedInvoiceOrder] = useState<Order | null>(null);
  const [isEditingPersonal, setIsEditingPersonal] = useState(false);
  const [isEditingAddress, setIsEditingAddress] = useState(false);

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

  const openForgotPassword = () => {
    setForgotIdentifier(email);
    setAuthError('');
    setResetSent(false);
    setAuthMode('forgot');
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotIdentifier.trim()) return;
    setAuthLoading(true);
    setAuthError('');
    setResetSent(false);
    try {
      await resetPassword(forgotIdentifier);
      setResetSent(true);
    } catch (err: any) {
      setAuthError(getCleanAuthErrorMessage(err));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSocialSignIn = async (provider: 'google' | 'facebook') => {
    setAuthError('');
    setResetSent(false);
    setSocialLoading(provider);
    try {
      const user = provider === 'google' ? await signInWithGoogle() : await signInWithFacebook();
      const adminEmails = ['mensfabricofficial@gmail.com', 'me@admin.com'];
      if (user.email && adminEmails.includes(user.email.toLowerCase())) {
        onNavigate('/admin');
        return;
      }
      if (window.location.search.includes('redirect=checkout')) {
        onNavigate('/checkout');
      }
    } catch (err: any) {
      setAuthError(getCleanAuthErrorMessage(err));
    } finally {
      setSocialLoading(null);
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

  // Save Customer Profile / Delivery Address updates
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
      setIsEditingPersonal(false);
      setIsEditingAddress(false);
      setProfileStatus({
        type: 'success',
        message: 'Your details have been saved successfully!'
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

  // 1. Unauthenticated Screen — Standalone Full-Page White Editorial Auth (Login / Register / Forgot Password)
  if (!currentUser) {
    // Dedicated Forgot Password Screen
    if (authMode === 'forgot') {
      const canReset = Boolean(forgotIdentifier.trim()) && !authLoading;
      return (
        <div className="min-h-screen bg-white text-neutral-900 flex flex-col relative px-4 sm:px-6 selection:bg-black selection:text-white">
          {/* Top-left Back Arrow */}
          <button
            type="button"
            onClick={() => { setAuthMode('login'); setAuthError(''); setResetSent(false); }}
            aria-label="Return to sign in"
            className="fixed top-4 left-4 sm:top-6 sm:left-7 p-2 text-neutral-800 hover:text-black hover:bg-neutral-100 rounded-full transition-colors cursor-pointer z-20"
          >
            <ChevronLeft className="w-5 h-5" strokeWidth={1.75} />
          </button>

          {/* Top Centered Brand Logo + Centered Reset Form */}
          <div className="w-full max-w-[400px] mx-auto pt-8 sm:pt-10 pb-12 flex-1 flex flex-col items-center">
            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="cursor-pointer focus:outline-none"
              aria-label="Go to Selvee home"
            >
              <BrandLogo variant="dark" imgClassName="h-10 sm:h-11 w-auto" />
            </button>

            <div className="w-full my-auto py-12 flex flex-col items-center">
              {/* Minimalist Padlock Icon with Keyhole */}
              <div className="mb-6 text-neutral-900">
                <svg className="w-14 h-14" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="10" y="20" width="28" height="21" rx="3" />
                  <path d="M16 20v-6a8 8 0 0 1 16 0v6" />
                  <circle cx="24" cy="29.5" r="2.2" fill="currentColor" stroke="none" />
                  <path d="M24 31.5v3.5" strokeWidth="2.4" />
                </svg>
              </div>

              <h1 className="text-[22px] sm:text-2xl font-bold text-neutral-900 tracking-tight text-center">
                Forgot your password?
              </h1>

              <p className="mt-2.5 mb-7 text-[13px] text-neutral-600 text-center leading-relaxed max-w-[360px]">
                Please enter the <strong className="font-semibold text-neutral-900">Phone number or Email address</strong> associated with your account, and we&apos;ll send you a link to reset your password
              </p>

              {authError && (
                <div className="w-full p-3 mb-4 bg-red-50 border border-red-200 rounded-[6px] text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              {resetSent && (
                <div className="w-full p-3 mb-4 bg-emerald-50 border border-emerald-200 rounded-[6px] text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>Password reset link sent! Please check your email inbox and spam folder.</span>
                </div>
              )}

              <form onSubmit={handleForgotSubmit} className="w-full space-y-4">
                <FloatingInput
                  label="Phone number or email"
                  type="text"
                  required
                  value={forgotIdentifier}
                  onChange={(e) => setForgotIdentifier(e.target.value)}
                  autoComplete="username"
                />

                <button
                  type="submit"
                  disabled={!canReset}
                  className={`w-full h-11 sm:h-12 text-sm font-medium rounded-[6px] transition-colors ${
                    canReset
                      ? 'bg-black text-white hover:bg-neutral-900 cursor-pointer'
                      : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                  }`}
                >
                  {authLoading ? 'Sending...' : 'Reset Password'}
                </button>
              </form>

              <button
                type="button"
                onClick={() => { setAuthMode('login'); setAuthError(''); setResetSent(false); }}
                className="mt-5 inline-flex items-center justify-center gap-1 text-xs font-semibold text-neutral-900 hover:text-black cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2} />
                <span>Return to sign in</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    const isRedirectCheckout = window.location.search.includes('redirect=checkout');
    const googleButtonLabel =
      socialLoading === 'google'
        ? 'Connecting...'
        : authMode === 'login'
        ? 'Continue with Google'
        : 'Sign with Google';
    const facebookButtonLabel =
      socialLoading === 'facebook'
        ? 'Connecting...'
        : authMode === 'login'
        ? 'Continue with Facebook'
        : 'Sign with Facebook';

    const passwordEyeToggle = (
      <button
        type="button"
        onClick={() => setShowPassword((prev) => !prev)}
        aria-label={showPassword ? 'Hide password' : 'Show password'}
        className="text-neutral-600 hover:text-neutral-900 p-0.5 cursor-pointer transition-colors"
      >
        {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
      </button>
    );

    return (
      <div className="min-h-screen bg-white text-neutral-900 flex flex-col relative px-4 sm:px-6 selection:bg-black selection:text-white">
        {/* Top-right Close Button */}
        <button
          type="button"
          onClick={() => onNavigate('/')}
          aria-label="Close sign in"
          className="fixed top-4 right-4 sm:top-6 sm:right-7 p-2 text-neutral-800 hover:text-black hover:bg-neutral-100 rounded-full transition-colors cursor-pointer z-20"
        >
          <X className="w-5 h-5" strokeWidth={1.75} />
        </button>

        {/* Centered Container */}
        <div className="w-full max-w-[380px] mx-auto my-auto py-12 flex flex-col items-center">
          {/* Centered Official Brand Logo */}
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="mb-9 sm:mb-11 cursor-pointer focus:outline-none"
            aria-label="Go to Selvee home"
          >
            <BrandLogo variant="dark" imgClassName="h-10 sm:h-11 w-auto" />
          </button>

          {/* Heading */}
          <h1 className="text-[22px] sm:text-2xl font-bold text-neutral-900 tracking-tight text-center">
            {authMode === 'login' ? 'Sign in to your account' : 'Create your account'}
          </h1>

          {/* Subline Switcher */}
          <p className="mt-2 mb-7 text-[13px] text-neutral-900 text-center">
            {authMode === 'login' ? (
              <>
                New user?{' '}
                <button
                  type="button"
                  onClick={() => { setAuthMode('register'); setAuthError(''); setResetSent(false); }}
                  className="text-[#1a73e8] underline underline-offset-2 hover:text-blue-700 font-medium cursor-pointer"
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => { setAuthMode('login'); setAuthError(''); setResetSent(false); }}
                  className="text-[#1a73e8] underline underline-offset-2 hover:text-blue-700 font-medium cursor-pointer"
                >
                  Sign in
                </button>
              </>
            )}
          </p>

          {isRedirectCheckout && (
            <div className="w-full p-3 mb-4 bg-neutral-900 text-white rounded-[6px] text-xs flex items-center gap-2.5">
              <Package className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>Please sign in or create an account to complete checkout.</span>
            </div>
          )}

          {authError && (
            <div className="w-full p-3 mb-4 bg-red-50 border border-red-200 rounded-[6px] text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          {resetSent && (
            <div className="w-full p-3 mb-4 bg-emerald-50 border border-emerald-200 rounded-[6px] text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>Password reset link sent to your email!</span>
            </div>
          )}

          {/* Auth Form */}
          <form onSubmit={handleAuthSubmit} className="w-full space-y-4">
            {authMode === 'register' ? (
              <>
                <FloatingInput
                  label="Full name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />

                <FloatingInput
                  label="Phone number"
                  type="tel"
                  required
                  prefixText="+88"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="017XXXXXXXX"
                  autoComplete="tel"
                />

                <FloatingInput
                  label="Email address"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />

                <FloatingInput
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  rightElement={passwordEyeToggle}
                />
              </>
            ) : (
              <>
                <FloatingInput
                  label="Phone number or email"
                  type="text"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                />

                <FloatingInput
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  rightElement={passwordEyeToggle}
                />

                <div className="flex justify-end pt-0.5">
                  <button
                    type="button"
                    onClick={openForgotPassword}
                    className="text-xs font-medium text-neutral-900 underline underline-offset-2 hover:text-black cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={authLoading || Boolean(socialLoading)}
              className="w-full h-11 sm:h-12 bg-black text-white text-sm font-medium rounded-[6px] hover:bg-neutral-900 transition-colors disabled:bg-neutral-400 cursor-pointer mt-1"
            >
              {authLoading ? 'Please wait...' : authMode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          {/* OR Divider */}
          <div className="w-full flex items-center gap-3 my-5">
            <div className="flex-1 border-t border-dashed border-neutral-300" />
            <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">OR</span>
            <div className="flex-1 border-t border-dashed border-neutral-300" />
          </div>

          {/* Social Auth Buttons */}
          <div className="w-full space-y-3">
            <button
              type="button"
              disabled={authLoading || Boolean(socialLoading)}
              onClick={() => handleSocialSignIn('google')}
              className="w-full h-11 bg-white border border-neutral-400 hover:border-black rounded-[6px] flex items-center justify-center gap-3 px-4 text-sm font-medium text-neutral-900 tracking-[0.01em] [word-spacing:0.12em] transition-colors cursor-pointer disabled:opacity-50"
            >
              <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z" />
                <path fill="#34A853" d="M12 24c3.3 0 6.08-1.09 8.1-2.96l-3.88-3.05c-1.1.74-2.51 1.18-4.22 1.18-3.24 0-5.99-2.19-6.97-5.13H1.03v3.14C3.05 21.18 7.21 24 12 24Z" />
                <path fill="#FBBC05" d="M5.03 14.04c-.25-.74-.39-1.54-.39-2.36 0-.82.14-1.62.39-2.36V6.18H1.03C.37 7.49 0 8.97 0 10.68c0 1.71.37 3.19 1.03 4.5l4-3.14Z" />
                <path fill="#EA4335" d="M12 4.75c1.8 0 3.41.62 4.68 1.84l3.51-3.51C18.07 1.19 15.3 0 12 0 7.21 0 3.05 2.82 1.03 6.82l4 3.14C6.01 6.94 8.76 4.75 12 4.75Z" />
              </svg>
              <span>{googleButtonLabel}</span>
            </button>

            <button
              type="button"
              disabled={authLoading || Boolean(socialLoading)}
              onClick={() => handleSocialSignIn('facebook')}
              className="w-full h-11 bg-white border border-neutral-400 hover:border-black rounded-[6px] flex items-center justify-center gap-3 px-4 text-sm font-medium text-neutral-900 tracking-[0.01em] [word-spacing:0.12em] transition-colors cursor-pointer disabled:opacity-50"
            >
              <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="11" fill="#1877F2" />
                <path
                  fill="#FFFFFF"
                  d="M15.12 13.06l.48-3.12h-2.99V7.92c0-.85.42-1.68 1.76-1.68h1.36V3.58s-1.24-.21-2.42-.21c-2.47 0-4.08 1.5-4.08 4.21v2.36H6.51v3.12h2.72v7.54a10.9 10.9 0 0 0 3.38 0v-7.54h2.51Z"
                />
              </svg>
              <span>{facebookButtonLabel}</span>
            </button>
          </div>

          {/* reCAPTCHA & Policies Notice */}
          <p className="mt-7 text-[11px] text-neutral-500 text-center leading-relaxed max-w-[320px]">
            This site is protected by reCAPTCHA and the Google{' '}
            <button
              type="button"
              onClick={() => onNavigate('/privacy-policy')}
              className="text-[#1a73e8] underline underline-offset-2 hover:text-blue-700 cursor-pointer"
            >
              Privacy Policy
            </button>{' '}
            and{' '}
            <button
              type="button"
              onClick={() => onNavigate('/terms')}
              className="text-[#1a73e8] underline underline-offset-2 hover:text-blue-700 cursor-pointer"
            >
              Terms of Service
            </button>{' '}
            apply.
          </p>
        </div>
      </div>
    );
  }

  // 2. Email Verification Pending Screen (Enforced for email/password signups; Google & Facebook OAuth bypass this)
  const isPrimaryAdmin = ['mensfabricofficial@gmail.com', 'me@admin.com'].includes(currentUser.email?.toLowerCase() || '');
  const isSocialAccount = currentUser.providerData?.some(
    (p) => p.providerId === 'google.com' || p.providerId === 'facebook.com'
  );
  if (!currentUser.emailVerified && !isSocialAccount && !isAdmin && !isPrimaryAdmin) {
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

  // 3. Authenticated Customer Dashboard (Minimal Editorial 3-Tab Layout: Profile, Order History, Addresses)
  const displayCustomerName = profileName || currentUser.displayName || customerProfile?.name || 'Customer';
  const ORDERS_PER_PAGE = 8;
  const totalOrderPages = Math.max(1, Math.ceil(orders.length / ORDERS_PER_PAGE));
  const safeOrderPage = Math.min(ordersPage, totalOrderPages);
  const startOrderIdx = (safeOrderPage - 1) * ORDERS_PER_PAGE;
  const paginatedOrders = orders.slice(startOrderIdx, startOrderIdx + ORDERS_PER_PAGE);

  const formatOrderDate = (createdAt: any) => {
    try {
      const date = createdAt?.toDate ? createdAt.toDate() : createdAt ? new Date(createdAt) : null;
      if (!date || Number.isNaN(date.getTime())) return 'Recently';
      return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
    } catch {
      return 'Recently';
    }
  };

  return (
    <div className="bg-[#f4f4f6] min-h-[75vh] py-12 sm:py-16 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto">

        {/* Centered Greeting Header */}
        <div className="text-center mb-8 sm:mb-9">
          <p className="text-2xl sm:text-[32px] font-medium text-neutral-900 tracking-tight leading-snug">
            Welcome Back,
          </p>
          <div className="mt-0.5 flex flex-wrap items-baseline justify-center gap-2.5">
            <h1 className="text-2xl sm:text-[32px] font-semibold text-neutral-900 tracking-tight leading-snug">
              {displayCustomerName}
            </h1>
            <button
              type="button"
              onClick={() => logOut()}
              className="text-xs font-medium text-neutral-800 underline underline-offset-2 hover:text-black cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Centered 3 Navigation Tabs (Profile, Order History, Addresses) */}
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 mb-9 sm:mb-10">
          {[
            { id: 'profile' as const, label: 'Profile' },
            { id: 'orders' as const, label: 'Order History' },
            { id: 'addresses' as const, label: 'Addresses' },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setProfileStatus(null);
                }}
                className={`px-6 py-2 rounded-full text-xs sm:text-[13px] font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-neutral-900 text-white shadow-xs'
                    : 'text-neutral-700 hover:text-black'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* TAB 1: PROFILE */}
        {activeTab === 'profile' && (
          <div className="max-w-[660px] mx-auto space-y-5">
            {profileStatus && (
              <div className={`p-3.5 rounded-xl text-xs flex items-center gap-2.5 ${
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

            {/* Card 1: Personal Details */}
            <div className="bg-white rounded-xl border border-neutral-200/80 p-6 sm:p-7 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-[15px] sm:text-base font-medium text-neutral-900">
                  Personal Details
                </h2>
                {!isEditingPersonal ? (
                  <button
                    type="button"
                    onClick={() => { setIsEditingPersonal(true); setProfileStatus(null); }}
                    className="text-xs font-medium text-neutral-900 underline underline-offset-2 hover:text-black cursor-pointer"
                  >
                    Edit
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsEditingPersonal(false)}
                    className="text-xs font-medium text-neutral-500 underline underline-offset-2 hover:text-black cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
              </div>

              {!isEditingPersonal ? (
                <div className="space-y-3 text-[13px] text-neutral-700">
                  <p>
                    <span className="text-neutral-600">Name: </span>
                    <span className="text-neutral-900 font-medium">{displayCustomerName}</span>
                  </p>
                  <p>
                    <span className="text-neutral-600">Email: </span>
                    <span className="text-neutral-900">{currentUser.email || 'Not linked'}</span>
                  </p>
                  {profilePhone && (
                    <p>
                      <span className="text-neutral-600">Phone: </span>
                      <span className="text-neutral-900">+88{profilePhone.replace(/^(\+88|88)/, '')}</span>
                    </p>
                  )}
                </div>
              ) : (
                <form onSubmit={handleProfileSubmit} className="space-y-4">
                  <FloatingInput
                    label="Full Name *"
                    type="text"
                    required
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="Your Full Name"
                  />

                  <FloatingInput
                    label="Phone Number *"
                    type="tel"
                    required
                    prefixText="+88"
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                    placeholder="01XXXXXXXXX"
                  />

                  <div className="flex items-center justify-between pt-1 text-xs text-neutral-600">
                    <span>Email: <strong className="text-neutral-900 font-medium">{currentUser.email || 'Not linked'}</strong></span>
                    <button
                      type="button"
                      onClick={() => setShowEmailChangeModal(true)}
                      className="text-neutral-900 underline underline-offset-2 hover:text-black font-medium cursor-pointer"
                    >
                      Change Email
                    </button>
                  </div>

                  <div className="flex items-center gap-2.5 pt-2">
                    <button
                      type="submit"
                      disabled={profileSaving}
                      className="px-5 py-2.5 bg-black text-white text-xs font-medium rounded-[6px] hover:bg-neutral-800 transition-colors cursor-pointer disabled:bg-neutral-400"
                    >
                      {profileSaving ? 'Saving...' : 'Save Details'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingPersonal(false)}
                      className="px-4 py-2.5 border border-neutral-300 text-neutral-700 text-xs font-medium rounded-[6px] hover:border-black transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Card 2: Email */}
            <div className="bg-white rounded-xl border border-neutral-200/80 p-6 sm:p-7 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-[15px] sm:text-base font-medium text-neutral-900">
                  Email
                </h2>
                <button
                  type="button"
                  onClick={() => setShowEmailChangeModal(true)}
                  className="text-xs font-medium text-neutral-900 underline underline-offset-2 hover:text-black cursor-pointer"
                >
                  Change Email
                </button>
              </div>

              <p className="text-[13px] text-neutral-700">
                <span className="text-neutral-600">Current Email: </span>
                <span className="text-neutral-900">{currentUser.email || 'Not linked'}</span>
              </p>
            </div>

            {/* Card 3: Password */}
            <div className="bg-white rounded-xl border border-neutral-200/80 p-6 sm:p-7 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-[15px] sm:text-base font-medium text-neutral-900">
                  Password
                </h2>
                <button
                  type="button"
                  disabled={passResetLoading || !currentUser.email}
                  onClick={handleProfilePasswordReset}
                  className="text-xs font-medium text-neutral-900 underline underline-offset-2 hover:text-black cursor-pointer disabled:opacity-40"
                >
                  {passResetLoading ? 'Sending...' : 'Change Password'}
                </button>
              </div>

              <p className="text-[13px] text-neutral-700">
                <span className="text-neutral-600">Current Password: </span>
                <span className="text-neutral-900 tracking-widest">********</span>
              </p>

              {passResetStatus && (
                <p className={`mt-4 text-xs p-3 rounded-[6px] ${
                  passResetStatus.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {passResetStatus.message}
                </p>
              )}
            </div>

            {/* Card 4: Simple Browser Notifications (PC & Mobile) */}
            <div className="bg-white rounded-xl border border-neutral-200/80 p-6 sm:p-7 shadow-[0_1px_2px_rgba(0,0,0,0.03)] space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <BellRing className="w-4 h-4 text-neutral-900" />
                  <h2 className="text-[15px] sm:text-base font-medium text-neutral-900">
                    Browser Notifications
                  </h2>
                </div>
                <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full shrink-0 ${
                  allNotificationsActive && notifPermission === 'granted'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : notifMuted
                    ? 'bg-neutral-100 text-neutral-600'
                    : 'bg-neutral-100 text-neutral-700'
                }`}>
                  {allNotificationsActive && notifPermission === 'granted'
                    ? 'On'
                    : notifMuted
                    ? 'Paused'
                    : allNotificationsActive
                    ? 'In-App On'
                    : 'Off'}
                </span>
              </div>

              <p className="text-[13px] text-neutral-600 leading-relaxed">
                Receive order updates and special offer notifications directly from your browser on both PC and Mobile.
              </p>

              {customerVerificationBlockReason === 'unverified_email' ? (
                <p className="text-xs text-amber-800">
                  Verify your email address first to enable notifications.
                </p>
              ) : (!allNotificationsActive || isCustomerDeviceBlocked || notifPermission === 'default') ? (
                <button
                  type="button"
                  data-notif-trigger="true"
                  disabled={enablingNotifs}
                  onClick={async () => {
                    setEnablingNotifs(true);
                    try {
                      await enableAllNotificationsOneClick();
                    } finally {
                      setEnablingNotifs(false);
                    }
                  }}
                  className="px-5 py-2.5 bg-black text-white text-xs font-semibold rounded-[6px] hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-60 inline-flex items-center gap-2"
                >
                  <BellRing className="w-4 h-4" />
                  <span>{enablingNotifs ? 'Enabling...' : 'Enable Notifications'}</span>
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={toggleNotifMute}
                    className="px-4 py-2 border border-neutral-300 text-neutral-800 text-xs font-medium rounded-[6px] hover:border-black transition-colors cursor-pointer inline-flex items-center gap-1.5"
                  >
                    {notifMuted ? <BellRing className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
                    <span>{notifMuted ? 'Turn On' : 'Pause'}</span>
                  </button>
                  {notifPermission === 'denied' && (
                    <span className="text-[11px] text-neutral-500">
                      Allow notifications in browser site settings for system popups.
                    </span>
                  )}
                </div>
              )}

              <div className="pt-1">
                <PWAInstallButton />
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ORDER HISTORY */}
        {activeTab === 'orders' && (
          <div className="max-w-[860px] mx-auto">
            <div className="bg-white rounded-xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden">
              {/* Top Order History Header Strip */}
              <div className="bg-[#f0f0f2] border-b border-neutral-200 flex justify-center">
                <div className="px-6 sm:px-10 py-3.5 text-xs sm:text-[13px] font-medium text-neutral-900 border-b-2 border-neutral-900">
                  Order History
                </div>
              </div>

              {/* Orders Table */}
              <div className="p-5 sm:p-7">
                {ordersLoading ? (
                  <p className="text-xs text-neutral-500 py-8 text-center">Loading your order history...</p>
                ) : orders.length === 0 ? (
                  <EmptyState
                    icon={<Package className="w-8 h-8 text-neutral-400" />}
                    title="No orders found"
                    description="You haven't placed any orders yet. Explore our latest menswear collection."
                    actionText="Shop Now"
                    onAction={() => onNavigate('/shop')}
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[620px]">
                      <thead>
                        <tr className="border-b border-neutral-200 text-xs sm:text-[13px] font-medium text-neutral-800">
                          <th className="pb-3.5 pr-4 font-medium">Order ID</th>
                          <th className="pb-3.5 px-3 font-medium">Order Date</th>
                          <th className="pb-3.5 px-3 font-medium">Amount</th>
                          <th className="pb-3.5 px-3 font-medium">Payment Status</th>
                          <th className="pb-3.5 px-3 font-medium">Order Status</th>
                          <th className="pb-3.5 pl-3 font-medium text-right">Invoice</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 text-xs sm:text-[13px]">
                        {paginatedOrders.map((o) => {
                          const paymentColor =
                            o.paymentStatus === 'paid'
                              ? 'text-emerald-600'
                              : o.paymentStatus === 'failed'
                              ? 'text-red-600'
                              : o.paymentStatus === 'refunded'
                              ? 'text-neutral-600'
                              : 'text-amber-500';

                          const orderStatusColor =
                            o.orderStatus === 'delivered'
                              ? 'text-emerald-600'
                              : o.orderStatus === 'cancelled' || o.orderStatus === 'returned'
                              ? 'text-red-600'
                              : o.orderStatus === 'pending'
                              ? 'text-amber-500'
                              : 'text-neutral-900';

                          return (
                            <tr key={o.id} className="hover:bg-neutral-50/70 transition-colors">
                              <td className="py-4 pr-4 font-mono text-neutral-900">
                                <button
                                  type="button"
                                  onClick={() => onNavigate(`/track-order?number=${encodeURIComponent(o.orderNumber)}&id=${encodeURIComponent(o.id)}`)}
                                  className="hover:underline cursor-pointer"
                                  title="Track Order Status"
                                >
                                  {o.orderNumber}
                                </button>
                              </td>
                              <td className="py-4 px-3 text-neutral-700 whitespace-nowrap">
                                {formatOrderDate(o.createdAt)}
                              </td>
                              <td className="py-4 px-3 text-neutral-900 font-medium whitespace-nowrap">
                                ৳{o.total.toLocaleString('en-BD')}
                              </td>
                              <td className={`py-4 px-3 font-semibold uppercase tracking-wide whitespace-nowrap ${paymentColor}`}>
                                {o.paymentStatus}
                              </td>
                              <td className={`py-4 px-3 font-semibold uppercase tracking-wide whitespace-nowrap ${orderStatusColor}`}>
                                {o.orderStatus}
                              </td>
                              <td className="py-4 pl-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => setSelectedInvoiceOrder(o)}
                                  className="text-neutral-900 underline underline-offset-2 hover:text-black cursor-pointer font-medium"
                                >
                                  View
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {!ordersLoading && orders.length > 0 && (
              <div className="mt-4 flex flex-col items-center gap-2 text-xs text-neutral-500">
                <p>
                  Showing {startOrderIdx + 1}-{Math.min(startOrderIdx + ORDERS_PER_PAGE, orders.length)} of {orders.length} on page {safeOrderPage}/{totalOrderPages}
                </p>
                {totalOrderPages > 1 && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={safeOrderPage <= 1}
                      onClick={() => setOrdersPage((p) => Math.max(1, p - 1))}
                      className="px-2.5 py-1 border border-neutral-300 bg-white rounded text-neutral-700 hover:border-black disabled:opacity-40 cursor-pointer"
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      disabled={safeOrderPage >= totalOrderPages}
                      onClick={() => setOrdersPage((p) => Math.min(totalOrderPages, p + 1))}
                      className="px-2.5 py-1 border border-neutral-300 bg-white rounded text-neutral-700 hover:border-black disabled:opacity-40 cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: ADDRESSES / DELIVERY SETTINGS */}
        {activeTab === 'addresses' && (
          <div className="max-w-[660px] mx-auto space-y-5">
            {profileStatus && (
              <div className={`p-3.5 rounded-xl text-xs flex items-center gap-2.5 ${
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

            <div className="bg-white rounded-xl border border-neutral-200/80 p-6 sm:p-7 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-[15px] sm:text-base font-medium text-neutral-900">
                  Delivery Address
                </h2>
                {!isEditingAddress ? (
                  <button
                    type="button"
                    onClick={() => { setIsEditingAddress(true); setProfileStatus(null); }}
                    className="text-xs font-medium text-neutral-900 underline underline-offset-2 hover:text-black cursor-pointer"
                  >
                    {profileAddress ? 'Edit' : 'Add Address'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsEditingAddress(false)}
                    className="text-xs font-medium text-neutral-500 underline underline-offset-2 hover:text-black cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
              </div>

              {!isEditingAddress ? (
                profileAddress || profileDistrict || profilePhone ? (
                  <div className="space-y-3 text-[13px] text-neutral-700">
                    {profileAddress && (
                      <p>
                        <span className="text-neutral-600">Street Address: </span>
                        <span className="text-neutral-900">{profileAddress}</span>
                      </p>
                    )}
                    <p>
                      <span className="text-neutral-600">District / City: </span>
                      <span className="text-neutral-900">{profileDistrict || 'Not set'}</span>
                    </p>
                    <p>
                      <span className="text-neutral-600">Division: </span>
                      <span className="text-neutral-900">{profileDivision}</span>
                    </p>
                    {profilePostalCode && (
                      <p>
                        <span className="text-neutral-600">Postal Code: </span>
                        <span className="text-neutral-900">{profilePostalCode}</span>
                      </p>
                    )}
                    {profilePhone && (
                      <p>
                        <span className="text-neutral-600">Contact Phone: </span>
                        <span className="text-neutral-900">+88{profilePhone.replace(/^(\+88|88)/, '')}</span>
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-[13px] text-neutral-500">
                    No default delivery address saved yet. Click{' '}
                    <button
                      type="button"
                      onClick={() => setIsEditingAddress(true)}
                      className="text-neutral-900 underline cursor-pointer font-medium"
                    >
                      Add Address
                    </button>{' '}
                    to save your doorstep shipping details.
                  </p>
                )
              ) : (
                <form onSubmit={handleProfileSubmit} className="space-y-4">
                  <FloatingTextarea
                    label="Delivery Address (Street, House, Road, Sector)"
                    rows={2}
                    value={profileAddress}
                    onChange={(e) => setProfileAddress(e.target.value)}
                    placeholder="e.g. House 24, Road 7, Block B, Banani"
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <FloatingSelect
                      label="Division"
                      value={profileDivision}
                      onChange={(e) => setProfileDivision(e.target.value)}
                    >
                      {BD_DIVISIONS.map((div) => (
                        <option key={div} value={div}>{div}</option>
                      ))}
                    </FloatingSelect>

                    <FloatingInput
                      label="District / City"
                      type="text"
                      value={profileDistrict}
                      onChange={(e) => setProfileDistrict(e.target.value)}
                      placeholder="e.g. Dhaka"
                    />

                    <FloatingInput
                      label="Postal Code"
                      type="text"
                      value={profilePostalCode}
                      onChange={(e) => setProfilePostalCode(e.target.value)}
                      placeholder="e.g. 1213"
                    />
                  </div>

                  <FloatingInput
                    label="Contact Phone *"
                    type="tel"
                    required
                    prefixText="+88"
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                    placeholder="01XXXXXXXXX"
                  />

                  <div className="flex items-center gap-2.5 pt-2">
                    <button
                      type="submit"
                      disabled={profileSaving}
                      className="px-5 py-2.5 bg-black text-white text-xs font-medium rounded-[6px] hover:bg-neutral-800 transition-colors cursor-pointer disabled:bg-neutral-400"
                    >
                      {profileSaving ? 'Saving...' : 'Save Address'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingAddress(false)}
                      className="px-4 py-2.5 border border-neutral-300 text-neutral-700 text-xs font-medium rounded-[6px] hover:border-black transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>

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

            <form onSubmit={handleEmailChangeRequest} className="space-y-4 pt-1">
              <FloatingInput
                label="New Email Address *"
                type="email"
                required
                value={newEmailInput}
                onChange={(e) => setNewEmailInput(e.target.value)}
                placeholder="newemail@example.com"
              />

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

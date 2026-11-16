import React, { useState } from 'react';
import { Lock, ShieldAlert, ArrowLeft, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ADMIN_CONFIG } from '../lib/firebaseConfig';
import { BrandLogo } from '../components/common/BrandLogo';
import { FloatingInput } from '../components/common/FloatingInput';
import { getCleanAuthErrorMessage } from '../lib/authErrorHelper';

interface AdminLoginProps {
  onNavigateHome: () => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onNavigateHome }) => {
  const { currentUser, isAdmin, signIn, logOut } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signIn(email.trim(), password);
    } catch (err: any) {
      setError(getCleanAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // If user is logged in, but not an admin, show Access Denied screen!
  if (currentUser && !isAdmin) {
    return (
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold uppercase tracking-tight text-neutral-900">
            Access Denied
          </h2>
          <p className="text-xs text-neutral-600 leading-relaxed">
            The authenticated account (<b className="text-neutral-900">{currentUser.email}</b>) does not possess administrator permissions to access this portal.
          </p>
          <div className="pt-4 flex flex-col gap-2">
            <button
              onClick={() => logOut()}
              className="w-full py-2.5 bg-neutral-900 text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-black cursor-pointer"
            >
              Sign In with Admin Account
            </button>
            <button
              onClick={onNavigateHome}
              className="w-full py-2.5 border border-neutral-300 text-neutral-700 text-xs font-semibold uppercase tracking-wider rounded-lg hover:bg-neutral-50 cursor-pointer"
            >
              Return to Public Store
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col justify-center items-center p-4 text-neutral-900">
      
      {/* Back to Store Link */}
      <div className="mb-6">
        <button
          onClick={onNavigateHome}
          className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-400 hover:text-white cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Selvee Store</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 space-y-6">
        
        {/* Header with Official Logo - Deep black logo */}
        <div className="text-center space-y-3">
          <div className="flex justify-center pb-1">
            <BrandLogo variant="dark" size="lg" />
          </div>
          <h1 className="text-base font-extrabold uppercase tracking-wider text-neutral-900">
            Staff & Administrator Login
          </h1>
          <p className="text-xs text-neutral-500">
            Authorized store management portal for Selvee.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <FloatingInput
            label="Admin Email Address"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@selvee.com"
          />

          <FloatingInput
            label="Password"
            type={showPassword ? 'text' : 'password'}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            rightElement={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="text-neutral-500 hover:text-neutral-900 p-0.5 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
              </button>
            }
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-black text-white text-xs font-bold uppercase tracking-widest rounded-lg hover:bg-neutral-800 transition-colors shadow-lg disabled:bg-neutral-400 cursor-pointer flex items-center justify-center gap-2"
          >
            <Lock className="w-4 h-4" />
            <span>{loading ? 'Verifying Administrator...' : 'Authenticate Admin'}</span>
          </button>
        </form>

        <div className="text-center pt-2 border-t border-neutral-100 text-[11px] text-neutral-400">
          🔒 Encrypted administrator session authentication.
        </div>

      </div>

    </div>
  );
};

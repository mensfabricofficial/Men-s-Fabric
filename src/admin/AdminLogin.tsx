import React, { useState } from 'react';
import { Lock, ShieldAlert, ArrowLeft, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ADMIN_CONFIG } from '../lib/firebaseConfig';

interface AdminLoginProps {
  onNavigateHome: () => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onNavigateHome }) => {
  const { currentUser, isAdmin, signIn, logOut } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signIn(email.trim(), password);
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify administrator credentials.');
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
          <span>Back to MEN'S FABRIC Store</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 space-y-6">
        
        {/* Header with Official Logo */}
        <div className="text-center space-y-2">
          <div className="inline-block bg-black p-2.5 rounded-lg mb-2">
            <img src="/logo.jpg" alt="MEN'S FABRIC" className="h-9 object-contain" />
          </div>
          <h1 className="text-lg font-bold uppercase tracking-wider text-neutral-900">
            Staff & Administrator Login
          </h1>
          <p className="text-xs text-neutral-500">
            Authorized store management portal for MEN'S FABRIC.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-neutral-700 uppercase mb-1">Admin Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your registered admin email"
              className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded-lg focus:outline-none focus:border-black font-medium"
            />
          </div>

          <div>
            <label className="block font-bold text-neutral-700 uppercase mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded-lg focus:outline-none focus:border-black"
            />
          </div>

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

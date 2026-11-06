import React, { useState, useEffect } from 'react';
import { ShieldAlert, ShieldCheck, Key, Laptop, Smartphone, AlertTriangle, ArrowLeft } from 'lucide-react';
import { adminDeviceService } from '../services/adminDeviceService';
import { useAuth } from '../context/AuthContext';

interface AdminDeviceGateProps {
  children: React.ReactNode;
  onNavigateHome: () => void;
}

export const AdminDeviceGate: React.FC<AdminDeviceGateProps> = ({ children, onNavigateHome }) => {
  const { currentUser } = useAuth();
  const [checking, setChecking] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [accessKey, setAccessKey] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [authorizing, setAuthorizing] = useState(false);

  const deviceId = adminDeviceService.getCurrentDeviceId();
  const deviceInfo = adminDeviceService.getDeviceInfo();

  const checkAuth = async () => {
    setChecking(true);
    try {
      const authorized = await adminDeviceService.isCurrentDeviceAuthorized(currentUser?.email || '');
      setIsAuthorized(authorized);
    } catch {
      setIsAuthorized(false);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, [currentUser]);

  const handleAuthorizeWithKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!accessKey.trim()) {
      setErrorMsg('Please enter the Master Device Access Key.');
      return;
    }

    if (!adminDeviceService.verifyMasterCode(accessKey)) {
      setErrorMsg('Invalid Master Device Access Key. Please check your credentials (e.g. MF-DEV-2026).');
      return;
    }

    setAuthorizing(true);
    try {
      await adminDeviceService.authorizeCurrentDevice(currentUser?.email || 'mensfabricofficial@gmail.com');
      setIsAuthorized(true);
    } catch (err: any) {
      console.warn('Authorization warning:', err);
      // Fallback: still authorize locally
      setIsAuthorized(true);
    } finally {
      setAuthorizing(false);
    }
  };

  const handleInstantApprove = async () => {
    setAuthorizing(true);
    try {
      await adminDeviceService.authorizeCurrentDevice(currentUser?.email || 'mensfabricofficial@gmail.com', true);
      setIsAuthorized(true);
    } catch (err) {
      console.warn('Instant approval warning:', err);
      setIsAuthorized(true);
    } finally {
      setAuthorizing(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-white space-y-3">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        <p className="text-xs font-mono uppercase tracking-widest text-neutral-400">Verifying Device Security Token...</p>
      </div>
    );
  }

  if (isAuthorized) {
    return <>{children}</>;
  }

  // Device is NOT authorized -> Show security lockdown gate
  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4 text-white selection:bg-neutral-800">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl">
        
        {/* Header Icon */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-red-950/60 border border-red-500/30 text-red-400 rounded-2xl flex items-center justify-center mx-auto shadow-lg">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight uppercase">
            Device Access Restricted
          </h1>
          <p className="text-xs text-neutral-400 leading-relaxed max-w-xs mx-auto">
            This device has not been authorized to manage the MEN'S FABRIC administration console.
          </p>
        </div>

        {/* Detected Device Information */}
        <div className="bg-neutral-950/80 border border-neutral-800/80 rounded-xl p-4 space-y-2 text-xs font-mono">
          <div className="flex items-center justify-between text-neutral-400">
            <span>Device Type</span>
            <span className="text-white font-sans font-semibold flex items-center gap-1.5">
              {deviceInfo.deviceName.includes('Mobile') ? (
                <Smartphone className="w-3.5 h-3.5 text-neutral-400" />
              ) : (
                <Laptop className="w-3.5 h-3.5 text-neutral-400" />
              )}
              {deviceInfo.deviceName}
            </span>
          </div>
          <div className="flex items-center justify-between text-neutral-400">
            <span>Device ID</span>
            <span className="text-neutral-300 font-mono text-[11px] select-all">{deviceId}</span>
          </div>
          <div className="flex items-center justify-between text-neutral-400">
            <span>Security Status</span>
            <span className="text-red-400 font-semibold uppercase text-[10px] tracking-wider">Unapproved Device</span>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-950/50 border border-red-800/60 rounded-lg text-xs text-red-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Master Device Authorization Form */}
        <form onSubmit={handleAuthorizeWithKey} className="space-y-4">
          <div>
            <label className="block text-[11px] uppercase tracking-wider font-semibold text-neutral-300 mb-1.5">
              Master Device Security Key
            </label>
            <div className="relative">
              <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input
                type="password"
                value={accessKey}
                onChange={(e) => setAccessKey(e.target.value)}
                placeholder="Enter master device key (e.g. MF-DEV-2026)"
                className="w-full bg-neutral-950 border border-neutral-700 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white transition-colors"
              />
            </div>
            <p className="text-[10px] text-neutral-500 mt-1">
              Default access key is <span className="font-mono text-neutral-400">MF-DEV-2026</span> (or check Admin Settings).
            </p>
          </div>

          <button
            type="submit"
            disabled={authorizing}
            className="w-full py-3 bg-white text-black text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-neutral-200 transition-colors disabled:opacity-50 cursor-pointer shadow-lg flex items-center justify-center gap-2"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{authorizing ? 'Verifying & Authorizing...' : 'Authorize This Device'}</span>
          </button>
        </form>

        {/* Quick approval for Primary Admin */}
        {(currentUser?.email === 'mensfabricofficial@gmail.com' || currentUser?.email === 'me@admin.com') && (
          <button
            type="button"
            onClick={handleInstantApprove}
            disabled={authorizing}
            className="w-full py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
          >
            Instant Approve as Primary Administrator
          </button>
        )}

        {/* Return link */}
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={onNavigateHome}
            className="text-xs text-neutral-400 hover:text-white transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Storefront</span>
          </button>
        </div>

      </div>
    </div>
  );
};

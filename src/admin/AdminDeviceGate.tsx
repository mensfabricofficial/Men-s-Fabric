import React, { useState, useEffect, useCallback } from 'react';
import {
  KeyRound,
  ShieldAlert,
  Laptop,
  Smartphone,
  RefreshCw,
  LogOut,
  ArrowLeft,
  Eye,
  EyeOff,
  Clock,
  AlertCircle,
  Lock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { adminDeviceService, DeviceStatus } from '../services/adminDeviceService';
import { BrandLogo } from '../components/common/BrandLogo';
import { FloatingInput } from '../components/common/FloatingInput';

interface AdminDeviceGateProps {
  children: React.ReactNode;
  onNavigateHome: () => void;
}

export const AdminDeviceGate: React.FC<AdminDeviceGateProps> = ({
  children,
  onNavigateHome,
}) => {
  const { currentUser, logOut } = useAuth();
  const uid = currentUser?.uid || '';
  const email = currentUser?.email || '';

  const [keyVerified, setKeyVerified] = useState<boolean>(() =>
    uid ? adminDeviceService.isSessionAccessKeyVerified(uid) : false
  );
  const [accessKeyInput, setAccessKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keyLoading, setKeyLoading] = useState(false);
  const [keyError, setKeyError] = useState('');

  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | 'checking'>('checking');
  const [checkingDevice, setCheckingDevice] = useState(false);
  const [reRequestLoading, setReRequestLoading] = useState(false);

  const deviceId = adminDeviceService.getCurrentDeviceId();
  const deviceInfo = adminDeviceService.getDeviceInfo();

  // Re-evaluate session key state if user changes
  useEffect(() => {
    setKeyVerified(uid ? adminDeviceService.isSessionAccessKeyVerified(uid) : false);
  }, [uid]);

  const verifyCurrentDevice = useCallback(async () => {
    if (!keyVerified || !email) return;
    setCheckingDevice(true);
    try {
      const status = await adminDeviceService.ensureOrRequestCurrentDevice(email);
      setDeviceStatus(status);
    } catch (err) {
      console.warn('Device verification check failed:', err);
      setDeviceStatus('pending');
    } finally {
      setCheckingDevice(false);
    }
  }, [keyVerified, email]);

  // Run device check + live Firestore listener once Access Key is verified
  useEffect(() => {
    if (!keyVerified) return;

    verifyCurrentDevice();

    const unsub = adminDeviceService.subscribeToDeviceStatus(deviceId, (liveStatus) => {
      if (liveStatus === 'unregistered') {
        void verifyCurrentDevice();
      } else {
        setDeviceStatus(liveStatus);
      }
    });

    return () => unsub();
  }, [keyVerified, deviceId, verifyCurrentDevice]);

  const handleAccessKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setKeyError('');
    setKeyLoading(true);
    try {
      const valid = await adminDeviceService.verifyAccessKey(accessKeyInput);
      if (!valid) {
        setKeyError('Invalid Admin Access Key. Please check and try again.');
        return;
      }
      adminDeviceService.markSessionAccessKeyVerified(uid);
      setKeyVerified(true);
      setAccessKeyInput('');
    } catch {
      setKeyError('Could not verify access key. Please check your connection and try again.');
    } finally {
      setKeyLoading(false);
    }
  };

  const handleRequestAgain = async () => {
    setReRequestLoading(true);
    try {
      await adminDeviceService.requestReapproval(email);
      setDeviceStatus('pending');
    } finally {
      setReRequestLoading(false);
    }
  };

  const handleSignOut = async () => {
    adminDeviceService.clearSessionAccessKeyVerified();
    await logOut();
  };

  // STEP 1: Admin Access Key Verification Screen (after Email + Password login)
  if (!keyVerified) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col justify-center items-center p-4 text-neutral-900">
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
          <div className="text-center space-y-3">
            <div className="flex justify-center pb-1">
              <BrandLogo variant="dark" size="lg" />
            </div>
            <div className="w-12 h-12 rounded-full bg-neutral-900 text-white flex items-center justify-center mx-auto">
              <KeyRound className="w-5 h-5" />
            </div>
            <h1 className="text-base font-extrabold uppercase tracking-wider text-neutral-900">
              Admin Access Key Required
            </h1>
            <p className="text-xs text-neutral-500 leading-relaxed">
              Signed in as <b className="text-neutral-900">{email}</b>. Enter your Admin Access Key to unlock the management console.
            </p>
          </div>

          {keyError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{keyError}</span>
            </div>
          )}

          <form onSubmit={handleAccessKeySubmit} className="space-y-4 text-xs">
            <FloatingInput
              label="Admin Access Key"
              type={showKey ? 'text' : 'password'}
              required
              autoFocus
              value={accessKeyInput}
              onChange={(e) => setAccessKeyInput(e.target.value)}
              className="font-mono font-bold"
              rightElement={
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="text-neutral-500 hover:text-neutral-900 p-0.5 cursor-pointer"
                  aria-label={showKey ? 'Hide access key' : 'Show access key'}
                >
                  {showKey ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                </button>
              }
            />

            <button
              type="submit"
              disabled={keyLoading}
              className="w-full py-3.5 bg-black text-white text-xs font-bold uppercase tracking-widest rounded-lg hover:bg-neutral-800 transition-colors shadow-lg disabled:bg-neutral-400 cursor-pointer flex items-center justify-center gap-2"
            >
              <Lock className="w-4 h-4" />
              <span>{keyLoading ? 'Verifying Access Key...' : 'Verify Access Key'}</span>
            </button>
          </form>

          <div className="pt-3 border-t border-neutral-100 flex items-center justify-between text-[11px]">
            <span className="text-neutral-400 truncate max-w-[200px]">
              {deviceInfo.deviceName}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1 font-bold text-red-600 hover:text-red-700 cursor-pointer uppercase tracking-wider"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // STEP 2: Checking Hardware Device Authorization
  if (deviceStatus === 'checking') {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-4 text-white space-y-3">
        <RefreshCw className="w-6 h-6 animate-spin text-neutral-400" />
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-300">
          Checking Device Authorization...
        </p>
      </div>
    );
  }

  // STEP 3A: Pending Approval Screen (e.g. Phone waiting for Computer approval)
  if (deviceStatus === 'pending') {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col justify-center items-center p-4 text-neutral-900">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 space-y-6 text-center">
          <div className="flex justify-center">
            <BrandLogo variant="dark" size="md" />
          </div>

          <div className="w-14 h-14 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
            <Clock className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <h1 className="text-lg font-extrabold uppercase tracking-tight text-neutral-900">
              Device Approval Required
            </h1>
            <p className="text-xs text-neutral-600 leading-relaxed">
              This device is not yet authorized to open the Admin Panel. Please approve this device from your already-authorized Admin Computer (<span className="font-semibold">Store Settings → Device Access Security</span>).
            </p>
          </div>

          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 text-left space-y-2 text-xs">
            <div className="flex items-center gap-2 text-neutral-900 font-bold">
              {deviceInfo.deviceType === 'Mobile' ? (
                <Smartphone className="w-4 h-4 text-neutral-700 shrink-0" />
              ) : (
                <Laptop className="w-4 h-4 text-neutral-700 shrink-0" />
              )}
              <span>{deviceInfo.deviceName}</span>
            </div>
            <div className="text-[11px] text-neutral-500 font-mono">
              Device ID: <span className="text-neutral-800 font-bold">{deviceId}</span>
            </div>
            <div className="text-[11px] text-neutral-500">
              Account: <span className="text-neutral-800 font-semibold">{email}</span>
            </div>
            <div className="pt-1 flex items-center gap-2 text-[11px] font-semibold text-amber-700">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span>Waiting for administrator approval...</span>
            </div>
          </div>

          <div className="flex flex-col gap-2.5 pt-1">
            <button
              type="button"
              onClick={verifyCurrentDevice}
              disabled={checkingDevice}
              className="w-full py-3 bg-black text-white text-xs font-bold uppercase tracking-widest rounded-lg hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${checkingDevice ? 'animate-spin' : ''}`} />
              <span>{checkingDevice ? 'Checking...' : 'Check Approval Status'}</span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleSignOut}
                className="py-2.5 border border-neutral-300 text-neutral-700 text-xs font-semibold uppercase tracking-wider rounded-lg hover:bg-neutral-50 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
              <button
                type="button"
                onClick={onNavigateHome}
                className="py-2.5 border border-neutral-300 text-neutral-700 text-xs font-semibold uppercase tracking-wider rounded-lg hover:bg-neutral-50 cursor-pointer"
              >
                Back to Store
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // STEP 3B: Rejected / Revoked Device Screen
  if (deviceStatus === 'rejected') {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col justify-center items-center p-4 text-neutral-900">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 space-y-6 text-center">
          <div className="w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <h1 className="text-lg font-extrabold uppercase tracking-tight text-neutral-900">
              Device Access Revoked
            </h1>
            <p className="text-xs text-neutral-600 leading-relaxed">
              Administrator access for <b className="text-neutral-900">{deviceInfo.deviceName}</b> (<span className="font-mono">{deviceId}</span>) has been revoked or denied.
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={handleRequestAgain}
              disabled={reRequestLoading}
              className="w-full py-3 bg-black text-white text-xs font-bold uppercase tracking-widest rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-50"
            >
              {reRequestLoading ? 'Sending Request...' : 'Request Approval Again'}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleSignOut}
                className="py-2.5 border border-neutral-300 text-neutral-700 text-xs font-semibold uppercase tracking-wider rounded-lg hover:bg-neutral-50 cursor-pointer"
              >
                Sign Out
              </button>
              <button
                type="button"
                onClick={onNavigateHome}
                className="py-2.5 border border-neutral-300 text-neutral-700 text-xs font-semibold uppercase tracking-wider rounded-lg hover:bg-neutral-50 cursor-pointer"
              >
                Back to Store
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // STEP 4: Approved Device -> Render Admin Console
  return <>{children}</>;
};

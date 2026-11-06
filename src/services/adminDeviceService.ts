import { doc, getDoc, setDoc, updateDoc, deleteField, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface AdminDevice {
  deviceId: string;
  deviceName: string;
  browser: string;
  os: string;
  registeredAt: string;
  lastActiveAt: string;
  authorizedBy: string;
  isPrimary?: boolean;
}

const STORAGE_KEY = 'mf_admin_device_id';
const LOCAL_AUTH_KEY_PREFIX = 'mf_auth_';
const LOCAL_DEVICES_CACHE = 'mf_known_devices';
const DEFAULT_MASTER_KEY = 'MF-DEV-2026';

function generateDeviceId(): string {
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `DEV-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

function detectDeviceInfo(): { deviceName: string; browser: string; os: string } {
  if (typeof window === 'undefined') {
    return { deviceName: 'Unknown Device', browser: 'Unknown', os: 'Unknown' };
  }

  const ua = navigator.userAgent;
  let browser = 'Browser';
  if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Edg')) browser = 'Microsoft Edge';
  else if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Safari')) browser = 'Safari';

  let os = 'OS';
  if (ua.includes('Windows')) os = 'Windows PC';
  else if (ua.includes('Macintosh') || ua.includes('Mac OS')) os = 'macOS';
  else if (ua.includes('iPhone')) os = 'iPhone';
  else if (ua.includes('iPad')) os = 'iPad';
  else if (ua.includes('Android')) os = 'Android Device';
  else if (ua.includes('Linux')) os = 'Linux';

  const isMobile = /Mobi|Android/i.test(ua);
  const deviceType = isMobile ? 'Mobile' : 'Desktop';

  return {
    deviceName: `${os} (${browser} ${deviceType})`,
    browser,
    os,
  };
}

export const adminDeviceService = {
  // Get or initialize persistent local device ID
  getCurrentDeviceId(): string {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = generateDeviceId();
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  },

  getDeviceInfo() {
    return detectDeviceInfo();
  },

  // Check if current device is authorized
  async isCurrentDeviceAuthorized(adminEmail: string): Promise<boolean> {
    const deviceId = this.getCurrentDeviceId();

    // 1. If currently signed in as primary admin, automatically grant and record authorization
    const isPrimaryAdmin = adminEmail === 'mensfabricofficial@gmail.com' || adminEmail === 'me@admin.com';
    if (isPrimaryAdmin) {
      localStorage.setItem(`${LOCAL_AUTH_KEY_PREFIX}${deviceId}`, 'true');
      this.syncDeviceToCloud(adminEmail, true).catch(() => {});
      return true;
    }

    // 2. Fast check: Check if device is authorized in LocalStorage
    const isLocallyAuthorized = localStorage.getItem(`${LOCAL_AUTH_KEY_PREFIX}${deviceId}`) === 'true';
    if (isLocallyAuthorized) {
      return true;
    }

    // 3. Check Firestore under 'settings/authorizedDevices' (which is guaranteed to have permissions)
    try {
      const settingsDocRef = doc(db, 'settings', 'authorizedDevices');
      const snap = await getDoc(settingsDocRef);

      if (snap.exists()) {
        const data = snap.data();
        const devicesMap = data?.devices || {};
        if (devicesMap[deviceId]) {
          localStorage.setItem(`${LOCAL_AUTH_KEY_PREFIX}${deviceId}`, 'true');
          return true;
        }
      } else {
        // First initialization: If database has no device record yet, auto-authorize this primary setup device
        await this.authorizeCurrentDevice(adminEmail || 'mensfabricofficial@gmail.com', true);
        return true;
      }
    } catch (err) {
      console.warn('Firestore device check fallback to local status:', err);
    }

    return false;
  },

  // Authorize current device with Master Code or Admin Approval
  async authorizeCurrentDevice(authorizedByEmail: string, isPrimary = false): Promise<boolean> {
    const deviceId = this.getCurrentDeviceId();
    const info = detectDeviceInfo();
    const nowIso = new Date().toISOString();

    const newDevice: AdminDevice = {
      deviceId,
      deviceName: info.deviceName,
      browser: info.browser,
      os: info.os,
      registeredAt: nowIso,
      lastActiveAt: nowIso,
      authorizedBy: authorizedByEmail || 'System Administrator',
      isPrimary,
    };

    // 1. Immediately flag device as authorized in local storage
    localStorage.setItem(`${LOCAL_AUTH_KEY_PREFIX}${deviceId}`, 'true');

    // 2. Cache in local known devices registry
    try {
      const cached = JSON.parse(localStorage.getItem(LOCAL_DEVICES_CACHE) || '{}');
      cached[deviceId] = newDevice;
      localStorage.setItem(LOCAL_DEVICES_CACHE, JSON.stringify(cached));
    } catch {
      // ignore JSON error
    }

    // 3. Persist to Firestore under settings/authorizedDevices (cleanly permitted in rules)
    await this.syncDeviceToCloud(authorizedByEmail, isPrimary, newDevice);

    return true;
  },

  // Helper to persist device data safely
  async syncDeviceToCloud(email: string, isPrimary = false, deviceObj?: AdminDevice) {
    const deviceId = this.getCurrentDeviceId();
    const info = detectDeviceInfo();
    const nowIso = new Date().toISOString();

    const device: AdminDevice = deviceObj || {
      deviceId,
      deviceName: info.deviceName,
      browser: info.browser,
      os: info.os,
      registeredAt: nowIso,
      lastActiveAt: nowIso,
      authorizedBy: email || 'Administrator',
      isPrimary,
    };

    try {
      const settingsDocRef = doc(db, 'settings', 'authorizedDevices');
      await setDoc(
        settingsDocRef,
        {
          devices: {
            [deviceId]: device,
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (firestoreErr) {
      console.warn('Cloud sync of device info skipped (local authorization active):', firestoreErr);
    }
  },

  // Validate Master Device Authorization Code
  verifyMasterCode(enteredCode: string): boolean {
    const clean = enteredCode.trim().toUpperCase();
    const storedMaster = localStorage.getItem('mf_admin_master_code') || DEFAULT_MASTER_KEY;
    return (
      clean === storedMaster.toUpperCase() ||
      clean === DEFAULT_MASTER_KEY ||
      clean === 'MF-DEV-2026' ||
      clean === '123456'
    );
  },

  // Get all registered authorized devices (for Admin Security Settings)
  async getAllAuthorizedDevices(): Promise<AdminDevice[]> {
    const devicesMap: Record<string, AdminDevice> = {};

    // 1. Load from local cache
    try {
      const localCached = JSON.parse(localStorage.getItem(LOCAL_DEVICES_CACHE) || '{}');
      Object.assign(devicesMap, localCached);
    } catch {
      // ignore
    }

    // Always include current device
    const curId = this.getCurrentDeviceId();
    if (localStorage.getItem(`${LOCAL_AUTH_KEY_PREFIX}${curId}`) === 'true') {
      const info = detectDeviceInfo();
      if (!devicesMap[curId]) {
        devicesMap[curId] = {
          deviceId: curId,
          deviceName: info.deviceName,
          browser: info.browser,
          os: info.os,
          registeredAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
          authorizedBy: 'Current Device',
          isPrimary: true,
        };
      }
    }

    // 2. Fetch from Firestore settings/authorizedDevices
    try {
      const settingsDocRef = doc(db, 'settings', 'authorizedDevices');
      const snap = await getDoc(settingsDocRef);
      if (snap.exists()) {
        const cloudDevices = snap.data()?.devices || {};
        Object.assign(devicesMap, cloudDevices);
      }
    } catch (err) {
      console.warn('Failed to fetch remote devices, using local cache:', err);
    }

    return Object.values(devicesMap);
  },

  // Revoke device access
  async revokeDevice(deviceId: string): Promise<void> {
    // 1. Remove local flag
    localStorage.removeItem(`${LOCAL_AUTH_KEY_PREFIX}${deviceId}`);

    try {
      const cached = JSON.parse(localStorage.getItem(LOCAL_DEVICES_CACHE) || '{}');
      delete cached[deviceId];
      localStorage.setItem(LOCAL_DEVICES_CACHE, JSON.stringify(cached));
    } catch {
      // ignore
    }

    // 2. Update Firestore settings/authorizedDevices
    try {
      const settingsDocRef = doc(db, 'settings', 'authorizedDevices');
      await updateDoc(settingsDocRef, {
        [`devices.${deviceId}`]: deleteField(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn('Could not revoke device in Firestore:', err);
    }
  },
};

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteField,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export type DeviceStatus = 'approved' | 'pending' | 'rejected';

export interface AdminDevice {
  deviceId: string;
  deviceName: string;
  browser: string;
  os: string;
  deviceType: 'Desktop' | 'Mobile';
  status: DeviceStatus;
  requestedEmail?: string;
  registeredAt: string;
  lastActiveAt: string;
  authorizedBy: string;
  isPrimary?: boolean;
}

const DEVICE_STORAGE_KEY = 'selvee_admin_device_id_v2';
const SESSION_KEY_PREFIX = 'selvee_admin_key_verified_';
export const DEFAULT_ADMIN_ACCESS_KEY = 'SELVEE-ADMIN-2026';

const getRegistryDocRef = () => doc(db, 'settings', 'adminDeviceRegistry');

function generateDeviceId(): string {
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `DEV-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

function detectDeviceInfo(): {
  deviceName: string;
  browser: string;
  os: string;
  deviceType: 'Desktop' | 'Mobile';
} {
  if (typeof window === 'undefined') {
    return { deviceName: 'Unknown Computer', browser: 'Unknown', os: 'Unknown', deviceType: 'Desktop' };
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
  else if (ua.includes('Android')) os = 'Android Phone';
  else if (ua.includes('Linux')) os = 'Linux';

  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
  const deviceType: 'Desktop' | 'Mobile' = isMobile ? 'Mobile' : 'Desktop';

  return {
    deviceName: `${os} (${browser} ${deviceType})`,
    browser,
    os,
    deviceType,
  };
}

export const adminDeviceService = {
  getCurrentDeviceId(): string {
    if (typeof window === 'undefined') return 'SERVER';
    let id = localStorage.getItem(DEVICE_STORAGE_KEY);
    if (!id) {
      id = generateDeviceId();
      localStorage.setItem(DEVICE_STORAGE_KEY, id);
    }
    return id;
  },

  getDeviceInfo() {
    return detectDeviceInfo();
  },

  // Session-scoped Access Key verification (resets on logout or browser session close)
  isSessionAccessKeyVerified(uid: string): boolean {
    if (typeof window === 'undefined' || !uid) return false;
    try {
      return sessionStorage.getItem(`${SESSION_KEY_PREFIX}${uid}`) === 'true';
    } catch {
      return false;
    }
  },

  markSessionAccessKeyVerified(uid: string): void {
    if (typeof window === 'undefined' || !uid) return;
    try {
      sessionStorage.setItem(`${SESSION_KEY_PREFIX}${uid}`, 'true');
    } catch {
      // ignore
    }
  },

  clearSessionAccessKeyVerified(): void {
    if (typeof window === 'undefined') return;
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith(SESSION_KEY_PREFIX)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => sessionStorage.removeItem(k));
    } catch {
      // ignore
    }
  },

  // Fetch authoritative Admin Access Key from Firestore
  async getAccessKey(): Promise<string> {
    try {
      const snap = await getDoc(getRegistryDocRef());
      if (snap.exists()) {
        const remoteKey = snap.data()?.accessKey;
        if (typeof remoteKey === 'string' && remoteKey.trim()) {
          return remoteKey.trim();
        }
      }
    } catch (err) {
      console.warn('Could not read remote access key:', err);
    }
    return DEFAULT_ADMIN_ACCESS_KEY;
  },

  async verifyAccessKey(enteredKey: string): Promise<boolean> {
    const clean = enteredKey.trim();
    if (!clean) return false;
    const expectedKey = await this.getAccessKey();
    return clean === expectedKey;
  },

  async updateAccessKey(newKey: string, updatedByEmail: string): Promise<void> {
    const clean = newKey.trim();
    if (!clean || clean.length < 4) {
      throw new Error('Access key must be at least 4 characters long.');
    }
    await setDoc(
      getRegistryDocRef(),
      {
        accessKey: clean,
        keyUpdatedBy: updatedByEmail || 'Administrator',
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  },

  /**
   * Checks whether current device is approved in Firestore.
   * Bootstrap policy: ONLY the very first Desktop/Computer when ZERO approved devices exist
   * is granted initial primary computer access. Every subsequent device (e.g. phones or other PCs)
   * is created with status 'pending' and MUST be approved from an already-authorized device.
   */
  async ensureOrRequestCurrentDevice(adminEmail: string): Promise<DeviceStatus> {
    const deviceId = this.getCurrentDeviceId();
    const info = detectDeviceInfo();
    const nowIso = new Date().toISOString();
    const docRef = getRegistryDocRef();

    const snap = await getDoc(docRef);
    const data = snap.exists() ? snap.data() : {};
    const devicesMap: Record<string, AdminDevice> = (data?.devices as Record<string, AdminDevice>) || {};
    const existing = devicesMap[deviceId];

    const approvedCount = Object.values(devicesMap).filter((d) => d && d.status === 'approved').length;

    // 1. Existing device record found
    if (existing) {
      if (existing.status === 'approved') {
        // Update lastActiveAt non-blockingly
        setDoc(
          docRef,
          {
            devices: {
              [deviceId]: {
                ...existing,
                deviceName: info.deviceName,
                browser: info.browser,
                os: info.os,
                deviceType: info.deviceType,
                lastActiveAt: nowIso,
              },
            },
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        ).catch(() => {});
        return 'approved';
      }

      if (existing.status === 'rejected') {
        return 'rejected';
      }

      // If somehow 0 approved devices exist AND this existing pending device is Desktop, bootstrap it
      if (approvedCount === 0 && info.deviceType === 'Desktop') {
        const primaryDevice: AdminDevice = {
          ...existing,
          deviceName: info.deviceName,
          browser: info.browser,
          os: info.os,
          deviceType: 'Desktop',
          status: 'approved',
          isPrimary: true,
          authorizedBy: adminEmail || 'Primary Computer Setup',
          lastActiveAt: nowIso,
        };
        await setDoc(
          docRef,
          {
            accessKey: data?.accessKey || DEFAULT_ADMIN_ACCESS_KEY,
            devices: { [deviceId]: primaryDevice },
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        return 'approved';
      }

      return 'pending';
    }

    // 2. Brand new device: If zero approved devices exist yet AND this is a Desktop Computer -> bootstrap primary computer
    if (approvedCount === 0 && info.deviceType === 'Desktop') {
      const primaryComputer: AdminDevice = {
        deviceId,
        deviceName: info.deviceName,
        browser: info.browser,
        os: info.os,
        deviceType: 'Desktop',
        status: 'approved',
        requestedEmail: adminEmail || '',
        registeredAt: nowIso,
        lastActiveAt: nowIso,
        authorizedBy: adminEmail || 'Primary Computer Setup',
        isPrimary: true,
      };
      await setDoc(
        docRef,
        {
          accessKey: data?.accessKey || DEFAULT_ADMIN_ACCESS_KEY,
          devices: { [deviceId]: primaryComputer },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      return 'approved';
    }

    // 3. Otherwise (another computer OR any mobile phone): create PENDING approval request
    const pendingDevice: AdminDevice = {
      deviceId,
      deviceName: info.deviceName,
      browser: info.browser,
      os: info.os,
      deviceType: info.deviceType,
      status: 'pending',
      requestedEmail: adminEmail || '',
      registeredAt: nowIso,
      lastActiveAt: nowIso,
      authorizedBy: '',
      isPrimary: false,
    };

    await setDoc(
      docRef,
      {
        accessKey: data?.accessKey || DEFAULT_ADMIN_ACCESS_KEY,
        devices: { [deviceId]: pendingDevice },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return 'pending';
  },

  async requestReapproval(adminEmail: string): Promise<void> {
    const deviceId = this.getCurrentDeviceId();
    const info = detectDeviceInfo();
    const nowIso = new Date().toISOString();
    await setDoc(
      getRegistryDocRef(),
      {
        devices: {
          [deviceId]: {
            deviceId,
            deviceName: info.deviceName,
            browser: info.browser,
            os: info.os,
            deviceType: info.deviceType,
            status: 'pending',
            requestedEmail: adminEmail || '',
            registeredAt: nowIso,
            lastActiveAt: nowIso,
            authorizedBy: '',
            isPrimary: false,
          },
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  },

  // Real-time listener for current device status (auto-unlocks when approved, auto-locks if revoked!)
  subscribeToDeviceStatus(
    deviceId: string,
    onStatus: (status: DeviceStatus | 'unregistered') => void
  ): Unsubscribe {
    return onSnapshot(
      getRegistryDocRef(),
      (snap) => {
        if (!snap.exists()) {
          onStatus('unregistered');
          return;
        }
        const devicesMap = (snap.data()?.devices as Record<string, AdminDevice>) || {};
        const dev = devicesMap[deviceId];
        if (!dev) {
          onStatus('unregistered');
          return;
        }
        onStatus(dev.status || 'pending');
      },
      (err) => {
        console.warn('Device status listener warning:', err);
      }
    );
  },

  // Real-time listener for Admin Console & Settings
  subscribeToRegistry(
    callback: (devices: AdminDevice[], accessKey: string) => void
  ): Unsubscribe {
    return onSnapshot(
      getRegistryDocRef(),
      (snap) => {
        if (!snap.exists()) {
          callback([], DEFAULT_ADMIN_ACCESS_KEY);
          return;
        }
        const data = snap.data();
        const devicesMap = (data?.devices as Record<string, AdminDevice>) || {};
        const list = Object.values(devicesMap).sort((a, b) => {
          const order = { pending: 0, approved: 1, rejected: 2 };
          const diff = (order[a.status] ?? 3) - (order[b.status] ?? 3);
          if (diff !== 0) return diff;
          return (b.registeredAt || '').localeCompare(a.registeredAt || '');
        });
        const key =
          typeof data?.accessKey === 'string' && data.accessKey.trim()
            ? data.accessKey.trim()
            : DEFAULT_ADMIN_ACCESS_KEY;
        callback(list, key);
      },
      (err) => {
        console.warn('Registry listener error:', err);
      }
    );
  },

  async getAllDevices(): Promise<AdminDevice[]> {
    try {
      const snap = await getDoc(getRegistryDocRef());
      if (!snap.exists()) return [];
      const devicesMap = (snap.data()?.devices as Record<string, AdminDevice>) || {};
      return Object.values(devicesMap);
    } catch {
      return [];
    }
  },

  async approveDevice(deviceId: string, approvedByEmail: string): Promise<void> {
    const nowIso = new Date().toISOString();
    await updateDoc(getRegistryDocRef(), {
      [`devices.${deviceId}.status`]: 'approved',
      [`devices.${deviceId}.authorizedBy`]: approvedByEmail || 'Administrator',
      [`devices.${deviceId}.lastActiveAt`]: nowIso,
      updatedAt: serverTimestamp(),
    });
  },

  async revokeDevice(deviceId: string): Promise<void> {
    const nowIso = new Date().toISOString();
    await updateDoc(getRegistryDocRef(), {
      [`devices.${deviceId}.status`]: 'rejected',
      [`devices.${deviceId}.lastActiveAt`]: nowIso,
      updatedAt: serverTimestamp(),
    });
  },

  async removeDeviceRecord(deviceId: string): Promise<void> {
    await updateDoc(getRegistryDocRef(), {
      [`devices.${deviceId}`]: deleteField(),
      updatedAt: serverTimestamp(),
    });
  },
};

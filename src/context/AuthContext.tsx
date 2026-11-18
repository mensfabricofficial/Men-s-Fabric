import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { 
  User, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  sendPasswordResetEmail,
  sendEmailVerification,
  verifyBeforeUpdateEmail,
  updateProfile,
  getIdTokenResult,
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { ADMIN_CONFIG } from '../lib/firebaseConfig';
import { CustomerProfile } from '../types';

interface AuthContextType {
  currentUser: User | null;
  customerProfile: CustomerProfile | null;
  profileLoaded: boolean;
  isAdmin: boolean;
  loading: boolean;
  signIn: (emailOrPhone: string, pass: string) => Promise<User>;
  signUp: (email: string, pass: string, name: string, phone: string) => Promise<User>;
  signInWithGoogle: () => Promise<User>;
  signInWithFacebook: () => Promise<User>;
  logOut: () => Promise<void>;
  resetPassword: (emailOrPhone: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
  reloadCurrentUser: () => Promise<User | null>;
  updateCustomerProfile: (data: Partial<CustomerProfile>) => Promise<void>;
  requestEmailChange: (newEmail: string) => Promise<void>;
  enableCurrentDeviceForVerifiedUser: () => Promise<void>;
}

const LOCAL_CUSTOMERS_KEY = 'mf_registered_customers_v1';

export const saveLocalCustomer = (profile: CustomerProfile) => {
  if (!profile || !profile.uid) return;
  try {
    const raw = localStorage.getItem(LOCAL_CUSTOMERS_KEY);
    const list: CustomerProfile[] = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex(
      (c) => c.uid === profile.uid || (c.email && c.email.toLowerCase() === profile.email?.toLowerCase())
    );
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...profile };
    } else {
      list.unshift(profile);
    }
    localStorage.setItem(LOCAL_CUSTOMERS_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  // Check admin authorization securely
  const checkAdminStatus = async (user: User): Promise<boolean> => {
    const emailLower = user.email?.trim().toLowerCase() || '';
    // 1. Direct configured UID match or Primary Admin emails
    if (
      user.uid === ADMIN_CONFIG.PRIMARY_ADMIN_UID ||
      user.uid === 'lw3mX9AivNduzBGundo3rB2jZcp2' ||
      emailLower === 'admin@mensfabric.com' ||
      emailLower === 'mensfabricofficial@gmail.com' ||
      emailLower === 'me@admin.com' ||
      ADMIN_CONFIG.SECONDARY_ADMIN_UIDS.includes(user.uid)
    ) {
      return true;
    }

    // 2. Custom claims (if set via Firebase Admin SDK)
    try {
      const tokenResult = await getIdTokenResult(user);
      if (tokenResult.claims.admin === true) {
        return true;
      }
    } catch {
      // Continue to check Firestore
    }

    // 3. Admin collection document lookup by UID
    try {
      const adminDoc = await getDoc(doc(db, 'admins', user.uid));
      if (adminDoc.exists() && adminDoc.data()?.active !== false) {
        return true;
      }
    } catch {
      // Permission denied or doesn't exist
    }

    // 4. Lookup in settings/adminsList by registered email
    try {
      if (emailLower) {
        const snap = await getDoc(doc(db, 'settings', 'adminsList'));
        if (snap.exists()) {
          const adminsMap = snap.data()?.admins || {};
          const matched = Object.values(adminsMap).find(
            (a: any) => a.email?.toLowerCase() === emailLower && a.active !== false
          );
          if (matched) {
            return true;
          }
        }
      }
    } catch {
      // Ignore
    }

    return false;
  };

  const getLocalCustomerDeviceId = (): string => {
    try {
      let id = localStorage.getItem('selvee_customer_device_id_v1');
      if (!id) {
        const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
        id = `CUS-${Date.now().toString(36).toUpperCase()}-${rand}`;
        localStorage.setItem('selvee_customer_device_id_v1', id);
      }
      return id;
    } catch {
      return 'CLIENT';
    }
  };

  // Binds verifiedDeviceId strictly once when customer email becomes verified on a device
  const bindVerifiedDeviceIfNeeded = async (user: User, loadedProfile?: CustomerProfile | null) => {
    if (!user?.uid || !user.emailVerified) return;
    if (loadedProfile?.verifiedDeviceId || (loadedProfile?.verifiedDeviceIds && loadedProfile.verifiedDeviceIds.length > 0)) {
      return;
    }

    const deviceId = getLocalCustomerDeviceId();
    const docRef = doc(db, 'users', user.uid);
    try {
      const freshSnap = await getDoc(docRef);
      const freshData = freshSnap.exists() ? (freshSnap.data() as CustomerProfile) : null;
      if (freshData?.verifiedDeviceId || (freshData?.verifiedDeviceIds && freshData.verifiedDeviceIds.length > 0)) {
        // Already verified on another device — do NOT auto-overwrite on passive login
        setCustomerProfile(freshData);
        saveLocalCustomer(freshData);
        return;
      }

      const verifiedAt = new Date().toISOString();
      await setDoc(
        docRef,
        {
          verifiedDeviceId: deviceId,
          verifiedDeviceIds: [deviceId],
          emailVerifiedAt: verifiedAt,
          email: (user.email || freshData?.email || '').toLowerCase(),
          name: user.displayName || freshData?.name || 'Selvee Customer',
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setCustomerProfile((prev) => {
        const next: CustomerProfile = {
          ...(prev || freshData || {
            uid: user.uid,
            name: user.displayName || 'Selvee Customer',
            email: (user.email || '').toLowerCase(),
            createdAt: verifiedAt,
          }),
          verifiedDeviceId: deviceId,
          verifiedDeviceIds: [deviceId],
          emailVerifiedAt: verifiedAt,
        };
        saveLocalCustomer(next);
        return next;
      });
    } catch {
      // Fallback: save locally if Firestore offline
      setCustomerProfile((prev) => {
        if (prev?.verifiedDeviceId || (prev?.verifiedDeviceIds && prev.verifiedDeviceIds.length > 0)) return prev;
        const verifiedAt = new Date().toISOString();
        const next: CustomerProfile = {
          ...(prev || {
            uid: user.uid,
            name: user.displayName || 'Selvee Customer',
            email: (user.email || '').toLowerCase(),
            createdAt: verifiedAt,
          }),
          verifiedDeviceId: deviceId,
          verifiedDeviceIds: [deviceId],
          emailVerifiedAt: verifiedAt,
        };
        saveLocalCustomer(next);
        return next;
      });
    }
  };

  // Explicit 1-click user action: authorize current PC or Mobile device for a verified customer account
  const enableCurrentDeviceForVerifiedUser = useCallback(async () => {
    const user = auth.currentUser;
    if (!user?.uid || !user.emailVerified) return;
    const deviceId = getLocalCustomerDeviceId();
    const docRef = doc(db, 'users', user.uid);

    setCustomerProfile((prev) => {
      const existing = new Set([
        ...(prev?.verifiedDeviceIds || []),
        ...(prev?.verifiedDeviceId ? [prev.verifiedDeviceId] : []),
      ]);
      if (existing.has(deviceId)) return prev;
      existing.add(deviceId);
      const next: CustomerProfile = {
        ...(prev || {
          uid: user.uid,
          name: user.displayName || 'Selvee Customer',
          email: (user.email || '').toLowerCase(),
          createdAt: new Date().toISOString(),
        }),
        verifiedDeviceId: prev?.verifiedDeviceId || deviceId,
        verifiedDeviceIds: Array.from(existing),
      };
      saveLocalCustomer(next);
      return next;
    });

    try {
      const snap = await getDoc(docRef);
      const remote = snap.exists() ? (snap.data() as CustomerProfile) : null;
      const remoteSet = new Set([
        ...(remote?.verifiedDeviceIds || []),
        ...(remote?.verifiedDeviceId ? [remote.verifiedDeviceId] : []),
      ]);
      if (remoteSet.has(deviceId)) return;
      remoteSet.add(deviceId);
      await setDoc(
        docRef,
        {
          verifiedDeviceId: remote?.verifiedDeviceId || deviceId,
          verifiedDeviceIds: Array.from(remoteSet),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch {
      // Local state still persists
    }
  }, []);

  const loadCustomerProfile = async (uid: string, userObj?: User | null) => {
    try {
      const docRef = doc(db, 'users', uid);
      const docSnap = await getDoc(docRef);
      let loaded: CustomerProfile | null = null;
      if (docSnap.exists()) {
        loaded = docSnap.data() as CustomerProfile;
        setCustomerProfile(loaded);
        saveLocalCustomer(loaded);
      }
      if (userObj?.emailVerified) {
        await bindVerifiedDeviceIfNeeded(userObj, loaded);
      }
    } catch (e) {
      console.warn("Could not load user profile:", e);
    } finally {
      setProfileLoaded(true);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        setProfileLoaded(false);
        const adminStatus = await checkAdminStatus(user);
        setIsAdmin(adminStatus);
        setLoading(false);
        void loadCustomerProfile(user.uid, user);
      } else {
        setIsAdmin(false);
        setCustomerProfile(null);
        setProfileLoaded(false);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const resolveEmailFromIdentifier = async (identifier: string): Promise<string> => {
    const trimmed = identifier.trim();
    if (trimmed.includes('@')) {
      return trimmed;
    }

    const cleanPhone = trimmed.replace(/[^\d+]/g, '').replace(/^(\+88|88)/, '');
    if (!cleanPhone) {
      throw new Error('Please enter a valid email address or mobile phone number.');
    }

    // 1. Check local customer cache first
    try {
      const raw = localStorage.getItem(LOCAL_CUSTOMERS_KEY);
      if (raw) {
        const list: CustomerProfile[] = JSON.parse(raw);
        const match = list.find(
          (c) =>
            c.email &&
            c.phone &&
            c.phone.replace(/[^\d]/g, '').replace(/^88/, '') === cleanPhone
        );
        if (match?.email) return match.email;
      }
    } catch {
      // ignore
    }

    // 2. Check Firestore users collection by phone number
    try {
      const phoneCandidates = Array.from(new Set([cleanPhone, trimmed, `+88${cleanPhone}`, `88${cleanPhone}`]));
      for (const candidate of phoneCandidates) {
        const q = query(collection(db, 'users'), where('phone', '==', candidate), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const data = snap.docs[0].data() as CustomerProfile;
          if (data.email) return data.email;
        }
      }
    } catch {
      // ignore lookup error
    }

    throw new Error('No account email was found for that phone number. Please sign in with your registered email address.');
  };

  const signIn = async (emailOrPhone: string, pass: string): Promise<User> => {
    const resolvedEmail = await resolveEmailFromIdentifier(emailOrPhone);
    const cred = await signInWithEmailAndPassword(auth, resolvedEmail.trim(), pass);
    const adminStatus = await checkAdminStatus(cred.user);
    setIsAdmin(adminStatus);
    await loadCustomerProfile(cred.user.uid, cred.user);
    return cred.user;
  };

  const finalizeSocialSignIn = async (user: User): Promise<User> => {
    const adminStatus = await checkAdminStatus(user);
    setIsAdmin(adminStatus);

    const docRef = doc(db, 'users', user.uid);
    let existingProfile: CustomerProfile | null = null;
    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        existingProfile = snap.data() as CustomerProfile;
      }
    } catch {
      // ignore read errors
    }

    if (existingProfile) {
      setCustomerProfile(existingProfile);
      saveLocalCustomer(existingProfile);
      if (user.emailVerified && !existingProfile.verifiedDeviceId) {
        await bindVerifiedDeviceIfNeeded(user, existingProfile);
      }
    } else {
      const deviceId = user.emailVerified ? getLocalCustomerDeviceId() : undefined;
      const verifiedAt = user.emailVerified ? new Date().toISOString() : undefined;
      const profileData: CustomerProfile = {
        uid: user.uid,
        name: user.displayName || 'Selvee Customer',
        email: (user.email || '').toLowerCase(),
        phone: user.phoneNumber || '',
        createdAt: serverTimestamp(),
        disabled: false,
        ...(deviceId ? { verifiedDeviceId: deviceId, emailVerifiedAt: verifiedAt } : {}),
      };
      const localProfileData: CustomerProfile = {
        ...profileData,
        createdAt: new Date().toISOString(),
      };
      setCustomerProfile(localProfileData);
      saveLocalCustomer(localProfileData);
      try {
        await setDoc(docRef, profileData, { merge: true });
      } catch {
        // ignore write rules error
      }
    }
    setProfileLoaded(true);

    return user;
  };

  const signInWithGoogle = async (): Promise<User> => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const cred = await signInWithPopup(auth, provider);
    return finalizeSocialSignIn(cred.user);
  };

  const signInWithFacebook = async (): Promise<User> => {
    const provider = new FacebookAuthProvider();
    provider.addScope('email');
    provider.addScope('public_profile');
    const cred = await signInWithPopup(auth, provider);
    return finalizeSocialSignIn(cred.user);
  };

  const signUp = async (email: string, pass: string, name: string, phone: string): Promise<User> => {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
    await updateProfile(cred.user, { displayName: name });
    
    // Create customer profile in Firestore & local store
    const profileData: CustomerProfile = {
      uid: cred.user.uid,
      name,
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      createdAt: serverTimestamp(),
      disabled: false
    };
    
    const localProfileData: CustomerProfile = {
      ...profileData,
      createdAt: new Date().toISOString(),
    };
    setCustomerProfile(localProfileData);
    saveLocalCustomer(localProfileData);

    try {
      await setDoc(doc(db, 'users', cred.user.uid), profileData);
    } catch (err) {
      console.warn("Notice: user profile doc creation pending Firestore rules:", err);
    }

    // Immediately dispatch email verification link
    try {
      await sendEmailVerification(cred.user);
    } catch (verErr) {
      console.warn("Failed to dispatch initial verification email:", verErr);
    }

    const adminStatus = await checkAdminStatus(cred.user);
    setIsAdmin(adminStatus);
    return cred.user;
  };

  const sendVerificationEmailAction = async () => {
    if (auth.currentUser) {
      await sendEmailVerification(auth.currentUser);
    } else {
      throw new Error("No active user session to send verification email.");
    }
  };

  const reloadCurrentUserAction = async (): Promise<User | null> => {
    if (auth.currentUser) {
      await auth.currentUser.reload();
      const updatedUser = auth.currentUser;
      setCurrentUser(updatedUser ? ({ ...updatedUser } as User) : null);
      if (updatedUser) {
        await loadCustomerProfile(updatedUser.uid, updatedUser);
      }
      return updatedUser;
    }
    return null;
  };

  const updateCustomerProfile = async (data: Partial<CustomerProfile>) => {
    const user = auth.currentUser;
    if (!user) throw new Error("Please log in to update your profile.");

    if (data.name && data.name !== user.displayName) {
      await updateProfile(user, { displayName: data.name });
    }

    const userDocRef = doc(db, 'users', user.uid);
    try {
      await setDoc(userDocRef, { ...data, updatedAt: serverTimestamp() }, { merge: true });
    } catch (e) {
      console.warn("Notice: user doc update pending Firestore rules:", e);
    }
    
    setCustomerProfile((prev) => {
      const updated = prev
        ? { ...prev, ...data }
        : ({
            uid: user.uid,
            name: data.name || user.displayName || '',
            email: user.email || '',
            ...data,
          } as CustomerProfile);
      saveLocalCustomer(updated);
      return updated;
    });
  };

  const requestEmailChange = async (newEmail: string) => {
    const user = auth.currentUser;
    if (!user) throw new Error("No active user session.");
    await verifyBeforeUpdateEmail(user, newEmail.trim());
  };

  const logOut = async () => {
    await signOut(auth);
    try {
      const { adminDeviceService } = await import('../services/adminDeviceService');
      adminDeviceService.clearSessionAccessKeyVerified();
    } catch {
      // ignore
    }
    setCurrentUser(null);
    setCustomerProfile(null);
    setIsAdmin(false);
  };

  const resetPassword = async (emailOrPhone: string) => {
    const resolvedEmail = await resolveEmailFromIdentifier(emailOrPhone);
    await sendPasswordResetEmail(auth, resolvedEmail.trim());
  };

  const refreshProfile = async () => {
    if (currentUser) {
      await loadCustomerProfile(currentUser.uid, currentUser);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        customerProfile,
        profileLoaded,
        isAdmin,
        loading,
        signIn,
        signUp,
        signInWithGoogle,
        signInWithFacebook,
        logOut,
        resetPassword,
        refreshProfile,
        sendVerificationEmail: sendVerificationEmailAction,
        reloadCurrentUser: reloadCurrentUserAction,
        updateCustomerProfile,
        requestEmailChange,
        enableCurrentDeviceForVerifiedUser
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

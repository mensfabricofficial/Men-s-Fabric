import React, { createContext, useContext, useEffect, useState } from 'react';
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
  getIdTokenResult
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { ADMIN_CONFIG } from '../lib/firebaseConfig';
import { CustomerProfile } from '../types';

interface AuthContextType {
  currentUser: User | null;
  customerProfile: CustomerProfile | null;
  isAdmin: boolean;
  loading: boolean;
  signIn: (email: string, pass: string) => Promise<User>;
  signUp: (email: string, pass: string, name: string, phone: string) => Promise<User>;
  logOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
  reloadCurrentUser: () => Promise<User | null>;
  updateCustomerProfile: (data: Partial<CustomerProfile>) => Promise<void>;
  requestEmailChange: (newEmail: string) => Promise<void>;
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
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  // Check admin authorization securely
  const checkAdminStatus = async (user: User): Promise<boolean> => {
    // 1. Direct configured UID match or Primary Admin emails
    if (
      user.uid === ADMIN_CONFIG.PRIMARY_ADMIN_UID ||
      user.uid === 'lw3mX9AivNduzBGundo3rB2jZcp2' ||
      user.email === 'admin@mensfabric.com' ||
      user.email === 'mensfabricofficial@gmail.com' ||
      user.email === 'me@admin.com' ||
      ADMIN_CONFIG.SECONDARY_ADMIN_UIDS.includes(user.uid)
    ) {
      return true;
    }

    // 2. Custom claims (if set via Firebase Admin SDK)
    try {
      const tokenResult = await getIdTokenResult(user, true);
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
      const cleanEmail = user.email?.trim().toLowerCase();
      if (cleanEmail) {
        const snap = await getDoc(doc(db, 'settings', 'adminsList'));
        if (snap.exists()) {
          const adminsMap = snap.data()?.admins || {};
          const matched = Object.values(adminsMap).find(
            (a: any) => a.email?.toLowerCase() === cleanEmail && a.active !== false
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

  const loadCustomerProfile = async (uid: string) => {
    try {
      const docRef = doc(db, 'users', uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as CustomerProfile;
        setCustomerProfile(data);
        saveLocalCustomer(data);
      }
    } catch (e) {
      console.warn("Could not load user profile:", e);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        const adminStatus = await checkAdminStatus(user);
        setIsAdmin(adminStatus);
        await loadCustomerProfile(user.uid);
      } else {
        setIsAdmin(false);
        setCustomerProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, pass: string): Promise<User> => {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), pass);
    const adminStatus = await checkAdminStatus(cred.user);
    setIsAdmin(adminStatus);
    await loadCustomerProfile(cred.user.uid);
    return cred.user;
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
    
    setCustomerProfile(profileData);
    saveLocalCustomer(profileData);

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
        await loadCustomerProfile(updatedUser.uid);
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
    setCurrentUser(null);
    setCustomerProfile(null);
    setIsAdmin(false);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  };

  const refreshProfile = async () => {
    if (currentUser) {
      await loadCustomerProfile(currentUser.uid);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        customerProfile,
        isAdmin,
        loading,
        signIn,
        signUp,
        logOut,
        resetPassword,
        refreshProfile,
        sendVerificationEmail: sendVerificationEmailAction,
        reloadCurrentUser: reloadCurrentUserAction,
        updateCustomerProfile,
        requestEmailChange
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

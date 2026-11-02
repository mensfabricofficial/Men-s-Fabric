import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  sendPasswordResetEmail,
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
  signUp: (email: string, pass: string, name: string, phone?: string) => Promise<User>;
  logOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  // Check admin authorization securely
  const checkAdminStatus = async (user: User): Promise<boolean> => {
    // 1. Direct configured UID match (HvhASQq3i8M7cFdrHRTC7f6hbuH3)
    if (user.uid === ADMIN_CONFIG.PRIMARY_ADMIN_UID) {
      return true;
    }
    // 2. Custom claims (if set via Firebase Admin SDK)
    try {
      const tokenResult = await getIdTokenResult(user, true);
      if (tokenResult.claims.admin === true) {
        return true;
      }
    } catch {
      // Continue to check Firestore admin collection
    }
    // 3. Admin collection document lookup
    try {
      const adminDoc = await getDoc(doc(db, 'admins', user.uid));
      if (adminDoc.exists() && adminDoc.data()?.active === true) {
        return true;
      }
    } catch {
      // Permission denied or doesn't exist
    }
    return false;
  };

  const loadCustomerProfile = async (uid: string) => {
    try {
      const docRef = doc(db, 'users', uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setCustomerProfile(docSnap.data() as CustomerProfile);
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

  const signUp = async (email: string, pass: string, name: string, phone?: string): Promise<User> => {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
    await updateProfile(cred.user, { displayName: name });
    
    // Create customer profile in Firestore
    const profileData: CustomerProfile = {
      uid: cred.user.uid,
      name,
      email: email.trim().toLowerCase(),
      phone: phone || '',
      createdAt: serverTimestamp(),
      disabled: false
    };
    
    try {
      await setDoc(doc(db, 'users', cred.user.uid), profileData);
      setCustomerProfile(profileData);
    } catch (err) {
      console.warn("Notice: user profile doc creation pending Firestore rules:", err);
    }

    const adminStatus = await checkAdminStatus(cred.user);
    setIsAdmin(adminStatus);
    return cred.user;
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
        refreshProfile
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

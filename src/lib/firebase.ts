import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { firebaseConfig } from './firebaseConfig';

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;

try {
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  // Cap max retry time to prevent hanging 120s on unconfigured or offline buckets
  storage.maxUploadRetryTime = 5000;
  storage.maxOperationRetryTime = 5000;
} catch (error) {
  console.error("Firebase initialization failed:", error);
  // Re-throw or provide fallback so app can inform the user gracefully
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  storage.maxUploadRetryTime = 5000;
  storage.maxOperationRetryTime = 5000;
}

export { app, auth, db, storage };

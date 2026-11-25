import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  Firestore,
} from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { firebaseConfig } from './firebaseConfig';
import { cleanupFirestoreAndBloatStorage } from '../utils/safeStorage';

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;

function createFirestoreInstance(firebaseApp: FirebaseApp): Firestore {
  cleanupFirestoreAndBloatStorage();
  try {
    return initializeFirestore(firebaseApp, {
      localCache: memoryLocalCache(),
      experimentalForceLongPolling: true,
      ignoreUndefinedProperties: true,
    });
  } catch {
    return getFirestore(firebaseApp);
  }
}

try {
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = createFirestoreInstance(app);
  storage = getStorage(app);
  // Allow larger multi-MB studio uploads to progress; uploadImage stallTimer aborts stalled buckets within 7s
  storage.maxUploadRetryTime = 60000;
  storage.maxOperationRetryTime = 30000;
} catch (error) {
  console.error('Firebase initialization failed:', error);
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = createFirestoreInstance(app);
  storage = getStorage(app);
  storage.maxUploadRetryTime = 60000;
  storage.maxOperationRetryTime = 30000;
}

export { app, auth, db, storage };

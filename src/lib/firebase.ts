import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  Firestore,
} from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { firebaseConfig } from './firebaseConfig';

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;

function createFirestoreInstance(firebaseApp: FirebaseApp): Firestore {
  try {
    return initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      experimentalForceLongPolling: true,
      ignoreUndefinedProperties: true,
    });
  } catch {
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
}

try {
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = createFirestoreInstance(app);
  storage = getStorage(app);
  // Cap max retry time to prevent hanging 120s on unconfigured or offline buckets
  storage.maxUploadRetryTime = 5000;
  storage.maxOperationRetryTime = 5000;
} catch (error) {
  console.error('Firebase initialization failed:', error);
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = createFirestoreInstance(app);
  storage = getStorage(app);
  storage.maxUploadRetryTime = 5000;
  storage.maxOperationRetryTime = 5000;
}

export { app, auth, db, storage };

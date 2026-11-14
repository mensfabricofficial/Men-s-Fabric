// Dedicated Firebase Configuration for MEN'S FABRIC
// You can edit or paste your Firebase API credentials directly here,
// or supply them via environment variables in your deployment / cPanel.

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCsuGokTD67wudbmw22xdWakMo8NPahwQs",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "men-s-fabric-71eb8.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "men-s-fabric-71eb8",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "men-s-fabric-71eb8.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "872374157456",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:872374157456:web:448915040f40a4cee71815",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-PWD3GPX28E"
};

// Configured Administrator Information - Primary Store Owner
export const ADMIN_CONFIG = {
  PRIMARY_ADMIN_UID: "HvhASQq3i8M7cFdrHRTC7f6hbuH3",
  ADMIN_EMAIL: "admin@mensfabric.com",
  SECONDARY_ADMIN_EMAILS: ["mensfabricofficial@gmail.com", "me@admin.com"],
  SECONDARY_ADMIN_UIDS: ["lw3mX9AivNduzBGundo3rB2jZcp2", "HvhASQq3i8M7cFdrHRTC7f6hbuH3"],
  STORE_NAME: "Selvee",
  CURRENCY: "৳",
  TIMEZONE: "Asia/Dhaka",
  OFFICIAL_LOGO: "/assets/aistudio/selvee1_8ff37f5b.jpg"
};

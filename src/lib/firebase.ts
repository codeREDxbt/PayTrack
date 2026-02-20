// ================================
// Firebase Configuration
// ================================
// To set up Firebase:
// 1. Go to https://console.firebase.google.com/
// 2. Create a new project (e.g., "salary-tracker")
// 3. Enable Authentication > Google provider
// 4. Create Firestore database in production mode
// 5. Copy config values into .env.local (see .env.example)

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

// ⚠️ Validate required env vars at startup – fail fast, fail loud
const requiredEnvVars = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
} as const;

const missingVars = Object.entries(requiredEnvVars)
    .filter(([, val]) => !val || val.startsWith('YOUR_'))
    .map(([key]) => `VITE_FIREBASE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`);

if (missingVars.length > 0) {
    throw new Error(
        `[PayTrack] Missing Firebase configuration. ` +
        `Copy .env.example to .env.local and fill in: ${missingVars.join(', ')}`
    );
}

const firebaseConfig = requiredEnvVars;

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Restrict Google provider to select account prompt for security
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Collection names
export const COLLECTIONS = {
    EMPLOYEES: 'employees',
    ATTENDANCE: 'attendance',
    PAYROLL: 'payroll',
    SETTINGS: 'settings',
    HOLIDAYS: 'holidays',
} as const;

export default app;


// ================================
// Firebase Configuration
// ================================
// To set up Firebase:
// 1. Go to https://console.firebase.google.com/
// 2. Create a new project (e.g., "salary-tracker")
// 3. Enable Authentication > Google provider
// 4. Create Firestore database in production mode
// 5. Copy your config values below

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

// TODO: Replace with your Firebase config
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "YOUR_API_KEY",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "YOUR_PROJECT.firebaseapp.com",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "YOUR_PROJECT.appspot.com",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "YOUR_SENDER_ID",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "YOUR_APP_ID",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Collection names
export const COLLECTIONS = {
    EMPLOYEES: 'employees',
    ATTENDANCE: 'attendance',
    PAYROLL: 'payroll',
    SETTINGS: 'settings',
    HOLIDAYS: 'holidays',
} as const;

export default app;

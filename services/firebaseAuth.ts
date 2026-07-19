import { FirebaseApp, initializeApp, getApps } from 'firebase/app';
import {
  GoogleAuthProvider,
  OAuthProvider,
  User,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const firebaseApp: FirebaseApp | null = getApps().length
  ? getApps()[0]
  : (firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId)
    ? initializeApp(firebaseConfig)
    : null;

export const auth = firebaseApp ? getAuth(firebaseApp) : null;

export const isFirebaseAuthConfigured = () => Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);

const ensureAuthConfigured = () => {
  if (!isFirebaseAuthConfigured()) {
    throw new Error('Firebase auth is not configured. Add VITE_FIREBASE_* values to your environment.');
  }
};

export const signInWithEmail = async (email: string, password: string) => {
  ensureAuthConfigured();
  if (!auth) throw new Error('Firebase auth is not initialized.');
  return signInWithEmailAndPassword(auth, email, password);
};

export const signUpWithEmail = async (email: string, password: string, displayName?: string) => {
  ensureAuthConfigured();
  if (!auth) throw new Error('Firebase auth is not initialized.');
  const credential = await createUserWithEmailAndPassword(auth, email, password);

  if (displayName) {
    await updateProfile(credential.user, { displayName });
  }

  return credential;
};

export const signInWithGoogle = async () => {
  ensureAuthConfigured();
  if (!auth) throw new Error('Firebase auth is not initialized.');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(auth, provider);
};

export const signInWithApple = async () => {
  ensureAuthConfigured();
  if (!auth) throw new Error('Firebase auth is not initialized.');
  const provider = new OAuthProvider('apple.com');
  provider.addScope('email');
  provider.addScope('name');
  provider.setCustomParameters({ locale: 'en' });
  return signInWithPopup(auth, provider);
};

export const sendResetEmail = async (email: string) => {
  ensureAuthConfigured();
  if (!auth) throw new Error('Firebase auth is not initialized.');
  return sendPasswordResetEmail(auth, email);
};

export const updateDisplayName = async (displayName: string) => {
  ensureAuthConfigured();
  if (!auth?.currentUser) {
    throw new Error('You must be signed in to update your profile.');
  }

  await updateProfile(auth.currentUser, { displayName });
  return auth.currentUser;
};

export const signOutUser = async () => {
  if (!auth) return;
  return signOut(auth);
};

export const watchAuthState = (callback: (user: User | null) => void) => {
  if (!auth) {
    callback(null);
    return () => undefined;
  }

  return onAuthStateChanged(auth, callback);
};

export const getCurrentIdToken = async () => {
  if (!auth) {
    throw new Error('Firebase auth is not configured.');
  }

  const user = auth.currentUser;
  if (!user) {
    throw new Error('You must be signed in to use this feature.');
  }

  return user.getIdToken();
};
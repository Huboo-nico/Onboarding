import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase Auth
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Request Workspace scopes for Google Drive and Google Docs
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.addScope('https://www.googleapis.com/auth/documents');

let isSigningIn = false;
let cachedAccessToken: string | null = null;

// Helper to check if we are using the placeholder configuration
export const isUsingPlaceholder = (): boolean => {
  return firebaseConfig.apiKey === "PLACEHOLDER_KEY" || !firebaseConfig.apiKey;
};

// Initialize auth state listener
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Start Google sign-in flow
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  if (isUsingPlaceholder()) {
    throw new Error('CONFIG_REQUIRED');
  }

  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('No se pudo obtener el token de acceso de Google.');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Error de autenticación Google:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

// Start Google Direct OAuth Implicit sign-in flow (robust fallback for custom domains like Vercel)
export const googleSignInDirect = (customClientId?: string) => {
  const clientId = customClientId || firebaseConfig.oAuthClientId || '507166952584-4plde32qf2n7g3dvgu2d3phnbhupb9go.apps.googleusercontent.com';
  const redirectUri = window.location.href.split('#')[0].split('?')[0];
  const scopes = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email';
  
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${encodeURIComponent(scopes)}&prompt=consent`;
  
  const width = 550;
  const height = 650;
  const left = window.screen.width / 2 - width / 2;
  const top = window.screen.height / 2 - height / 2;
  
  const popup = window.open(
    authUrl,
    'google_oauth',
    `width=${width},height=${height},top=${top},left=${left}`
  );
  
  if (!popup) {
    throw new Error('POPUP_BLOCKED');
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

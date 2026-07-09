import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Handle Google OAuth Implicit Flow popup callback
if (window.opener && (window.location.hash || window.location.search)) {
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const searchParams = new URLSearchParams(window.location.search);
  
  const accessToken = hashParams.get('access_token');
  const error = searchParams.get('error') || hashParams.get('error');
  
  if (accessToken) {
    try {
      window.opener.postMessage({ type: 'GOOGLE_OAUTH_SUCCESS', token: accessToken }, '*');
    } catch (e) {
      console.error(e);
    }
    window.close();
  } else if (error) {
    try {
      window.opener.postMessage({ type: 'GOOGLE_OAUTH_FAILURE', error }, '*');
    } catch (e) {
      console.error(e);
    }
    window.close();
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

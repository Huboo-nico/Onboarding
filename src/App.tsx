import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  ShieldCheck, 
  CheckCircle2, 
  XCircle, 
  User, 
  Building, 
  Globe, 
  FileText, 
  PlusCircle, 
  Download, 
  History, 
  Sparkles, 
  ExternalLink,
  LogOut,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Lock,
  ArrowRight,
  Info,
  Clock,
  Folder,
  Key
} from 'lucide-react';
import { mockTranscripts, TranscriptTemplate } from './mockData';
import { KYCAnalysisResult, ClientRecord } from './types';
import { initAuth, googleSignIn, googleSignInDirect, logout, isUsingPlaceholder } from './auth';
import { createKYCDocument, getFilesInFolder, getAllKYCFolders, createAdditionalNote } from './gdrive';
import { User as FirebaseUser } from 'firebase/auth';

export default function App() {
  // Application State
  const [transcript, setTranscript] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentResult, setCurrentResult] = useState<KYCAnalysisResult | null>(null);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  
  // Google Auth / Workspace State
  const [googleUser, setGoogleUser] = useState<FirebaseUser | null>(null);
  const [oauthToken, setOauthToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [isWorkspaceConfigured, setIsWorkspaceConfigured] = useState<boolean>(true);
  
  // Custom Google Client ID State for Vercel/Custom Domain compatibility
  const [customGoogleClientId, setCustomGoogleClientId] = useState<string>('');
  const [showGoogleConfig, setShowGoogleConfig] = useState<boolean>(false);

  // Export State
  const [exportingDoc, setExportingDoc] = useState<boolean>(false);
  const [exportedDocUrl, setExportedDocUrl] = useState<string | null>(null);
  const [exportedFolderUrl, setExportedFolderUrl] = useState<string | null>(null);
  const [exportedFolderName, setExportedFolderName] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // Google Drive Explorer State
  const [driveFolders, setDriveFolders] = useState<Array<{ id: string; name: string; mimeType: string; createdTime?: string }>>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [activeFolderFiles, setActiveFolderFiles] = useState<Array<{ id: string; name: string; mimeType: string; webViewLink?: string; createdTime?: string }>>([]);
  const [loadingDrive, setLoadingDrive] = useState<boolean>(false);
  const [loadingDriveFiles, setLoadingDriveFiles] = useState<boolean>(false);
  const [exportedFolderId, setExportedFolderId] = useState<string | null>(null);
  const [exportedDocId, setExportedDocId] = useState<string | null>(null);
  const [folderSearch, setFolderSearch] = useState<string>('');
  
  // Note creation inside Drive Explorer
  const [showNoteForm, setShowNoteForm] = useState<boolean>(false);
  const [newNoteTitle, setNewNoteTitle] = useState<string>('');
  const [newNoteContent, setNewNoteContent] = useState<string>('');
  const [isSavingNote, setIsSavingNote] = useState<boolean>(false);
  const [noteSuccessMessage, setNoteSuccessMessage] = useState<string | null>(null);

  // Server Diagnostics State
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean | null>(null);
  const [hasGeminiKey2, setHasGeminiKey2] = useState<boolean | null>(null);
  const [checkingConfig, setCheckingConfig] = useState<boolean>(false);
  const [customGeminiKey, setCustomGeminiKey] = useState<string>('');
  const [customGeminiKey2, setCustomGeminiKey2] = useState<string>('');
  const [showCustomGeminiInput, setShowCustomGeminiInput] = useState<boolean>(false);
  const [testingConnection, setTestingConnection] = useState<boolean>(false);
  const [testingConnectionKey, setTestingConnectionKey] = useState<1 | 2 | null>(null);
  const [connectionResult, setConnectionResult] = useState<{
    success: boolean;
    model?: string;
    message?: string;
    error?: string;
  } | null>(null);

  const testGeminiConnection = async (keyIndex: 1 | 2 = 1) => {
    setTestingConnection(true);
    setTestingConnectionKey(keyIndex);
    setConnectionResult(null);
    try {
      const savedKey = localStorage.getItem('custom_gemini_api_key') || '';
      const savedKey2 = localStorage.getItem('custom_gemini_api_key_2') || '';
      const response = await fetch('/api/test-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gemini-key': savedKey,
          'x-gemini-key-2': savedKey2,
        },
        body: JSON.stringify({ keyIndex }),
      });

      const contentType = response.headers.get('content-type') || '';
      let data: any = {};
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        throw new Error(text || `The server returned a plain text error with code ${response.status}`);
      }

      if (response.ok && data.success) {
        setConnectionResult({
          success: true,
          model: data.model,
          message: data.message || `Successful connection with Gemini Key ${keyIndex}.`,
        });
        if (keyIndex === 1) {
          setHasGeminiKey(true);
        } else {
          setHasGeminiKey2(true);
        }
      } else {
        setConnectionResult({
          success: false,
          error: data.error || `Authentication or connection error with Key ${keyIndex}.`,
        });
      }
    } catch (err: any) {
      console.error('Error testing Gemini key:', err);
      // Clean up common server errors to make them highly friendly
      let errorMsg = err.message || 'Network error or communication error with the server.';
      if (errorMsg.includes('A server error')) {
        errorMsg = 'Vercel server error. Make sure dependencies are built correctly and that the Node/Vercel backend is not experiencing a temporary lock.';
      }
      setConnectionResult({
        success: false,
        error: errorMsg,
      });
    } finally {
      setTestingConnection(false);
      setTestingConnectionKey(null);
    }
  };

  const checkConfigStatus = async () => {
    setCheckingConfig(true);
    try {
      const savedKey = localStorage.getItem('custom_gemini_api_key') || '';
      const savedKey2 = localStorage.getItem('custom_gemini_api_key_2') || '';
      const res = await fetch('/api/config-status', {
        headers: {
          'x-gemini-key': savedKey,
          'x-gemini-key-2': savedKey2,
        }
      });
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await res.json();
          setHasGeminiKey(!!data.hasGeminiKey);
          setHasGeminiKey2(!!data.hasGeminiKey2);
        } else {
          setHasGeminiKey(false);
          setHasGeminiKey2(false);
        }
      } else {
        setHasGeminiKey(false);
        setHasGeminiKey2(false);
      }
    } catch (err) {
      console.error('Error fetching config status:', err);
      setHasGeminiKey(false);
      setHasGeminiKey2(false);
    } finally {
      setCheckingConfig(false);
    }
  };

  // Initialize and load clients history
  useEffect(() => {
    // Check if Firebase key is placeholder (which indicates Google OAuth is not completed yet)
    setIsWorkspaceConfigured(!isUsingPlaceholder());

    // Check Gemini key configuration on start
    checkConfigStatus();

    // Load custom Google Client ID if saved
    const savedClientId = localStorage.getItem('custom_google_client_id') || import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
    if (savedClientId) {
      setCustomGoogleClientId(savedClientId);
    }

    // Load custom Gemini API Key if saved
    const savedGeminiKey = localStorage.getItem('custom_gemini_api_key') || '';
    if (savedGeminiKey) {
      setCustomGeminiKey(savedGeminiKey);
    }

    const savedGeminiKey2 = localStorage.getItem('custom_gemini_api_key_2') || '';
    if (savedGeminiKey2) {
      setCustomGeminiKey2(savedGeminiKey2);
    }

    // Load clients history from localStorage
    const savedClients = localStorage.getItem('kyc_clients_history');
    if (savedClients) {
      try {
        setClients(JSON.parse(savedClients));
      } catch (e) {
        console.error('Error loading history:', e);
      }
    }

    // Initialize Google Firebase Auth
    const unsubscribe = initAuth(
      (user, token) => {
        setGoogleUser(user);
        setOauthToken(token);
      },
      () => {
        setGoogleUser(null);
        setOauthToken(null);
      }
    );

    // Listen for direct Google OAuth messages (used on custom domains like Vercel)
    const handleOAuthMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data?.type === 'GOOGLE_OAUTH_SUCCESS' && event.data?.token) {
        const token = event.data.token;
        setOauthToken(token);
        
        // Fetch user info from Google's profile endpoint
        try {
          const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            setGoogleUser({
              displayName: data.name || data.given_name || 'Google User',
              email: data.email || '',
              photoURL: data.picture || null,
            } as any);
          } else {
            setGoogleUser({
              displayName: 'Connected Google User',
              email: '',
              photoURL: null,
            } as any);
          }
        } catch (e) {
          console.error('Error fetching Google user info:', e);
          setGoogleUser({
            displayName: 'Connected Google User',
            email: '',
            photoURL: null,
          } as any);
        }
      } else if (event.data?.type === 'GOOGLE_OAUTH_SUCCESS' && event.data?.token) {
        // do nothing
      } else if (event.data?.type === 'GOOGLE_OAUTH_FAILURE') {
        setExportError('Failed to connect to Google: ' + (event.data.error || 'Access denied'));
      }
    };

    window.addEventListener('message', handleOAuthMessage);

    return () => {
      unsubscribe();
      window.removeEventListener('message', handleOAuthMessage);
    };
  }, []);

  // Fetch folders from Drive
  const fetchDriveFolders = async (token = oauthToken) => {
    if (!token) return;
    setLoadingDrive(true);
    try {
      const folders = await getAllKYCFolders(token);
      setDriveFolders(folders);
    } catch (err) {
      console.error('Error fetching drive folders:', err);
    } finally {
      setLoadingDrive(false);
    }
  };

  // Fetch files inside a folder
  const fetchFilesForFolder = async (folderId: string, token = oauthToken) => {
    if (!token || !folderId) return;
    setLoadingDriveFiles(true);
    try {
      const files = await getFilesInFolder(token, folderId);
      setActiveFolderFiles(files);
    } catch (err) {
      console.error('Error fetching folder files:', err);
    } finally {
      setLoadingDriveFiles(false);
    }
  };

  // Create an additional note/annex inside a folder
  const handleCreateNote = async () => {
    if (!oauthToken || !activeFolderId) {
      alert('Error: No active folder selected.');
      return;
    }
    if (!newNoteTitle.trim() || !newNoteContent.trim()) {
      alert('Please enter the title and content of the compliance note.');
      return;
    }

    setIsSavingNote(true);
    setNoteSuccessMessage(null);
    try {
      const noteTitleWithApp = `${newNoteTitle.trim()} - Compliance Memo`;
      const contentWithHeading = `${newNoteTitle.trim()}\n===================\nDate: ${new Date().toLocaleString()}\n\n${newNoteContent.trim()}`;
      
      await createAdditionalNote(
        oauthToken,
        activeFolderId,
        noteTitleWithApp,
        contentWithHeading
      );
      
      setNoteSuccessMessage('Compliance note successfully saved in Google Drive!');
      setNewNoteTitle('');
      setNewNoteContent('');
      setShowNoteForm(false);
      
      // Refresh current folder file list
      await fetchFilesForFolder(activeFolderId, oauthToken);
      
      // Clear success notification after a few seconds
      setTimeout(() => setNoteSuccessMessage(null), 5000);
    } catch (err: any) {
      console.error('Error creating compliance note:', err);
      alert('Could not create compliance note in Drive: ' + (err.message || err));
    } finally {
      setIsSavingNote(false);
    }
  };

  // Sync drive workspace on login/logout
  useEffect(() => {
    if (oauthToken) {
      fetchDriveFolders(oauthToken);
    } else {
      setDriveFolders([]);
      setActiveFolderId(null);
      setActiveFolderFiles([]);
    }
  }, [oauthToken]);

  // Sync folder files when active folder changes
  useEffect(() => {
    if (activeFolderId && oauthToken) {
      fetchFilesForFolder(activeFolderId, oauthToken);
    } else {
      setActiveFolderFiles([]);
    }
  }, [activeFolderId, oauthToken]);

  // Handle Google Login for exporting
  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    setExportError(null);
    
    // Check if we are on a custom domain (like Vercel)
    const isCustomDomain = window.location.hostname !== 'localhost' && 
                           !window.location.hostname.endsWith('.run.app') &&
                           !window.location.hostname.endsWith('.local');

    if (isCustomDomain || customGoogleClientId) {
      try {
        googleSignInDirect(customGoogleClientId || undefined);
      } catch (err: any) {
        if (err.message === 'POPUP_BLOCKED') {
          setExportError('The browser blocked the login popup window. Please allow popups for this site.');
        } else {
          setExportError('Error initiating direct Google Sign-In: ' + err.message);
        }
        setIsLoggingIn(false);
      }
      return;
    }

    try {
      const result = await googleSignIn();
      if (result) {
        setGoogleUser(result.user);
        setOauthToken(result.accessToken);
      }
    } catch (err: any) {
      if (err.message === 'CONFIG_REQUIRED') {
        alert('Configuration Required: To connect Google Workspace, you must first accept the Google OAuth setup window (see the card below the chat). In the meantime, you can continue using the application locally.');
      } else {
        // Fallback to direct sign-in if Firebase popup fails!
        console.warn('Firebase login failed, trying Direct Google OAuth fallback:', err);
        try {
          googleSignInDirect();
        } catch (fallbackErr: any) {
          setExportError('Failed to connect with Google: ' + err.message);
        }
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Handle Log out
  const handleLogout = async () => {
    await logout();
    setGoogleUser(null);
    setOauthToken(null);
    setExportedDocUrl(null);
    setExportedFolderUrl(null);
    setExportedFolderName(null);
  };

  // Pre-fill transcript from templates
  const selectTemplate = (template: TranscriptTemplate) => {
    setTranscript(template.text);
    setError(null);
    setExportedDocUrl(null);
    setExportedFolderUrl(null);
    setExportedFolderName(null);
  };

  // Analyze transcript with server-side Gemini API
  const handleAnalyze = async () => {
    if (!transcript.trim()) {
      setError('Please type or paste the call transcript before performing the analysis.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setExportedDocUrl(null);
    setExportedFolderUrl(null);
    setExportedFolderName(null);
    setExportError(null);

    try {
      const savedKey = localStorage.getItem('custom_gemini_api_key') || '';
      const savedKey2 = localStorage.getItem('custom_gemini_api_key_2') || '';
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gemini-key': savedKey,
          'x-gemini-key-2': savedKey2,
        },
        body: JSON.stringify({ transcript }),
      });

      if (!response.ok) {
        let errorMessage = 'Failed to communicate with the analysis server.';
        try {
          const errText = await response.text();
          try {
            const errData = JSON.parse(errText);
            if (errData && errData.error) {
              errorMessage = errData.error;
            }
          } catch (jsonErr) {
            // Response was not JSON (e.g. Vercel serverless function crash returning HTML)
            if (response.status === 500 || response.status === 502 || response.status === 504) {
              errorMessage = `Vercel Server Error (Status ${response.status}). This usually occurs if you have not configured the GEMINI_API_KEY environment variable in your Vercel panel. Please make sure to add GEMINI_API_KEY in Vercel > Settings > Environment Variables.`;
            } else if (errText && errText.length < 200) {
              errorMessage = `Server Error (${response.status}): ${errText}`;
            } else {
              errorMessage = `Communication Error (${response.status}). You likely need to configure GEMINI_API_KEY in your Vercel environment variables.`;
            }
          }
        } catch (readErr) {
          errorMessage = `Could not connect to the server (Status ${response.status}).`;
        }
        throw new Error(errorMessage);
      }

      const result: KYCAnalysisResult = await response.json();
      setCurrentResult(result);
      
      // Auto-save analyzed client to local storage directory
      saveClientRecord(result);

      // If already connected to Google Drive, automatically upload it!
      if (oauthToken) {
        handleExportToGoogleDoc(result);
      }

    } catch (err: any) {
      console.error('Analysis error:', err);
      setError(err.message || 'Error processing the transcript with Artificial Intelligence.');
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to save analyzed record to the client list
  const saveClientRecord = (record: KYCAnalysisResult) => {
    const newRecord: ClientRecord = {
      ...record,
      id: Math.random().toString(36).substr(2, 9),
      analyzedAt: new Date().toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }),
      transcriptSample: transcript
    };

    setClients(prev => {
      // Avoid duplicated companies in history
      const filtered = prev.filter(c => c.companyName.toLowerCase() !== record.companyName.toLowerCase());
      const updated = [newRecord, ...filtered];
      localStorage.setItem('kyc_clients_history', JSON.stringify(updated));
      return updated;
    });
  };

  // Load a record from history
  const loadClientFromHistory = (record: ClientRecord) => {
    setCurrentResult(record);
    setTranscript(record.transcriptSample);
    setExportedDocUrl(null);
    setExportError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Delete a record from history
  const deleteRecord = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = window.confirm('Are you sure you want to delete this client from the local history?');
    if (!confirmed) return;

    setClients(prev => {
      const updated = prev.filter(c => c.id !== id);
      localStorage.setItem('kyc_clients_history', JSON.stringify(updated));
      return updated;
    });

    if (currentResult && clients.find(c => c.id === id)?.companyName === currentResult.companyName) {
      setCurrentResult(null);
    }
  };

  // Create HTML Report in Google Drive
  const handleExportToGoogleDoc = async (resultToExport?: KYCAnalysisResult) => {
    const targetResult = resultToExport || currentResult;
    if (!oauthToken || !targetResult) return;
    setExportingDoc(true);
    setExportError(null);
    setExportedDocUrl(null);
    setExportedFolderUrl(null);
    setExportedFolderName(null);
    setExportedFolderId(null);
    setExportedDocId(null);

    try {
      const { docUrl, folderUrl, folderName, folderId, documentId } = await createKYCDocument(oauthToken, targetResult);
      setExportedDocUrl(docUrl);
      setExportedFolderUrl(folderUrl);
      setExportedFolderName(folderName);
      setExportedFolderId(folderId || null);
      setExportedDocId(documentId || null);
      
      // Auto-focus on the newly created or retrieved folder
      if (folderId) {
        setActiveFolderId(folderId);
      }
      
      // Refresh the visual directory listing
      await fetchDriveFolders(oauthToken);
    } catch (err: any) {
      console.error('Google Drive HTML export error:', err);
      setExportError('Failed to export HTML Report to Google Drive: ' + (err.message || err));
    } finally {
      setExportingDoc(false);
    }
  };

  // Download Local HTML Report
  const handleDownloadLocalHTML = () => {
    if (!currentResult) return;

    const isCompliantText = currentResult.isCompliant ? 'COMPLIANT (YES)' : 'NON-COMPLIANT ALERT (NO - POLICY BREACH)';
    const severityText = currentResult.breachSeverity === 'CRITICAL' ? 'CRITICAL' : 'NONE';

    const rawQ = currentResult.questionnaire || {};
    const sanitizeVal = (val: any, fallback: string) => {
      if (val === undefined || val === null) return fallback;
      const s = String(val).trim();
      if (
        !s || 
        s.toLowerCase() === 'none' || 
        s.toLowerCase() === 'unknown' || 
        s.toLowerCase() === 'n/a' ||
        s === '(no me lo ha contestado)' ||
        s.toLowerCase() === '(no me lo ha contestado)' ||
        s === '(not answered)' ||
        s.toLowerCase() === '(not answered)' ||
        s.toLowerCase() === '(not answered / not provided)'
      ) {
        return fallback;
      }
      return s;
    };

    const fallbackText = '(Not answered / Not provided)';
    const q = {
      q1_name: sanitizeVal(rawQ.q1_name, currentResult.clientName || fallbackText),
      q2_source: sanitizeVal(rawQ.q2_source, fallbackText),
      q3_country: sanitizeVal(rawQ.q3_country, currentResult.country || fallbackText),
      q4_address_phone: sanitizeVal(rawQ.q4_address_phone, currentResult.contactInfo || fallbackText),
      q5_company_name: sanitizeVal(rawQ.q5_company_name, currentResult.companyName || fallbackText),
      q6_activity: sanitizeVal(rawQ.q6_activity, currentResult.role || fallbackText),
      q7_statutory_db: sanitizeVal(rawQ.q7_statutory_db, currentResult.taxId && currentResult.taxId !== 'None' ? `${currentResult.taxId} - ${currentResult.taxIdResearch || ''}` : fallbackText),
      q8_formation_date: sanitizeVal(rawQ.q8_formation_date, fallbackText),
      q9_years_trading: sanitizeVal(rawQ.q9_years_trading, fallbackText),
      q10_shipping: sanitizeVal(rawQ.q10_shipping, fallbackText),
      q11_channel: sanitizeVal(rawQ.q11_channel, fallbackText),
      q12_goods_in: sanitizeVal(rawQ.q12_goods_in, fallbackText),
      q13_stock_shipping: sanitizeVal(rawQ.q13_stock_shipping, fallbackText),
      q14_average_rrp: sanitizeVal(rawQ.q14_average_rrp, fallbackText),
      q15_start_date: sanitizeVal(rawQ.q15_start_date, fallbackText),
      q16_kyc: sanitizeVal(rawQ.q16_kyc, fallbackText),
      q17_capital: sanitizeVal(rawQ.q17_capital, fallbackText),
      q18_europe: sanitizeVal(rawQ.q18_europe, fallbackText),
      q19_pricing: sanitizeVal(rawQ.q19_pricing, fallbackText),
      q20_other: sanitizeVal(rawQ.q20_other, fallbackText)
    };

    const questionnaireFields = [
      { num: 1, label: "Name (primary contact / principal)", key: "q1_name" },
      { num: 2, label: "Source (how client came; referrer)", key: "q2_source" },
      { num: 3, label: "Country / residence", key: "q3_country" },
      { num: 4, label: "Address and telephone number", key: "q4_address_phone" },
      { num: 5, label: "Name of company (legal & trading)", key: "q5_company_name" },
      { num: 6, label: "Activity (what business does; products)", key: "q6_activity" },
      { num: 7, label: "Companies House / Statutory DB", key: "q7_statutory_db" },
      { num: 8, label: "Date of formation", key: "q8_formation_date" },
      { num: 9, label: "Years trading", key: "q9_years_trading" },
      { num: 10, label: "Shipping (volumes; markets; carriers)", key: "q10_shipping" },
      { num: 11, label: "Channel (D2C / B2B / marketplace)", key: "q11_channel" },
      { num: 12, label: "Goods in / source (origin of stock)", key: "q12_goods_in" },
      { num: 13, label: "Stock & shipping (SKUs; fulfilment)", key: "q13_stock_shipping" },
      { num: 14, label: "Average RRP (order value / weight)", key: "q14_average_rrp" },
      { num: 15, label: "Start date (target go-live)", key: "q15_start_date" },
      { num: 16, label: "KYC checks (UBO IDs; certified docs)", key: "q16_kyc" },
      { num: 17, label: "Capital (funding position; funds origin)", key: "q17_capital" },
      { num: 18, label: "Europe (EU ops; VAT registrations)", key: "q18_europe" },
      { num: 19, label: "Pricing (agreed card; B2B charges)", key: "q19_pricing" },
      { num: 20, label: "Other (notes; special risks)", key: "q20_other" }
    ];

    const questionnaireHtml = `
        <div class="card" style="margin-bottom: 30px; background-color: #fcfdfd; border: 1px solid #e2e8f0; padding: 24px;">
            <h3 style="color: #047857; border-bottom: 2px solid #a7f3d0; padding-bottom: 8px; margin-bottom: 16px; font-size: 18px;">
                📋 Huboo Onboarding Questionnaire
            </h3>
            <div style="display: grid; grid-template-columns: 1fr; gap: 16px;">
                ${questionnaireFields.map(field => {
                  const val = (q as any)[field.key] || fallbackText;
                  const isUnanswered = val === fallbackText || val.includes('(no me lo ha contestado)');
                  const answerBg = isUnanswered ? '#fef3c7' : '#f8fafc';
                  const answerColor = isUnanswered ? '#b45309' : '#1e293b';
                  const answerStyle = isUnanswered ? 'font-style: italic;' : '';
                  return `
                    <div style="border-bottom: 1px dashed #e2e8f0; padding-bottom: 12px;">
                        <span style="font-size: 11px; font-weight: bold; color: #64748b; font-family: monospace;">QUESTION ${field.num}</span>
                        <strong style="display: block; font-size: 13px; color: #334155; margin-bottom: 4px;">${field.label}</strong>
                        <div style="background-color: ${answerBg}; color: ${answerColor}; ${answerStyle} padding: 10px; border-radius: 4px; font-size: 13px; border-left: 3px solid ${isUnanswered ? '#f59e0b' : '#3b82f6'};">
                            ${val}
                        </div>
                    </div>
                  `;
                }).join('')}
            </div>
        </div>
    `;

    const taxIdHtml = currentResult.taxId && currentResult.taxId !== 'None' ? `
        <div class="card" style="margin-bottom: 30px;">
            <h3>6. Tax Identification & Registry Research (VAT/CIF/NIF)</h3>
            <p><strong>Extracted Tax ID:</strong> ${currentResult.taxId}</p>
            <div style="background-color: white; padding: 12px; border-radius: 6px; border: 1px solid #cbd5e1; font-style: italic; font-size: 13px; margin-top: 10px; color: #475569;">
                ${currentResult.taxIdResearch}
            </div>
        </div>
    ` : `
        <div class="card" style="margin-bottom: 30px; opacity: 0.75;">
            <h3>6. Tax Identification & Registry Research (VAT/CIF/NIF)</h3>
            <p>No NIF, CIF, or VAT tax registration numbers were identified in the conversation transcript for registry verification.</p>
        </div>
    `;

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>KYC Compliance Report - ${currentResult.companyName}</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; padding: 40px; margin: 0; }
        .container { max-width: 850px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; }
        h1 { color: #0f172a; margin-top: 0; font-size: 24px; border-bottom: 2px solid #cbd5e1; padding-bottom: 12px; }
        .badge { display: inline-block; padding: 6px 12px; border-radius: 9999px; font-weight: bold; font-size: 14px; margin-bottom: 20px; }
        .badge-success { background-color: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }
        .badge-error { background-color: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
        .card { background-color: #f1f5f9; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; }
        .card h3 { margin-top: 0; color: #334155; font-size: 16px; }
        ul { padding-left: 20px; }
        li { margin-bottom: 8px; }
        .footer { text-align: center; margin-top: 40px; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>KYC Compliance Audit Report</h1>
        <div class="badge ${currentResult.isCompliant ? 'badge-success' : 'badge-error'}">
            Compliance Status: ${isCompliantText}
        </div>
        
        <div class="grid">
            <div class="card">
                <h3>1. Counterparty General Information</h3>
                <p><strong>Contact/Client:</strong> ${currentResult.clientName}</p>
                <p><strong>Company Name:</strong> ${currentResult.companyName}</p>
                <p><strong>Role / Title:</strong> ${currentResult.role}</p>
                <p><strong>Country / Jurisdiction:</strong> ${currentResult.country}</p>
                <p><strong>Contact Info:</strong> ${currentResult.contactInfo}</p>
            </div>
            
            <div class="card">
                <h3>2. KYC Checklist Status</h3>
                <p><strong>Legal Identity:</strong> ${currentResult.kycChecklist.identityEstablished ? '🟢 Verified' : '❌ Pending'}</p>
                <p><strong>UBO Ownership:</strong> ${currentResult.kycChecklist.ownershipVerified ? '🟢 Verified' : '❌ Pending'}</p>
                <p><strong>Business purpose:</strong> ${currentResult.kycChecklist.businessActivityDefined ? '🟢 Verified' : '❌ Pending'}</p>
                <p><strong>Risk Assessment:</strong> ${currentResult.kycChecklist.riskAssessmentCompleted ? '🟢 Verified' : '❌ Pending'}</p>
            </div>
        </div>

        ${questionnaireHtml}

        <div class="card" style="margin-bottom: 30px;">
            <h3>3. Summary of Commercial Topics Discussed</h3>
            <p>${currentResult.commercialDetailsFound}</p>
            <p><strong>Alert Severity Level:</strong> ${severityText}</p>
        </div>

        <div class="card" style="margin-bottom: 30px;">
            <h3>4. Mandatory Regularization Next Steps</h3>
            <ul>
                ${currentResult.nextStepsRequired.map(step => `<li>${step}</li>`).join('')}
            </ul>
        </div>

        <div class="card" style="margin-bottom: 30px;">
            <h3>5. Conversation Summary</h3>
            <p>${currentResult.summaryOfCall}</p>
        </div>

        ${taxIdHtml}

        <div class="footer">
            Automatically generated by KYC Compliance Automator - Corporate Zero-Tolerance Security Protocol.
        </div>
    </div>
</body>
</html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `KYC_Compliance_Report_${currentResult.companyName.replace(/\s+/g, '_')}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      {/* Header: Authority & Protocol */}
      <header className="bg-slate-900 text-white px-8 py-4 flex flex-col md:flex-row justify-between items-center border-b-4 border-red-600 gap-4 shadow-lg shadow-slate-900/10">
        <div>
          <h1 className="text-xl font-bold tracking-tight uppercase font-display flex items-center gap-2.5">
            KYC Compliance Automator
            <span className="text-[10px] bg-red-950 text-red-400 font-mono px-2 py-0.5 rounded border border-red-800 font-semibold uppercase tracking-wider">
              Zero Tolerance
            </span>
          </h1>
          <p className="text-xs text-slate-400 font-mono mt-0.5">ZERO-TOLERANCE POLICY: KYC COMPLETION MANDATORY BEFORE COMMERCIALS</p>
        </div>
        
        <div className="flex items-center gap-4 text-sm flex-wrap justify-end">
          <div className="flex items-center gap-2 bg-red-950/80 border border-red-500/50 px-3 py-1.5 rounded">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
            <span className="font-mono text-xs font-bold text-red-200">RESTRICTED MODE ACTIVE</span>
          </div>

          <div className="h-8 w-[1px] bg-slate-700 hidden sm:block"></div>

          {/* Auth status bar */}
          <div className="flex items-center gap-3 bg-slate-800/80 px-4 py-1.5 rounded border border-slate-700/60 shadow-sm">
            {googleUser ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-indigo-600 border border-indigo-400 flex items-center justify-center text-xs font-bold text-white">
                    {googleUser.displayName ? googleUser.displayName.charAt(0) : 'U'}
                  </div>
                  <div className="text-left hidden md:block">
                    <p className="text-[10px] font-semibold text-white leading-3">Connected</p>
                    <p className="text-[9px] text-slate-300 leading-none mt-0.5">{googleUser.email}</p>
                  </div>
                </div>
                <button 
                  onClick={handleLogout}
                  className="text-slate-400 hover:text-red-400 p-1 rounded hover:bg-slate-700 transition"
                  title="Sign Out Google"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse"></span>
                <span className="text-[11px] text-slate-300 font-medium">Drive offline</span>
                <button
                  onClick={handleGoogleLogin}
                  disabled={isLoggingIn}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-[11px] py-1 px-2.5 rounded flex items-center gap-1 transition disabled:opacity-50 cursor-pointer"
                >
                  <Lock className="w-3 h-3" />
                  {isLoggingIn ? 'Connecting...' : 'Connect Drive'}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-6 md:py-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: Transcript Input & Configuration */}
        <section id="input-section" className="lg:col-span-5 flex flex-col gap-6">
          
          {/* Policy Instructions */}
          <div className="bg-white border-t-4 border-red-600 p-5 rounded shadow-sm border-x border-b border-slate-200 relative overflow-hidden">
            <div className="absolute right-0 top-0 w-24 h-24 bg-gradient-to-br from-red-500/5 to-amber-500/5 rounded-full blur-2xl"></div>
            <h2 className="font-display font-semibold text-xs tracking-wider text-red-600 uppercase flex items-center gap-2 mb-2.5">
              <ShieldAlert className="w-4 h-4 text-red-600" />
              ZERO-TOLERANCE PROTOCOL
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed mb-3">
              Under no circumstances is it permitted to engage in commercial discussions, quote rates, or draft contracts with counterparties without first fully completing the <strong className="text-slate-900">Basic KYC Checklist</strong>.
            </p>
            <div className="border-t border-slate-100 pt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-slate-500 font-mono">
              <span className="flex items-center gap-1 text-emerald-600">🟢 Authorized: Request documentation</span>
              <span className="flex items-center gap-1 text-red-600">🔴 Forbidden: Discuss prices</span>
            </div>
          </div>

          {/* Transcript Analysis Box */}
          <div className="bg-white p-6 rounded border border-slate-200 shadow-sm flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <h2 className="font-display font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-slate-500" />
                Input Conversation
              </h2>
              {transcript && (
                <button 
                  onClick={() => { setTranscript(''); setError(null); setCurrentResult(null); }}
                  className="text-slate-400 hover:text-slate-600 text-xs font-semibold uppercase tracking-wider font-mono"
                >
                  Clear
                </button>
              )}
            </div>

            <p className="text-xs text-slate-500 -mt-2">
              Paste the transcript of the chat, call, or email you had with the counterparty to analyze compliance with the protocol.
            </p>

            <textarea
              id="transcript-input"
              value={transcript}
              onChange={(e) => { setTranscript(e.target.value); if (error) setError(null); }}
              placeholder="Ejemplo: 'Hola, soy Juan de la Empresa X. Queríamos saber sus tarifas mensuales y si nos pueden hacer descuento de una vez...'"
              className="w-full h-64 p-4 border border-slate-200 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600 bg-slate-50/50 resize-y"
            />

            {error && (
              <div className="bg-red-50 text-red-800 text-xs p-4 rounded border border-red-200 flex flex-col gap-2.5 animate-fadeIn">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                  <p className="font-semibold text-red-950">{error}</p>
                </div>
                {error.includes('GEMINI_API_KEY') && (
                  <div className="text-[11px] bg-white/70 p-3 rounded border border-red-100 flex flex-col gap-1.5 text-slate-700 font-sans mt-0.5">
                    <div className="font-bold text-red-900">Steps to resolve the API error in Vercel:</div>
                    <ol className="list-decimal pl-4 flex flex-col gap-1.5 text-slate-600">
                      <li>Open your project panel in <a href="https://vercel.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline font-semibold">Vercel</a>.</li>
                      <li>Go to the <strong>Settings</strong> tab at the top.</li>
                      <li>Click on the <strong>Environment Variables</strong> section on the left.</li>
                      <li>Create a new variable with the key: <code className="bg-slate-200 px-1 py-0.5 rounded text-red-600 font-mono font-bold select-all">GEMINI_API_KEY</code></li>
                      <li>Paste your Gemini API Key value into the value field.</li>
                      <li>Click <strong>Save</strong> to save it.</li>
                      <li><em>Important!</em> Go to the <strong>Deployments</strong> tab of your project in Vercel, click on the three dots of your last deployment and select <strong>Redeploy</strong> to make the changes take effect.</li>
                    </ol>
                  </div>
                )}
              </div>
            )}

            {/* Vercel Server Diagnostics Status Card */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded text-xs flex flex-col gap-2.5">
              <div className="flex flex-col gap-3">
                {/* Key 1 Status & Test Button */}
                <div className="flex justify-between items-center bg-white p-2 rounded border border-slate-100 shadow-xs">
                  <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${hasGeminiKey === null ? 'bg-amber-400 animate-pulse' : hasGeminiKey ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    Primary Key (Key 1): {hasGeminiKey === null ? 'Checking...' : hasGeminiKey ? '🟢 Detected' : '🔴 NOT Detected'}
                  </span>
                  <button
                    type="button"
                    onClick={() => testGeminiConnection(1)}
                    disabled={testingConnection}
                    className="text-indigo-600 hover:text-indigo-800 font-bold uppercase text-[9px] font-mono flex items-center gap-1 cursor-pointer disabled:opacity-50 px-2 py-1 bg-indigo-50 hover:bg-indigo-100 rounded transition"
                    title="Test actual connection of the Primary Key"
                  >
                    {testingConnectionKey === 1 ? 'Testing...' : 'Test'}
                  </button>
                </div>

                {/* Key 2 Status & Test Button */}
                <div className="flex justify-between items-center bg-white p-2 rounded border border-slate-100 shadow-xs">
                  <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${hasGeminiKey2 === null ? 'bg-amber-400 animate-pulse' : hasGeminiKey2 ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    Secondary Key (Key 2): {hasGeminiKey2 === null ? 'Checking...' : hasGeminiKey2 ? '🟢 Detected (Active Backup)' : '⚪ Not Configured'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {hasGeminiKey2 && (
                      <button
                        type="button"
                        onClick={() => testGeminiConnection(2)}
                        disabled={testingConnection}
                        className="text-indigo-600 hover:text-indigo-800 font-bold uppercase text-[9px] font-mono flex items-center gap-1 cursor-pointer disabled:opacity-50 px-2 py-1 bg-indigo-50 hover:bg-indigo-100 rounded transition"
                        title="Test actual connection of the Secondary Key"
                      >
                        {testingConnectionKey === 2 ? 'Testing...' : 'Test'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={checkConfigStatus}
                      disabled={checkingConfig}
                      className="text-indigo-600 hover:text-indigo-800 font-bold uppercase text-[9px] font-mono flex items-center gap-1 cursor-pointer disabled:opacity-50 px-2 py-1 bg-indigo-50 hover:bg-indigo-100 rounded transition"
                      title="Update configuration status"
                    >
                      <RefreshCw className={`w-2.5 h-2.5 ${checkingConfig ? 'animate-spin' : ''}`} />
                      {checkingConfig ? '...' : 'Check'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Display connection test result */}
              {connectionResult && (
                <div className={`p-2.5 rounded text-[11px] leading-relaxed border animate-fadeIn ${connectionResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
                  <div className="font-bold flex items-center gap-1 mb-0.5">
                    {connectionResult.success ? '✓ Successful Connection!' : '✗ Connection Error'}
                  </div>
                  <p className="text-[10px] text-slate-700 font-sans">
                    {connectionResult.success 
                      ? `${connectionResult.message} Verified model: ${connectionResult.model}` 
                      : connectionResult.error}
                  </p>
                </div>
              )}

              {/* Custom manual Gemini API Key inputs */}
              <div className="border-t border-slate-200 pt-2 flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowCustomGeminiInput(!showCustomGeminiInput)}
                  className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 cursor-pointer text-left leading-tight"
                >
                  <Key className="w-3 h-3 shrink-0" />
                  {showCustomGeminiInput ? 'Hide manual API Key settings' : 'Want to enter your Gemini API Key manually? (Quick alternative)'}
                </button>
                
                {showCustomGeminiInput && (
                  <div className="p-2.5 bg-white border border-indigo-100 rounded flex flex-col gap-3.5 mt-1 animate-fadeIn">
                    <p className="text-[10px] leading-relaxed text-slate-500">
                      If you have issues with Vercel environment variables, enter your Gemini API Keys here. They will be saved securely in your browser and used immediately.
                    </p>
                    
                    {/* Key 1 Input */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Primary Key (Key 1)</label>
                      <div className="flex gap-1.5">
                        <input
                          type="password"
                          value={customGeminiKey}
                          onChange={(e) => setCustomGeminiKey(e.target.value)}
                          placeholder="AIzaSy... (Primary Key)"
                          className="bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 w-full focus:outline-none focus:border-indigo-500 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const trimmed = customGeminiKey.trim();
                            if (!trimmed) {
                              alert('Please enter a valid key.');
                              return;
                            }
                            localStorage.setItem('custom_gemini_api_key', trimmed);
                            alert('Gemini Primary Key (Key 1) saved successfully.');
                            checkConfigStatus();
                          }}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] px-2.5 py-1 rounded transition cursor-pointer shrink-0"
                        >
                          Save
                        </button>
                        {localStorage.getItem('custom_gemini_api_key') && (
                          <button
                            type="button"
                            onClick={() => {
                              localStorage.removeItem('custom_gemini_api_key');
                              setCustomGeminiKey('');
                              alert('Your manual Primary Key was deleted.');
                              checkConfigStatus();
                            }}
                            className="bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-semibold text-[10px] px-2 py-1 rounded transition cursor-pointer shrink-0"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Key 2 Input */}
                    <div className="flex flex-col gap-1 border-t border-slate-100 pt-2.5">
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Secondary Key (Key 2 / Backup)</label>
                      <div className="flex gap-1.5">
                        <input
                          type="password"
                          value={customGeminiKey2}
                          onChange={(e) => setCustomGeminiKey2(e.target.value)}
                          placeholder="AIzaSy... (Secondary Key)"
                          className="bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 w-full focus:outline-none focus:border-indigo-500 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const trimmed = customGeminiKey2.trim();
                            if (!trimmed) {
                              alert('Please enter a valid backup key.');
                              return;
                            }
                            localStorage.setItem('custom_gemini_api_key_2', trimmed);
                            alert('Gemini Secondary Key (Key 2) saved successfully.');
                            checkConfigStatus();
                          }}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] px-2.5 py-1 rounded transition cursor-pointer shrink-0"
                        >
                          Save
                        </button>
                        {localStorage.getItem('custom_gemini_api_key_2') && (
                          <button
                            type="button"
                            onClick={() => {
                              localStorage.removeItem('custom_gemini_api_key_2');
                              setCustomGeminiKey2('');
                              alert('Your manual Secondary Key was deleted.');
                              checkConfigStatus();
                            }}
                            className="bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-semibold text-[10px] px-2 py-1 rounded transition cursor-pointer shrink-0"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              {hasGeminiKey === false && (
                <div className="text-[11px] text-slate-600 space-y-1.5 border-t border-slate-100 pt-2.5 animate-fadeIn">
                  <p className="font-medium text-rose-700">⚠️ Vercel has not loaded your GEMINI_API_KEY yet.</p>
                  <p className="leading-relaxed">
                    If you already added the variable in Vercel, this error happens because <strong>Vercel requires a new deployment (Redeploy)</strong> to apply new variables. Variables do not update automatically on existing deployments.
                  </p>
                  <div className="bg-white p-2.5 rounded border border-rose-100 mt-1">
                    <div className="font-bold text-slate-800 text-[10px] mb-1">Steps to activate the key immediately:</div>
                    <ol className="list-decimal pl-4 text-[10px] space-y-1.5 text-slate-500">
                      <li>Go to your project on <a href="https://vercel.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline font-semibold">Vercel</a> and enter the <strong>Deployments</strong> tab.</li>
                      <li>Find your last deployment (the active one), click on the <strong>three dots (...)</strong> on the right and select <strong>Redeploy</strong>.</li>
                      <li>Once the deployment finishes (takes about 30 seconds), click on the <strong>"Check"</strong> button above.</li>
                    </ol>
                  </div>
                </div>
              )}

              {hasGeminiKey2 === false && (
                <div className="text-[11px] text-slate-600 space-y-1.5 border-t border-slate-100 pt-2.5 animate-fadeIn">
                  <p className="font-medium text-slate-700">⚪ Secondary Key (Key 2 / Backup) not configured on Vercel.</p>
                  <p className="leading-relaxed">
                    We recommend configuring <code className="bg-slate-200 px-1 py-0.5 rounded text-indigo-600 font-mono font-bold">GEMINI_API_KEY_2</code> as <strong>gemini-3.5-flash</strong> to act as an automatic backup against quota limits (failover).
                  </p>
                  <div className="bg-white p-2.5 rounded border border-slate-100 mt-1">
                    <div className="font-bold text-slate-800 text-[10px] mb-1">Steps to configure API Key 2 on Vercel:</div>
                    <ol className="list-decimal pl-4 text-[10px] space-y-1.5 text-slate-500">
                      <li>Open your project on <a href="https://vercel.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline font-semibold">Vercel</a>.</li>
                      <li>Go to the <strong>Settings</strong> tab at the top.</li>
                      <li>Click on the <strong>Environment Variables</strong> section on the left.</li>
                      <li>Create a new variable with the key: <code className="bg-slate-200 px-1 py-0.5 rounded text-indigo-600 font-mono font-bold select-all">GEMINI_API_KEY_2</code></li>
                      <li>Paste your backup Gemini API key in the value field.</li>
                      <li>Click <strong>Save</strong>.</li>
                      <li><strong>Important!</strong> Go to the <strong>Deployments</strong> tab, click on the <strong>three dots (...)</strong> of your last deployment and select <strong>Redeploy</strong> to apply the new backup key.</li>
                    </ol>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleAnalyze}
              disabled={isLoading || !transcript.trim()}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs uppercase tracking-wider py-3 px-4 rounded flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Analyzing Compliance...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Verify Compliance
                </>
              )}
            </button>
          </div>

          {/* Quick Test Cases / Templates */}
          <div className="bg-white p-6 rounded border border-slate-200 shadow-sm flex flex-col gap-3">
            <h3 className="font-display font-bold text-slate-800 text-xs uppercase tracking-wider">
              Quick Test Cases
            </h3>
            <p className="text-xs text-slate-500 -mt-1">
              Test instantly with these pre-configured cases illustrating real scenarios:
            </p>

            <div className="flex flex-col gap-2 mt-1">
              {mockTranscripts.map((tpl, i) => (
                <button
                  key={i}
                  onClick={() => selectTemplate(tpl)}
                  className="text-left p-3.5 rounded border border-slate-200 hover:border-slate-400 hover:bg-slate-50/50 transition group flex flex-col gap-1.5 cursor-pointer bg-white"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-800 group-hover:text-slate-950 font-display">
                      {tpl.title}
                    </span>
                    <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                      tpl.expectedStatus === 'COMPLIANT' 
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                        : 'bg-red-100 text-red-800 border border-red-200'
                    }`}>
                      {tpl.expectedStatus === 'COMPLIANT' ? 'COMPLIANT' : 'BREACH'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                    {tpl.description}
                  </p>
                </button>
              ))}
            </div>
          </div>

        </section>

        {/* RIGHT COLUMN: Compliance Diagnostic Viewer (KYC & Alerts) */}
        <section id="results-section" className="lg:col-span-7 flex flex-col gap-6">
          
          {!currentResult ? (
            /* Empty Wait State: Commercial Gatekeeper Locked */
            <div className="bg-slate-100 rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-center p-8 py-14 relative overflow-hidden min-h-[550px] shadow-inner">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_0%,_rgba(0,0,0,0.02)_100%)]"></div>
              
              <div className="z-10 max-w-md">
                <div className="w-16 h-16 bg-slate-200 text-slate-500 rounded-full flex items-center justify-center mx-auto mb-5 shadow-sm">
                  <Lock className="w-8 h-8" />
                </div>
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest font-mono">Commercial Module Locked</h3>
                <h2 className="text-xl font-bold text-slate-900 mt-2 font-display">Awaiting Compliance Analysis</h2>
                <p className="text-xs text-slate-500 mt-3 px-4 leading-relaxed">
                  No drafting of offers, quoting prices, or discussing contract terms is permitted until the compliance analysis of the counterparty's conversation has been executed and approved.
                </p>
                
                <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
                  <button disabled className="px-5 py-2 text-[11px] font-bold tracking-wider uppercase bg-slate-300 text-slate-500 rounded cursor-not-allowed opacity-60">
                    GENERATE TERM SHEET
                  </button>
                  <button disabled className="px-5 py-2 text-[11px] font-bold tracking-wider uppercase border border-slate-300 text-slate-400 rounded cursor-not-allowed opacity-60">
                    BOOK SALES CALL
                  </button>
                </div>
              </div>
              
              <div className="mt-12 bg-red-50 border border-red-200 p-4 rounded text-left z-10 max-w-sm">
                <p className="text-[10px] text-red-700 font-bold uppercase mb-1 font-mono tracking-wider">Operational Risk Alert</p>
                <p className="text-[11px] text-red-900 leading-relaxed italic">
                  "Until the basic Onboarding Checklist has been validated, any exchange of quotes or rates is strictly prohibited under disciplinary sanction."
                </p>
              </div>
            </div>
          ) : (
            /* Active Diagnosis */
            <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              
              {/* Compliance Banner */}
              {currentResult.isCompliant ? (
                <div className="bg-emerald-50 text-emerald-800 border-b border-emerald-100 p-6 flex items-start gap-4">
                  <div className="bg-emerald-600 text-white p-2.5 rounded shadow shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-display font-bold text-sm tracking-wide text-emerald-950 flex items-center gap-2">
                      COMPLIANCE STATUS: COMPLIANT
                      <span className="bg-emerald-200 text-emerald-900 text-[10px] font-mono px-2 py-0.5 rounded font-semibold uppercase border border-emerald-300">
                        Approved
                      </span>
                    </h2>
                    <p className="text-xs text-emerald-700/90 mt-1 leading-relaxed">
                      This communication exchange strictly respects the protocol. No price negotiations or substantial contract discussions were initiated before requesting or obtaining KYC requirements. It is safe to continue the dialogue in accordance with onboarding rules.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-rose-50 text-rose-800 border-b border-rose-100 p-6 flex items-start gap-4 animate-pulse">
                  <div className="bg-rose-600 text-white p-2.5 rounded shadow shrink-0">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-display font-bold text-sm tracking-wide text-rose-950 flex items-center gap-2">
                      COMPLIANCE STATUS: BREACH DETECTED
                      <span className="bg-rose-200 text-rose-900 text-[10px] font-mono px-2 py-0.5 rounded font-semibold uppercase border border-rose-300">
                        Critical
                      </span>
                    </h2>
                    <p className="text-xs text-rose-700/90 mt-1 leading-relaxed">
                      <strong>Compliance Danger!</strong> Substantive commercial discussions (pricing, discount offers, quotes, or contract terms) have been detected before the basic KYC process was completed. You must immediately cease rate discussions and regularize the account by requesting the Onboarding Checklist.
                    </p>
                  </div>
                </div>
              )}

              {/* Report Content */}
              <div className="p-6 flex flex-col gap-6">
                
                {/* 1. Client / Counterparty Information */}
                <div>
                  <h3 className="font-display font-bold text-slate-800 text-xs uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <User className="w-4 h-4 text-slate-500" />
                    Counterparty Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded border border-slate-200 text-xs">
                    <div className="flex items-center gap-2.5">
                      <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <div>
                        <p className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold font-mono">Counterparty Name</p>
                        <p className="font-bold text-slate-800 mt-0.5">{currentResult.clientName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <div>
                        <p className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold font-mono">Company / Organization</p>
                        <p className="font-bold text-slate-800 mt-0.5">{currentResult.companyName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <div>
                        <p className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold font-mono">Jurisdiction of Origin</p>
                        <p className="font-bold text-slate-800 mt-0.5">{currentResult.country}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <div>
                        <p className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold font-mono">Role / Title</p>
                        <p className="font-bold text-slate-800 mt-0.5">{currentResult.role}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 md:col-span-2 border-t border-slate-200 pt-2.5 mt-1">
                      <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <div>
                        <p className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold font-mono">Extracted Contact Details</p>
                        <p className="font-semibold text-slate-700 mt-0.5">{currentResult.contactInfo}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. KYC Checklist */}
                <div>
                  <h3 className="font-display font-bold text-slate-800 text-xs uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-slate-500" />
                    Mandatory Corporate KYC Checklist
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    
                    <div className={`p-3.5 rounded border flex items-center justify-between ${
                      currentResult.kycChecklist.identityEstablished 
                        ? 'bg-emerald-50/50 border-emerald-200 text-emerald-950' 
                        : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}>
                      <div className="flex items-center gap-2">
                        {currentResult.kycChecklist.identityEstablished ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <span className="text-xs font-medium">Legal Identity Established</span>
                      </div>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                        currentResult.kycChecklist.identityEstablished ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-slate-200 text-slate-600 border-slate-300'
                      }`}>
                        {currentResult.kycChecklist.identityEstablished ? 'YES' : 'NO'}
                      </span>
                    </div>

                    <div className={`p-3.5 rounded border flex items-center justify-between ${
                      currentResult.kycChecklist.ownershipVerified 
                        ? 'bg-emerald-50/50 border-emerald-200 text-emerald-950' 
                        : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}>
                      <div className="flex items-center gap-2">
                        {currentResult.kycChecklist.ownershipVerified ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <span className="text-xs font-medium">Ultimate Beneficial Owners (UBO)</span>
                      </div>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                        currentResult.kycChecklist.ownershipVerified ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-slate-200 text-slate-600 border-slate-300'
                      }`}>
                        {currentResult.kycChecklist.ownershipVerified ? 'YES' : 'NO'}
                      </span>
                    </div>

                    <div className={`p-3.5 rounded border flex items-center justify-between ${
                      currentResult.kycChecklist.businessActivityDefined 
                        ? 'bg-emerald-50/50 border-emerald-200 text-emerald-950' 
                        : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}>
                      <div className="flex items-center gap-2">
                        {currentResult.kycChecklist.businessActivityDefined ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <span className="text-xs font-medium">Business Activity Defined</span>
                      </div>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                        currentResult.kycChecklist.businessActivityDefined ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-slate-200 text-slate-600 border-slate-300'
                      }`}>
                        {currentResult.kycChecklist.businessActivityDefined ? 'YES' : 'NO'}
                      </span>
                    </div>

                    <div className={`p-3.5 rounded border flex items-center justify-between ${
                      currentResult.kycChecklist.riskAssessmentCompleted 
                        ? 'bg-emerald-50/50 border-emerald-200 text-emerald-950' 
                        : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}>
                      <div className="flex items-center gap-2">
                        {currentResult.kycChecklist.riskAssessmentCompleted ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <span className="text-xs font-medium">Risk Profile Assessment</span>
                      </div>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                        currentResult.kycChecklist.riskAssessmentCompleted ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-slate-200 text-slate-600 border-slate-300'
                      }`}>
                        {currentResult.kycChecklist.riskAssessmentCompleted ? 'YES' : 'NO'}
                      </span>
                    </div>

                  </div>
                </div>

                {/* Tax Identification & Research */}
                <div className="bg-slate-50 border border-slate-200 rounded p-4">
                  <h3 className="font-display font-bold text-slate-800 text-xs uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <Building className="w-4 h-4 text-indigo-600" />
                    Tax Identification & Registry Verification (CIF / NIF / VAT)
                  </h3>
                  {currentResult.taxId && currentResult.taxId !== 'None' ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded font-mono">
                          Tax ID: {currentResult.taxId}
                        </span>
                        <span className="text-[10px] bg-indigo-100 text-indigo-800 border border-indigo-200 px-2 py-0.5 rounded font-bold font-mono">
                          RESEARCH ACTIVE
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 bg-white p-3 rounded border border-slate-200 leading-relaxed font-sans italic">
                        {currentResult.taxIdResearch}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">
                      No tax identification number (CIF, NIF, or VAT) was detected in the conversation to perform automatic registry research.
                    </p>
                  )}
                </div>

                {/* 2.5 Huboo Onboarding Questionnaire (20 Questions) */}
                <div className="bg-slate-50 border border-slate-200 rounded p-5">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
                    <h3 className="font-display font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-emerald-600" />
                      Huboo - Client Onboarding Questionnaire (20 Questions)
                    </h3>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded font-bold font-mono uppercase">
                      Smart Extraction
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {[
                      { num: 1, label: "Name (primary contact / principal)", key: "q1_name" },
                      { num: 2, label: "Source (how client came; referrer)", key: "q2_source" },
                      { num: 3, label: "Country / residence", key: "q3_country" },
                      { num: 4, label: "Address and telephone number", key: "q4_address_phone" },
                      { num: 5, label: "Name of company (legal & trading)", key: "q5_company_name" },
                      { num: 6, label: "Activity (what business does; products)", key: "q6_activity" },
                      { num: 7, label: "Companies House / Statutory DB", key: "q7_statutory_db" },
                      { num: 8, label: "Date of formation", key: "q8_formation_date" },
                      { num: 9, label: "Years trading", key: "q9_years_trading" },
                      { num: 10, label: "Shipping (volumes; markets; carriers)", key: "q10_shipping" },
                      { num: 11, label: "Channel (D2C / B2B / marketplace)", key: "q11_channel" },
                      { num: 12, label: "Goods in / source (origin of stock)", key: "q12_goods_in" },
                      { num: 13, label: "Stock & shipping (SKUs; fulfilment)", key: "q13_stock_shipping" },
                      { num: 14, label: "Average RRP (order value / weight)", key: "q14_average_rrp" },
                      { num: 15, label: "Start date (target go-live)", key: "q15_start_date" },
                      { num: 16, label: "KYC checks (UBO IDs; certified docs)", key: "q16_kyc" },
                      { num: 17, label: "Capital (funding position; funds origin)", key: "q17_capital" },
                      { num: 18, label: "Europe (EU ops; VAT registrations)", key: "q18_europe" },
                      { num: 19, label: "Pricing (agreed card; B2B charges)", key: "q19_pricing" },
                      { num: 20, label: "Other (notes; special risks)", key: "q20_other" }
                    ].map((item) => {
                      const rawVal = currentResult.questionnaire 
                        ? (currentResult.questionnaire as any)[item.key] 
                        : (item.key === "q1_name" ? currentResult.clientName :
                           item.key === "q3_country" ? currentResult.country :
                           item.key === "q4_address_phone" ? currentResult.contactInfo :
                           item.key === "q5_company_name" ? currentResult.companyName :
                           item.key === "q6_activity" ? currentResult.role :
                           item.key === "q7_statutory_db" ? (currentResult.taxId && currentResult.taxId !== 'None' ? `${currentResult.taxId} - ${currentResult.taxIdResearch || ''}` : '(Not answered / Not provided)') :
                           '(Not answered / Not provided)');
                           
                      const sanitizeDisplayVal = (val: any) => {
                        if (val === undefined || val === null) return '(Not answered / Not provided)';
                        const s = String(val).trim();
                        if (!s || s.toLowerCase() === 'none' || s.toLowerCase() === 'unknown' || s.toLowerCase() === 'n/a' || s === '(no me lo ha contestado)' || s === '(not answered)' || s === '(not answered / not provided)') {
                          return '(Not answered / Not provided)';
                        }
                        return s;
                      };
                      
                      const val = sanitizeDisplayVal(rawVal);
                      const isUnanswered = val.includes('(Not answered / Not provided)');
                      
                      return (
                        <div key={item.key} className="bg-white p-3 rounded border border-slate-200 flex flex-col justify-between hover:shadow-sm transition-all duration-200">
                          <div>
                            <span className="text-[10px] text-slate-400 font-mono font-bold block mb-0.5">
                              PREGUNTA {item.num}
                            </span>
                            <span className="text-xs font-semibold text-slate-800 block mb-2 leading-snug">
                              {item.label}
                            </span>
                          </div>
                          <div className={`text-xs p-2.5 rounded font-medium border ${
                            isUnanswered 
                              ? 'bg-amber-50/50 text-amber-700 border-amber-100 italic' 
                              : 'bg-slate-50 text-slate-900 border-slate-100 font-sans'
                          }`}>
                            {val}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Commercial Discussions Detected */}
                <div className={`p-4 rounded border ${
                  currentResult.commercialDiscussionsDetected 
                    ? 'bg-red-50 border-red-200 text-red-950' 
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}>
                  <h4 className="font-display font-bold text-xs uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    {currentResult.commercialDiscussionsDetected ? (
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                    ) : (
                      <ShieldCheck className="w-4 h-4 text-slate-500" />
                    )}
                    Commercial Discussions Detected
                  </h4>
                  <p className="text-xs leading-relaxed">
                    {currentResult.commercialDetailsFound}
                  </p>
                </div>

                {/* 4. Summary and Action Plan */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="font-display font-bold text-slate-800 text-xs uppercase tracking-wider mb-2.5">
                      Communication Summary
                    </h3>
                    <div className="bg-slate-50 p-4 rounded border border-slate-200 text-xs leading-relaxed text-slate-600">
                      {currentResult.summaryOfCall}
                    </div>
                  </div>

                  <div>
                    <h3 className="font-display font-bold text-slate-800 text-xs uppercase tracking-wider mb-2.5">
                      Action & Regularization Plan
                    </h3>
                    <ul className="flex flex-col gap-2">
                      {currentResult.nextStepsRequired.map((step, index) => (
                        <li key={index} className="flex items-start gap-2 text-xs">
                          <ArrowRight className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                          <span className="text-slate-700 font-semibold">{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* 5. Acciones de Exportación */}
                <div className="border-t border-slate-200 pt-6 flex flex-col gap-3">
                  <div className="flex justify-between items-center flex-wrap gap-2">
                    <h4 className="font-display font-bold text-slate-800 text-xs uppercase tracking-wider">
                      Export Compliance Report
                    </h4>
                    
                    {/* Settings Trigger */}
                    <button
                      type="button"
                      onClick={() => setShowGoogleConfig(!showGoogleConfig)}
                      className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 cursor-pointer transition"
                    >
                      <Info className="w-3.5 h-3.5" />
                      {showGoogleConfig ? 'Hide Settings' : 'Google Drive Settings (Vercel)'}
                    </button>
                  </div>

                  {/* Google Configuration Panel */}
                  {showGoogleConfig && (
                    <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-lg text-xs text-slate-600 flex flex-col gap-3 animate-fadeIn mb-3">
                      <div className="font-semibold text-slate-800 text-xs flex items-center gap-1">
                        <Info className="w-4 h-4 text-indigo-600" />
                        Ultimate Google Drive Configuration Guide for Vercel
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        Google is extremely strict with redirect URL matching. An extra or missing forward slash (<code className="bg-slate-200 px-0.5 rounded text-red-600 font-mono">/</code>) can trigger a <code className="bg-slate-200 px-1 py-0.5 rounded text-red-600 font-bold">redirect_uri_mismatch</code> error. 
                        Follow these exact steps to resolve it:
                      </p>
                      <ol className="list-decimal pl-4 text-[11px] flex flex-col gap-2 text-slate-600">
                        <li>Open the <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline font-semibold">Google Cloud Console</a> and go to your project.</li>
                        <li>Click on your <strong>OAuth 2.0 Client ID</strong> credential (or create one by choosing <em>Web application</em>).</li>
                        <li>
                          In the <strong>Authorized JavaScript origins</strong> section, add this exact origin (no trailing slash):
                          <div className="mt-1 flex items-center gap-1.5">
                            <code className="bg-white border border-slate-200 px-2 py-1 rounded text-red-600 font-mono select-all text-[10px] font-semibold break-all">{window.location.origin}</code>
                          </div>
                        </li>
                        <li>
                          In the <strong>Authorized redirect URIs</strong> section, you must add <strong>BOTH</strong> values to avoid trailing-slash issues:
                          <div className="mt-1.5 flex flex-col gap-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400 font-mono text-[10px] w-14 font-semibold">Value 1:</span>
                              <code className="bg-white border border-slate-200 px-2 py-1 rounded text-indigo-600 font-mono select-all text-[10px] font-semibold break-all">{window.location.origin}</code>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400 font-mono text-[10px] w-14 font-semibold">Value 2:</span>
                              <code className="bg-white border border-slate-200 px-2 py-1 rounded text-indigo-600 font-mono select-all text-[10px] font-semibold break-all">{window.location.origin + '/'}</code>
                            </div>
                            {window.location.href.split('#')[0].split('?')[0] !== window.location.origin && window.location.href.split('#')[0].split('?')[0] !== window.location.origin + '/' && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-slate-400 font-mono text-[10px] w-14 font-semibold">Value 3:</span>
                                <code className="bg-white border border-slate-200 px-2 py-1 rounded text-indigo-600 font-mono select-all text-[10px] font-semibold break-all">{window.location.href.split('#')[0].split('?')[0]}</code>
                              </div>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-500 mt-1 italic font-sans">
                            * Add one row for Value 1 and another row for Value 2 in Google Cloud.
                          </p>
                        </li>
                        <li>Click <strong>Save</strong> at the bottom of the Google Console page.</li>
                        <li>Copy the generated <strong>Client ID</strong> (the long text ending in <code className="bg-slate-200 px-0.5 rounded font-mono">.apps.googleusercontent.com</code>) and paste it below:</li>
                      </ol>

                      {/* Error 403 Troubleshooting block */}
                      <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-slate-700">
                        <div className="font-semibold text-amber-800 text-[11px] flex items-center gap-1.5 mb-1">
                          <span className="flex h-2 w-2 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                          </span>
                          Are you seeing the Error "Access blocked: App not verified" or "Error 403: access_denied"?
                        </div>
                        <p className="text-[10px] leading-relaxed text-slate-600 mb-2">
                          This is because your Google Cloud project is in <strong>Testing</strong> mode by default and does not allow external sign-ins without authorized test users.
                        </p>
                        <div className="text-[10px] font-medium text-slate-800 mb-1">How to fix this in 1 minute:</div>
                        <ol className="list-decimal pl-4 text-[10px] flex flex-col gap-1 text-slate-600">
                          <li>Go to the <a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" rel="noopener noreferrer" className="text-amber-700 underline font-semibold">OAuth Consent Screen</a> in the Google Cloud Console.</li>
                          <li>Locate the section labeled <strong>Test users</strong>.</li>
                          <li>Click on the <strong>+ ADD USERS</strong> button.</li>
                          <li>Add your exact email address: <code className="bg-amber-100 border border-amber-250 px-1 py-0.5 rounded text-amber-950 font-mono select-all font-bold">huboo.nicolas@gmail.com</code> and save changes.</li>
                          <li><em>(Optional)</em> If you want any email to access the app without manual configuration, click on <strong>Publish app</strong> on that same Google Cloud consent page to move it to production status.</li>
                        </ol>
                      </div>

                      <div className="flex flex-col gap-1.5 mt-2">
                        <label className="font-semibold text-slate-700 text-[11px]">Google Client ID (OAuth Client ID):</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={customGoogleClientId}
                            onChange={(e) => setCustomGoogleClientId(e.target.value)}
                            placeholder="e.g., 123456789-abc.apps.googleusercontent.com"
                            className="bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 w-full focus:outline-none focus:border-indigo-500"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              localStorage.setItem('custom_google_client_id', customGoogleClientId.trim());
                              setShowGoogleConfig(false);
                              alert('Google Client ID configuration saved successfully.');
                            }}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 rounded transition cursor-pointer shrink-0"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex flex-wrap gap-3">
                    {/* Google Docs Export */}
                    {googleUser ? (
                      <button
                        onClick={handleExportToGoogleDoc}
                        disabled={exportingDoc}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider py-2.5 px-4 rounded flex items-center gap-2 transition cursor-pointer disabled:opacity-50 shadow-sm"
                      >
                        {exportingDoc ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            Uploading HTML Report...
                          </>
                        ) : (
                          <>
                            <PlusCircle className="w-3.5 h-3.5" />
                            Export HTML Report to Drive
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={handleGoogleLogin}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider py-2.5 px-4 rounded border border-slate-200 flex items-center gap-2 transition cursor-pointer"
                        title="Log in with Google to enable Google Drive export"
                      >
                        <Lock className="w-3.5 h-3.5 text-slate-400" />
                        Connect Google Workspace to Export
                      </button>
                    )}

                    {/* Descarga Offline */}
                    <button
                      onClick={handleDownloadLocalHTML}
                      className="bg-slate-850 hover:bg-slate-900 text-white font-bold text-xs uppercase tracking-wider py-2.5 px-4 rounded flex items-center gap-2 transition cursor-pointer shadow-sm"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download Offline Report (HTML)
                    </button>
                  </div>

                  {/* Resultados de Exportación Google */}
                  {exportedDocUrl && (
                    <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-lg flex flex-col gap-3 animate-fadeIn">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <div>
                          <p className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            Report uploaded to Google Drive successfully!
                          </p>
                          <p className="text-[11px] text-indigo-700 mt-0.5">
                            Saved in the folder <strong className="text-indigo-900">"{exportedFolderName || 'Company'}"</strong> in Google Drive.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 w-full sm:w-auto shrink-0">
                          {exportedFolderUrl && (
                            <a
                              href={exportedFolderUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bg-white hover:bg-slate-50 text-indigo-700 border border-indigo-200 font-bold text-[10px] uppercase tracking-wider py-1.5 px-3 rounded flex items-center gap-1.5 transition whitespace-nowrap justify-center flex-1 sm:flex-none cursor-pointer"
                            >
                              <Folder className="w-3 h-3 text-indigo-600" />
                              View Company Folder
                            </a>
                          )}
                          <a
                            href={exportedDocUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] uppercase tracking-wider py-1.5 px-3 rounded flex items-center gap-1.5 transition whitespace-nowrap justify-center flex-1 sm:flex-none cursor-pointer"
                          >
                            Open HTML Report
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* VISUAL COMPLIANCE DRIVE WORKSPACE */}
                  <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50 flex flex-col gap-0 mt-3 shadow-sm">
                    {/* Header bar */}
                    <div className="bg-slate-900 text-white px-4 py-3 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <Folder className="w-4 h-4 text-indigo-400" />
                        <h4 className="font-display font-bold text-xs uppercase tracking-wider">
                          Visual Explorer: Google Drive Repository
                        </h4>
                      </div>
                      <div className="flex items-center gap-2">
                        {googleUser ? (
                          <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-mono px-2 py-0.5 rounded border border-emerald-500/30 font-semibold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            Connected
                          </span>
                        ) : (
                          <span className="bg-slate-700 text-slate-300 text-[10px] font-mono px-2 py-0.5 rounded border border-slate-600">
                            Structure Preview
                          </span>
                        )}
                        {googleUser && (
                          <button
                            type="button"
                            onClick={() => fetchDriveFolders(oauthToken)}
                            disabled={loadingDrive}
                            className="text-indigo-400 hover:text-white p-1 rounded hover:bg-slate-800 transition disabled:opacity-50 cursor-pointer"
                            title="Refresh Drive folders"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${loadingDrive ? 'animate-spin' : ''}`} />
                          </button>
                        )}
                      </div>
                    </div>

                    {googleUser ? (
                      /* Real Interactive Google Drive Explorer */
                      <div className="grid grid-cols-1 md:grid-cols-12 min-h-[350px]">
                        {/* Sidebar: Folder Tree Directory */}
                        <div className="md:col-span-4 bg-slate-100 border-b md:border-b-0 md:border-r border-slate-200 p-3.5 flex flex-col gap-3">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                              KYC Folders
                            </span>
                            <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-1.5 py-0.2 rounded font-mono">
                              {driveFolders.length}
                            </span>
                          </div>

                          {/* Quick Filter */}
                          <input
                            type="text"
                            value={folderSearch}
                            onChange={(e) => setFolderSearch(e.target.value)}
                            placeholder="Search company..."
                            className="bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 w-full"
                          />

                          {/* Folder list */}
                          {loadingDrive ? (
                            <div className="flex flex-col items-center justify-center py-10 gap-2">
                              <RefreshCw className="w-5 h-5 text-indigo-600 animate-spin" />
                              <span className="text-[11px] text-slate-500">Loading folders...</span>
                            </div>
                          ) : driveFolders.length === 0 ? (
                            <div className="text-center py-8 bg-white/50 border border-dashed border-slate-250 rounded p-4 text-slate-400">
                              <Folder className="w-6 h-6 text-slate-300 mx-auto mb-1.5" />
                              <p className="text-[10px] leading-normal">
                                No folders found. Export a report to create one.
                              </p>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1 overflow-y-auto max-h-[220px] pr-1">
                              {driveFolders
                                .filter(f => f.name.toLowerCase().includes(folderSearch.toLowerCase()))
                                .map(folder => (
                                  <button
                                    key={folder.id}
                                    type="button"
                                    onClick={() => setActiveFolderId(folder.id)}
                                    className={`w-full text-left px-2.5 py-2 rounded text-xs transition flex items-center gap-2 cursor-pointer border ${
                                      activeFolderId === folder.id
                                        ? 'bg-indigo-600 text-white border-indigo-700 font-semibold shadow-sm'
                                        : 'bg-white hover:bg-slate-150 text-slate-700 border-slate-200 hover:text-slate-900'
                                    }`}
                                  >
                                    <Folder className={`w-4 h-4 shrink-0 ${activeFolderId === folder.id ? 'text-indigo-200' : 'text-indigo-600'}`} />
                                    <span className="truncate">{folder.name}</span>
                                  </button>
                                ))}
                            </div>
                          )}
                        </div>

                        {/* File details and creation panel */}
                        <div className="md:col-span-8 p-4 bg-white flex flex-col gap-4 animate-fadeIn">
                          {activeFolderId ? (
                            <>
                              {/* Breadcrumbs / Actions */}
                              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 pb-3 border-b border-slate-100">
                                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                  <span className="font-semibold text-slate-400 font-sans">My Drive</span>
                                  <span className="text-slate-300">/</span>
                                  <Folder className="w-3.5 h-3.5 text-indigo-600" />
                                  <span className="font-bold text-slate-800 truncate max-w-[150px]">
                                    {driveFolders.find(f => f.id === activeFolderId)?.name || 'Company'}
                                  </span>
                                </div>
                                <a
                                  href={`https://drive.google.com/drive/folders/${activeFolderId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 transition self-start cursor-pointer"
                                >
                                  Open Folder in Google Drive ↗
                                </a>
                              </div>

                              {/* Files listing */}
                              <div className="flex flex-col gap-2">
                                <div className="flex justify-between items-center">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                                    Compliance Files
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => fetchFilesForFolder(activeFolderId)}
                                    disabled={loadingDriveFiles}
                                    className="text-[9px] text-indigo-600 font-bold font-mono hover:underline cursor-pointer"
                                  >
                                    Refresh files
                                  </button>
                                </div>

                                {loadingDriveFiles ? (
                                  <div className="flex items-center justify-center py-10 gap-2">
                                    <RefreshCw className="w-4 h-4 text-indigo-600 animate-spin" />
                                    <span className="text-xs text-slate-500">Consulting Drive...</span>
                                  </div>
                                ) : activeFolderFiles.length === 0 ? (
                                  <p className="text-[11px] text-slate-500 text-center py-8 border border-dashed border-slate-200 rounded">
                                    No additional files found in this Drive folder. You can add notes or legal annexes below.
                                  </p>
                                ) : (
                                  <div className="flex flex-col gap-1.5 max-h-[160px] overflow-y-auto pr-1">
                                    {activeFolderFiles.map(file => {
                                      const isDoc = file.mimeType.includes('document');
                                      return (
                                        <div
                                          key={file.id}
                                          className="p-2.5 rounded border border-slate-100 hover:border-slate-300 bg-slate-50/50 flex items-center justify-between text-xs transition group"
                                        >
                                          <div className="flex items-center gap-2.5 truncate max-w-[70%]">
                                            <FileText className={`w-4 h-4 shrink-0 ${isDoc ? 'text-indigo-600' : 'text-slate-400'}`} />
                                            <div className="truncate">
                                              <p className="font-semibold text-slate-800 truncate" title={file.name}>
                                                {file.name}
                                              </p>
                                              {file.createdTime && (
                                                <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                                                  Created: {new Date(file.createdTime).toLocaleString('en-US', {
                                                    day: '2-digit',
                                                    month: '2-digit',
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                  })}
                                                </p>
                                              )}
                                            </div>
                                          </div>
                                          {file.webViewLink && (
                                            <a
                                              href={file.webViewLink}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 text-indigo-600 text-[10px] font-bold py-1 px-2.5 rounded flex items-center gap-1 transition cursor-pointer shrink-0"
                                            >
                                              Open ↗
                                            </a>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>

                              {/* Form to create custom compliance note */}
                              <div className="border-t border-slate-100 pt-3 flex flex-col gap-2 mt-auto">
                                {!showNoteForm ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setShowNoteForm(true);
                                      setNewNoteTitle(`Additional Compliance Note - ${currentResult?.companyName || 'Company'}`);
                                      setNewNoteContent('PEP checked against national database, zero matches found.\nFindings attached as legal KYC annex.');
                                    }}
                                    className="bg-slate-100 hover:bg-slate-200 border border-slate-300 hover:border-slate-400 text-slate-700 text-[11px] font-bold py-2 px-3 rounded flex items-center justify-center gap-1.5 transition cursor-pointer w-full"
                                  >
                                    <PlusCircle className="w-3.5 h-3.5 text-slate-500" />
                                    Add Memorandum or Compliance Note Directly to Drive
                                  </button>
                                ) : (
                                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex flex-col gap-2.5 animate-fadeIn">
                                    <div className="flex justify-between items-center">
                                      <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider font-mono">
                                        New Memo in Google Drive
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => setShowNoteForm(false)}
                                        className="text-slate-400 hover:text-rose-600 text-[10px] font-bold cursor-pointer"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                    <input
                                      type="text"
                                      value={newNoteTitle}
                                      onChange={(e) => setNewNoteTitle(e.target.value)}
                                      placeholder="Note Title"
                                      className="bg-white border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-semibold w-full"
                                    />
                                    <textarea
                                      rows={3}
                                      value={newNoteContent}
                                      onChange={(e) => setNewNoteContent(e.target.value)}
                                      placeholder="Details of findings or validation..."
                                      className="bg-white border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-mono w-full resize-none"
                                    />
                                    <button
                                      type="button"
                                      onClick={handleCreateNote}
                                      disabled={isSavingNote || !newNoteTitle.trim() || !newNoteContent.trim()}
                                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold py-1.5 px-3 rounded transition flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                                    >
                                      {isSavingNote ? (
                                        <>
                                          <RefreshCw className="w-3 animate-spin" />
                                          Saving to Drive...
                                        </>
                                      ) : (
                                        'Save Note to Google Drive'
                                      )}
                                    </button>
                                  </div>
                                )}

                                {noteSuccessMessage && (
                                  <div className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-150 p-2 rounded text-center animate-fadeIn">
                                    ✓ {noteSuccessMessage}
                                  </div>
                                )}
                              </div>
                            </>
                          ) : (
                            <div className="flex flex-col items-center justify-center text-center h-full text-slate-500 p-6 my-auto">
                              <Folder className="w-10 h-10 text-indigo-200 mb-2" />
                              <h5 className="font-bold text-xs text-slate-700">Corporate File Explorer</h5>
                              <p className="text-[11px] leading-relaxed text-slate-500 mt-1 max-w-xs">
                                Select a folder from the left list to see its Google Drive files in real-time and draft compliance notes.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* Beautiful Visual Mock Simulator Diagram */
                      <div className="p-4 bg-white flex flex-col gap-4">
                        <p className="text-[11px] leading-relaxed text-slate-600 -mb-1">
                          Connecting your account automatically organizes all your documents into a clean hierarchical folder structure, avoiding mix-ups and enabling fast compliance audits:
                        </p>

                        {/* Interactive Tree View Simulator */}
                        <div className="bg-slate-900 text-slate-300 p-4 rounded-lg font-mono text-[11px] shadow-inner border border-slate-800 select-none flex flex-col gap-2">
                          <div className="flex items-center justify-between border-b border-slate-850 pb-1.5 mb-1 text-[9px] text-slate-500 font-semibold tracking-wider">
                            <span>REPOSITORY PREVIEW</span>
                            <span>GOOGLE DRIVE</span>
                          </div>
                          <div className="flex items-center gap-2 text-indigo-400">
                            <Folder className="w-3.5 h-3.5 shrink-0" />
                            <span>My Drive / My Google Drive</span>
                          </div>
                          <div className="pl-4 flex items-center gap-2 text-amber-400">
                            <span>└──</span>
                            <Folder className="w-3.5 h-3.5 shrink-0" />
                            <span>📁 {currentResult?.companyName || '[Company Name]'}</span>
                          </div>
                          <div className="pl-10 flex flex-col gap-1.5 text-slate-400">
                            <div className="flex items-center gap-2">
                              <span>├──</span>
                              <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                              <span className="text-white">📄 KYC Report - {currentResult?.companyName || '[Company]'} ({currentResult?.clientName || '[Client]'}).gdoc</span>
                              <span className="text-[9px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 font-semibold rounded px-1">Main Report</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span>└──</span>
                              <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                              <span>📄 Additional Memorandum - Compliance Memo.gdoc</span>
                              <span className="text-[9px] bg-slate-800 text-slate-500 rounded px-1 font-semibold">Auditor Memos</span>
                            </div>
                          </div>
                        </div>

                        {/* Feature features list */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-slate-100 mt-1">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-indigo-600 font-mono">1. DEDICATED FOLDER</span>
                            <span className="text-[10px] text-slate-500 leading-relaxed">
                              Each company has its own dedicated folder in your Drive to ensure clutter-free audits.
                            </span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-indigo-600 font-mono">2. IMPECCABLE FORMAT</span>
                            <span className="text-[10px] text-slate-500 leading-relaxed">
                              Reports are created with headers, tables, and auto-generated corporate color schemes.
                            </span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-indigo-600 font-mono">3. INTERACTIVE WRITING</span>
                            <span className="text-[10px] text-slate-500 leading-relaxed">
                              Once connected, you can draft and attach additional notes that save directly into their folder.
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {!googleUser && (
                    <p className="text-[10px] text-slate-500 italic mt-1.5 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-indigo-500 inline animate-pulse" />
                      Tip: When you connect your Google Drive, each completed analysis is automatically saved in a Drive folder created for that company.
                    </p>
                  )}

                  {exportError && (
                    <div className="bg-red-50 text-red-800 text-xs p-3.5 rounded border border-red-200 mt-2">
                      {exportError}
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}

        </section>

      </main>

      {/* SECCIÓN INFERIOR: Directorio Local de Clientes Guardados */}
      <section id="directory-section" className="w-full max-w-7xl mx-auto px-6 pb-12 mt-6">
        <div className="bg-white p-6 rounded border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="font-display font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                <History className="w-4 h-4 text-slate-500" />
                Local Counterparty Analysis History
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Persistent local directory of analyzed counterparties and their compliance status.
              </p>
            </div>
            {clients.length > 0 && (
              <span className="text-xs bg-slate-50 text-slate-600 font-mono px-2 py-0.5 rounded border border-slate-200 font-semibold">
                {clients.length} Counterparties
              </span>
            )}
          </div>

          {clients.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-slate-200 rounded bg-slate-50/50">
              <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-slate-500">No analyzed counterparties registered in the local history yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded border border-slate-250 shadow-sm">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 font-mono font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Counterparty / Company</th>
                    <th className="py-3 px-4">Jurisdiction</th>
                    <th className="py-3 px-4">Control Analysis</th>
                    <th className="py-3 px-4">Compliance Status</th>
                    <th className="py-3 px-4">Analysis Date</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {clients.map((record) => (
                    <tr 
                      key={record.id}
                      onClick={() => loadClientFromHistory(record)}
                      className="hover:bg-slate-50/80 cursor-pointer transition group"
                    >
                      <td className="py-3.5 px-4 font-semibold text-slate-800">
                        <div>
                          <p>{record.companyName}</p>
                          <p className="text-[10px] text-slate-400 font-normal">{record.clientName} ({record.role})</p>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">{record.country}</td>
                      <td className="py-3.5 px-4 text-slate-500">
                        <div className="flex gap-1 text-[10px] font-mono">
                          <span className={`px-1 py-0.5 rounded ${record.kycChecklist.identityEstablished ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>ID</span>
                          <span className={`px-1 py-0.5 rounded ${record.kycChecklist.ownershipVerified ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>UBO</span>
                          <span className={`px-1 py-0.5 rounded ${record.kycChecklist.businessActivityDefined ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>ACT</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-bold">
                        {record.isCompliant ? (
                          <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase tracking-wide">
                            COMPLIANT
                          </span>
                        ) : (
                          <span className="bg-red-100 text-red-800 text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase tracking-wide animate-pulse">
                            VIOLATION
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 text-[11px] font-mono">{record.analyzedAt}</td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={(e) => deleteRecord(record.id, e)}
                          className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-100 transition inline-block opacity-0 group-hover:opacity-100"
                          title="Delete from history"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Footer corporativo */}
      <footer className="bg-slate-950 text-slate-500 text-xs py-8 px-6 text-center border-t border-slate-900 font-sans mt-auto">
        <p className="mb-1 font-semibold text-slate-400">KYC Compliance Automator v1.0</p>
        <p className="max-w-md mx-auto text-[11px] leading-relaxed">
          This software complies strictly with the Zero Tolerance Corporate KYC Checklist and Onboarding Protocol. Automated audits leverage advanced Google Gemini intelligence to mitigate legal, regulatory, and commercial risks.
        </p>
      </footer>
    </div>
  );
}

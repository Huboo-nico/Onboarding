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
  const [checkingConfig, setCheckingConfig] = useState<boolean>(false);
  const [customGeminiKey, setCustomGeminiKey] = useState<string>('');
  const [showCustomGeminiInput, setShowCustomGeminiInput] = useState<boolean>(false);
  const [testingConnection, setTestingConnection] = useState<boolean>(false);
  const [connectionResult, setConnectionResult] = useState<{
    success: boolean;
    model?: string;
    message?: string;
    error?: string;
  } | null>(null);

  const testGeminiConnection = async () => {
    setTestingConnection(true);
    setConnectionResult(null);
    try {
      const savedKey = localStorage.getItem('custom_gemini_api_key') || '';
      const response = await fetch('/api/test-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gemini-key': savedKey,
        },
      });

      const contentType = response.headers.get('content-type') || '';
      let data: any = {};
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        throw new Error(text || `El servidor devolvió un error de texto plano con código ${response.status}`);
      }

      if (response.ok && data.success) {
        setConnectionResult({
          success: true,
          model: data.model,
          message: data.message || 'Conexión exitosa con Gemini.',
        });
        setHasGeminiKey(true);
      } else {
        setConnectionResult({
          success: false,
          error: data.error || 'Error de autenticación o conexión.',
        });
      }
    } catch (err: any) {
      console.error('Error testing Gemini key:', err);
      // Clean up common server errors to make them highly friendly
      let errorMsg = err.message || 'Error de red o comunicación con el servidor.';
      if (errorMsg.includes('A server error')) {
        errorMsg = 'Error en el servidor de Vercel. Asegúrate de que las dependencias estén bien construidas y que el backend de Node/Vercel no esté experimentando un bloqueo temporal.';
      }
      setConnectionResult({
        success: false,
        error: errorMsg,
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const checkConfigStatus = async () => {
    setCheckingConfig(true);
    try {
      const savedKey = localStorage.getItem('custom_gemini_api_key') || '';
      const res = await fetch('/api/config-status', {
        headers: {
          'x-gemini-key': savedKey,
        }
      });
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await res.json();
          setHasGeminiKey(!!data.hasGeminiKey);
        } else {
          setHasGeminiKey(false);
        }
      } else {
        setHasGeminiKey(false);
      }
    } catch (err) {
      console.error('Error fetching config status:', err);
      setHasGeminiKey(false);
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
              displayName: data.name || data.given_name || 'Usuario Google',
              email: data.email || '',
              photoURL: data.picture || null,
            } as any);
          } else {
            setGoogleUser({
              displayName: 'Usuario Google Conectado',
              email: '',
              photoURL: null,
            } as any);
          }
        } catch (e) {
          console.error('Error fetching Google user info:', e);
          setGoogleUser({
            displayName: 'Usuario Google Conectado',
            email: '',
            photoURL: null,
          } as any);
        }
      } else if (event.data?.type === 'GOOGLE_OAUTH_FAILURE') {
        setExportError('Fallo al conectar con Google: ' + (event.data.error || 'Acceso denegado'));
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
      alert('Error: No hay una carpeta activa seleccionada.');
      return;
    }
    if (!newNoteTitle.trim() || !newNoteContent.trim()) {
      alert('Por favor, ingresa el título y contenido de la nota compliance.');
      return;
    }

    setIsSavingNote(true);
    setNoteSuccessMessage(null);
    try {
      const noteTitleWithApp = `${newNoteTitle.trim()} - Compliance Memo`;
      const contentWithHeading = `${newNoteTitle.trim()}\n===================\nFecha: ${new Date().toLocaleString()}\n\n${newNoteContent.trim()}`;
      
      await createAdditionalNote(
        oauthToken,
        activeFolderId,
        noteTitleWithApp,
        contentWithHeading
      );
      
      setNoteSuccessMessage('¡Nota de compliance guardada con éxito en Google Drive!');
      setNewNoteTitle('');
      setNewNoteContent('');
      setShowNoteForm(false);
      
      // Refresh current folder file list
      await fetchFilesForFolder(activeFolderId, oauthToken);
      
      // Clear success notification after a few seconds
      setTimeout(() => setNoteSuccessMessage(null), 5000);
    } catch (err: any) {
      console.error('Error creating compliance note:', err);
      alert('No se pudo crear la nota en Drive: ' + (err.message || err));
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
          setExportError('El navegador bloqueó la ventana emergente de inicio de sesión. Por favor, permite ventanas emergentes para este sitio.');
        } else {
          setExportError('Error al iniciar Google Sign-In directo: ' + err.message);
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
        alert('Configuración Requerida: Para conectar Google Workspace, primero debes aceptar la ventana flotante de Google OAuth (ver la tarjeta debajo del chat). Mientras tanto, puedes usar la aplicación de forma local.');
      } else {
        // Fallback to direct sign-in if Firebase popup fails!
        console.warn('Firebase login failed, trying Direct Google OAuth fallback:', err);
        try {
          googleSignInDirect();
        } catch (fallbackErr: any) {
          setExportError('Fallo al conectar con Google: ' + err.message);
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
      setError('Por favor, escribe o pega la transcripción de la llamada antes de realizar el análisis.');
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
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gemini-key': savedKey,
        },
        body: JSON.stringify({ transcript }),
      });

      if (!response.ok) {
        let errorMessage = 'No se pudo comunicar con el servidor de análisis.';
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
              errorMessage = `Error del servidor de Vercel (Estado ${response.status}). Esto ocurre usualmente si no has configurado la variable de entorno GEMINI_API_KEY en tu panel de Vercel. Por favor, asegúrate de añadir GEMINI_API_KEY en Vercel > Settings > Environment Variables.`;
            } else if (errText && errText.length < 200) {
              errorMessage = `Error del servidor (${response.status}): ${errText}`;
            } else {
              errorMessage = `Error de comunicación (${response.status}). Es probable que falte configurar GEMINI_API_KEY en las variables de entorno de tu proyecto en Vercel.`;
            }
          }
        } catch (readErr) {
          errorMessage = `No se pudo conectar con el servidor (Estado ${response.status}).`;
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
      setError(err.message || 'Error al procesar la transcripción con Inteligencia Artificial.');
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to save analyzed record to the client list
  const saveClientRecord = (record: KYCAnalysisResult) => {
    const newRecord: ClientRecord = {
      ...record,
      id: Math.random().toString(36).substr(2, 9),
      analyzedAt: new Date().toLocaleString('es-ES', {
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
    const confirmed = window.confirm('¿Está seguro de que desea eliminar este cliente del registro local?');
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

  // Create Google Doc
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
      console.error('Google Docs export error:', err);
      setExportError('Fallo al exportar a Google Docs: ' + (err.message || err));
    } finally {
      setExportingDoc(false);
    }
  };

  // Download Local HTML Report
  const handleDownloadLocalHTML = () => {
    if (!currentResult) return;

    const isCompliantText = currentResult.isCompliant ? 'COMPLIANT (YES)' : 'NON-COMPLIANT ALERT (NO - POLICY BREACH)';
    const severityText = currentResult.breachSeverity === 'CRITICAL' ? 'CRITICAL' : 'NONE';

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
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; }
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
              Tolerancia Cero
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
                    <p className="text-[10px] font-semibold text-white leading-3">Conectado</p>
                    <p className="text-[9px] text-slate-300 leading-none mt-0.5">{googleUser.email}</p>
                  </div>
                </div>
                <button 
                  onClick={handleLogout}
                  className="text-slate-400 hover:text-red-400 p-1 rounded hover:bg-slate-700 transition"
                  title="Cerrar Sesión Google"
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
                  {isLoggingIn ? 'Conectando...' : 'Conectar Drive'}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-6 md:py-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* COLUMNA IZQUIERDA: Entrada de Transcripciones y Configuración */}
        <section id="input-section" className="lg:col-span-5 flex flex-col gap-6">
          
          {/* Instrucciones de la Política */}
          <div className="bg-white border-t-4 border-red-600 p-5 rounded shadow-sm border-x border-b border-slate-200 relative overflow-hidden">
            <div className="absolute right-0 top-0 w-24 h-24 bg-gradient-to-br from-red-500/5 to-amber-500/5 rounded-full blur-2xl"></div>
            <h2 className="font-display font-semibold text-xs tracking-wider text-red-600 uppercase flex items-center gap-2 mb-2.5">
              <ShieldAlert className="w-4 h-4 text-red-600" />
              PROTOCOLO DE CERO TOLERANCIA
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed mb-3">
              No se permite bajo ningún concepto entablar conversaciones comerciales, cotizar tarifas o redactar borradores contractuales con contrapartes sin antes completar en su totalidad el <strong className="text-slate-900">Checklist de KYC básico</strong>.
            </p>
            <div className="border-t border-slate-100 pt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-slate-500 font-mono">
              <span className="flex items-center gap-1 text-emerald-600">🟢 Autorizado: Pedir documentación</span>
              <span className="flex items-center gap-1 text-red-600">🔴 Prohibido: Discutir precios</span>
            </div>
          </div>

          {/* Caja de Análisis de Transcripción */}
          <div className="bg-white p-6 rounded border border-slate-200 shadow-sm flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <h2 className="font-display font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-slate-500" />
                Ingresar Conversación
              </h2>
              {transcript && (
                <button 
                  onClick={() => { setTranscript(''); setError(null); setCurrentResult(null); }}
                  className="text-slate-400 hover:text-slate-600 text-xs font-semibold uppercase tracking-wider font-mono"
                >
                  Limpiar
                </button>
              )}
            </div>

            <p className="text-xs text-slate-500 -mt-2">
              Pegue la transcripción del chat, llamada o correo electrónico que mantuviste con la contraparte para analizar el cumplimiento del protocolo.
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
                    <div className="font-bold text-red-900">Pasos para solucionar el error de API en Vercel:</div>
                    <ol className="list-decimal pl-4 flex flex-col gap-1.5 text-slate-600">
                      <li>Abre el panel de tu proyecto en <a href="https://vercel.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline font-semibold">Vercel</a>.</li>
                      <li>Ve a la pestaña <strong>Settings</strong> (Ajustes) en la parte superior.</li>
                      <li>Haz clic en la sección <strong>Environment Variables</strong> (Variables de entorno) a la izquierda.</li>
                      <li>Crea una nueva variable con la clave: <code className="bg-slate-200 px-1 py-0.5 rounded text-red-600 font-mono font-bold select-all">GEMINI_API_KEY</code></li>
                      <li>Pega el valor de tu API Key de Gemini en el campo de valor.</li>
                      <li>Haz clic en <strong>Save</strong> (Guardar) para guardarla.</li>
                      <li><em>¡Importante!</em> Ve a la pestaña <strong>Deployments</strong> (Despliegues) de tu proyecto en Vercel, haz clic en los tres puntos de tu último despliegue y selecciona <strong>Redeploy</strong> (Redesplegar) para que los cambios surtan efecto.</li>
                    </ol>
                  </div>
                )}
              </div>
            )}

            {/* Vercel Server Diagnostics Status Card */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded text-xs flex flex-col gap-2.5">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${hasGeminiKey === null ? 'bg-amber-400 animate-pulse' : hasGeminiKey ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`} />
                  Servidor Vercel: {hasGeminiKey === null ? 'Comprobando...' : hasGeminiKey ? '🟢 Clave de API Detectada' : '🔴 Clave de API NO Detectada'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={testGeminiConnection}
                    disabled={testingConnection}
                    className="text-indigo-600 hover:text-indigo-800 font-bold uppercase text-[9px] font-mono flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    title="Realizar una prueba de conexión real enviando un mensaje de prueba a Gemini"
                  >
                    {testingConnection ? 'Probando...' : 'Probar Conexión'}
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={checkConfigStatus}
                    disabled={checkingConfig}
                    className="text-indigo-600 hover:text-indigo-800 font-bold uppercase text-[9px] font-mono flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${checkingConfig ? 'animate-spin' : ''}`} />
                    {checkingConfig ? 'Verificando...' : 'Comprobar'}
                  </button>
                </div>
              </div>

              {/* Display connection test result */}
              {connectionResult && (
                <div className={`p-2.5 rounded text-[11px] leading-relaxed border animate-fadeIn ${connectionResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
                  <div className="font-bold flex items-center gap-1 mb-0.5">
                    {connectionResult.success ? '✓ ¡Conexión Exitosa!' : '✗ Error de Conexión'}
                  </div>
                  <p className="text-[10px] text-slate-700 font-sans">
                    {connectionResult.success 
                      ? `${connectionResult.message} Modelo verificado: ${connectionResult.model}` 
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
                  {showCustomGeminiInput ? 'Ocultar ajuste de API Key manual' : '¿Quieres ingresar tu API Key de Gemini manualmente? (Alternativa rápida)'}
                </button>
                
                {showCustomGeminiInput && (
                  <div className="p-2.5 bg-white border border-indigo-100 rounded flex flex-col gap-2 mt-1 animate-fadeIn">
                    <p className="text-[10px] leading-relaxed text-slate-500">
                      Si tienes problemas con las variables de entorno de Vercel, ingresa tu API Key de Gemini aquí. Se guardará de forma segura en tu navegador y se usará para el análisis de inmediato.
                    </p>
                    <div className="flex gap-1.5">
                      <input
                        type="password"
                        value={customGeminiKey}
                        onChange={(e) => setCustomGeminiKey(e.target.value)}
                        placeholder="AIzaSy..."
                        className="bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 w-full focus:outline-none focus:border-indigo-500 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const trimmed = customGeminiKey.trim();
                          if (!trimmed) {
                            alert('Por favor, ingresa una clave válida.');
                            return;
                          }
                          localStorage.setItem('custom_gemini_api_key', trimmed);
                          alert('Clave de API de Gemini guardada correctamente.');
                          checkConfigStatus();
                        }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] px-2.5 py-1 rounded transition cursor-pointer shrink-0"
                      >
                        Guardar
                      </button>
                      {localStorage.getItem('custom_gemini_api_key') && (
                        <button
                          type="button"
                          onClick={() => {
                            localStorage.removeItem('custom_gemini_api_key');
                            setCustomGeminiKey('');
                            alert('Se eliminó tu clave de API manual. El servidor volverá a usar la del entorno de Vercel.');
                            checkConfigStatus();
                          }}
                          className="bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-semibold text-[10px] px-2 py-1 rounded transition cursor-pointer shrink-0"
                        >
                          Borrar
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              {hasGeminiKey === false && (
                <div className="text-[11px] text-slate-600 space-y-1.5 border-t border-slate-100 pt-2.5 animate-fadeIn">
                  <p className="font-medium text-rose-700">⚠️ Vercel no ha cargado tu GEMINI_API_KEY todavía.</p>
                  <p className="leading-relaxed">
                    Si ya agregaste la variable en Vercel, el error ocurre porque <strong>Vercel requiere un nuevo despliegue (Redeploy)</strong> para aplicar variables nuevas. Las variables no se actualizan solas en despliegues existentes.
                  </p>
                  <div className="bg-white p-2.5 rounded border border-rose-100 mt-1">
                    <div className="font-bold text-slate-800 text-[10px] mb-1">Pasos para activar la clave de inmediato:</div>
                    <ol className="list-decimal pl-4 text-[10px] space-y-1.5 text-slate-500">
                      <li>Ve a tu proyecto en <a href="https://vercel.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline font-semibold">Vercel</a> y entra a la pestaña <strong>Deployments</strong>.</li>
                      <li>Busca tu último despliegue (el que está activo), haz clic en los <strong>tres puntos (...)</strong> de la derecha y selecciona <strong>Redeploy</strong>.</li>
                      <li>Una vez que termine el despliegue (tarda unos 30 segundos), haz clic en el botón <strong>"Comprobar"</strong> de aquí arriba.</li>
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
                  Analizando Cumplimiento...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Verificar Compliance
                </>
              )}
            </button>
          </div>

          {/* Casos de Prueba / Plantillas Rápidas */}
          <div className="bg-white p-6 rounded border border-slate-200 shadow-sm flex flex-col gap-3">
            <h3 className="font-display font-bold text-slate-800 text-xs uppercase tracking-wider">
              Casos de Prueba Rápidos
            </h3>
            <p className="text-xs text-slate-500 -mt-1">
              Prueba al instante con estos casos pre-configurados que ilustran escenarios reales:
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
                      {tpl.expectedStatus === 'COMPLIANT' ? 'CONFORME' : 'BRECHA'}
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

        {/* COLUMNA DERECHA: Visor de Diagnóstico de Cumplimiento (KYC & Alerts) */}
        <section id="results-section" className="lg:col-span-7 flex flex-col gap-6">
          
          {!currentResult ? (
            /* Estado Vacío de Espera: Commercial Gatekeeper Locked */
            <div className="bg-slate-100 rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-center p-8 py-14 relative overflow-hidden min-h-[550px] shadow-inner">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_0%,_rgba(0,0,0,0.02)_100%)]"></div>
              
              <div className="z-10 max-w-md">
                <div className="w-16 h-16 bg-slate-200 text-slate-500 rounded-full flex items-center justify-center mx-auto mb-5 shadow-sm">
                  <Lock className="w-8 h-8" />
                </div>
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest font-mono">Módulo Comercial Bloqueado</h3>
                <h2 className="text-xl font-bold text-slate-900 mt-2 font-display">Esperando Análisis de Compliance</h2>
                <p className="text-xs text-slate-500 mt-3 px-4 leading-relaxed">
                  No se permite redactar ofertas, cotizar precios ni discutir términos contractuales hasta que el análisis de cumplimiento de la conversación de la contraparte sea ejecutado y aprobado.
                </p>
                
                <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
                  <button disabled className="px-5 py-2 text-[11px] font-bold tracking-wider uppercase bg-slate-300 text-slate-500 rounded cursor-not-allowed opacity-60">
                    GENERAR HOJA DE TÉRMINOS
                  </button>
                  <button disabled className="px-5 py-2 text-[11px] font-bold tracking-wider uppercase border border-slate-300 text-slate-400 rounded cursor-not-allowed opacity-60">
                    RESERVAR LLAMADA DE VENTAS
                  </button>
                </div>
              </div>
              
              <div className="mt-12 bg-red-50 border border-red-200 p-4 rounded text-left z-10 max-w-sm">
                <p className="text-[10px] text-red-700 font-bold uppercase mb-1 font-mono tracking-wider">Alerta de Riesgo Operativo</p>
                <p className="text-[11px] text-red-900 leading-relaxed italic">
                  "Hasta que el Onboarding Checklist básico haya sido validado, cualquier intercambio de cotizaciones o tarifas está estrictamente prohibido bajo sanción disciplinaria."
                </p>
              </div>
            </div>
          ) : (
            /* Diagnóstico Activo */
            <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              
              {/* Banner de Cumplimiento */}
              {currentResult.isCompliant ? (
                <div className="bg-emerald-50 text-emerald-800 border-b border-emerald-100 p-6 flex items-start gap-4">
                  <div className="bg-emerald-600 text-white p-2.5 rounded shadow shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-display font-bold text-sm tracking-wide text-emerald-950 flex items-center gap-2">
                      ESTADO DE COMPLIANCE: CONFORME
                      <span className="bg-emerald-200 text-emerald-900 text-[10px] font-mono px-2 py-0.5 rounded font-semibold uppercase border border-emerald-300">
                        Aprobado
                      </span>
                    </h2>
                    <p className="text-xs text-emerald-700/90 mt-1 leading-relaxed">
                      Este intercambio de comunicación respeta estrictamente el protocolo. No se entablaron negociaciones de precios o contratos sustanciales antes de solicitar u obtener los requisitos KYC. Es seguro continuar el diálogo respetando las reglas de onboarding.
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
                      ESTADO DE COMPLIANCE: BRECHA DETECTADA
                      <span className="bg-rose-200 text-rose-900 text-[10px] font-mono px-2 py-0.5 rounded font-semibold uppercase border border-rose-300">
                        Crítico
                      </span>
                    </h2>
                    <p className="text-xs text-rose-700/90 mt-1 leading-relaxed">
                      <strong>¡Peligro de Incumplimiento!</strong> Se han detectado discusiones comerciales sustantivas (precios, ofertas de descuentos, cotizaciones o condiciones de contratos) antes de que el proceso de KYC básico fuera completado. Debe detener de inmediato las conversaciones de tarifas y regularizar la cuenta solicitando el Onboarding Checklist.
                    </p>
                  </div>
                </div>
              )}

              {/* Contenido del Reporte */}
              <div className="p-6 flex flex-col gap-6">
                
                {/* 1. Datos del Cliente / Contraparte */}
                <div>
                  <h3 className="font-display font-bold text-slate-800 text-xs uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <User className="w-4 h-4 text-slate-500" />
                    Información de la Contraparte
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded border border-slate-200 text-xs">
                    <div className="flex items-center gap-2.5">
                      <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <div>
                        <p className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold font-mono">Nombre de Contraparte</p>
                        <p className="font-bold text-slate-800 mt-0.5">{currentResult.clientName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <div>
                        <p className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold font-mono">Empresa / Organización</p>
                        <p className="font-bold text-slate-800 mt-0.5">{currentResult.companyName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <div>
                        <p className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold font-mono">Jurisdicción de Origen</p>
                        <p className="font-bold text-slate-800 mt-0.5">{currentResult.country}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <div>
                        <p className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold font-mono">Cargo o Función</p>
                        <p className="font-bold text-slate-800 mt-0.5">{currentResult.role}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 md:col-span-2 border-t border-slate-200 pt-2.5 mt-1">
                      <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <div>
                        <p className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold font-mono font-mono">Datos de Contacto Extraídos</p>
                        <p className="font-semibold text-slate-700 mt-0.5">{currentResult.contactInfo}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Checklist KYC */}
                <div>
                  <h3 className="font-display font-bold text-slate-800 text-xs uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-slate-500" />
                    Checklist KYC Corporativo Obligatorio
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
                        <span className="text-xs font-medium">Identidad Legal Establecida</span>
                      </div>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                        currentResult.kycChecklist.identityEstablished ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-slate-200 text-slate-600 border-slate-300'
                      }`}>
                        {currentResult.kycChecklist.identityEstablished ? 'SÍ' : 'NO'}
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
                        <span className="text-xs font-medium">Propietarios Finales (UBO)</span>
                      </div>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                        currentResult.kycChecklist.ownershipVerified ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-slate-200 text-slate-600 border-slate-300'
                      }`}>
                        {currentResult.kycChecklist.ownershipVerified ? 'SÍ' : 'NO'}
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
                        <span className="text-xs font-medium">Actividad Comercial Definida</span>
                      </div>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                        currentResult.kycChecklist.businessActivityDefined ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-slate-200 text-slate-600 border-slate-300'
                      }`}>
                        {currentResult.kycChecklist.businessActivityDefined ? 'SÍ' : 'NO'}
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
                        <span className="text-xs font-medium">Análisis de Perfil de Riesgo</span>
                      </div>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                        currentResult.kycChecklist.riskAssessmentCompleted ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-slate-200 text-slate-600 border-slate-300'
                      }`}>
                        {currentResult.kycChecklist.riskAssessmentCompleted ? 'SÍ' : 'NO'}
                      </span>
                    </div>

                  </div>
                </div>

                {/* Identificación Fiscal & Research */}
                <div className="bg-slate-50 border border-slate-200 rounded p-4">
                  <h3 className="font-display font-bold text-slate-800 text-xs uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <Building className="w-4 h-4 text-indigo-600" />
                    Identificación Fiscal & Verificación de Registro (CIF / NIF / VAT)
                  </h3>
                  {currentResult.taxId && currentResult.taxId !== 'None' ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded font-mono">
                          ID Fiscal: {currentResult.taxId}
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
                      No se detectó ningún número de identificación fiscal (CIF, NIF, o VAT) en la conversación para realizar la investigación automática.
                    </p>
                  )}
                </div>

                {/* 3. Discusiones Comerciales Detectadas */}
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
                    Temas Comerciales Abordados
                  </h4>
                  <p className="text-xs leading-relaxed">
                    {currentResult.commercialDetailsFound}
                  </p>
                </div>

                {/* 4. Resumen y Plan de Acción */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="font-display font-bold text-slate-800 text-xs uppercase tracking-wider mb-2.5">
                      Resumen de la Comunicación
                    </h3>
                    <div className="bg-slate-50 p-4 rounded border border-slate-200 text-xs leading-relaxed text-slate-600">
                      {currentResult.summaryOfCall}
                    </div>
                  </div>

                  <div>
                    <h3 className="font-display font-bold text-slate-800 text-xs uppercase tracking-wider mb-2.5">
                      Plan de Acción y Regularización
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
                      Exportar Reporte de Compliance
                    </h4>
                    
                    {/* Settings Trigger */}
                    <button
                      type="button"
                      onClick={() => setShowGoogleConfig(!showGoogleConfig)}
                      className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 cursor-pointer transition"
                    >
                      <Info className="w-3.5 h-3.5" />
                      {showGoogleConfig ? 'Ocultar Ajustes' : 'Ajustes de Google Drive (Vercel)'}
                    </button>
                  </div>

                  {/* Google Configuration Panel */}
                  {showGoogleConfig && (
                    <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-lg text-xs text-slate-600 flex flex-col gap-3 animate-fadeIn mb-3">
                      <div className="font-semibold text-slate-800 text-xs flex items-center gap-1">
                        <Info className="w-4 h-4 text-indigo-600" />
                        Guía Definitiva de Configuración para Google Drive en Vercel
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        Google es sumamente estricto con las direcciones URL de redirección. Una barra diagonal (<code className="bg-slate-200 px-0.5 rounded text-red-600 font-mono">/</code>) de más o de menos puede causar el error <code className="bg-slate-200 px-1 py-0.5 rounded text-red-600 font-bold">redirect_uri_mismatch</code>. 
                        Sigue estos pasos detallados para resolverlo de inmediato:
                      </p>
                      <ol className="list-decimal pl-4 text-[11px] flex flex-col gap-2 text-slate-600">
                        <li>Abre la <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline font-semibold">Consola de Google Cloud</a> e ingresa a tu proyecto.</li>
                        <li>Haz clic en tu credencial tipo <strong>ID de cliente de OAuth 2.0</strong> (o crea una seleccionando <em>Aplicación web</em>).</li>
                        <li>
                          En la sección <strong>Orígenes de JavaScript autorizados</strong>, agrega este origen exacto (sin barra final):
                          <div className="mt-1 flex items-center gap-1.5">
                            <code className="bg-white border border-slate-200 px-2 py-1 rounded text-red-600 font-mono select-all text-[10px] font-semibold break-all">{window.location.origin}</code>
                          </div>
                        </li>
                        <li>
                          En la sección <strong>URIs de redireccionamiento autorizados</strong>, debes agregar <strong>AMBOS</strong> valores para evitar errores de barra final:
                          <div className="mt-1.5 flex flex-col gap-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400 font-mono text-[10px] w-14 font-semibold">Valor 1:</span>
                              <code className="bg-white border border-slate-200 px-2 py-1 rounded text-indigo-600 font-mono select-all text-[10px] font-semibold break-all">{window.location.origin}</code>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400 font-mono text-[10px] w-14 font-semibold">Valor 2:</span>
                              <code className="bg-white border border-slate-200 px-2 py-1 rounded text-indigo-600 font-mono select-all text-[10px] font-semibold break-all">{window.location.origin + '/'}</code>
                            </div>
                            {window.location.href.split('#')[0].split('?')[0] !== window.location.origin && window.location.href.split('#')[0].split('?')[0] !== window.location.origin + '/' && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-slate-400 font-mono text-[10px] w-14 font-semibold">Valor 3:</span>
                                <code className="bg-white border border-slate-200 px-2 py-1 rounded text-indigo-600 font-mono select-all text-[10px] font-semibold break-all">{window.location.href.split('#')[0].split('?')[0]}</code>
                              </div>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-500 mt-1 italic font-sans">
                            * Agrega una fila para el Valor 1 y otra fila para el Valor 2 en Google Cloud.
                          </p>
                        </li>
                        <li>Haz clic en <strong>Guardar</strong> en el botón azul inferior de la consola de Google.</li>
                        <li>Copia el <strong>ID de cliente</strong> generado (el texto largo que termina en <code className="bg-slate-200 px-0.5 rounded font-mono">.apps.googleusercontent.com</code>) y pégalo aquí abajo:</li>
                      </ol>

                      {/* Error 403 Troubleshooting block */}
                      <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-slate-700">
                        <div className="font-semibold text-amber-800 text-[11px] flex items-center gap-1.5 mb-1">
                          <span className="flex h-2 w-2 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                          </span>
                          ¿Te aparece el Error "Acceso bloqueado: App no verificada" o "Error 403: access_denied"?
                        </div>
                        <p className="text-[10px] leading-relaxed text-slate-600 mb-2">
                          Esto se debe a que tu proyecto de Google Cloud está en estado de <strong>Prueba (Testing)</strong> por defecto y no permite accesos externos sin autorizar previamente los correos de prueba.
                        </p>
                        <div className="text-[10px] font-medium text-slate-800 mb-1">Cómo solucionarlo en 1 minuto:</div>
                        <ol className="list-decimal pl-4 text-[10px] flex flex-col gap-1 text-slate-600">
                          <li>Entra a la <a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" rel="noopener noreferrer" className="text-amber-700 underline font-semibold">Pantalla de consentimiento de OAuth de Google Cloud</a>.</li>
                          <li>Busca la sección llamada <strong>Usuarios de prueba (Test users)</strong>.</li>
                          <li>Haz clic en el botón <strong>+ ADD USERS (Agregar usuarios)</strong>.</li>
                          <li>Agrega tu correo electrónico exacto: <code className="bg-amber-100 border border-amber-250 px-1 py-0.5 rounded text-amber-950 font-mono select-all font-bold">huboo.nicolas@gmail.com</code> y guarda los cambios.</li>
                          <li><em>(Opcional)</em> Si quieres que cualquiera pueda usar la app sin configurar usuarios, puedes hacer clic en el botón <strong>Publicar aplicación (Publish app)</strong> en esa misma pantalla de consentimiento de Google Cloud para pasarla a producción.</li>
                        </ol>
                      </div>

                      <div className="flex flex-col gap-1.5 mt-2">
                        <label className="font-semibold text-slate-700 text-[11px]">ID de Cliente de Google (OAuth Client ID):</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={customGoogleClientId}
                            onChange={(e) => setCustomGoogleClientId(e.target.value)}
                            placeholder="Ej. 123456789-abc.apps.googleusercontent.com"
                            className="bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 w-full focus:outline-none focus:border-indigo-500"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              localStorage.setItem('custom_google_client_id', customGoogleClientId.trim());
                              setShowGoogleConfig(false);
                              alert('Configuración de Google Client ID guardada correctamente.');
                            }}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 rounded transition cursor-pointer shrink-0"
                          >
                            Guardar
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
                            Generando Google Doc...
                          </>
                        ) : (
                          <>
                            <PlusCircle className="w-3.5 h-3.5" />
                            Exportar a Google Docs
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={handleGoogleLogin}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider py-2.5 px-4 rounded border border-slate-200 flex items-center gap-2 transition cursor-pointer"
                        title="Inicia sesión con Google para habilitar exportación a Google Docs"
                      >
                        <Lock className="w-3.5 h-3.5 text-slate-400" />
                        Conectar Google Workspace para Exportar
                      </button>
                    )}

                    {/* Descarga Offline */}
                    <button
                      onClick={handleDownloadLocalHTML}
                      className="bg-slate-850 hover:bg-slate-900 text-white font-bold text-xs uppercase tracking-wider py-2.5 px-4 rounded flex items-center gap-2 transition cursor-pointer shadow-sm"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Descargar Reporte Offline (HTML)
                    </button>
                  </div>

                  {/* Resultados de Exportación Google */}
                  {exportedDocUrl && (
                    <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-lg flex flex-col gap-3 animate-fadeIn">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <div>
                          <p className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            ¡Reporte subido a Google Drive con éxito!
                          </p>
                          <p className="text-[11px] text-indigo-700 mt-0.5">
                            Se guardó en la carpeta <strong className="text-indigo-900">"{exportedFolderName || 'Empresa'}"</strong> en Google Drive.
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
                              Ver Carpeta de Empresa
                            </a>
                          )}
                          <a
                            href={exportedDocUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] uppercase tracking-wider py-1.5 px-3 rounded flex items-center gap-1.5 transition whitespace-nowrap justify-center flex-1 sm:flex-none cursor-pointer"
                          >
                            Abrir Documento Google
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
                          Explorador Visual: Repositorio en Google Drive
                        </h4>
                      </div>
                      <div className="flex items-center gap-2">
                        {googleUser ? (
                          <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-mono px-2 py-0.5 rounded border border-emerald-500/30 font-semibold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            Conectado
                          </span>
                        ) : (
                          <span className="bg-slate-700 text-slate-300 text-[10px] font-mono px-2 py-0.5 rounded border border-slate-600">
                            Simulación de Estructura
                          </span>
                        )}
                        {googleUser && (
                          <button
                            type="button"
                            onClick={() => fetchDriveFolders(oauthToken)}
                            disabled={loadingDrive}
                            className="text-indigo-400 hover:text-white p-1 rounded hover:bg-slate-800 transition disabled:opacity-50 cursor-pointer"
                            title="Refrescar carpetas de Drive"
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
                              Carpetas KYC
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
                            placeholder="Buscar empresa..."
                            className="bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 w-full"
                          />

                          {/* Folder list */}
                          {loadingDrive ? (
                            <div className="flex flex-col items-center justify-center py-10 gap-2">
                              <RefreshCw className="w-5 h-5 text-indigo-600 animate-spin" />
                              <span className="text-[11px] text-slate-500">Cargando carpetas...</span>
                            </div>
                          ) : driveFolders.length === 0 ? (
                            <div className="text-center py-8 bg-white/50 border border-dashed border-slate-250 rounded p-4 text-slate-400">
                              <Folder className="w-6 h-6 text-slate-300 mx-auto mb-1.5" />
                              <p className="text-[10px] leading-normal">
                                No se encontraron carpetas. Exporta un reporte para crear una.
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
                                  <span className="font-semibold text-slate-400">Mi Unidad</span>
                                  <span className="text-slate-300">/</span>
                                  <Folder className="w-3.5 h-3.5 text-indigo-600" />
                                  <span className="font-bold text-slate-800 truncate max-w-[150px]">
                                    {driveFolders.find(f => f.id === activeFolderId)?.name || 'Empresa'}
                                  </span>
                                </div>
                                <a
                                  href={`https://drive.google.com/drive/folders/${activeFolderId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 transition self-start cursor-pointer"
                                >
                                  Abrir Carpeta en Google Drive ↗
                                </a>
                              </div>

                              {/* Files listing */}
                              <div className="flex flex-col gap-2">
                                <div className="flex justify-between items-center">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                                    Archivos de Cumplimiento
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => fetchFilesForFolder(activeFolderId)}
                                    disabled={loadingDriveFiles}
                                    className="text-[9px] text-indigo-600 font-bold font-mono hover:underline cursor-pointer"
                                  >
                                    Refrescar archivos
                                  </button>
                                </div>

                                {loadingDriveFiles ? (
                                  <div className="flex items-center justify-center py-10 gap-2">
                                    <RefreshCw className="w-4 h-4 text-indigo-600 animate-spin" />
                                    <span className="text-xs text-slate-500">Consultando Drive...</span>
                                  </div>
                                ) : activeFolderFiles.length === 0 ? (
                                  <p className="text-[11px] text-slate-500 text-center py-8 border border-dashed border-slate-200 rounded">
                                    No hay archivos adicionales en esta carpeta de Drive. Puedes añadir notas o actas adicionales abajo.
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
                                                  Creado: {new Date(file.createdTime).toLocaleString('es-ES', {
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
                                              Abrir ↗
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
                                      setNewNoteTitle(`Anotación Adicional - ${currentResult?.companyName || 'Empresa'}`);
                                      setNewNoteContent('PEP validado en base de datos nacional, sin coincidencias encontradas.\nSe adjuntan hallazgos como anexo legal de KYC.');
                                    }}
                                    className="bg-slate-100 hover:bg-slate-200 border border-slate-300 hover:border-slate-400 text-slate-700 text-[11px] font-bold py-2 px-3 rounded flex items-center justify-center gap-1.5 transition cursor-pointer w-full"
                                  >
                                    <PlusCircle className="w-3.5 h-3.5 text-slate-500" />
                                    Añadir Memorándum o Nota de Compliance Directo a Drive
                                  </button>
                                ) : (
                                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex flex-col gap-2.5 animate-fadeIn">
                                    <div className="flex justify-between items-center">
                                      <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider font-mono">
                                        Nuevo Memo en Google Docs
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => setShowNoteForm(false)}
                                        className="text-slate-400 hover:text-rose-600 text-[10px] font-bold cursor-pointer"
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                    <input
                                      type="text"
                                      value={newNoteTitle}
                                      onChange={(e) => setNewNoteTitle(e.target.value)}
                                      placeholder="Título de la Nota"
                                      className="bg-white border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-semibold w-full"
                                    />
                                    <textarea
                                      rows={3}
                                      value={newNoteContent}
                                      onChange={(e) => setNewNoteContent(e.target.value)}
                                      placeholder="Detalles del hallazgo o validación..."
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
                                          Guardando en Drive...
                                        </>
                                      ) : (
                                        'Guardar Nota en Google Drive'
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
                              <h5 className="font-bold text-xs text-slate-700">Explorador de Archivos Corporativo</h5>
                              <p className="text-[11px] leading-relaxed text-slate-500 mt-1 max-w-xs">
                                Selecciona una carpeta de la lista lateral izquierda para ver sus archivos en Google Drive en tiempo real y redactar notas compliance.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* Beautiful Visual Mock Simulator Diagram */
                      <div className="p-4 bg-white flex flex-col gap-4">
                        <p className="text-[11px] leading-relaxed text-slate-600 -mb-1">
                          Conectar tu cuenta organiza de forma automatizada todos tus documentos en una estructura de carpetas jerárquica limpia, evitando mezclar análisis y permitiendo auditorías rápidas:
                        </p>

                        {/* Interactive Tree View Simulator */}
                        <div className="bg-slate-900 text-slate-300 p-4 rounded-lg font-mono text-[11px] shadow-inner border border-slate-800 select-none flex flex-col gap-2">
                          <div className="flex items-center justify-between border-b border-slate-850 pb-1.5 mb-1 text-[9px] text-slate-500 font-semibold tracking-wider">
                            <span>VISTA PREVIA DEL REPOSITORIO</span>
                            <span>GOOGLE DRIVE</span>
                          </div>
                          <div className="flex items-center gap-2 text-indigo-400">
                            <Folder className="w-3.5 h-3.5 shrink-0" />
                            <span>Mi Unidad / Mi Google Drive</span>
                          </div>
                          <div className="pl-4 flex items-center gap-2 text-amber-400">
                            <span>└──</span>
                            <Folder className="w-3.5 h-3.5 shrink-0" />
                            <span>📁 {currentResult?.companyName || '[Nombre de la Empresa]'}</span>
                          </div>
                          <div className="pl-10 flex flex-col gap-1.5 text-slate-400">
                            <div className="flex items-center gap-2">
                              <span>├──</span>
                              <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                              <span className="text-white">📄 Informe KYC - {currentResult?.companyName || '[Empresa]'} ({currentResult?.clientName || '[Cliente]'}).gdoc</span>
                              <span className="text-[9px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 font-semibold rounded px-1">Reporte Principal</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span>└──</span>
                              <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                              <span>📄 Memorándum Adicional - Compliance Memo.gdoc</span>
                              <span className="text-[9px] bg-slate-800 text-slate-500 rounded px-1 font-semibold">Memos del Auditor</span>
                            </div>
                          </div>
                        </div>

                        {/* Feature features list */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-slate-100 mt-1">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-indigo-600 font-mono">1. CARPETA EXCLUSIVA</span>
                            <span className="text-[10px] text-slate-500 leading-relaxed">
                              Cada empresa tiene su propia carpeta dedicada en tu Drive para una auditoría sin errores de desorden.
                            </span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-indigo-600 font-mono">2. FORMATO IMPECABLE</span>
                            <span className="text-[10px] text-slate-500 leading-relaxed">
                              Los informes se crean con cabeceras, tablas y esquemas de color corporativos autogenerados.
                            </span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-indigo-600 font-mono">3. REDACCIÓN INTERACTIVA</span>
                            <span className="text-[10px] text-slate-500 leading-relaxed">
                              Una vez conectado, podrás redactar y adjuntar notas adicionales que se guardarán directamente en su carpeta.
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {!googleUser && (
                    <p className="text-[10px] text-slate-500 italic mt-1.5 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-indigo-500 inline animate-pulse" />
                      Tip: Cuando conectas tu Google Drive, cada análisis completado se guardará de forma automática en una carpeta de Drive creada para esa empresa.
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
                Historial de Análisis Local de Contrapartes
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Directorio persistente local de las contrapartes analizadas y su estado de cumplimiento.
              </p>
            </div>
            {clients.length > 0 && (
              <span className="text-xs bg-slate-50 text-slate-600 font-mono px-2 py-0.5 rounded border border-slate-200 font-semibold">
                {clients.length} Contrapartes
              </span>
            )}
          </div>

          {clients.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-slate-200 rounded bg-slate-50/50">
              <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-slate-500">No hay contrapartes analizadas registradas en el historial local aún.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded border border-slate-250 shadow-sm">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 font-mono font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Contraparte / Empresa</th>
                    <th className="py-3 px-4">Jurisdicción</th>
                    <th className="py-3 px-4">Análisis de Control</th>
                    <th className="py-3 px-4">Estado Compliance</th>
                    <th className="py-3 px-4">Fecha Análisis</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
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
                            CONFORME
                          </span>
                        ) : (
                          <span className="bg-red-100 text-red-800 text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase tracking-wide animate-pulse">
                            VIOLACIÓN
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 text-[11px] font-mono">{record.analyzedAt}</td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={(e) => deleteRecord(record.id, e)}
                          className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-100 transition inline-block opacity-0 group-hover:opacity-100"
                          title="Eliminar de historial"
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
          Este software cumple estrictamente con el Protocolo de Onboarding y Checklist de KYC Corporativo de Cero Tolerancia. Las auditorías automatizadas utilizan inteligencia de modelos avanzados de Google Gemini para mitigar riesgos legales, regulatorios y comerciales.
        </p>
      </footer>
    </div>
  );
}

import { KYCAnalysisResult } from './types';

interface BatchUpdateRequest {
  insertText?: {
    text: string;
    location: {
      index: number;
    };
  };
  updateTextStyle?: {
    textStyle: {
      bold?: boolean;
      fontSize?: {
        size: number;
        unit: 'PT';
      };
      foregroundColor?: {
        color: {
          rgbColor: {
            red: number;
            green: number;
            blue: number;
          };
        };
      };
    };
    fields: string;
    range: {
      startIndex: number;
      endIndex: number;
    };
  };
}

/**
 * Creates a beautifully formatted Google Doc in a specific folder named after the company.
 */
export async function createKYCDocument(
  token: string,
  data: KYCAnalysisResult
): Promise<{ docUrl: string; folderUrl: string; folderName: string; folderId?: string; documentId?: string }> {
  const companyName = (data.companyName || 'Empresa').trim();
  const clientName = (data.clientName || 'Cliente').trim();
  
  // 1. Search for an existing folder with the company name
  let folderId = '';
  // Avoid SQL-like injection in search query by escaping single quotes
  const escapedCompanyName = companyName.replace(/'/g, "\\'");
  const searchQueries = `mimeType='application/vnd.google-apps.folder' and name='${escapedCompanyName}' and trashed=false`;
  
  try {
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQueries)}&fields=files(id,name)`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.files && searchData.files.length > 0) {
        folderId = searchData.files[0].id;
      }
    }
  } catch (searchErr) {
    console.error('Error al buscar la carpeta de la empresa:', searchErr);
  }
  
  // 2. If folder doesn't exist, create it
  if (!folderId) {
    try {
      const createFolderRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: companyName,
          mimeType: 'application/vnd.google-apps.folder',
        }),
      });
      
      if (createFolderRes.ok) {
        const folderData = await createFolderRes.json();
        folderId = folderData.id;
      } else {
        const err = await createFolderRes.json().catch(() => ({}));
        console.error('Error al crear la carpeta en Drive:', err);
      }
    } catch (createErr) {
      console.error('Error de red al crear carpeta:', createErr);
    }
  }
  
  // 3. Build document text
  const isCompliantText = data.isCompliant ? 'CONFORME (SÍ)' : 'ALERTA DE INCUMPLIMIENTO (NO - BRECHA DE POLÍTICA)';
  const severityText = data.breachSeverity === 'CRITICAL' ? 'CRÍTICA' : 'NINGUNA';
  
  const bodyText = `
INFORME DE CUMPLIMIENTO DE COMPLIANCE (KYC)
Documento de Control Interno Corporativo - Generado por KYC Compliance Automator
---------------------------------------------------------------------------------

1. INFORMACIÓN GENERAL DE LA CONTRAPARTE
   • Cliente/Representante: ${clientName}
   • Empresa / Entidad: ${companyName}
   • Cargo / Rol: ${data.role || 'No especificado'}
   • País: ${data.country || 'No especificado'}
   • Información de Contacto: ${data.contactInfo || 'No especificada'}

2. ESTADO DE CUMPLIMIENTO (POLÍTICA DE CERO TOLERANCIA)
   • ¿Cumple con el protocolo de onboarding?: ${isCompliantText}
   • Severidad de la alerta: ${severityText}
   • ¿Se detectaron discusiones comerciales previas?: ${data.commercialDiscussionsDetected ? 'SÍ' : 'NO'}

3. DETALLES DE LAS TEMAS COMERCIALES DISCUTIDOS
   ${data.commercialDetailsFound || 'Ninguno'}

4. ESTADO DEL CHECKLIST KYC (REQUERIDO ANTES DE NEGOCIACIÓN)
   [${data.kycChecklist?.identityEstablished ? 'X' : ' '}] Identidad Legal Establecida y Registrada
   [${data.kycChecklist?.ownershipVerified ? 'X' : ' '}] Verificación de Beneficiarios Finales (UBO) Completada
   [${data.kycChecklist?.businessActivityDefined ? 'X' : ' '}] Propósito y Actividad Comercial Definida
   [${data.kycChecklist?.riskAssessmentCompleted ? 'X' : ' '}] Análisis de Perfil de Riesgo Completado

5. ACCIONES Y PRÓXIMOS PASOS REQUERIDOS
${(data.nextStepsRequired || []).map(step => `   • ${step}`).join('\n')}

6. RESUMEN DE LA CONVERSACIÓN
   ${data.summaryOfCall || 'Sin transcripción'}

---------------------------------------------------------------------------------
AVISO DE COMPLIANCE: De acuerdo con la Política de Cero Tolerancia corporativa, no se pueden reanudar o mantener discusiones comerciales con la contraparte hasta que todos los puntos del Checklist KYC muestren [X] (Verificados).
  `;
  
  // 4. Create the Google Doc inside the company folder (or root as fallback) with content via multipart upload
  const docTitle = `Informe KYC - ${companyName} (${clientName})`;
  const boundary = '314159265358979323846';
  const metadata = {
    name: docTitle,
    mimeType: 'application/vnd.google-apps.document',
    parents: folderId ? [folderId] : [],
  };

  const body =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) + '\r\n' +
    `--${boundary}\r\n` +
    'Content-Type: text/plain; charset=UTF-8\r\n\r\n' +
    bodyText + '\r\n' +
    `--${boundary}--`;

  const createDocRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: body,
  });

  if (!createDocRes.ok) {
    const err = await createDocRes.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Error al crear el documento en Google Drive.');
  }

  const docData = await createDocRes.json();
  const documentId = docData.id;
  
  const docUrl = `https://docs.google.com/document/d/${documentId}/edit`;
  const folderUrl = folderId ? `https://drive.google.com/drive/folders/${folderId}` : 'https://drive.google.com';
  
  return {
    docUrl,
    folderUrl,
    folderName: companyName,
    folderId,
    documentId,
  };
}

/**
 * Fetches the list of files in a specific Google Drive folder.
 */
export async function getFilesInFolder(
  token: string,
  folderId: string
): Promise<Array<{ id: string; name: string; mimeType: string; webViewLink?: string; createdTime?: string }>> {
  try {
    const query = `'${folderId}' in parents and trashed = false`;
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,webViewLink,createdTime)&orderBy=name`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    if (res.ok) {
      const data = await res.json();
      return data.files || [];
    } else {
      const errorText = await res.text();
      console.error('[Google Drive API] Error fetching files in folder:', errorText);
      return [];
    }
  } catch (err) {
    console.error('[Google Drive API] Network error fetching files:', err);
    return [];
  }
}

/**
 * Retrieves all folders created by this app in the user's Google Drive.
 */
export async function getAllKYCFolders(
  token: string
): Promise<Array<{ id: string; name: string; mimeType: string; createdTime?: string }>> {
  try {
    const query = "mimeType = 'application/vnd.google-apps.folder' and trashed = false";
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,createdTime)&orderBy=name`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    if (res.ok) {
      const data = await res.json();
      return data.files || [];
    } else {
      const errorText = await res.text();
      console.error('[Google Drive API] Error fetching all folders:', errorText);
      return [];
    }
  } catch (err) {
    console.error('[Google Drive API] Network error fetching folders:', err);
    return [];
  }
}

/**
 * Creates an additional text file or Google Doc inside a company's folder.
 */
export async function createAdditionalNote(
  token: string,
  folderId: string,
  title: string,
  content: string
): Promise<{ id: string; webViewLink: string }> {
  try {
    const boundary = '314159265358979323846';
    const metadata = {
      name: title,
      mimeType: 'application/vnd.google-apps.document',
      parents: [folderId],
    };

    const body =
      `--${boundary}\r\n` +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) + '\r\n' +
      `--${boundary}\r\n` +
      'Content-Type: text/plain; charset=UTF-8\r\n\r\n' +
      content + '\r\n' +
      `--${boundary}--`;

    const createRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: body,
    });

    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Error al crear el documento de nota.');
    }

    const docData = await createRes.json();
    const documentId = docData.id;

    return {
      id: documentId,
      webViewLink: `https://docs.google.com/document/d/${documentId}/edit`,
    };
  } catch (err: any) {
    console.error('Error creating additional note:', err);
    throw err;
  }
}


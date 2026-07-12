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
  const isCompliantText = data.isCompliant ? 'COMPLIANT (YES)' : 'NON-COMPLIANT ALERT (NO - POLICY BREACH)';
  const severityText = data.breachSeverity === 'CRITICAL' ? 'CRITICAL' : 'NONE';
  
  const rawQ = (data.questionnaire || {}) as any;
  const sanitizeVal = (val: any, fallback: string) => {
    if (val === undefined || val === null) return fallback;
    const s = String(val).trim();
    if (!s || s.toLowerCase() === 'none' || s.toLowerCase() === 'unknown' || s.toLowerCase() === 'n/a') {
      return fallback;
    }
    return s;
  };

  const q = {
    q1_name: sanitizeVal(rawQ.q1_name, clientName || '(no me lo ha contestado)'),
    q2_source: sanitizeVal(rawQ.q2_source, '(no me lo ha contestado)'),
    q3_country: sanitizeVal(rawQ.q3_country, data.country || '(no me lo ha contestado)'),
    q4_address_phone: sanitizeVal(rawQ.q4_address_phone, data.contactInfo || '(no me lo ha contestado)'),
    q5_company_name: sanitizeVal(rawQ.q5_company_name, companyName || '(no me lo ha contestado)'),
    q6_activity: sanitizeVal(rawQ.q6_activity, data.role || '(no me lo ha contestado)'),
    q7_statutory_db: sanitizeVal(rawQ.q7_statutory_db, data.taxId && data.taxId !== 'None' ? `${data.taxId} - ${data.taxIdResearch || ''}` : '(no me lo ha contestado)'),
    q8_formation_date: sanitizeVal(rawQ.q8_formation_date, '(no me lo ha contestado)'),
    q9_years_trading: sanitizeVal(rawQ.q9_years_trading, '(no me lo ha contestado)'),
    q10_shipping: sanitizeVal(rawQ.q10_shipping, '(no me lo ha contestado)'),
    q11_channel: sanitizeVal(rawQ.q11_channel, '(no me lo ha contestado)'),
    q12_goods_in: sanitizeVal(rawQ.q12_goods_in, '(no me lo ha contestado)'),
    q13_stock_shipping: sanitizeVal(rawQ.q13_stock_shipping, '(no me lo ha contestado)'),
    q14_average_rrp: sanitizeVal(rawQ.q14_average_rrp, '(no me lo ha contestado)'),
    q15_start_date: sanitizeVal(rawQ.q15_start_date, '(no me lo ha contestado)'),
    q16_kyc: sanitizeVal(rawQ.q16_kyc, '(no me lo ha contestado)'),
    q17_capital: sanitizeVal(rawQ.q17_capital, '(no me lo ha contestado)'),
    q18_europe: sanitizeVal(rawQ.q18_europe, '(no me lo ha contestado)'),
    q19_pricing: sanitizeVal(rawQ.q19_pricing, '(no me lo ha contestado)'),
    q20_other: sanitizeVal(rawQ.q20_other, '(no me lo ha contestado)')
  };

  const bodyText = `Huboo – Client Onboarding
Onboarding Questionnaire
Client: ${companyName || '________________________'}     BDM: ____________________     Date: 7 July 2026

1.  Name  (primary contact / principal)
${q.q1_name}


2.  Source  (how the client came to us; referrer)
${q.q2_source}


3.  Country / residence
${q.q3_country}


4.  Address and telephone number
${q.q4_address_phone}


5.  Name of company  (legal and trading name)
${q.q5_company_name}


6.  Activity  (what the business does; product categories)
${q.q6_activity}


7.  Companies House / statutory databases  (registration number; checks completed)
${q.q7_statutory_db}


8.  Date of formation
${q.q8_formation_date}


9.  Years trading
${q.q9_years_trading}


10.  Shipping  (volumes; markets; carriers)
${q.q10_shipping}


11.  Channel  (D2C / B2B / marketplace)
${q.q11_channel}


12.  Goods in / source  (where stock originates; inbound)
${q.q12_goods_in}


13.  Stock & shipping  (SKUs; storage; fulfilment profile)
${q.q13_stock_shipping}


14.  Average RRP  (and average order value / weight)
${q.q14_average_rrp}


15.  Start date  (target go-live)
${q.q15_start_date}


16.  KYC  (ID and address for UBOs and directors; certified docs; screening)
${q.q16_kyc}


17.  Capital  (funding position; investors; source of funds)
${q.q17_capital}


18.  Europe  (EU operations; VAT registrations; markets)
${q.q18_europe}


19.  Pricing  (agreed rate card; B2B charges)
${q.q19_pricing}


20.  Other  (notes; special requirements; risks)
${q.q20_other}


Sign-off
BDM: ______________    Compliance (KYC/UBO complete): ______________    EC / Chair approval (new counterparty): ______________
Internal. Complete in full before onboarding. Ownership / UBO and KYC fields are mandatory.

=================================================================================
KYC COMPLIANCE AUDIT REPORT (INTERNAL COMPLIANCE MONITORING)
=================================================================================
• Contact/Representative: ${clientName}
• Company / Entity: ${companyName}
• Title / Role: ${data.role || 'Not specified'}
• Country/Region: ${data.country || 'Not specified'}
• Contact Information: ${data.contactInfo || 'Not specified'}

COMPLIANCE STATUS (ZERO TOLERANCE POLICY)
• Complies with onboarding protocol?: ${isCompliantText}
• Breach Severity Level: ${severityText}
• Pre-onboarding commercial discussions detected?: ${data.commercialDiscussionsDetected ? 'YES' : 'NO'}

DETAILS OF COMMERCIAL TOPICS DISCUSSED
${data.commercialDetailsFound || 'None'}

KYC CHECKLIST STATUS (REQUIRED BEFORE ENGAGEMENT)
[${data.kycChecklist?.identityEstablished ? 'X' : ' '}] Legal Identity Established and Registered
[${data.kycChecklist?.ownershipVerified ? 'X' : ' '}] Ultimate Beneficial Owners (UBO) Verification Completed
[${data.kycChecklist?.businessActivityDefined ? 'X' : ' '}] Business Purpose and Activity Formally Defined
[${data.kycChecklist?.riskAssessmentCompleted ? 'X' : ' '}] Risk Profile Assessment Completed

REQUIRED ACTIONS AND NEXT STEPS
${(data.nextStepsRequired || []).map(step => `• ${step}`).join('\n')}

CONVERSATION SUMMARY
• ${data.summaryOfCall || 'No transcript available'}

---------------------------------------------------------------------------------
COMPLIANCE NOTICE: In accordance with the Corporate Zero Tolerance Policy, no commercial discussions or transactions may proceed or resume with this counterparty until all items in the KYC Checklist are verified and marked as [X].
`;
  
  // 4. Create the Google Doc inside the company folder (or root as fallback) with content via multipart upload
  const docTitle = `KYC Report - ${companyName} (${clientName})`;
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


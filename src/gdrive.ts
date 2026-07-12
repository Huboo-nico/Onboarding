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
    if (
      !s || 
      s.toLowerCase() === 'none' || 
      s.toLowerCase() === 'unknown' || 
      s.toLowerCase() === 'n/a' || 
      s === '(no me lo ha contestado)' ||
      s.toLowerCase() === '(no me lo ha contestado)'
    ) {
      return fallback;
    }
    return s;
  };

  const fallbackText = '(Not answered / Not provided)';
  const q = {
    q1_name: sanitizeVal(rawQ.q1_name, clientName || fallbackText),
    q2_source: sanitizeVal(rawQ.q2_source, fallbackText),
    q3_country: sanitizeVal(rawQ.q3_country, data.country || fallbackText),
    q4_address_phone: sanitizeVal(rawQ.q4_address_phone, data.contactInfo || fallbackText),
    q5_company_name: sanitizeVal(rawQ.q5_company_name, companyName || fallbackText),
    q6_activity: sanitizeVal(rawQ.q6_activity, data.role || fallbackText),
    q7_statutory_db: sanitizeVal(rawQ.q7_statutory_db, data.taxId && data.taxId !== 'None' ? `${data.taxId} - ${data.taxIdResearch || ''}` : fallbackText),
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

  const htmlBodyText = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6; margin: 30px; }
    .header-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
    .header-title { font-size: 24px; font-weight: bold; color: #0f172a; margin: 0 0 5px 0; }
    .header-subtitle { font-size: 12px; font-family: monospace; color: #dc2626; text-transform: uppercase; letter-spacing: 1px; font-weight: bold; }
    .section-title { font-size: 16px; font-weight: bold; color: #1e3a8a; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-top: 30px; margin-bottom: 15px; text-transform: uppercase; }
    
    .status-container { padding: 15px; border-radius: 8px; margin-bottom: 25px; border: 1px solid #cbd5e1; }
    .status-compliant { background-color: #f0fdf4; border-color: #bbf7d0; color: #166534; }
    .status-breach { background-color: #fef2f2; border-color: #fca5a5; color: #991b1b; }
    
    .info-grid { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
    .info-grid th { background-color: #f8fafc; text-align: left; font-weight: bold; color: #475569; width: 30%; padding: 10px; border: 1px solid #e2e8f0; font-size: 12px; }
    .info-grid td { padding: 10px; border: 1px solid #e2e8f0; font-size: 13px; }
    
    .checklist-item { padding: 8px 12px; border-radius: 4px; margin-bottom: 8px; border: 1px solid #e2e8f0; font-size: 12px; }
    .checklist-verified { background-color: #f0fdf4; border-color: #bbf7d0; color: #166534; }
    .checklist-pending { background-color: #f8fafc; border-color: #cbd5e1; color: #64748b; }
    
    .question-card { border: 1px solid #e2e8f0; border-radius: 6px; padding: 15px; margin-bottom: 15px; background-color: #f8fafc; }
    .question-header { font-size: 11px; font-weight: bold; color: #64748b; font-family: monospace; text-transform: uppercase; margin-bottom: 4px; }
    .question-label { font-size: 13px; font-weight: bold; color: #334155; margin-bottom: 8px; }
    
    .answer-box { padding: 10px; border-radius: 4px; font-size: 13px; border-left: 3px solid #3b82f6; background-color: #ffffff; color: #1e293b; }
    .answer-unanswered { border-left-color: #f59e0b; background-color: #fffbeb; color: #b45309; font-style: italic; }
    
    .footer { text-align: center; margin-top: 50px; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 20px; }
  </style>
</head>
<body>
  <table class="header-table">
    <tr>
      <td>
        <div class="header-title">HUBOO – CLIENT ONBOARDING QUESTIONNAIRE</div>
        <div class="header-subtitle">ZERO-TOLERANCE CORPORATE SECURITY PROTOCOL</div>
      </td>
    </tr>
  </table>

  <div class="status-container ${data.isCompliant ? 'status-compliant' : 'status-breach'}">
    <strong>COMPLIANCE STATUS: ${data.isCompliant ? 'COMPLIANT (APPROVED)' : 'BREACH DETECTED (RESTRICTED)'}</strong>
    <p style="margin: 5px 0 0 0; font-size: 12px; font-weight: normal;">
      ${data.isCompliant 
        ? 'This communication exchange fully respects the Corporate Zero Tolerance protocol. No unauthorized commercial discussions were detected prior to onboarding requirements.' 
        : 'CRITICAL SECURITY BREACH: Substantive commercial topics (pricing, quotes, contracts) were discussed prior to establishing complete basic KYC validation.'}
    </p>
  </div>

  <div class="section-title">1. Counterparty General Information</div>
  <table class="info-grid">
    <tr>
      <th>Legal & Trading Name</th>
      <td><strong>${companyName}</strong></td>
    </tr>
    <tr>
      <th>Primary Contact / Representative</th>
      <td>${clientName}</td>
    </tr>
    <tr>
      <th>Role / Title</th>
      <td>${data.role || 'Not specified'}</td>
    </tr>
    <tr>
      <th>Jurisdiction / Residence</th>
      <td>${data.country || 'Not specified'}</td>
    </tr>
    <tr>
      <th>Contact Information</th>
      <td>${data.contactInfo || 'Not specified'}</td>
    </tr>
  </table>

  <div class="section-title">2. Mandatory Onboarding Checklist</div>
  <div class="checklist-item ${data.kycChecklist?.identityEstablished ? 'checklist-verified' : 'checklist-pending'}">
    [${data.kycChecklist?.identityEstablished ? 'X' : ' '}] Legal Identity Established and Registered — <strong>${data.kycChecklist?.identityEstablished ? 'VERIFIED' : 'PENDING'}</strong>
  </div>
  <div class="checklist-item ${data.kycChecklist?.ownershipVerified ? 'checklist-verified' : 'checklist-pending'}">
    [${data.kycChecklist?.ownershipVerified ? 'X' : ' '}] Ultimate Beneficial Owners (UBO) Verification Completed — <strong>${data.kycChecklist?.ownershipVerified ? 'VERIFIED' : 'PENDING'}</strong>
  </div>
  <div class="checklist-item ${data.kycChecklist?.businessActivityDefined ? 'checklist-verified' : 'checklist-pending'}">
    [${data.kycChecklist?.businessActivityDefined ? 'X' : ' '}] Business Purpose and Activity Formally Defined — <strong>${data.kycChecklist?.businessActivityDefined ? 'VERIFIED' : 'PENDING'}</strong>
  </div>
  <div class="checklist-item ${data.kycChecklist?.riskAssessmentCompleted ? 'checklist-verified' : 'checklist-pending'}">
    [${data.kycChecklist?.riskAssessmentCompleted ? 'X' : ' '}] Risk Profile Assessment Completed — <strong>${data.kycChecklist?.riskAssessmentCompleted ? 'VERIFIED' : 'PENDING'}</strong>
  </div>

  <div class="section-title">3. Huboo Onboarding Questionnaire (20 Questions)</div>
  
  <div class="question-card">
    <div class="question-header">Question 1</div>
    <div class="question-label">Name (primary contact / principal)</div>
    <div class="answer-box ${q.q1_name === fallbackText ? 'answer-unanswered' : ''}">${q.q1_name}</div>
  </div>

  <div class="question-card">
    <div class="question-header">Question 2</div>
    <div class="question-label">Source (how the client came to us; referrer)</div>
    <div class="answer-box ${q.q2_source === fallbackText ? 'answer-unanswered' : ''}">${q.q2_source}</div>
  </div>

  <div class="question-card">
    <div class="question-header">Question 3</div>
    <div class="question-label">Country / residence</div>
    <div class="answer-box ${q.q3_country === fallbackText ? 'answer-unanswered' : ''}">${q.q3_country}</div>
  </div>

  <div class="question-card">
    <div class="question-header">Question 4</div>
    <div class="question-label">Address and telephone number</div>
    <div class="answer-box ${q.q4_address_phone === fallbackText ? 'answer-unanswered' : ''}">${q.q4_address_phone}</div>
  </div>

  <div class="question-card">
    <div class="question-header">Question 5</div>
    <div class="question-label">Name of company (legal and trading name)</div>
    <div class="answer-box ${q.q5_company_name === fallbackText ? 'answer-unanswered' : ''}">${q.q5_company_name}</div>
  </div>

  <div class="question-card">
    <div class="question-header">Question 6</div>
    <div class="question-label">Activity (what the business does; product categories)</div>
    <div class="answer-box ${q.q6_activity === fallbackText ? 'answer-unanswered' : ''}">${q.q6_activity}</div>
  </div>

  <div class="question-card">
    <div class="question-header">Question 7</div>
    <div class="question-label">Companies House / statutory databases (registration number; checks completed)</div>
    <div class="answer-box ${q.q7_statutory_db === fallbackText ? 'answer-unanswered' : ''}">${q.q7_statutory_db}</div>
  </div>

  <div class="question-card">
    <div class="question-header">Question 8</div>
    <div class="question-label">Date of formation</div>
    <div class="answer-box ${q.q8_formation_date === fallbackText ? 'answer-unanswered' : ''}">${q.q8_formation_date}</div>
  </div>

  <div class="question-card">
    <div class="question-header">Question 9</div>
    <div class="question-label">Years trading</div>
    <div class="answer-box ${q.q9_years_trading === fallbackText ? 'answer-unanswered' : ''}">${q.q9_years_trading}</div>
  </div>

  <div class="question-card">
    <div class="question-header">Question 10</div>
    <div class="question-label">Shipping (volumes; markets; carriers)</div>
    <div class="answer-box ${q.q10_shipping === fallbackText ? 'answer-unanswered' : ''}">${q.q10_shipping}</div>
  </div>

  <div class="question-card">
    <div class="question-header">Question 11</div>
    <div class="question-label">Channel (D2C / B2B / marketplace)</div>
    <div class="answer-box ${q.q11_channel === fallbackText ? 'answer-unanswered' : ''}">${q.q11_channel}</div>
  </div>

  <div class="question-card">
    <div class="question-header">Question 12</div>
    <div class="question-label">Goods in / source (where stock originates; inbound)</div>
    <div class="answer-box ${q.q12_goods_in === fallbackText ? 'answer-unanswered' : ''}">${q.q12_goods_in}</div>
  </div>

  <div class="question-card">
    <div class="question-header">Question 13</div>
    <div class="question-label">Stock & shipping (SKUs; storage; fulfilment profile)</div>
    <div class="answer-box ${q.q13_stock_shipping === fallbackText ? 'answer-unanswered' : ''}">${q.q13_stock_shipping}</div>
  </div>

  <div class="question-card">
    <div class="question-header">Question 14</div>
    <div class="question-label">Average RRP (and average order value / weight)</div>
    <div class="answer-box ${q.q14_average_rrp === fallbackText ? 'answer-unanswered' : ''}">${q.q14_average_rrp}</div>
  </div>

  <div class="question-card">
    <div class="question-header">Question 15</div>
    <div class="question-label">Start date (target go-live)</div>
    <div class="answer-box ${q.q15_start_date === fallbackText ? 'answer-unanswered' : ''}">${q.q15_start_date}</div>
  </div>

  <div class="question-card">
    <div class="question-header">Question 16</div>
    <div class="question-label">KYC (ID and address for UBOs and directors; certified docs; screening)</div>
    <div class="answer-box ${q.q16_kyc === fallbackText ? 'answer-unanswered' : ''}">${q.q16_kyc}</div>
  </div>

  <div class="question-card">
    <div class="question-header">Question 17</div>
    <div class="question-label">Capital (funding position; investors; source of funds)</div>
    <div class="answer-box ${q.q17_capital === fallbackText ? 'answer-unanswered' : ''}">${q.q17_capital}</div>
  </div>

  <div class="question-card">
    <div class="question-header">Question 18</div>
    <div class="question-label">Europe (EU operations; VAT registrations; markets)</div>
    <div class="answer-box ${q.q18_europe === fallbackText ? 'answer-unanswered' : ''}">${q.q18_europe}</div>
  </div>

  <div class="question-card">
    <div class="question-header">Question 19</div>
    <div class="question-label">Pricing (agreed rate card; B2B charges)</div>
    <div class="answer-box ${q.q19_pricing === fallbackText ? 'answer-unanswered' : ''}">${q.q19_pricing}</div>
  </div>

  <div class="question-card">
    <div class="question-header">Question 20</div>
    <div class="question-label">Other (notes; special requirements; risks)</div>
    <div class="answer-box ${q.q20_other === fallbackText ? 'answer-unanswered' : ''}">${q.q20_other}</div>
  </div>

  <div class="section-title">4. Commercial Discussions Audit</div>
  <table class="info-grid">
    <tr>
      <th style="width: 40%">Commercial discussions detected?</th>
      <td><strong>${data.commercialDiscussionsDetected ? 'YES (VIOLATION)' : 'NO (COMPLIANT)'}</strong></td>
    </tr>
    <tr>
      <th>Severity Level</th>
      <td><span style="color: ${data.breachSeverity === 'CRITICAL' ? '#dc2626' : '#166534'}; font-weight: bold;">${severityText}</span></td>
    </tr>
  </table>
  
  <p style="font-size: 13px; font-weight: bold; color: #475569; margin-bottom: 5px;">Details of Commercial Topics Discussed:</p>
  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px; font-size: 13px; font-style: italic; color: #1e293b;">
    ${data.commercialDetailsFound || 'None.'}
  </div>

  <div class="section-title">5. Required Actions & Next Steps</div>
  <ul style="padding-left: 20px; font-size: 13px; color: #334155;">
    ${(data.nextStepsRequired || []).map(step => `<li style="margin-bottom: 6px; font-weight: bold;">${step}</li>`).join('')}
  </ul>

  <div class="section-title">6. Conversation Summary</div>
  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px; font-size: 13px; color: #334155;">
    ${data.summaryOfCall || 'No transcript available.'}
  </div>

  <div class="footer">
    This document was automatically compiled and uploaded by the Huboo KYC Compliance Automator.<br>
    Confidentiality Notice: INTERNAL COMPLIANCE RECORD ONLY. DO NOT DISTRIBUTE EXTERNALLY.
  </div>
</body>
</html>`;
  
  // 4. Create the Google Doc inside the company folder (or root as fallback) with content via multipart upload
  const docTitle = `KYC Report - ${companyName} (${clientName})`;
  const boundary = '314159265358979323846';
  const metadata = {
    name: docTitle,
    mimeType: 'application/vnd.google-apps.document',
    parents: folderId ? [folderId] : [],
  };

  const part1 = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  const part2 = `--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${htmlBodyText}\r\n`;
  const part3 = `--${boundary}--`;

  const multipartBlob = new Blob([part1, part2, part3], { type: `multipart/related; boundary=${boundary}` });

  const createDocRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: multipartBlob,
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


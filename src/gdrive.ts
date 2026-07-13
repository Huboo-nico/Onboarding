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
  const companyName = (data.companyName || 'Company').trim();
  const clientName = (data.clientName || 'Client').trim();
  
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
    console.error('Error searching for company folder:', searchErr);
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
        console.error('Error creating folder in Drive:', err);
      }
    } catch (createErr) {
      console.error('Network error creating folder:', createErr);
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

  const markdownBodyText = `# HUBOO – CLIENT ONBOARDING QUESTIONNAIRE
## ZERO-TOLERANCE CORPORATE SECURITY PROTOCOL

---

### COMPLIANCE STATUS: ${data.isCompliant ? 'COMPLIANT (APPROVED)' : 'BREACH DETECTED (RESTRICTED)'}

${data.isCompliant 
  ? 'This communication exchange fully respects the Corporate Zero Tolerance protocol. No unauthorized commercial discussions were detected prior to onboarding requirements.' 
  : 'CRITICAL SECURITY BREACH: Substantive commercial topics (pricing, quotes, contracts) were discussed prior to establishing complete basic KYC validation.'}

---

## 1. Counterparty General Information

* **Legal & Trading Name**: **${companyName}**
* **Primary Contact / Representative**: ${clientName}
* **Role / Title**: ${data.role || 'Not specified'}
* **Jurisdiction / Residence**: ${data.country || 'Not specified'}
* **Contact Information**: ${data.contactInfo || 'Not specified'}

---

## 2. Mandatory Onboarding Checklist

* [${data.kycChecklist?.identityEstablished ? 'X' : ' '}] **Legal Identity Established and Registered** — ${data.kycChecklist?.identityEstablished ? 'VERIFIED' : 'PENDING'}
* [${data.kycChecklist?.ownershipVerified ? 'X' : ' '}] **Ultimate Beneficial Owners (UBO) Verification Completed** — ${data.kycChecklist?.ownershipVerified ? 'VERIFIED' : 'PENDING'}
* [${data.kycChecklist?.businessActivityDefined ? 'X' : ' '}] **Business Purpose and Activity Formally Defined** — ${data.kycChecklist?.businessActivityDefined ? 'VERIFIED' : 'PENDING'}
* [${data.kycChecklist?.riskAssessmentCompleted ? 'X' : ' '}] **Risk Profile Assessment Completed** — ${data.kycChecklist?.riskAssessmentCompleted ? 'VERIFIED' : 'PENDING'}

---

## 3. Huboo Onboarding Questionnaire (20 Questions)

### Question 1: Name (primary contact / principal)
> ${q.q1_name}

### Question 2: Source (how the client came to us; referrer)
> ${q.q2_source}

### Question 3: Country / residence
> ${q.q3_country}

### Question 4: Address and telephone number
> ${q.q4_address_phone}

### Question 5: Name of company (legal and trading name)
> ${q.q5_company_name}

### Question 6: Activity (what the business does; product categories)
> ${q.q6_activity}

### Question 7: Companies House / statutory databases (registration number; checks completed)
> ${q.q7_statutory_db}

### Question 8: Date of formation
> ${q.q8_formation_date}

### Question 9: Years trading
> ${q.q9_years_trading}

### Question 10: Shipping (volumes; markets; carriers)
> ${q.q10_shipping}

### Question 11: Channel (D2C / B2B / marketplace)
> ${q.q11_channel}

### Question 12: Goods in / source (where stock originates; inbound)
> ${q.q12_goods_in}

### Question 13: Stock & shipping (SKUs; storage; fulfilment profile)
> ${q.q13_stock_shipping}

### Question 14: Average RRP (and average order value / weight)
> ${q.q14_average_rrp}

### Question 15: Start date (target go-live)
> ${q.q15_start_date}

### Question 16: KYC (ID and address for UBOs and directors; certified docs; screening)
> ${q.q16_kyc}

### Question 17: Capital (funding position; investors; source of funds)
> ${q.q17_capital}

### Question 18: Europe (EU operations; VAT registrations; markets)
> ${q.q18_europe}

### Question 19: Pricing (agreed rate card; B2B charges)
> ${q.q19_pricing}

### Question 20: Other (notes; special requirements; risks)
> ${q.q20_other}

---

## 4. Commercial Discussions Audit

* **Commercial discussions detected?** ${data.commercialDiscussionsDetected ? 'YES (VIOLATION)' : 'NO (COMPLIANCE APPROVED)'}
* **Severity Level**: **${severityText}**

**Details of Commercial Topics Discussed:**
> ${data.commercialDetailsFound || 'None.'}

---

## 5. Required Actions & Next Steps

${(data.nextStepsRequired || []).map(step => `* **${step}**`).join('\n')}

---

## 6. Conversation Summary

${data.summaryOfCall || 'No transcript available.'}

---

_This document was automatically compiled and uploaded by the Huboo KYC Compliance Automator._
_Confidentiality Notice: INTERNAL COMPLIANCE RECORD ONLY. DO NOT DISTRIBUTE EXTERNALLY._`;
  
  // 4. Create the Google Doc inside the company folder (or root as fallback) with content via multipart upload
  const docTitle = `KYC Report - ${companyName} (${clientName})`;
  const boundary = '314159265358979323846';
  const metadata = {
    name: docTitle,
    mimeType: 'application/vnd.google-apps.document',
    parents: folderId ? [folderId] : [],
  };

  // HTML content generation for beautiful Google Docs rendering
  const escapeHtml = (str: string): string => {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const escCompanyName = escapeHtml(companyName);
  const escClientName = escapeHtml(clientName);
  const escRole = escapeHtml(data.role || 'Not specified');
  const escCountry = escapeHtml(data.country || 'Not specified');
  const escContactInfo = escapeHtml(data.contactInfo || 'Not specified');
  const escCommercialDetails = escapeHtml(data.commercialDetailsFound || 'None.').replace(/\n/g, '<br/>');
  const escSummary = escapeHtml(data.summaryOfCall || 'No transcript available.').replace(/\n/g, '<br/>');

  const htmlBodyText = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: Arial, sans-serif;
      color: #334155;
      line-height: 1.6;
    }
    .header {
      border-bottom: 2px solid #3b82f6;
      padding-bottom: 12px;
      margin-bottom: 20px;
    }
    h1 {
      color: #1e3a8a;
      font-size: 22pt;
      margin: 0;
      font-weight: bold;
    }
    .subtitle {
      color: #64748b;
      font-size: 11pt;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      margin-top: 4px;
      margin-bottom: 0;
      font-weight: bold;
    }
    h2 {
      color: #1e3a8a;
      font-size: 15pt;
      margin-top: 25px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 6px;
    }
    h3 {
      color: #0f172a;
      font-size: 11pt;
      margin-top: 18px;
      margin-bottom: 8px;
      font-weight: bold;
    }
    .status-container {
      margin: 20px 0;
    }
    .status-box {
      padding: 16px;
      border-radius: 6px;
      font-size: 11pt;
    }
    .status-compliant {
      background-color: #ecfdf5;
      border: 1px solid #a7f3d0;
      color: #065f46;
    }
    .status-breach {
      background-color: #fef2f2;
      border: 1px solid #fecaca;
      color: #991b1b;
    }
    blockquote {
      background-color: #f8fafc;
      border-left: 4px solid #cbd5e1;
      padding: 12px 16px;
      margin: 12px 0;
      color: #475569;
      font-style: italic;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
    }
    th, td {
      border: 1px solid #e2e8f0;
      padding: 10px 12px;
      text-align: left;
      font-size: 10pt;
    }
    th {
      background-color: #f1f5f9;
      color: #334155;
      font-weight: bold;
    }
    .checklist-item {
      margin-bottom: 8px;
      font-size: 10.5pt;
    }
    .checked {
      color: #059669;
      font-weight: bold;
    }
    .pending {
      color: #d97706;
      font-weight: bold;
    }
    .footer {
      font-size: 9pt;
      color: #94a3b8;
      margin-top: 50px;
      border-top: 1px solid #e2e8f0;
      padding-top: 15px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>HUBOO &ndash; CLIENT ONBOARDING QUESTIONNAIRE</h1>
    <div class="subtitle">ZERO-TOLERANCE CORPORATE SECURITY PROTOCOL</div>
  </div>

  <div class="status-container">
    <div class="status-box ${data.isCompliant ? 'status-compliant' : 'status-breach'}">
      <strong>COMPLIANCE STATUS: ${data.isCompliant ? 'COMPLIANT (APPROVED)' : 'BREACH DETECTED (RESTRICTED)'}</strong>
      <br/><br/>
      ${data.isCompliant 
        ? 'This communication exchange fully respects the Corporate Zero Tolerance protocol. No unauthorized commercial discussions were detected prior to onboarding requirements.' 
        : 'CRITICAL SECURITY BREACH: Substantive commercial topics (pricing, quotes, contracts) were discussed prior to establishing complete basic KYC validation.'}
    </div>
  </div>

  <h2>1. Counterparty General Information</h2>
  <table>
    <tr>
      <th style="width: 30%;">Legal &amp; Trading Name</th>
      <td><strong>${escCompanyName}</strong></td>
    </tr>
    <tr>
      <th>Primary Contact / Representative</th>
      <td>${escClientName}</td>
    </tr>
    <tr>
      <th>Role / Title</th>
      <td>${escRole}</td>
    </tr>
    <tr>
      <th>Jurisdiction / Residence</th>
      <td>${escCountry}</td>
    </tr>
    <tr>
      <th>Contact Information</th>
      <td>${escContactInfo}</td>
    </tr>
  </table>

  <h2>2. Mandatory Onboarding Checklist</h2>
  <div class="checklist-item">
    <span class="${data.kycChecklist?.identityEstablished ? 'checked' : 'pending'}">
      [${data.kycChecklist?.identityEstablished ? 'X' : ' '}]
    </span> 
    <strong>Legal Identity Established and Registered</strong> &mdash; ${data.kycChecklist?.identityEstablished ? 'VERIFIED' : 'PENDING'}
  </div>
  <div class="checklist-item">
    <span class="${data.kycChecklist?.ownershipVerified ? 'checked' : 'pending'}">
      [${data.kycChecklist?.ownershipVerified ? 'X' : ' '}]
    </span> 
    <strong>Ultimate Beneficial Owners (UBO) Verification Completed</strong> &mdash; ${data.kycChecklist?.ownershipVerified ? 'VERIFIED' : 'PENDING'}
  </div>
  <div class="checklist-item">
    <span class="${data.kycChecklist?.businessActivityDefined ? 'checked' : 'pending'}">
      [${data.kycChecklist?.businessActivityDefined ? 'X' : ' '}]
    </span> 
    <strong>Business Purpose and Activity Formally Defined</strong> &mdash; ${data.kycChecklist?.businessActivityDefined ? 'VERIFIED' : 'PENDING'}
  </div>
  <div class="checklist-item">
    <span class="${data.kycChecklist?.riskAssessmentCompleted ? 'checked' : 'pending'}">
      [${data.kycChecklist?.riskAssessmentCompleted ? 'X' : ' '}]
    </span> 
    <strong>Risk Profile Assessment Completed</strong> &mdash; ${data.kycChecklist?.riskAssessmentCompleted ? 'VERIFIED' : 'PENDING'}
  </div>

  <h2>3. Huboo Onboarding Questionnaire (20 Questions)</h2>
  
  <h3>Question 1: Name (primary contact / principal)</h3>
  <blockquote>${q.q1_name}</blockquote>

  <h3>Question 2: Source (how the client came to us; referrer)</h3>
  <blockquote>${q.q2_source}</blockquote>

  <h3>Question 3: Country / residence</h3>
  <blockquote>${q.q3_country}</blockquote>

  <h3>Question 4: Address and telephone number</h3>
  <blockquote>${q.q4_address_phone}</blockquote>

  <h3>Question 5: Name of company (legal and trading name)</h3>
  <blockquote>${q.q5_company_name}</blockquote>

  <h3>Question 6: Activity (what the business does; product categories)</h3>
  <blockquote>${q.q6_activity}</blockquote>

  <h3>Question 7: Companies House / statutory databases (registration number; checks completed)</h3>
  <blockquote>${q.q7_statutory_db}</blockquote>

  <h3>Question 8: Date of formation</h3>
  <blockquote>${q.q8_formation_date}</blockquote>

  <h3>Question 9: Years trading</h3>
  <blockquote>${q.q9_years_trading}</blockquote>

  <h3>Question 10: Shipping (volumes; markets; carriers)</h3>
  <blockquote>${q.q10_shipping}</blockquote>

  <h3>Question 11: Channel (D2C / B2B / marketplace)</h3>
  <blockquote>${q.q11_channel}</blockquote>

  <h3>Question 12: Goods in / source (where stock originates; inbound)</h3>
  <blockquote>${q.q12_goods_in}</blockquote>

  <h3>Question 13: Stock &amp; shipping (SKUs; storage; fulfilment profile)</h3>
  <blockquote>${q.q13_stock_shipping}</blockquote>

  <h3>Question 14: Average RRP (and average order value / weight)</h3>
  <blockquote>${q.q14_average_rrp}</blockquote>

  <h3>Question 15: Start date (target go-live)</h3>
  <blockquote>${q.q15_start_date}</blockquote>

  <h3>Question 16: KYC (ID and address for UBOs and directors; certified docs; screening)</h3>
  <blockquote>${q.q16_kyc}</blockquote>

  <h3>Question 17: Capital (funding position; investors; source of funds)</h3>
  <blockquote>${q.q17_capital}</blockquote>

  <h3>Question 18: Europe (EU operations; VAT registrations; markets)</h3>
  <blockquote>${q.q18_europe}</blockquote>

  <h3>Question 19: Pricing (agreed rate card; B2B charges)</h3>
  <blockquote>${q.q19_pricing}</blockquote>

  <h3>Question 20: Other (notes; special requirements; risks)</h3>
  <blockquote>${q.q20_other}</blockquote>

  <h2>4. Commercial Discussions Audit</h2>
  <ul>
    <li><strong>Commercial discussions detected?</strong> ${data.commercialDiscussionsDetected ? 'YES (VIOLATION)' : 'NO (COMPLIANCE APPROVED)'}</li>
    <li><strong>Severity Level:</strong> <strong>${severityText}</strong></li>
  </ul>
  <h3>Details of Commercial Topics Discussed:</h3>
  <blockquote>${escCommercialDetails}</blockquote>

  <h2>5. Required Actions &amp; Next Steps</h2>
  <ul>
    ${(data.nextStepsRequired || []).map(step => `<li><strong>${escapeHtml(step)}</strong></li>`).join('')}
  </ul>

  <h2>6. Conversation Summary</h2>
  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 6px; font-size: 10pt; color: #475569;">
    ${escSummary}
  </div>

  <div class="footer">
    <p><em>This document was automatically compiled and uploaded by the Huboo KYC Compliance Automator.</em></p>
    <p><strong>Confidentiality Notice: INTERNAL COMPLIANCE RECORD ONLY. DO NOT DISTRIBUTE EXTERNALLY.</strong></p>
  </div>
</body>
</html>`;

  const part1 = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  const part2 = `--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${htmlBodyText}\r\n`;
  const part3 = `--${boundary}--`;

  const multipartBlob = new Blob([part1, part2, part3], { type: `multipart/related; boundary=${boundary}` });

  const createDocRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBlob,
  });

  if (!createDocRes.ok) {
    const err = await createDocRes.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Error creating document in Google Drive.');
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

    const escapeHtml = (str: string): string => {
      if (!str) return '';
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };

    const htmlBodyText = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="font-family: Arial, sans-serif; color: #334155; line-height: 1.6; font-size: 11pt;">
  <h2 style="color: #1e3a8a; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px; margin-bottom: 15px;">${escapeHtml(title)}</h2>
  <div style="white-space: pre-wrap; background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 6px;">${escapeHtml(content)}</div>
</body>
</html>`;

    const body =
      `--${boundary}\r\n` +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) + '\r\n' +
      `--${boundary}\r\n` +
      'Content-Type: text/html; charset=UTF-8\r\n\r\n' +
      htmlBodyText + '\r\n' +
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
      throw new Error(err.error?.message || 'Error creating note document.');
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


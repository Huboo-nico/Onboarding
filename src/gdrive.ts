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
  
  // 4. Create the HTML report file inside the company folder (or root as fallback) with content via multipart upload
  const docTitle = `KYC_Compliance_Report_${companyName.replace(/\s+/g, '_')}.html`;
  const boundary = '314159265358979323846';
  const metadata = {
    name: docTitle,
    mimeType: 'text/html',
    parents: folderId ? [folderId] : [],
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

  const escCompanyName = escapeHtml(companyName);
  const escClientName = escapeHtml(clientName);
  const escRole = escapeHtml(data.role || 'Not specified');
  const escCountry = escapeHtml(data.country || 'Not specified');
  const escContactInfo = escapeHtml(data.contactInfo || 'Not specified');
  const escCommercialDetails = escapeHtml(data.commercialDetailsFound || 'None.').replace(/\n/g, '<br/>');
  const escSummary = escapeHtml(data.summaryOfCall || 'No transcript available.').replace(/\n/g, '<br/>');

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
              📋 Huboo Onboarding Questionnaire (20 Questions)
          </h3>
          <div style="display: grid; grid-template-columns: 1fr; gap: 16px;">
              ${questionnaireFields.map(field => {
                const val = (q as any)[field.key] || fallbackText;
                const isUnanswered = val === fallbackText || val.includes('(no me lo ha contestado)') || val.includes('(not answered)');
                const answerBg = isUnanswered ? '#fef3c7' : '#f8fafc';
                const answerColor = isUnanswered ? '#b45309' : '#1e293b';
                const answerStyle = isUnanswered ? 'font-style: italic;' : '';
                return `
                  <div style="border-bottom: 1px dashed #e2e8f0; padding-bottom: 12px; text-align: left;">
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

  const taxIdHtml = data.taxId && data.taxId !== 'None' ? `
      <div class="card" style="margin-bottom: 30px;">
          <h3 style="margin-top: 0; color: #334155; font-size: 16px;">6. Tax Identification & Registry Research (VAT/CIF/NIF)</h3>
          <p><strong>Extracted Tax ID:</strong> ${data.taxId}</p>
          <div style="background-color: white; padding: 12px; border-radius: 6px; border: 1px solid #cbd5e1; font-style: italic; font-size: 13px; margin-top: 10px; color: #475569;">
              ${data.taxIdResearch}
          </div>
      </div>
  ` : `
      <div class="card" style="margin-bottom: 30px; opacity: 0.75;">
          <h3 style="margin-top: 0; color: #334155; font-size: 16px;">6. Tax Identification & Registry Research (VAT/CIF/NIF)</h3>
          <p>No NIF, CIF, or VAT tax registration numbers were identified in the conversation transcript for registry verification.</p>
      </div>
  `;

  const htmlBodyText = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>KYC Compliance Report - ${escCompanyName}</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; padding: 40px; margin: 0; }
        .container { max-width: 850px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; }
        h1 { color: #0f172a; margin-top: 0; font-size: 24px; border-bottom: 2px solid #cbd5e1; padding-bottom: 12px; text-align: left; }
        .badge { display: inline-block; padding: 6px 12px; border-radius: 9999px; font-weight: bold; font-size: 14px; margin-bottom: 20px; }
        .badge-success { background-color: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }
        .badge-error { background-color: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
        .card { background-color: #f1f5f9; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 20px; text-align: left; }
        .card h3 { margin-top: 0; color: #334155; font-size: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 12px; }
        ul { padding-left: 20px; text-align: left; }
        li { margin-bottom: 8px; }
        .footer { text-align: center; margin-top: 40px; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>KYC Compliance Audit Report</h1>
        <div class="badge ${data.isCompliant ? 'badge-success' : 'badge-error'}">
            Compliance Status: ${isCompliantText}
        </div>
        
        <div class="grid">
            <div class="card">
                <h3>1. Counterparty General Information</h3>
                <p><strong>Contact/Client:</strong> ${escClientName}</p>
                <p><strong>Company Name:</strong> ${escCompanyName}</p>
                <p><strong>Role / Title:</strong> ${escRole}</p>
                <p><strong>Country / Jurisdiction:</strong> ${escCountry}</p>
                <p><strong>Contact Info:</strong> ${escContactInfo}</p>
            </div>
            
            <div class="card">
                <h3>2. KYC Checklist Status</h3>
                <p><strong>Legal Identity:</strong> ${data.kycChecklist?.identityEstablished ? '🟢 Verified' : '❌ Pending'}</p>
                <p><strong>UBO Ownership:</strong> ${data.kycChecklist?.ownershipVerified ? '🟢 Verified' : '❌ Pending'}</p>
                <p><strong>Business purpose:</strong> ${data.kycChecklist?.businessActivityDefined ? '🟢 Verified' : '❌ Pending'}</p>
                <p><strong>Risk Assessment:</strong> ${data.kycChecklist?.riskAssessmentCompleted ? '🟢 Verified' : '❌ Pending'}</p>
            </div>
        </div>

        ${questionnaireHtml}

        <div class="card">
            <h3>3. Summary of Commercial Topics Discussed</h3>
            <p>${escCommercialDetails}</p>
            <p><strong>Alert Severity Level:</strong> ${severityText}</p>
        </div>

        <div class="card">
            <h3>4. Mandatory Regularization Next Steps</h3>
            <ul>
                ${(data.nextStepsRequired || []).map(step => `<li>${escapeHtml(step)}</li>`).join('')}
            </ul>
        </div>

        <div class="card">
            <h3>5. Conversation Summary</h3>
            <p>${escSummary}</p>
        </div>

        ${taxIdHtml}

        <div class="footer">
            Automatically generated by KYC Compliance Automator - Corporate Zero-Tolerance Security Protocol.
        </div>
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
  
  const docUrl = `https://drive.google.com/file/d/${documentId}/view`;
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
      name: title.endsWith('.html') ? title : `${title}.html`,
      mimeType: 'text/html',
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
  <title>${escapeHtml(title)}</title>
</head>
<body style="font-family: Arial, sans-serif; color: #334155; line-height: 1.6; font-size: 11pt; padding: 30px; background-color: #f8fafc;">
  <div style="max-width: 800px; margin: 0 auto; background-color: #ffffff; padding: 30px; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
    <h2 style="color: #1e3a8a; border-bottom: 2px solid #cbd5e1; padding-bottom: 8px; margin-top: 0; margin-bottom: 20px; font-size: 18pt;">${escapeHtml(title)}</h2>
    <div style="white-space: pre-wrap; background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 6px; color: #334155; font-size: 11pt; line-height: 1.6;">${escapeHtml(content)}</div>
  </div>
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
      webViewLink: `https://drive.google.com/file/d/${documentId}/view`,
    };
  } catch (err: any) {
    console.error('Error creating additional note:', err);
    throw err;
  }
}


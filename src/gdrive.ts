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

  const part1 = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  const part2 = `--${boundary}\r\nContent-Type: text/markdown; charset=UTF-8\r\n\r\n${markdownBodyText}\r\n`;
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


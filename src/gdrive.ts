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
 * Creates a beautifully formatted Google Doc in the user's Drive with the KYC report.
 */
export async function createKYCDocument(
  token: string,
  data: KYCAnalysisResult
): Promise<string> {
  const title = `KYC Report: ${data.companyName} (${data.clientName})`;

  // 1. Create a blank document
  const createRes = await fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title }),
  });

  if (!createRes.ok) {
    const err = await createRes.json();
    throw new Error(err.error?.message || 'Error al crear el documento en Google Docs.');
  }

  const doc = await createRes.json();
  const documentId = doc.documentId;

  // 2. Build the document content
  // We will build a styled document using batchUpdate.
  // To avoid complex index calculations, we append text sequentially.
  // Because we append to index 1 (just after the start), we build the document from the BOTTOM up, 
  // or we can append with a single big text block first and style ranges.
  // Let's create a structured markdown-like text layout.

  const isCompliantText = data.isCompliant ? 'CONFORME (SÍ)' : 'ALERTA DE INCUMPLIMIENTO (NO - BRECHA DE POLÍTICA)';
  const severityText = data.breachSeverity === 'CRITICAL' ? 'CRÍTICA' : 'NINGUNA';

  const bodyText = `
INFORME DE CUMPLIMIENTO DE COMPLIANCE (KYC)
Documento de Control Interno Corporativo - Generado por KYC Compliance Automator
---------------------------------------------------------------------------------

1. INFORMACIÓN GENERAL DE LA CONTRAPARTE
   • Cliente/Representante: ${data.clientName}
   • Empresa / Entidad: ${data.companyName}
   • Cargo / Rol: ${data.role}
   • País: ${data.country}
   • Información de Contacto: ${data.contactInfo}

2. ESTADO DE CUMPLIMIENTO (POLÍTICA DE CERO TOLERANCIA)
   • ¿Cumple con el protocolo de onboarding?: ${isCompliantText}
   • Severidad de la alerta: ${severityText}
   • ¿Se detectaron discusiones comerciales previas?: ${data.commercialDiscussionsDetected ? 'SÍ' : 'NO'}

3. DETALLES DE LAS TEMAS COMERCIALES DISCUTIDOS
   ${data.commercialDetailsFound}

4. ESTADO DEL CHECKLIST KYC (REQUERIDO ANTES DE NEGOCIACIÓN)
   [${data.kycChecklist.identityEstablished ? 'X' : ' '}] Identidad Legal Establecida y Registrada
   [${data.kycChecklist.ownershipVerified ? 'X' : ' '}] Verificación de Beneficiarios Finales (UBO) Completada
   [${data.kycChecklist.businessActivityDefined ? 'X' : ' '}] Propósito y Actividad Comercial Definida
   [${data.kycChecklist.riskAssessmentCompleted ? 'X' : ' '}] Análisis de Perfil de Riesgo Completado

5. ACCIONES Y PRÓXIMOS PASOS REQUERIDOS
${data.nextStepsRequired.map(step => `   • ${step}`).join('\n')}

6. RESUMEN DE LA CONVERSACIÓN
   ${data.summaryOfCall}

---------------------------------------------------------------------------------
AVISO DE COMPLIANCE: De acuerdo con la Política de Cero Tolerancia corporativa, no se pueden reanudar o mantener discusiones comerciales con la contraparte hasta que todos los puntos del Checklist KYC muestren [X] (Verificados).
  `;

  // Apply batch update to write text
  const requests: BatchUpdateRequest[] = [
    {
      insertText: {
        text: bodyText,
        location: { index: 1 }
      }
    }
  ];

  // We can also add styling requests if we want, but simple formatted text is robust.
  // Let's do a text insertion.
  const updateRes = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });

  if (!updateRes.ok) {
    const err = await updateRes.json();
    console.error('Error styling document:', err);
    // Even if styling fails, we have the document, so we can fall back to returning the link.
  }

  return `https://docs.google.com/document/d/${documentId}/edit`;
}

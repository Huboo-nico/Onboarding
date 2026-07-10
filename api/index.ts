import express from "express";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();

// JSON parsing middleware
app.use(express.json());

// Global error handlers to capture any unexpected failures without crashing serverless instances
process.on("uncaughtException", (err) => {
  console.error("[Fatal] UNCAUGHT EXCEPTION in serverless:", err);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("[Fatal] UNHANDLED REJECTION in serverless at:", promise, "reason:", reason);
});

// Enum for Gemini schema
enum Type {
  OBJECT = "OBJECT",
  STRING = "STRING",
  BOOLEAN = "BOOLEAN",
  ARRAY = "ARRAY",
  INTEGER = "INTEGER",
  NUMBER = "NUMBER"
}

// Lazy-initialize Gemini SDK to prevent startup crashes when GEMINI_API_KEY is missing
function getGeminiClient(customKey?: string, useKeyIndex: 1 | 2 = 1): any {
  let apiKey = "";
  
  // 1. Check custom user key passed in request headers (and ensure it's not a placeholder string)
  if (customKey && typeof customKey === "string") {
    const trimmed = customKey.trim();
    if (trimmed && trimmed !== "null" && trimmed !== "undefined") {
      apiKey = trimmed;
    }
  }
  
  // 2. Fallback to server-side process.env.GEMINI_API_KEY / GEMINI_API_KEY_2
  if (!apiKey) {
    const envKey1 = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : "";
    const envKey2 = process.env.GEMINI_API_KEY_2 ? process.env.GEMINI_API_KEY_2.trim() : "";
    
    if (useKeyIndex === 2 && envKey2 && envKey2 !== "null" && envKey2 !== "undefined" && envKey2 !== "MY_GEMINI_API_KEY") {
      apiKey = envKey2;
    } else if (envKey1 && envKey1 !== "null" && envKey1 !== "undefined" && envKey1 !== "MY_GEMINI_API_KEY") {
      apiKey = envKey1;
    } else if (envKey2 && envKey2 !== "null" && envKey2 !== "undefined" && envKey2 !== "MY_GEMINI_API_KEY") {
      apiKey = envKey2;
    }
  }

  if (!apiKey) {
    throw new Error(
      "Falta la clave de API de Gemini. Por favor, asegúrate de añadir GEMINI_API_KEY en Vercel (Settings > Environment Variables) o ingresa tu clave manualmente en el panel de control de la app."
    );
  }
  
  // Clean up the key: trim whitespace and strip enclosing quotes
  apiKey = apiKey.trim();
  if ((apiKey.startsWith('"') && apiKey.endsWith('"')) || (apiKey.startsWith("'") && apiKey.endsWith("'"))) {
    apiKey = apiKey.slice(1, -1).trim();
  }

  // Debugging info (safe)
  console.log(`[Gemini SDK] Inicializando cliente (Key index target: ${useKeyIndex}). Longitud de clave: ${apiKey.length}. Finaliza con: ...${apiKey.slice(-4)}`);
  
  try {
    return new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  } catch (err: any) {
    console.error("[Gemini SDK] Error al inicializar GoogleGenAI:", err);
    throw new Error(`Error de inicialización de la IA de Gemini: ${err.message || err}`);
  }
}

// API Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Config Status check
app.get("/api/config-status", (req, res) => {
  let customKey = req.headers['x-gemini-key'] as string;
  let hasKey = false;
  if (customKey) {
    customKey = customKey.trim();
    if ((customKey.startsWith('"') && customKey.endsWith('"')) || (customKey.startsWith("'") && customKey.endsWith("'"))) {
      customKey = customKey.slice(1, -1).trim();
    }
    hasKey = customKey.length > 0;
  }
  if (!hasKey && process.env.GEMINI_API_KEY) {
    const envKey = process.env.GEMINI_API_KEY.trim();
    hasKey = envKey.length > 0 && envKey !== "MY_GEMINI_API_KEY";
  }

  let hasKey2 = false;
  if (process.env.GEMINI_API_KEY_2) {
    const envKey2 = process.env.GEMINI_API_KEY_2.trim();
    hasKey2 = envKey2.length > 0 && envKey2 !== "MY_GEMINI_API_KEY";
  }

  res.json({
    hasGeminiKey: hasKey,
    hasGeminiKey2: hasKey2,
  });
});

// Diagnostic API Key connection test
app.post("/api/test-key", async (req, res) => {
  try {
    const customKey = req.headers['x-gemini-key'] as string;
    const keyIndex = req.body?.keyIndex === 2 ? 2 : 1;
    const ai = getGeminiClient(customKey, keyIndex);

    const modelsToTry = [
      "gemini-3.5-flash",
      "gemini-flash-latest",
      "gemini-3.1-flash-lite"
    ];

    let success = false;
    let modelUsed = "";
    let rawError = "";

    for (const modelName of modelsToTry) {
      try {
        console.log(`[Diagnostic] Probando clave con modelo: ${modelName}`);
        const response = await ai.models.generateContent({
          model: modelName,
          contents: "Di únicamente la palabra 'OK' si recibes este mensaje de prueba de conexión.",
        });
        if (response && response.text) {
          success = true;
          modelUsed = modelName;
          break;
        }
      } catch (err: any) {
        console.warn(`[Diagnostic] Falló prueba con ${modelName}:`, err.message || err);
        rawError = err.message || JSON.stringify(err);
        const errMsg = err.message || "";
        if (
          errMsg.includes("API_KEY_INVALID") || 
          errMsg.includes("API key not valid") || 
          errMsg.includes("quota") || 
          errMsg.includes("quota exceeded") || 
          errMsg.includes("429") || 
          errMsg.includes("RESOURCE_EXHAUSTED") || 
          errMsg.includes("PERMISSION_DENIED") ||
          errMsg.includes("block") ||
          errMsg.includes("permission")
        ) {
          console.log("[Diagnostic] Error crítico de clave o cuota. Deteniendo reintentos.");
          break;
        }
      }
    }

    if (success) {
      return res.json({
        success: true,
        model: modelUsed,
        message: "¡Conexión exitosa con la API de Gemini!"
      });
    } else {
      return res.status(400).json({
        success: false,
        error: rawError || "Error desconocido al intentar conectar con Gemini."
      });
    }
  } catch (error: any) {
    console.error("Error en endpoint /api/test-key:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Error al inicializar el cliente de Gemini o procesar la prueba."
    });
  }
});

// Analysis endpoint using Gemini 3.5 Flash with structured JSON output
app.post("/api/analyze", async (req, res) => {
  try {
    const { transcript } = req.body;
    if (!transcript || typeof transcript !== "string") {
      return res.status(400).json({ error: "El contenido de la conversación es requerido." });
    }

    const customKey = req.headers['x-gemini-key'] as string;
    let ai = getGeminiClient(customKey, 1);

    const systemInstruction = `Eres un Oficial de Cumplimiento Normativo (Compliance Officer) corporativo de alta prioridad.
Tu tarea es analizar detalladamente el texto de una conversación/comunicación entre un miembro del equipo comercial y un tercero (cliente, socio, proveedor, etc.) según la política estricta de CERO TOLERANCIA de la empresa.

--- POLÍTICA DE CERO TOLERANCIA DE LA EMPRESA (KYC) ---
Con efecto inmediato, no se llevarán a cabo discusiones comerciales con ningún cliente actual o potencial, socio, proveedor, inversionista u otra contraparte hasta que se haya completado el KYC básico.
Esta es una regla de cero tolerancia y es obligatoria.
La política es directa:
1. Completar primero los requisitos básicos de KYC.
2. Confirmar con quién estamos tratando.
3. Solo entonces comenzar discusiones comerciales sustanciales, intercambiar información confidencial o negociar términos.
Hasta que se complete el KYC básico, cualquier comunicación debe limitarse únicamente a obtener la información requerida para completar el proceso de KYC. No se debe realizar ninguna participación comercial sustancial antes de ese momento.
Si hay alguna duda, se debe escalar antes de comprometerse comercialmente.
--------------------------------------------------

Tu rol:
1. Extraer los datos de identidad de la contraparte.
2. Evaluar el checklist básico de KYC (si se ha completado en su totalidad).
3. Detectar si se ha discutido cualquier asunto comercial sustancial (precios, tarifas, contratos, descuentos, términos, SLA, propuestas formales, planes de implementación con valor comercial o entrega de servicios/productos).
4. Determinar la COMPATIBILIDAD CON LA POLÍTICA: si se detectó discusión comercial SUSTANCIAL pero el KYC básico NO estaba completado, es una violación de política CRÍTICA (isCompliant: false, breachSeverity: "CRITICAL").
5. Si no hubo discusiones comerciales, o si el KYC básico se completó antes de cualquier oferta, se considera conforme (isCompliant: true, breachSeverity: "NONE").
6. Identificar si se menciona algún identificador fiscal como CIF, NIF, o número de VAT (IVA) de la empresa o cliente. Si se encuentra:
   a. Extráelo tal cual.
   b. Realiza una breve investigación de validación sintáctica y de formato basada en tu conocimiento corporativo, especificando el país correspondiente (por ejemplo, España para CIF/NIF que comienzan con letras, de la Unión Europea para prefijos de países VAT como ES, FR, DE, etc.), la validez potencial del formato y un breve resumen corporativo de esa entidad si coincide con una compañía real.
7. OBLIGATORIO: Todas las justificaciones detalladas, resúmenes, descripciones comerciales, próximos pasos e investigaciones de impuestos (campos: "commercialDetailsFound", "summaryOfCall", "nextStepsRequired" y "taxIdResearch") DEBEN estar redactados íntegramente en INGLÉS para presentación corporativa internacional.`;

    let lastError: any = null;
    let result: any = null;

    // List of candidate models to try in descending order of capability/preference
    const modelsToTry = [
      "gemini-3.5-flash",
      "gemini-flash-latest",
      "gemini-3.1-flash-lite"
    ];

    // Helper function to run analysis with a specific client instance
    const attemptAnalysis = async (clientInstance: any) => {
      let runResult: any = null;
      let runError: any = null;

      for (const modelName of modelsToTry) {
        try {
          console.log(`[Gemini API] Intentando análisis estructurado con modelo: ${modelName}`);
          const response = await clientInstance.models.generateContent({
            model: modelName,
            contents: `Analiza la siguiente conversación/transcripción de llamada:
"${transcript}"`,
            config: {
              systemInstruction,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  clientName: { type: Type.STRING, description: "Full name of the person/contact. 'Unknown' if not mentioned." },
                  companyName: { type: Type.STRING, description: "Name of the counterparty's company. 'Unknown' if not mentioned." },
                  role: { type: Type.STRING, description: "Title or role of the contact. 'Unknown' if not mentioned." },
                  country: { type: Type.STRING, description: "Country or region of operation. 'Unknown' if not mentioned." },
                  contactInfo: { type: Type.STRING, description: "Contact details (email, phone). 'Unknown' if not mentioned." },
                  
                  kycChecklist: {
                    type: Type.OBJECT,
                    properties: {
                      identityEstablished: { type: Type.BOOLEAN, description: "Whether the legal identity of the company/person was obtained and verified." },
                      ownershipVerified: { type: Type.BOOLEAN, description: "Whether Ultimate Beneficial Owners (UBO) have been obtained or verified." },
                      businessActivityDefined: { type: Type.BOOLEAN, description: "Whether the business purpose and activity have been formally defined." },
                      riskAssessmentCompleted: { type: Type.BOOLEAN, description: "Whether a basic risk profiling/PEP check was completed." }
                    },
                    required: ["identityEstablished", "ownershipVerified", "businessActivityDefined", "riskAssessmentCompleted"]
                  },
                  
                  commercialDiscussionsDetected: { type: Type.BOOLEAN, description: "Whether any discussions regarding prices, fees, payment terms, or custom commercial quotes were detected." },
                  commercialDetailsFound: { type: Type.STRING, description: "Specific details of commercial topics discussed. MUST be in English. 'None' if not applicable." },
                  isCompliant: { type: Type.BOOLEAN, description: "Whether the call was compliant with the Corporate Zero Tolerance policy (no commercial talk before KYC completes)." },
                  breachSeverity: { type: Type.STRING, description: "Severity of the breach. Must be 'NONE' (compliant) or 'CRITICAL' (if Zero Tolerance policy was breached)." },
                  
                  summaryOfCall: { type: Type.STRING, description: "Brief audit summary of the conversation (2-3 sentences), focusing on compliance aspects. MUST be in English." },
                  nextStepsRequired: { 
                    type: Type.ARRAY, 
                    items: { type: Type.STRING },
                    description: "List of 3 to 5 immediate actions required to bring the client into full compliance. MUST be in English."
                  },
                  taxId: { type: Type.STRING, description: "Extracted CIF, NIF, or VAT tax registration number if found. Set to 'None' if not present." },
                  taxIdResearch: { type: Type.STRING, description: "Brief format/validity research and country check based on the tax identifier found. MUST be in English. 'No VAT/CIF/NIF tax identifier found in the transcript.' if not applicable." }
                },
                required: [
                  "clientName", "companyName", "role", "country", "contactInfo", 
                  "kycChecklist", "commercialDiscussionsDetected", "commercialDetailsFound", 
                  "isCompliant", "breachSeverity", "summaryOfCall", "nextStepsRequired",
                  "taxId", "taxIdResearch"
                ]
              }
            }
          });

          const responseText = response.text || "{}";
          runResult = JSON.parse(responseText.trim());
          console.log(`[Gemini API] ¡Análisis estructurado exitoso con el modelo ${modelName}!`);
          break; // Break model loop on success
        } catch (err: any) {
          console.warn(`[Gemini API] Fallo estructurado con el modelo ${modelName}:`, err.message || err);
          runError = err;
          
          const errMsg = err.message || "";
          // If the error is related to API key, authorization, or quota, fail-fast this client loop
          if (
            errMsg.includes("API_KEY_INVALID") || 
            errMsg.includes("API key not valid") || 
            errMsg.includes("quota") || 
            errMsg.includes("quota exceeded") || 
            errMsg.includes("429") || 
            errMsg.includes("RESOURCE_EXHAUSTED") || 
            errMsg.includes("PERMISSION_DENIED") ||
            errMsg.includes("block") ||
            errMsg.includes("permission")
          ) {
            console.log("[Gemini API] Error crítico de clave o cuota detectado. Deteniendo cascada de modelos para este cliente.");
            break;
          }
        }
      }
      return { result: runResult, lastError: runError };
    };

    // 1. Run analysis with Key 1 Client
    console.log("[Gemini API] Ejecutando análisis inicial con Cliente Primario (Key 1)...");
    const firstAttempt = await attemptAnalysis(ai);
    result = firstAttempt.result;
    lastError = firstAttempt.lastError;

    // Check if backup key GEMINI_API_KEY_2 is configured and we failed the first attempt
    const hasKey2 = process.env.GEMINI_API_KEY_2 && process.env.GEMINI_API_KEY_2.trim() !== "" && process.env.GEMINI_API_KEY_2 !== "MY_GEMINI_API_KEY";
    
    if (!result && hasKey2) {
      console.warn("[Gemini API] Intento inicial falló o fue denegado. Activando conmutación por error a GEMINI_API_KEY_2...");
      try {
        const ai2 = getGeminiClient(customKey, 2);
        const secondAttempt = await attemptAnalysis(ai2);
        result = secondAttempt.result;
        lastError = secondAttempt.lastError;
        if (result) {
          console.log("[Gemini API] ¡Análisis exitoso de conmutación por error con Cliente Secundario!");
          // Upgrade our active client to ai2 for subsequent unstructured fallbacks if needed
          ai = ai2;
        }
      } catch (err2: any) {
        console.error("[Gemini API] Falló el intento alternativo con GEMINI_API_KEY_2:", err2.message || err2);
      }
    }

    // Helper to format friendly error outputs
    const formatFriendlyError = (err: any) => {
      const errMsg = err?.message || "";
      let friendlyError = "No se pudo procesar la llamada con la IA de Gemini.";

      if (errMsg.includes("API_KEY_INVALID") || errMsg.includes("API key not valid")) {
        friendlyError = "La API Key de Gemini ingresada NO es válida. Por favor, asegúrate de haberla copiado completa, sin comillas ni espacios adicionales.";
      } else if (errMsg.includes("quota") || errMsg.includes("quota exceeded") || errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED")) {
        friendlyError = "Límite de cuota excedido para tu API Key de Gemini. Si es una clave gratuita, tiene un límite estricto de solicitudes por minuto. Por favor, espera un minuto o configura una clave secundaria.";
      } else if (errMsg.includes("block") || errMsg.includes("permission") || errMsg.includes("PERMISSION_DENIED")) {
        friendlyError = "Acceso denegado. Es posible que tu API Key no tenga los permisos necesarios o esté restringida para ciertos modelos o regiones.";
      } else if (errMsg.includes("not found") || errMsg.includes("not_found")) {
        friendlyError = "Modelo no encontrado o no disponible para esta API Key. Asegúrate de usar una clave que tenga acceso a la API de Gemini.";
      } else {
        friendlyError = `Error de la API de Gemini: ${errMsg}`;
      }
      return friendlyError;
    };

    // 2. Unstructured fallback if structured analysis failed for both keys
    if (!result) {
      const lastErrMsg = lastError?.message || "";
      const isKeyOrQuotaError = lastErrMsg && (
        lastErrMsg.includes("API_KEY_INVALID") || 
        lastErrMsg.includes("API key not valid") || 
        lastErrMsg.includes("quota") || 
        lastErrMsg.includes("quota exceeded") || 
        lastErrMsg.includes("429") || 
        lastErrMsg.includes("RESOURCE_EXHAUSTED") || 
        lastErrMsg.includes("PERMISSION_DENIED") ||
        lastErrMsg.includes("block") ||
        lastErrMsg.includes("permission")
      );

      if (isKeyOrQuotaError && !hasKey2) {
        console.log("[Gemini API] Omitiendo fallback debido a error de cuota/clave sin clave secundaria configurada.");
        throw new Error(formatFriendlyError(lastError));
      }

      try {
        console.log("[Gemini API] Intentando análisis de respaldo sin responseSchema estricto usando gemini-3.5-flash...");
        let fallbackResponse;
        try {
          fallbackResponse = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: `Analiza la siguiente conversación/transcripción de llamada:
"${transcript}"

Debes devolver obligatoriamente un objeto JSON plano que cumpla exactamente con esta estructura y con todos los detalles redactados en INGLÉS:
{
  "clientName": "Contact name or 'Unknown'",
  "companyName": "Company name or 'Unknown'",
  "role": "Role or 'Unknown'",
  "country": "Country or 'Unknown'",
  "contactInfo": "Email/phone or 'Unknown'",
  "kycChecklist": {
    "identityEstablished": true/false,
    "ownershipVerified": true/false,
    "businessActivityDefined": true/false,
    "riskAssessmentCompleted": true/false
  },
  "commercialDiscussionsDetected": true/false,
  "commercialDetailsFound": "details of commercial talks in English or 'None'",
  "isCompliant": true/false,
  "breachSeverity": "NONE" or "CRITICAL",
  "summaryOfCall": "brief audit summary in English",
  "nextStepsRequired": ["action 1 in English", "action 2 in English"],
  "taxId": "extracted VAT/CIF/NIF or 'None'",
  "taxIdResearch": "brief research analysis of tax number in English"
}`,
            config: {
              systemInstruction,
              responseMimeType: "application/json"
            }
          });
        } catch (errKey1Flash) {
          console.warn("[Gemini API] Falló fallback con gemini-3.5-flash en Key 1. Probando gemini-flash-latest...");
          fallbackResponse = await ai.models.generateContent({
            model: "gemini-flash-latest",
            contents: `Analiza la siguiente conversación/transcripción de llamada:
"${transcript}"

Debes devolver obligatoriamente un objeto JSON plano que cumpla exactamente con esta estructura y con todos los detalles redactados en INGLÉS:
{
  "clientName": "Contact name or 'Unknown'",
  "companyName": "Company name or 'Unknown'",
  "role": "Role or 'Unknown'",
  "country": "Country or 'Unknown'",
  "contactInfo": "Email/phone or 'Unknown'",
  "kycChecklist": {
    "identityEstablished": true/false,
    "ownershipVerified": true/false,
    "businessActivityDefined": true/false,
    "riskAssessmentCompleted": true/false
  },
  "commercialDiscussionsDetected": true/false,
  "commercialDetailsFound": "details of commercial talks in English or 'None'",
  "isCompliant": true/false,
  "breachSeverity": "NONE" or "CRITICAL",
  "summaryOfCall": "brief audit summary in English",
  "nextStepsRequired": ["action 1 in English", "action 2 in English"],
  "taxId": "extracted VAT/CIF/NIF or 'None'",
  "taxIdResearch": "brief research analysis of tax number in English"
}`,
            config: {
              systemInstruction,
              responseMimeType: "application/json"
            }
          });
        }

        const responseText = fallbackResponse.text || "{}";
        result = JSON.parse(responseText.trim());
        console.log("[Gemini API] ¡Análisis de respaldo exitoso!");
      } catch (fallbackErr: any) {
        // If backup key is available and we haven't tried it yet for fallback
        if (hasKey2 && ai !== getGeminiClient(customKey, 2)) {
          try {
            console.warn("[Gemini API] Fallback primario falló. Reintentando fallback con Cliente Secundario (Key 2)...");
            const ai2 = getGeminiClient(customKey, 2);
            let fallbackResponse2;
            try {
              fallbackResponse2 = await ai2.models.generateContent({
                model: "gemini-3.5-flash",
                contents: `Analiza la siguiente conversación/transcripción de llamada:
"${transcript}"

Debes devolver obligatoriamente un objeto JSON plano que cumpla exactamente con esta estructura y con todos los detalles redactados en INGLÉS:
{
  "clientName": "Contact name or 'Unknown'",
  "companyName": "Company name or 'Unknown'",
  "role": "Role or 'Unknown'",
  "country": "Country or 'Unknown'",
  "contactInfo": "Email/phone or 'Unknown'",
  "kycChecklist": {
    "identityEstablished": true/false,
    "ownershipVerified": true/false,
    "businessActivityDefined": true/false,
    "riskAssessmentCompleted": true/false
  },
  "commercialDiscussionsDetected": true/false,
  "commercialDetailsFound": "details of commercial talks in English or 'None'",
  "isCompliant": true/false,
  "breachSeverity": "NONE" or "CRITICAL",
  "summaryOfCall": "brief audit summary in English",
  "nextStepsRequired": ["action 1 in English", "action 2 in English"],
  "taxId": "extracted VAT/CIF/NIF or 'None'",
  "taxIdResearch": "brief research analysis of tax number in English"
}`,
                config: {
                  systemInstruction,
                  responseMimeType: "application/json"
                }
              });
            } catch (errKey2Flash) {
              console.warn("[Gemini API] Falló fallback con gemini-3.5-flash en Key 2. Probando gemini-flash-latest...");
              fallbackResponse2 = await ai2.models.generateContent({
                model: "gemini-flash-latest",
                contents: `Analiza la siguiente conversación/transcripción de llamada:
"${transcript}"

Debes devolver obligatoriamente un objeto JSON plano que cumpla exactamente con esta estructura y con todos los detalles redactados en INGLÉS:
{
  "clientName": "Contact name or 'Unknown'",
  "companyName": "Company name or 'Unknown'",
  "role": "Role or 'Unknown'",
  "country": "Country or 'Unknown'",
  "contactInfo": "Email/phone or 'Unknown'",
  "kycChecklist": {
    "identityEstablished": true/false,
    "ownershipVerified": true/false,
    "businessActivityDefined": true/false,
    "riskAssessmentCompleted": true/false
  },
  "commercialDiscussionsDetected": true/false,
  "commercialDetailsFound": "details of commercial talks in English or 'None'",
  "isCompliant": true/false,
  "breachSeverity": "NONE" or "CRITICAL",
  "summaryOfCall": "brief audit summary in English",
  "nextStepsRequired": ["action 1 in English", "action 2 in English"],
  "taxId": "extracted VAT/CIF/NIF or 'None'",
  "taxIdResearch": "brief research analysis of tax number in English"
}`,
                config: {
                  systemInstruction,
                  responseMimeType: "application/json"
                }
              });
            }
            const responseText = fallbackResponse2.text || "{}";
            result = JSON.parse(responseText.trim());
            console.log("[Gemini API] ¡Análisis de respaldo exitoso con Cliente Secundario!");
          } catch (fallbackErr2: any) {
            console.error("[Gemini API] Falló el fallback alternativo también:", fallbackErr2);
            throw new Error(formatFriendlyError(lastError || fallbackErr2));
          }
        } else {
          throw new Error(formatFriendlyError(lastError || fallbackErr));
        }
      }
    }

    res.json(result);
  } catch (error: any) {
    console.error("Error en la llamada a Gemini:", error);
    res.status(500).json({ error: error.message || "Error al procesar la transcripción con Inteligencia Artificial." });
  }
});

export default app;

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
let aiInstance: any = null;
let lastUsedKey: string | null = null;

function getGeminiClient(customKey?: string): any {
  let apiKey = "";
  
  // 1. Check custom user key passed in request headers (and ensure it's not a placeholder string)
  if (customKey && typeof customKey === "string") {
    const trimmed = customKey.trim();
    if (trimmed && trimmed !== "null" && trimmed !== "undefined") {
      apiKey = trimmed;
    }
  }
  
  // 2. Fallback to server-side process.env.GEMINI_API_KEY
  if (!apiKey && process.env.GEMINI_API_KEY) {
    const envKey = process.env.GEMINI_API_KEY.trim();
    if (envKey && envKey !== "null" && envKey !== "undefined") {
      apiKey = envKey;
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
  console.log(`[Gemini SDK] Inicializando cliente. Longitud de clave: ${apiKey.length}. Finaliza con: ...${apiKey.slice(-4)}`);
  
  try {
    if (!aiInstance || lastUsedKey !== apiKey) {
      aiInstance = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
      lastUsedKey = apiKey;
    }
    return aiInstance;
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
    hasKey = envKey.length > 0;
  }

  res.json({
    hasGeminiKey: hasKey,
  });
});

// Diagnostic API Key connection test
app.post("/api/test-key", async (req, res) => {
  try {
    const customKey = req.headers['x-gemini-key'] as string;
    const ai = getGeminiClient(customKey);

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
    const ai = getGeminiClient(customKey);

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

    for (const modelName of modelsToTry) {
      try {
        console.log(`[Gemini API] Intentando análisis con modelo: ${modelName}`);
        const response = await ai.models.generateContent({
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
                
                commercialDiscussionsDetected: { type: Type.BOOLEAN, description: "Whether any discussions regarding prices, fees, payment terms, or custom коммерческий quotes were detected." },
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
        result = JSON.parse(responseText.trim());
        console.log(`[Gemini API] ¡Análisis exitoso con el modelo ${modelName}!`);
        break; // Break the loop if we have a successful result
      } catch (err: any) {
        console.warn(`[Gemini API] Fallo con el modelo ${modelName}:`, err.message || err);
        lastError = err;
        
        const errMsg = err.message || "";
        // If the error is related to API key, authorization, or quota, fail fast to avoid 504 timeouts.
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
          console.log("[Gemini API] Error crítico de clave o cuota. Deteniendo reintentos y lanzando error inmediato.");
          break;
        }
        // Continúa al siguiente modelo de la lista
      }
    }

    // Si todos los intentos estructurados fallaron, probamos un fallback de texto libre a JSON
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

      if (isKeyOrQuotaError) {
        console.log("[Gemini API] Bypassing fallback due to critical API key/quota error.");
        let friendlyError = "La API Key de Gemini ingresada NO es válida. Por favor, asegúrate de haberla configurado correctamente.";
        if (lastErrMsg.includes("quota") || lastErrMsg.includes("quota exceeded") || lastErrMsg.includes("429") || lastErrMsg.includes("RESOURCE_EXHAUSTED")) {
          friendlyError = "Límite de cuota excedido para esta API Key de Gemini. Si es una clave gratuita, tiene un límite estricto de solicitudes por minuto. Por favor, espera un minuto o prueba con otra clave.";
        } else if (lastErrMsg.includes("block") || lastErrMsg.includes("permission") || lastErrMsg.includes("PERMISSION_DENIED")) {
          friendlyError = "Acceso denegado. Es posible que tu API Key no tenga los permisos necesarios o esté restringida para ciertos modelos o regiones.";
        } else {
          friendlyError = `Error de la API de Gemini: ${lastErrMsg}`;
        }
        throw new Error(friendlyError);
      }

      try {
        console.log("[Gemini API] Intentando análisis de respaldo sin responseSchema estricto usando gemini-flash-latest...");
        const fallbackResponse = await ai.models.generateContent({
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

        const responseText = fallbackResponse.text || "{}";
        result = JSON.parse(responseText.trim());
        console.log("[Gemini API] ¡Análisis exitoso de respaldo (sin responseSchema estricto)!");
      } catch (fallbackErr: any) {
        console.error("[Gemini API] Fallo definitivo en el análisis:", fallbackErr);
        
        // Formatear el error definitivo con diagnósticos útiles
        const errMsg = lastError?.message || fallbackErr?.message || "";
        let friendlyError = "No se pudo procesar la llamada con la IA de Gemini.";

        if (errMsg.includes("API_KEY_INVALID") || errMsg.includes("API key not valid")) {
          friendlyError = "La API Key de Gemini ingresada NO es válida. Por favor, asegúrate de haberla copiado completa, sin caracteres adicionales, comillas ni espacios adicionales.";
        } else if (errMsg.includes("quota") || errMsg.includes("quota exceeded") || errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED")) {
          friendlyError = "Límite de cuota excedido para esta API Key de Gemini. Si es una clave gratuita, tiene un límite estricto de solicitudes por minuto. Por favor, espera un minuto o prueba con otra clave.";
        } else if (errMsg.includes("block") || errMsg.includes("permission") || errMsg.includes("PERMISSION_DENIED")) {
          friendlyError = "Acceso denegado. Es posible que tu API Key no tenga los permisos necesarios o esté restringida para ciertos modelos o regiones.";
        } else if (errMsg.includes("not found") || errMsg.includes("not_found")) {
          friendlyError = "Modelo no encontrado o no disponible para esta API Key. Asegúrate de usar una clave que tenga acceso a la API de Gemini.";
        } else {
          friendlyError = `Error de la API de Gemini: ${errMsg}`;
        }

        throw new Error(friendlyError);
      }
    }

    res.json(result);
  } catch (error: any) {
    console.error("Error en la llamada a Gemini:", error);
    res.status(500).json({ error: error.message || "Error al procesar la transcripción con Inteligencia Artificial." });
  }
});

export default app;

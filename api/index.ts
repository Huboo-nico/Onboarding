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
function getGeminiClient(customKey1?: string, useKeyIndex: 1 | 2 = 1, customKey2?: string): any {
  let apiKey = "";
  
  if (useKeyIndex === 2) {
    // 1. Try custom key 2 first
    if (customKey2 && typeof customKey2 === "string") {
      const trimmed = customKey2.trim();
      if (trimmed && trimmed !== "null" && trimmed !== "undefined") {
        apiKey = trimmed;
      }
    }
    // 2. Fallback to server env key 2
    if (!apiKey) {
      const envKey2 = process.env.GEMINI_API_KEY_2 ? process.env.GEMINI_API_KEY_2.trim() : "";
      if (envKey2 && envKey2 !== "null" && envKey2 !== "undefined" && envKey2 !== "MY_GEMINI_API_KEY") {
        apiKey = envKey2;
      }
    }
    // 3. Last-resort fallback to custom key 1
    if (!apiKey && customKey1 && typeof customKey1 === "string") {
      const trimmed = customKey1.trim();
      if (trimmed && trimmed !== "null" && trimmed !== "undefined") {
        apiKey = trimmed;
      }
    }
  } else {
    // 1. Try custom key 1 first
    if (customKey1 && typeof customKey1 === "string") {
      const trimmed = customKey1.trim();
      if (trimmed && trimmed !== "null" && trimmed !== "undefined") {
        apiKey = trimmed;
      }
    }
    // 2. Fallback to server env key 1
    if (!apiKey) {
      const envKey1 = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : "";
      if (envKey1 && envKey1 !== "null" && envKey1 !== "undefined" && envKey1 !== "MY_GEMINI_API_KEY") {
        apiKey = envKey1;
      }
    }
  }

  // If still empty, check any available env keys as generic fallback
  if (!apiKey) {
    const envKey1 = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : "";
    const envKey2 = process.env.GEMINI_API_KEY_2 ? process.env.GEMINI_API_KEY_2.trim() : "";
    if (envKey1 && envKey1 !== "null" && envKey1 !== "undefined" && envKey1 !== "MY_GEMINI_API_KEY") {
      apiKey = envKey1;
    } else if (envKey2 && envKey2 !== "null" && envKey2 !== "undefined" && envKey2 !== "MY_GEMINI_API_KEY") {
      apiKey = envKey2;
    }
  }

  if (!apiKey) {
    throw new Error(
      "Missing Gemini API Key. Please make sure to add GEMINI_API_KEY in Vercel (Settings > Environment Variables) or enter your key manually in the app control panel."
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
    console.error("[Gemini SDK] Error initializing GoogleGenAI:", err);
    throw new Error(`Gemini AI initialization error: ${err.message || err}`);
  }
}

// API Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Config Status check
app.get("/api/config-status", (req, res) => {
  let customKey = req.headers['x-gemini-key'] as string;
  let customKey2 = req.headers['x-gemini-key-2'] as string;

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
  if (customKey2) {
    customKey2 = customKey2.trim();
    if ((customKey2.startsWith('"') && customKey2.endsWith('"')) || (customKey2.startsWith("'") && customKey2.endsWith("'"))) {
      customKey2 = customKey2.slice(1, -1).trim();
    }
    hasKey2 = customKey2.length > 0;
  }
  if (!hasKey2 && process.env.GEMINI_API_KEY_2) {
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
    const customKey2 = req.headers['x-gemini-key-2'] as string;
    const keyIndex = req.body?.keyIndex === 2 ? 2 : 1;
    const ai = getGeminiClient(customKey, keyIndex, customKey2);

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
        message: "Successful connection with Gemini API!"
      });
    } else {
      return res.status(400).json({
        success: false,
        error: rawError || "Unknown error trying to connect to Gemini."
      });
    }
  } catch (error: any) {
    console.error("Error in endpoint /api/test-key:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Error initializing Gemini client or processing test."
    });
  }
});

// Analysis endpoint using Gemini 3.5 Flash with structured JSON output
app.post("/api/analyze", async (req, res) => {
  try {
    const { transcript } = req.body;
    if (!transcript || typeof transcript !== "string") {
      return res.status(400).json({ error: "Conversation transcript is required." });
    }

    const customKey = req.headers['x-gemini-key'] as string;
    const customKey2 = req.headers['x-gemini-key-2'] as string;
    let ai = getGeminiClient(customKey, 1, customKey2);

    const systemInstruction = `You are a high-level Corporate Compliance Officer (Compliance Auditor) of the highest authority.
Your task is to analyze thoroughly the transcript of a conversation or call between a sales representative and a third party (client, partner, supplier, investor, etc.) according to the company's strict ZERO-TOLERANCE KYC policy.

--- CORPORATE ZERO-TOLERANCE KYC POLICY ---
With immediate effect, no commercial discussions of any kind may take place with any current or prospective customer, partner, supplier, investor, or other counterparty until basic Know Your Customer (KYC) has been fully completed.
This is a zero-tolerance rule and is strictly mandatory.
The policy is simple:
1. Complete the basic KYC requirements first.
2. Confirm who we are dealing with.
3. Only then begin substantial commercial discussions, exchange confidential information, or negotiate terms.
Until basic KYC is completed, any communication must be strictly limited to obtaining the information required to complete the KYC process. No substantial commercial engagement of any kind may occur before that point.
If there is any doubt, the representative must escalate before engaging commercially.
--------------------------------------------

Your role:
1. Extract the counterparty's identity details (name, company name, role, country, contact info).
2. Assess the basic KYC checklist (whether all requirements were met and completed *before* any commercial discussions took place).
3. Detect if any substantive commercial topics were discussed (pricing, fees, rates, contracts, discounts, terms, SLAs, formal proposals, implementation plans with commercial value, or delivery of services/products).
4. Determine POLICY COMPLIANCE: If you detect SUBSTANTIVE commercial discussions but basic KYC was NOT completed or was still pending, this is a CRITICAL policy breach (isCompliant: false, breachSeverity: "CRITICAL"). If no commercial discussions occurred or if basic KYC was fully completed before any commercial talk, the call is compliant (isCompliant: true, breachSeverity: "NONE").
5. Identify any tax registration numbers mentioned in the conversation, such as a Spanish CIF/NIF, or European VAT registration number.
6. For the "taxIdResearch" field: If a Tax ID is found, perform a brief format and syntax validation analysis based on corporate standards. For example:
   - Spanish CIF (Certificado de Identificación Fiscal): It always starts with an organization type letter (A for S.A., B for S.L., C, D, E, F, G, H, J, N, P, Q, R, S, U, V, W), followed by 7 numeric digits and a control character (either a letter or digit). Validate whether the prefix letter aligns with Spanish corporate structures (e.g. B for Sociedad de Responsabilidad Limitada, A for Sociedad Anónima) and whether the format matches.
   - Spanish NIF/DNI: It comprises 8 digits followed by a single control letter (for individuals) or starts with a letter (for foreigners/companies) followed by 7 digits and a control letter/digit.
   - EU VAT ID: Verify if the country prefix matches EU ISO standards (e.g., ES for Spain, FR for France, DE for Germany, etc.) and comment on the expected format structure.
   - Summarize the potential validity of this identifier format, indicate the country of origin, and include brief corporate/registry research details if applicable.
7. MANDATORY REQUIREMENT: All audit findings, summaries, commercial descriptions, next steps, and tax research (fields: "commercialDetailsFound", "summaryOfCall", "nextStepsRequired", and "taxIdResearch") MUST be fully written in professional, grammatically perfect English for international corporate reporting, without exceptions.
8. HUBOO ONBOARDING QUESTIONNAIRE EXTRACTION: You must extract and compile answers to the 20 questions for the Huboo Onboarding Questionnaire in the "questionnaire" field.
   - TRANSLATE TO ENGLISH: Extract and write the answers to all 20 questions in ENGLISH. If any terms or details are mentioned in Spanish, translate them clearly into professional English to maintain a fully English-language reporting output (e.g., "Joyas" -> "Jewelry", "España" -> "Spain").
   - FLEXIBLE INTELLIGENT MATCHING: Be highly intelligent and proactive when matching answers. If a piece of information is mentioned anywhere in the conversation, or can be directly and safely inferred, map it to the corresponding question. Do not return '(no me lo ha contestado)' if there are context clues, names, details, or partial answers available in the transcript.
     * q1_name: Name of the primary contact person / spokesperson.
     * q2_source: Channel of origin (how they reached us, recommendation, website, email, etc.).
     * q3_country: Company headquarters or client country (e.g., Spain).
     * q4_address_phone: Address and phone/contact info if mentioned.
     * q5_company_name: Name of company (legal/trading name).
     * q6_activity: Business activity, product types (e.g., jewelry, high-value jewelry, premium unboxing, security).
     * q7_statutory_db: Any tax ID (CIF/NIF/VAT) or Companies House registration. Include complete validation research if present (such as CIF letter prefix meaning, Seville province code, check digit validation).
     * q8_formation_date: Date the company was established or incorporated.
     * q9_years_trading: Number of years/months they have been operating/trading.
     * q10_shipping: Shipping volumes, target markets (Spain, EU, international), and preferred carriers.
     * q11_channel: Selling channels used (Shopify, WooCommerce, D2C, Amazon, etc.).
     * q12_goods_in: Origin of the stock / inventory supplier location.
     * q13_stock_shipping: Inventory profile, number of SKUs, storage requirements, premium unboxing needs.
     * q14_average_rrp: Recommended Retail Price (RRP/PVP) of products, average order value, average weight.
     * q15_start_date: Target launch date or go-live timeline.
     * q16_kyc: Mentions of identification documents (DNI, passport, deeds/incorporation documents, beneficial owners verification).
     * q17_capital: Funding source, capital position, self-funded, investors.
     * q18_europe: European expansion plans, European VAT numbers, EU operations.
     * q19_pricing: Pricing discussion details, rate cards, custom quotes, storage costs mentioned.
     * q20_other: Other notes, special security requirements (like camera recording during premium unboxing), custom requests.
   - CRITICAL CONSTRAINT: If there is absolutely no mention or clue about a question's topic in the transcript, you MUST literally return '(no me lo ha contestado)' for that question. Do NOT make up any details. The text MUST be exactly '(no me lo ha contestado)'.`;

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
          console.log(`[Gemini API] Attempting structured analysis with model: ${modelName}`);
          const response = await clientInstance.models.generateContent({
            model: modelName,
            contents: `Analyze the following call transcript:
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
                  taxIdResearch: { type: Type.STRING, description: "Brief format/validity research and country check based on the tax identifier found. MUST be in English. 'No VAT/CIF/NIF tax identifier found in the transcript.' if not applicable." },
                  
                  questionnaire: {
                    type: Type.OBJECT,
                    properties: {
                      q1_name: { type: Type.STRING, description: "1. Name (primary contact / principal). Extract or '(no me lo ha contestado)'." },
                      q2_source: { type: Type.STRING, description: "2. Source (how they came to us; referrer). Extract or '(no me lo ha contestado)'." },
                      q3_country: { type: Type.STRING, description: "3. Country / residence. Extract or '(no me lo ha contestado)'." },
                      q4_address_phone: { type: Type.STRING, description: "4. Address and telephone number. Extract or '(no me lo ha contestado)'." },
                      q5_company_name: { type: Type.STRING, description: "5. Name of company (legal and trading name). Extract or '(no me lo ha contestado)'." },
                      q6_activity: { type: Type.STRING, description: "6. Activity (what the business does; product categories). Extract or '(no me lo ha contestado)'." },
                      q7_statutory_db: { type: Type.STRING, description: "7. Companies House / statutory databases (registration number; checks completed). If a Spanish CIF/NIF/VAT is found, include format/validity research and details. Extract or '(no me lo ha contestado)'." },
                      q8_formation_date: { type: Type.STRING, description: "8. Date of formation. Extract or '(no me lo ha contestado)'." },
                      q9_years_trading: { type: Type.STRING, description: "9. Years trading. Extract or '(no me lo ha contestado)'." },
                      q10_shipping: { type: Type.STRING, description: "10. Shipping (volumes; markets; carriers). Extract or '(no me lo ha contestado)'." },
                      q11_channel: { type: Type.STRING, description: "11. Channel (D2C / B2B / marketplace). Extract or '(no me lo ha contestado)'." },
                      q12_goods_in: { type: Type.STRING, description: "12. Goods in / source (where stock originates; inbound). Extract or '(no me lo ha contestado)'." },
                      q13_stock_shipping: { type: Type.STRING, description: "13. Stock & shipping (SKUs; storage; fulfilment profile). Extract or '(no me lo ha contestado)'." },
                      q14_average_rrp: { type: Type.STRING, description: "14. Average RRP (and average order value / weight). Extract or '(no me lo ha contestado)'." },
                      q15_start_date: { type: Type.STRING, description: "15. Start date (target go-live). Extract or '(no me lo ha contestado)'." },
                      q16_kyc: { type: Type.STRING, description: "16. KYC (ID and address for UBOs and directors; certified docs; screening). Extract or '(no me lo ha contestado)'." },
                      q17_capital: { type: Type.STRING, description: "17. Capital (funding position; investors; source of funds). Extract or '(no me lo ha contestado)'." },
                      q18_europe: { type: Type.STRING, description: "18. Europe (EU operations; VAT registrations; markets). Extract or '(no me lo ha contestado)'." },
                      q19_pricing: { type: Type.STRING, description: "19. Pricing (agreed rate card; B2B charges). Extract or '(no me lo ha contestado)'." },
                      q20_other: { type: Type.STRING, description: "20. Other (notes; special requirements; risks). Extract or '(no me lo ha contestado)'." }
                    },
                    required: [
                      "q1_name", "q2_source", "q3_country", "q4_address_phone", "q5_company_name",
                      "q6_activity", "q7_statutory_db", "q8_formation_date", "q9_years_trading", "q10_shipping",
                      "q11_channel", "q12_goods_in", "q13_stock_shipping", "q14_average_rrp", "q15_start_date",
                      "q16_kyc", "q17_capital", "q18_europe", "q19_pricing", "q20_other"
                    ]
                  }
                },
                required: [
                  "clientName", "companyName", "role", "country", "contactInfo", 
                  "kycChecklist", "commercialDiscussionsDetected", "commercialDetailsFound", 
                  "isCompliant", "breachSeverity", "summaryOfCall", "nextStepsRequired",
                  "taxId", "taxIdResearch", "questionnaire"
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
    const hasKey2 = (customKey2 && customKey2.trim().length > 0) || (process.env.GEMINI_API_KEY_2 && process.env.GEMINI_API_KEY_2.trim() !== "" && process.env.GEMINI_API_KEY_2 !== "MY_GEMINI_API_KEY");
    
    if (!result && hasKey2) {
      console.warn("[Gemini API] Intento inicial falló o fue denegado. Activando conmutación por error a GEMINI_API_KEY_2...");
      try {
        const ai2 = getGeminiClient(customKey, 2, customKey2);
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
      let friendlyError = "Could not process call with Gemini AI.";

      if (errMsg.includes("API_KEY_INVALID") || errMsg.includes("API key not valid")) {
        friendlyError = "The provided Gemini API Key is NOT valid. Please ensure it has been copied fully, with no outer quotes or spaces.";
      } else if (errMsg.includes("quota") || errMsg.includes("quota exceeded") || errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED")) {
        friendlyError = "Quota limit exceeded for your Gemini API Key. Free tier keys have strict limits per minute. Please wait a minute or set up a backup key.";
      } else if (errMsg.includes("block") || errMsg.includes("permission") || errMsg.includes("PERMISSION_DENIED")) {
        friendlyError = "Access denied. Your API Key may lack permissions or be restricted for certain models or regions.";
      } else if (errMsg.includes("not found") || errMsg.includes("not_found")) {
        friendlyError = "Model not found or not available for this API Key. Ensure you are using a key that has access to the Gemini API.";
      } else {
        friendlyError = `Gemini API Error: ${errMsg}`;
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
        console.log("[Gemini API] Attempting fallback analysis without strict responseSchema using gemini-3.5-flash...");
        let fallbackResponse;
        try {
          fallbackResponse = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: `Analyze the following call transcript:
"${transcript}"

You must return a flat JSON object adhering exactly to this structure (with all fields, including the 20 questionnaire fields, fully extracted and translated into English for international reporting):
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
  "taxIdResearch": "brief research analysis of tax number in English",
  "questionnaire": {
    "q1_name": "Answer or '(no me lo ha contestado)'",
    "q2_source": "Answer or '(no me lo ha contestado)'",
    "q3_country": "Answer or '(no me lo ha contestado)'",
    "q4_address_phone": "Answer or '(no me lo ha contestado)'",
    "q5_company_name": "Answer or '(no me lo ha contestado)'",
    "q6_activity": "Answer or '(no me lo ha contestado)'",
    "q7_statutory_db": "Answer or '(no me lo ha contestado)'",
    "q8_formation_date": "Answer or '(no me lo ha contestado)'",
    "q9_years_trading": "Answer or '(no me lo ha contestado)'",
    "q10_shipping": "Answer or '(no me lo ha contestado)'",
    "q11_channel": "Answer or '(no me lo ha contestado)'",
    "q12_goods_in": "Answer or '(no me lo ha contestado)'",
    "q13_stock_shipping": "Answer or '(no me lo ha contestado)'",
    "q14_average_rrp": "Answer or '(no me lo ha contestado)'",
    "q15_start_date": "Answer or '(no me lo ha contestado)'",
    "q16_kyc": "Answer or '(no me lo ha contestado)'",
    "q17_capital": "Answer or '(no me lo ha contestado)'",
    "q18_europe": "Answer or '(no me lo ha contestado)'",
    "q19_pricing": "Answer or '(no me lo ha contestado)'",
    "q20_other": "Answer or '(no me lo ha contestado)'"
  }
}`,
            config: {
              systemInstruction,
              responseMimeType: "application/json"
            }
          });
        } catch (errKey1Flash) {
          console.warn("[Gemini API] Fallback with gemini-3.5-flash failed on Key 1. Trying gemini-flash-latest...");
          fallbackResponse = await ai.models.generateContent({
            model: "gemini-flash-latest",
            contents: `Analyze the following call transcript:
"${transcript}"

You must return a flat JSON object adhering exactly to this structure (with all fields, including the 20 questionnaire fields, fully extracted and translated into English for international reporting):
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
  "taxIdResearch": "brief research analysis of tax number in English",
  "questionnaire": {
    "q1_name": "Answer or '(no me lo ha contestado)'",
    "q2_source": "Answer or '(no me lo ha contestado)'",
    "q3_country": "Answer or '(no me lo ha contestado)'",
    "q4_address_phone": "Answer or '(no me lo ha contestado)'",
    "q5_company_name": "Answer or '(no me lo ha contestado)'",
    "q6_activity": "Answer or '(no me lo ha contestado)'",
    "q7_statutory_db": "Answer or '(no me lo ha contestado)'",
    "q8_formation_date": "Answer or '(no me lo ha contestado)'",
    "q9_years_trading": "Answer or '(no me lo ha contestado)'",
    "q10_shipping": "Answer or '(no me lo ha contestado)'",
    "q11_channel": "Answer or '(no me lo ha contestado)'",
    "q12_goods_in": "Answer or '(no me lo ha contestado)'",
    "q13_stock_shipping": "Answer or '(no me lo ha contestado)'",
    "q14_average_rrp": "Answer or '(no me lo ha contestado)'",
    "q15_start_date": "Answer or '(no me lo ha contestado)'",
    "q16_kyc": "Answer or '(no me lo ha contestado)'",
    "q17_capital": "Answer or '(no me lo ha contestado)'",
    "q18_europe": "Answer or '(no me lo ha contestado)'",
    "q19_pricing": "Answer or '(no me lo ha contestado)'",
    "q20_other": "Answer or '(no me lo ha contestado)'"
  }
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
        if (hasKey2 && ai !== getGeminiClient(customKey, 2, customKey2)) {
          try {
            console.warn("[Gemini API] Fallback primario falló. Reintentando fallback con Cliente Secundario (Key 2)...");
            const ai2 = getGeminiClient(customKey, 2, customKey2);
            let fallbackResponse2;
            try {
              fallbackResponse2 = await ai2.models.generateContent({
                model: "gemini-3.5-flash",
                contents: `Analyze the following call transcript:
"${transcript}"

You must return a flat JSON object adhering exactly to this structure (with all fields, including the 20 questionnaire fields, fully extracted and translated into English for international reporting):
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
  "taxIdResearch": "brief research analysis of tax number in English",
  "questionnaire": {
    "q1_name": "Answer or '(no me lo ha contestado)'",
    "q2_source": "Answer or '(no me lo ha contestado)'",
    "q3_country": "Answer or '(no me lo ha contestado)'",
    "q4_address_phone": "Answer or '(no me lo ha contestado)'",
    "q5_company_name": "Answer or '(no me lo ha contestado)'",
    "q6_activity": "Answer or '(no me lo ha contestado)'",
    "q7_statutory_db": "Answer or '(no me lo ha contestado)'",
    "q8_formation_date": "Answer or '(no me lo ha contestado)'",
    "q9_years_trading": "Answer or '(no me lo ha contestado)'",
    "q10_shipping": "Answer or '(no me lo ha contestado)'",
    "q11_channel": "Answer or '(no me lo ha contestado)'",
    "q12_goods_in": "Answer or '(no me lo ha contestado)'",
    "q13_stock_shipping": "Answer or '(no me lo ha contestado)'",
    "q14_average_rrp": "Answer or '(no me lo ha contestado)'",
    "q15_start_date": "Answer or '(no me lo ha contestado)'",
    "q16_kyc": "Answer or '(no me lo ha contestado)'",
    "q17_capital": "Answer or '(no me lo ha contestado)'",
    "q18_europe": "Answer or '(no me lo ha contestado)'",
    "q19_pricing": "Answer or '(no me lo ha contestado)'",
    "q20_other": "Answer or '(no me lo ha contestado)'"
  }
}`,
                config: {
                  systemInstruction,
                  responseMimeType: "application/json"
                }
              });
            } catch (errKey2Flash) {
              console.warn("[Gemini API] Fallback with gemini-3.5-flash failed on Key 2. Trying gemini-flash-latest...");
              fallbackResponse2 = await ai2.models.generateContent({
                model: "gemini-flash-latest",
                contents: `Analyze the following call transcript:
"${transcript}"

You must return a flat JSON object adhering exactly to this structure (with all fields, including the 20 questionnaire fields, fully extracted and translated into English for international reporting):
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
  "taxIdResearch": "brief research analysis of tax number in English",
  "questionnaire": {
    "q1_name": "Answer or '(no me lo ha contestado)'",
    "q2_source": "Answer or '(no me lo ha contestado)'",
    "q3_country": "Answer or '(no me lo ha contestado)'",
    "q4_address_phone": "Answer or '(no me lo ha contestado)'",
    "q5_company_name": "Answer or '(no me lo ha contestado)'",
    "q6_activity": "Answer or '(no me lo ha contestado)'",
    "q7_statutory_db": "Answer or '(no me lo ha contestado)'",
    "q8_formation_date": "Answer or '(no me lo ha contestado)'",
    "q9_years_trading": "Answer or '(no me lo ha contestado)'",
    "q10_shipping": "Answer or '(no me lo ha contestado)'",
    "q11_channel": "Answer or '(no me lo ha contestado)'",
    "q12_goods_in": "Answer or '(no me lo ha contestado)'",
    "q13_stock_shipping": "Answer or '(no me lo ha contestado)'",
    "q14_average_rrp": "Answer or '(no me lo ha contestado)'",
    "q15_start_date": "Answer or '(no me lo ha contestado)'",
    "q16_kyc": "Answer or '(no me lo ha contestado)'",
    "q17_capital": "Answer or '(no me lo ha contestado)'",
    "q18_europe": "Answer or '(no me lo ha contestado)'",
    "q19_pricing": "Answer or '(no me lo ha contestado)'",
    "q20_other": "Answer or '(no me lo ha contestado)'"
  }
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
    console.error("Error in call to Gemini:", error);
    res.status(500).json({ error: error.message || "Error processing call transcript with Artificial Intelligence." });
  }
});

export default app;

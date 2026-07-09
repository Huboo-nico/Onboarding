import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON parsing middleware
  app.use(express.json());

  // Initialize Gemini SDK with telemetry header
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // API Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Analysis endpoint using Gemini 3.5 Flash with structured JSON output
  app.post("/api/analyze", async (req, res) => {
    try {
      const { transcript } = req.body;
      if (!transcript || typeof transcript !== "string") {
        return res.status(400).json({ error: "El contenido de la conversación es requerido." });
      }

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
6. Redactar un resumen y los próximos pasos detallados para regularizar la situación del cliente.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Analiza la siguiente conversación/transcripción de llamada:
"${transcript}"`,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              clientName: { type: Type.STRING, description: "Nombre completo de la persona/contacto. 'Unknown' si no se menciona." },
              companyName: { type: Type.STRING, description: "Nombre de la empresa de la contraparte. 'Unknown' si no se menciona." },
              role: { type: Type.STRING, description: "Cargo o rol del contacto. 'Unknown' si no se menciona." },
              country: { type: Type.STRING, description: "País o región de operación. 'Unknown' si no se menciona." },
              contactInfo: { type: Type.STRING, description: "Detalles de contacto (email, teléfono). 'Unknown' si no se menciona." },
              
              kycChecklist: {
                type: Type.OBJECT,
                properties: {
                  identityEstablished: { type: Type.BOOLEAN, description: "Indica si se obtuvo y verificó la identidad legal de la empresa o persona (ej. registro legal, ID)." },
                  ownershipVerified: { type: Type.BOOLEAN, description: "Indica si se obtuvieron o verificaron los Beneficiarios Finales (UBO - Ultimate Beneficial Owners)." },
                  businessActivityDefined: { type: Type.BOOLEAN, description: "Indica si la actividad de negocio y el propósito de la relación quedaron establecidos formalmente." },
                  riskAssessmentCompleted: { type: Type.BOOLEAN, description: "Indica si se pudo hacer un análisis básico de riesgo (ej. país de alto riesgo o PEPs)." }
                },
                required: ["identityEstablished", "ownershipVerified", "businessActivityDefined", "riskAssessmentCompleted"]
              },
              
              commercialDiscussionsDetected: { type: Type.BOOLEAN, description: "Indica si se detectó alguna conversación sobre precios, tarifas, contratos, condiciones de pago, cotizaciones, o detalles comerciales confidenciales." },
              commercialDetailsFound: { type: Type.STRING, description: "Detalles específicos de los temas comerciales abordados en la conversación. 'Ninguno' si no aplica." },
              isCompliant: { type: Type.BOOLEAN, description: "Indica si la conversación cumple con la regla de cero tolerancia (es decir, NO se hablaron de temas comerciales a menos que el KYC esté completamente verificado)." },
              breachSeverity: { type: Type.STRING, description: "Gravedad de la brecha. Debe ser 'NONE' (conforme) o 'CRITICAL' (si se violó la política de cero tolerancia)." },
              
              summaryOfCall: { type: Type.STRING, description: "Breve resumen de la conversación de 2 o 3 líneas enfocándose en el cumplimiento." },
              nextStepsRequired: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING },
                description: "Lista de 3 a 5 acciones inmediatas requeridas para regularizar al cliente y seguir el protocolo de cumplimiento."
              }
            },
            required: [
              "clientName", "companyName", "role", "country", "contactInfo", 
              "kycChecklist", "commercialDiscussionsDetected", "commercialDetailsFound", 
              "isCompliant", "breachSeverity", "summaryOfCall", "nextStepsRequired"
            ]
          }
        }
      });

      const responseText = response.text || "{}";
      const result = JSON.parse(responseText.trim());
      res.json(result);
    } catch (error: any) {
      console.error("Error en la llamada a Gemini:", error);
      res.status(500).json({ error: error.message || "Error al procesar la transcripción con Inteligencia Artificial." });
    }
  });

  // Vite development server or production build static delivery
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

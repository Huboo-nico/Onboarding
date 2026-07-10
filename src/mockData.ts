export interface TranscriptTemplate {
  title: string;
  description: string;
  expectedStatus: "COMPLIANT" | "BREACH";
  text: string;
}

export const mockTranscripts: TranscriptTemplate[] = [
  {
    title: "Caso 1: Violación Crítica de Política (Negociación Comercial Sin KYC)",
    description: "El comercial detalla tarifas mensuales, descuentos del 15% y acuerda términos de SLA con un cliente nuevo sin haber verificado su identidad ni sus beneficiarios finales (UBO).",
    expectedStatus: "BREACH",
    text: `Ejecutivo Comercial: ¡Hola! Qué tal, un gusto hablar contigo hoy. Vi tu solicitud sobre nuestro software de pasarela de pagos.
Cliente (Prospecto): Hola, sí, soy Carlos de una empresa fintech en desarrollo. Queríamos conocer sus tarifas y si nos pueden hacer un descuento por volumen.
Ejecutivo Comercial: Claro que sí, Carlos. Mira, normalmente nuestra tarifa es del 2.5% por transacción más $0.10 fijos. Pero como están empezando y proyectan buen volumen, les puedo dejar una tarifa preferencial del 1.9% más $0.05 fijos durante los primeros 6 meses.
Cliente (Prospecto): Excelente. ¿Y qué nivel de soporte nos darían? ¿Tienen un acuerdo de nivel de servicio (SLA) establecido?
Ejecutivo Comercial: Sí, garantizamos un 99.9% de disponibilidad en nuestro SLA. Si hay alguna caída mayor a 15 minutos, les reembolsamos el 10% de la tarifa mensual de soporte. Te puedo enviar el borrador del contrato comercial hoy mismo para que lo vayas revisando con tus abogados.
Cliente (Prospecto): Perfecto, envíamelo por favor. Así cerramos esto rápido.
Ejecutivo Comercial: Buenísimo, Carlos. Por cierto, antes de la firma final de contratos te pediré algunos papeles básicos de tu empresa, pero mientras tanto te voy mandando la cotización formal y el contrato comercial para adelantar. ¡Un saludo!`
  },
  {
    title: "Caso 2: Cumplimiento Estricto del Protocolo (Procedimiento Conforme)",
    description: "El comercial se mantiene firme ante las preguntas de precios del cliente, limitando educadamente la conversación a recopilar los datos de KYC básicos requeridos por la política de la empresa.",
    expectedStatus: "COMPLIANT",
    text: `Ejecutivo Comercial: Hola, buenas tardes. Gracias por contactar con nuestro equipo de cumplimiento y soporte. Entiendo que estás interesado en nuestros servicios corporativos.
Cliente (Prospecto): Hola, gracias por atenderme. Sí, queremos abrir una cuenta para realizar transferencias internacionales de nuestra empresa. ¿Qué tarifas tienen para envíos a Asia y Europa? Nos urge mucho cotizar.
Ejecutivo Comercial: Entiendo perfectamente la urgencia, y con mucho gusto te ayudaremos con todo el detalle comercial. Sin embargo, por política regulatoria obligatoria de nuestra empresa, antes de discutir cualquier tarifa, términos comerciales o enviar propuestas, necesitamos completar un proceso básico de KYC (Conozca a su Cliente).
Cliente (Prospecto): Pero es que solo quiero una estimación aproximada para saber si nos conviene. No les quita nada decirme el costo por transferencia.
Ejecutivo Comercial: Comprendo, pero nuestra política corporativa es de tolerancia cero. No tenemos permitido entablar conversaciones comerciales ni dar cotizaciones hasta haber verificado la identidad legal de su empresa y de los beneficiarios finales.
Cliente (Prospecto): Está bien, entiendo. ¿Qué necesitan de mi parte entonces para hacer ese proceso de KYC rápido?
Ejecutivo Comercial: Es muy sencillo. Necesitamos que nos compartas: 1) El registro mercantil o acta de constitución legal de la empresa, 2) Una identificación oficial del representante legal, y 3) Un esquema simple que indique quiénes son los beneficiarios finales que poseen más del 25% de las acciones. Te acabo de enviar un enlace seguro para que puedas subir estos documentos. En cuanto los verifiquemos, agendamos de inmediato la sesión para definir su estructura de tarifas especiales.`
  },
  {
    title: "Caso 3: Caso Mixto (Información KYC Parcial con Brecha Comercial)",
    description: "El cliente proporciona algunos datos de identificación, pero el ejecutivo comercial cede ante la presión y comparte especificaciones de precios y comisiones antes de verificar la propiedad real.",
    expectedStatus: "BREACH",
    text: `Ejecutivo Comercial: Hola Sofía, un gusto saludarte. Gracias por enviarme el número de registro fiscal o VAT de su empresa 'Tech Solutions SRL' que es ESB12345678 en España.
Cliente (Sofía): Hola, sí, te lo mandé temprano para avanzar. Ya con eso estamos listos para cotizar, ¿verdad? Necesitamos saber cuánto nos cobrarían por la integración API de su software.
Ejecutivo Comercial: Gracias Sofía, la identidad básica de la empresa está registrada con el VAT ESB12345678. Aún nos falta verificar el esquema de beneficiarios finales (UBO) para completar el proceso de KYC obligatorio, pero ya tenemos un buen avance.
Cliente (Sofía): Excelente. Pero dime, ¿cuál es el costo aproximado del fee de integración? Necesito meterlo en el presupuesto que presento a mi junta directiva mañana por la mañana. Por favor, ayúdame con un dato estimado, no tiene que ser definitivo.
Ejecutivo Comercial: Entiendo tu situación con la junta directiva... Mira, confidencialmente, el costo estándar de integración API es de $1,200 USD como pago único. Sin embargo, si cerramos la suscripción anual antes del fin de mes, puedo gestionar que se reduzca a $600 USD. Por favor, manéjalo de forma interna en tu junta mientras terminamos el proceso de KYC.
Cliente (Sofía): ¡Muchas gracias! Con eso me salvas para la presentación de mañana.`
  }
];

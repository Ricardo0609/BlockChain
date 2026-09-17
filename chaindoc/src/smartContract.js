// ─────────────────────────────────────────────────────────────
// smartContract.js — Lectura de contratos con IA (Gemini)
//
// ⚠️ SÓLO PARA PRUEBAS. La llave viaja al navegador y es visible
// para cualquiera. Antes de producción, mover esta llamada a un
// backend: basta reemplazar el cuerpo de askGemini() por un fetch
// a tu propio endpoint. Todo lo demás sigue igual.
//
// ⚠️ En la capa gratuita de Google, los prompts pueden usarse para
// entrenar sus modelos. No enviar contratos reales de clientes.
// ─────────────────────────────────────────────────────────────

const ENV = (typeof import.meta !== "undefined" && import.meta.env) || {};
const API_KEY = ENV.VITE_GEMINI_API_KEY || "";
const BASE = "https://generativelanguage.googleapis.com/v1beta";

// Google renombra y retira modelos seguido. En vez de fijar uno,
// preguntamos a la API cuáles admite esta llave y elegimos el mejor.
// Puedes forzar uno con VITE_GEMINI_MODEL en tu .env.local
const FORCED = ENV.VITE_GEMINI_MODEL || "";

// Orden de preferencia: Flash es el que entra en la capa gratuita.
const PREFER = [
  /^gemini-3\.5-flash$/, /^gemini-3-flash/, /^gemini-2\.5-flash$/,
  /^gemini-2\.0-flash$/, /flash-lite/, /flash/,
];

let resolvedModel = null;

/** Lista los modelos que esta llave puede usar. Útil para diagnosticar. */
export async function listModels() {
  const res = await fetch(`${BASE}/models?key=${API_KEY}`);
  if (!res.ok) {
    if (res.status === 400 || res.status === 403)
      throw new Error("La llave no es válida para la API de Gemini. Debe empezar con «AIza» y venir de aistudio.google.com/apikey");
    throw new Error(`No se pudo consultar la lista de modelos (error ${res.status}).`);
  }
  const data = await res.json();
  return (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""));
}

/** Elige un modelo disponible una sola vez y lo recuerda. */
async function resolveModel() {
  if (FORCED) return FORCED;
  if (resolvedModel) return resolvedModel;

  const available = await listModels();
  if (!available.length)
    throw new Error("Tu llave no tiene acceso a ningún modelo de Gemini.");

  for (const rx of PREFER) {
    const hit = available.find((m) => rx.test(m) && !/vision|embedding|tts|image/.test(m));
    if (hit) { resolvedModel = hit; return hit; }
  }
  resolvedModel = available[0];
  return resolvedModel;
}

export const aiConfigured = () => Boolean(API_KEY);

// ── Esquema de salida ─────────────────────────────────────────
// Obliga al modelo a devolver JSON con esta forma exacta.
const SCHEMA = {
  type: "object",
  properties: {
    titulo:      { type: "string" },
    resumen:     { type: "string" },
    fechaLimite: { type: "string", nullable: true },
    montoTotal:  { type: "number", nullable: true },
    moneda:      { type: "string", nullable: true },
    partes: {
      type: "array",
      items: {
        type: "object",
        properties: { nombre: { type: "string" }, rol: { type: "string" } },
        required: ["nombre", "rol"],
      },
    },
    requisitos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          titulo:      { type: "string" },
          descripcion: { type: "string" },
          tipo:        { type: "string", enum: ["entregable", "comprobante", "documento"] },
          monto:       { type: "number", nullable: true },
          fechaLimite: { type: "string", nullable: true },
          obligatorio: { type: "boolean" },
        },
        required: ["titulo", "descripcion", "tipo", "obligatorio"],
      },
    },
  },
  required: ["titulo", "resumen", "partes", "requisitos"],
};

const PROMPT = `Eres un analista de contratos. Lee el contrato y extrae ÚNICAMENTE lo que está escrito en él.

Tu tarea es producir la lista de comprobantes que deberán reunirse para demostrar que el contrato se cumplió.

Reglas:
- No inventes datos. Si el contrato no dice el monto o la fecha, deja ese campo nulo.
- Un "requisito" es algo que alguien tendrá que subir como evidencia.
- tipo "entregable": el producto o servicio final (un archivo, una obra, un reporte).
- tipo "comprobante": prueba de un pago (factura, recibo, transferencia).
- tipo "documento": un papel que debe existir (el contrato firmado, un permiso, una póliza).
- Si el contrato menciona contratar a un tercero, genera un requisito de tipo "comprobante" para ese gasto.
- Las fechas van en formato AAAA-MM-DD. Si el contrato da un plazo relativo ("5 días"), calcúlalo desde HOY, que es {HOY}.
- El resumen es una frase de máximo 25 palabras.
- Escribe todo en español.

CONTRATO:
"""
{TEXTO}
"""`;

// ── Llamada al modelo ─────────────────────────────────────────
// ← Este es el único punto que cambia al mover la IA a un backend.
async function askGemini(prompt) {
  const model = await resolveModel();
  const res = await fetch(`${BASE}/models/${model}:generateContent?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0, // determinista: mismo contrato, mismo resultado
        responseMimeType: "application/json",
        responseSchema: SCHEMA,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 404) {
      // El modelo desapareció: olvida el elegido para que se resuelva de nuevo.
      resolvedModel = null;
      throw new Error(`El modelo «${model}» no está disponible para tu llave. Vuelve a intentarlo.`);
    }
    if (res.status === 429)
      throw new Error("Se agotó la cuota gratuita por ahora. Espera un minuto e inténtalo de nuevo.");
    if (res.status === 400 && /API key/i.test(body))
      throw new Error("La llave de Gemini no es válida. Debe empezar con «AIza».");
    if (res.status === 403)
      throw new Error("La llave no tiene permiso para usar este modelo.");
    throw new Error(`El servicio respondió con error ${res.status}.`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("El modelo no devolvió resultados. Prueba con un contrato más detallado.");
  return { text, model };
}

// ── Normalización ─────────────────────────────────────────────
// El modelo puede omitir campos o devolver tipos raros. Esto
// garantiza que la app siempre reciba una estructura utilizable.
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

function normalize(raw) {
  const reqs = Array.isArray(raw.requisitos) ? raw.requisitos : [];
  return {
    titulo:      String(raw.titulo || "").trim() || "Contrato inteligente",
    resumen:     String(raw.resumen || "").trim(),
    fechaLimite: isDate(raw.fechaLimite) ? raw.fechaLimite : null,
    montoTotal:  typeof raw.montoTotal === "number" ? raw.montoTotal : null,
    moneda:      raw.moneda || "MXN",
    partes: (Array.isArray(raw.partes) ? raw.partes : [])
      .filter((p) => p?.nombre)
      .map((p) => ({ nombre: String(p.nombre).trim(), rol: String(p.rol || "parte").trim() })),
    requisitos: reqs
      .filter((r) => r?.titulo)
      .map((r, i) => ({
        id: `r${i + 1}`,
        titulo:      String(r.titulo).trim(),
        descripcion: String(r.descripcion || "").trim(),
        tipo:        ["entregable", "comprobante", "documento"].includes(r.tipo) ? r.tipo : "documento",
        monto:       typeof r.monto === "number" ? r.monto : null,
        fechaLimite: isDate(r.fechaLimite) ? r.fechaLimite : null,
        obligatorio: r.obligatorio !== false,
        estado:      "pendiente",
        archivo:     null,
      })),
  };
}

/** Lee un contrato y devuelve la estructura del expediente. */
export async function analyzeContract(text) {
  if (!API_KEY) throw new Error("Falta la llave de Gemini. Crea el archivo .env.local con VITE_GEMINI_API_KEY.");
  if (!text || text.trim().length < 80)
    throw new Error("El contrato es demasiado corto para analizarse. Escribe al menos un párrafo con las obligaciones.");

  const hoy = new Date().toISOString().slice(0, 10);
  const prompt = PROMPT.replace("{HOY}", hoy).replace("{TEXTO}", text.trim().slice(0, 60000));

  const { text: out, model } = await askGemini(prompt);

  let parsed;
  try {
    parsed = JSON.parse(out);
  } catch {
    throw new Error("El modelo devolvió una respuesta ilegible. Inténtalo de nuevo.");
  }

  const result = normalize(parsed);
  if (!result.requisitos.length)
    throw new Error("No se identificaron obligaciones concretas. Detalla más el contrato: entregables, pagos y fechas.");

  return { ...result, modelo: model, analizadoEn: new Date().toISOString() };
}

// ── Utilidades del expediente ─────────────────────────────────

/** Huella SHA-256 del archivo, para detectar si lo cambian después. */
export async function hashFile(file) {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Un requisito admite VARIOS comprobantes: una barda de concreto necesita
 * el recibo del cemento, el de los ladrillos y el de la grava.
 *
 * Los expedientes viejos guardaban un solo `archivo`; esta función
 * unifica ambas formas para que nada del código tenga que distinguirlas.
 */
export const archivosDe = (r) =>
  Array.isArray(r?.archivos) ? r.archivos : (r?.archivo ? [r.archivo] : []);

/** Identificador estable de un comprobante dentro de su requisito. */
export const aidDe = (a) => a?.aid || a?.path || a?.docId || a?.nombre || "";

/** Suma de los importes anotados en los comprobantes de un requisito. */
export function comprobadoDe(r) {
  const lista = archivosDe(r).filter((a) => typeof a.monto === "number");
  return lista.length ? lista.reduce((s, a) => s + a.monto, 0) : null;
}

/** Formatea un importe con su moneda. */
export const fmtMonto = (n, moneda = "MXN") =>
  n == null ? "—" : `$${Number(n).toLocaleString("es-MX", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })} ${moneda}`;

/**
 * Lee el importe de un documento con plantilla visual (factura o recibo).
 * Los campos son texto libre, así que se limpian antes de convertir.
 */
export function montoDeDocumento(doc) {
  const f = doc?.fields;
  if (!f) return null;
  const crudo = f.total ?? f.cantidad ?? f.subtotal ?? null;
  if (crudo == null || crudo === "") return null;
  const n = parseFloat(String(crudo).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Aritmética del expediente. Sin IA: sólo suma lo que hay.
 *
 * - esperado:   lo que el contrato dice que debe gastarse
 * - comprobado: lo que realmente respaldan los comprobantes adjuntos
 * - desviaciones: requisitos donde lo comprobado no cuadra con lo pactado
 */
export function calcularMontos(exp) {
  const reqs = exp?.requisitos || [];
  const moneda = exp?.moneda || "MXN";
  const contrato = typeof exp?.montoTotal === "number" ? exp.montoTotal : null;

  let esperado = 0, comprobado = 0;
  let hayEsperado = false, hayComprobado = false;
  const desviaciones = [];
  let sinImporte = 0;

  for (const r of reqs) {
    if (typeof r.monto === "number") { esperado += r.monto; hayEsperado = true; }

    // ← ACTUALIZADO: se suman TODOS los comprobantes del requisito
    const lista = archivosDe(r);
    const real = comprobadoDe(r);
    if (real != null) { comprobado += real; hayComprobado = true; }
    sinImporte += lista.filter((a) => typeof a.monto !== "number").length;

    // Sólo tiene sentido comparar cuando existen ambos lados.
    if (typeof r.monto === "number" && real != null) {
      const dif = real - r.monto;
      // Tolerancia de un peso: evita marcar diferencias por redondeo.
      if (Math.abs(dif) > 1) {
        desviaciones.push({
          id: r.id, titulo: r.titulo, esperado: r.monto, real, dif,
          piezas: lista.length,
        });
      }
    }
  }

  const base = contrato ?? (hayEsperado ? esperado : null);
  const restante = base != null && hayComprobado ? base - comprobado : null;

  return {
    moneda, contrato,
    esperado: hayEsperado ? esperado : null,
    comprobado: hayComprobado ? comprobado : null,
    base, restante, sinImporte, desviaciones,
    porcentaje: base && base > 0 ? Math.min(999, Math.round((comprobado / base) * 100)) : null,
    excedido: base != null && comprobado > base + 1,
    // Aplica cuando el contrato fija un total pero los requisitos suman otra cosa.
    descuadre: contrato != null && hayEsperado && Math.abs(esperado - contrato) > 1
      ? esperado - contrato : null,
  };
}

export function expedienteStatus(exp) {
  const reqs = exp?.requisitos || [];
  const obligatorios = reqs.filter((r) => r.obligatorio);
  // ← ACTUALIZADO: se deriva de los comprobantes, no del campo guardado
  const cumplidos = obligatorios.filter((r) => archivosDe(r).length > 0).length;
  const total = obligatorios.length;

  const hoy = new Date().toISOString().slice(0, 10);
  const vencido = exp?.fechaLimite ? hoy > exp.fechaLimite : false;
  const completo = total > 0 && cumplidos === total;

  // Diferencia en días de calendario: evita el desfase por hora del día.
  let dias = null;
  if (exp?.fechaLimite) {
    const hoyD = new Date(hoy + "T00:00:00");
    const limD = new Date(exp.fechaLimite + "T00:00:00");
    dias = Math.round((limD - hoyD) / 86400000);
  }

  return {
    cumplidos,
    total,
    porcentaje: total ? Math.round((cumplidos / total) * 100) : 0,
    completo,
    vencido,
    dias,
    estado: completo ? "completo" : vencido ? "vencido" : "abierto",
  };
}

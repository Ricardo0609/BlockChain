// ─────────────────────────────────────────────────────────────
// ia.js — Lectura de contratos con Gemini, desde el servidor
//
// Hasta ahora esto vivía en el navegador y la llave viajaba con él:
// cualquiera podía abrir las herramientas de desarrollo, copiarla y
// gastarla. Aquí la llave nunca sale del servidor.
//
// Es el mismo esquema y el mismo prompt que usaba el cliente, para
// que el resultado no cambie. Lo único distinto es dónde corre.
// ─────────────────────────────────────────────────────────────

const BASE = "https://generativelanguage.googleapis.com/v1beta";

const llave = () => process.env.GEMINI_API_KEY || "";
const FORZADO = () => process.env.GEMINI_MODELO || "";

// Google renombra y retira modelos seguido. En vez de fijar uno,
// preguntamos cuáles admite esta llave y elegimos el mejor.
const PREFER = [
  /^gemini-3\.5-flash$/, /^gemini-3-flash/, /^gemini-2\.5-flash$/,
  /^gemini-2\.0-flash$/, /flash-lite/, /flash/,
];

let resuelto = null;
let candidatos = null;

/** Modelos que esta llave puede usar. */
export async function listarModelos(){
  const res = await fetch(`${BASE}/models?key=${llave()}`);
  if(!res.ok){
    if(res.status === 400 || res.status === 403) throw new Error("llave");
    throw new Error(`modelos-${res.status}`);
  }
  const data = await res.json();
  return (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""));
}

async function modelosCandidatos(){
  if(candidatos) return candidatos;

  const disponibles = await listarModelos();
  if(!disponibles.length) throw new Error("sin-modelos");

  const utiles = disponibles.filter((m) => !/vision|embedding|tts|image|audio|live|thinking-exp/.test(m));
  const orden = [];
  if(FORZADO()) orden.push(FORZADO());
  if(resuelto) orden.push(resuelto);                 // el que funcionó la última vez, primero
  for(const rx of PREFER){
    for(const m of utiles) if(rx.test(m) && !orden.includes(m)) orden.push(m);
  }
  if(!orden.length) orden.push(utiles[0] || disponibles[0]);
  candidatos = orden.slice(0, 4);                    // más de cuatro sólo alarga la espera
  return candidatos;
}

// ── Esquema de salida ─────────────────────────────────────────
// Obliga al modelo a devolver JSON con esta forma exacta.
export const SCHEMA = {
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
          fase:        { type: "string", nullable: true },
        },
        required: ["titulo", "descripcion", "tipo", "obligatorio"],
      },
    },
    fases: {
      type: "array",
      items: {
        type: "object",
        properties: {
          titulo:      { type: "string" },
          descripcion: { type: "string" },
          fechaLimite: { type: "string", nullable: true },
        },
        required: ["titulo", "descripcion"],
      },
    },
  },
  required: ["titulo", "resumen", "partes", "requisitos", "fases"],
};

export const PROMPT = `Eres un analista de contratos. Lee el contrato y extrae ÚNICAMENTE lo que está escrito en él.

Tu tarea es producir la lista de comprobantes que deberán reunirse para demostrar que el contrato se cumplió.

Reglas:
- No inventes datos. Si el contrato no dice el monto o la fecha, deja ese campo nulo.
- Un "requisito" es algo que alguien tendrá que subir como evidencia.
- tipo "entregable": el producto o servicio final (un archivo, una obra, un reporte).
- tipo "comprobante": prueba de un pago (factura, recibo, transferencia).
- tipo "documento": un papel que debe existir (el contrato firmado, un permiso, una póliza).
- Si el contrato menciona contratar a un tercero, genera un requisito de tipo "comprobante" para ese gasto.
- Las fechas van en formato AAAA-MM-DD. Si el contrato da un plazo relativo ("5 días"), calcúlalo desde HOY, que es {HOY}.
- FASES: si el contrato establece etapas, avances, revisiones intermedias, entregas parciales o plazos escalonados, crea una fase por cada una, en orden cronológico y con su fecha límite. La entrega final también es una fase. Si el contrato no menciona etapas, devuelve "fases" como lista vacía.
- Si una fase se define de forma relativa ("a la mitad del plazo", "a los 5 días del inicio"), calcula su fecha a partir de las fechas del contrato.
- Asigna cada requisito a la fase en la que debe entregarse, escribiendo en "fase" el título EXACTO de esa fase. Si no corresponde a ninguna, déjalo nulo.
- Toda fase debe poder comprobarse: si una fase no tiene ningún requisito, crea uno de tipo "entregable" que la demuestre (por ejemplo, un reporte de avance con fotografías).
- El resumen es una frase de máximo 25 palabras.
- Escribe todo en español.

CONTRATO:
"""
{TEXTO}
"""`;

// ── Llamada al modelo ─────────────────────────────────────────
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Errores pasajeros del lado de Google: vale la pena reintentar.
//   503 = modelo saturado · 500/502/504 = falla temporal · 429 = cuota por minuto
const TRANSITORIOS = new Set([429, 500, 502, 503, 504]);

/** Una sola petición a un modelo. */
async function pedir(model, prompt){
  let res;
  try{
    res = await fetch(`${BASE}/models/${model}:generateContent?key=${llave()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,                   // determinista: mismo contrato, mismo resultado
          responseMimeType: "application/json",
          responseSchema: SCHEMA,
        },
      }),
    });
  }catch{
    return { ok: false, status: 0, cuerpo: "" };     // sin conexión
  }
  if(!res.ok) return { ok: false, status: res.status, cuerpo: await res.text() };
  const data = await res.json();
  return { ok: true, status: 200, text: data?.candidates?.[0]?.content?.parts?.[0]?.text };
}

/** Reintenta con espera creciente y, si el modelo sigue fallando, pasa al siguiente. */
export async function preguntar(prompt){
  const modelos = await modelosCandidatos();
  const ESPERAS = [0, 1000, 2500];
  let ultimo = 0;

  for(const model of modelos){
    for(const espera of ESPERAS){
      if(espera) await esperar(espera);

      const r = await pedir(model, prompt);
      if(r.ok){
        if(!r.text) throw new Error("vacio");
        if(model !== resuelto) candidatos = null;    // se reordena: el que funcionó va primero
        resuelto = model;
        return { text: r.text, model };
      }
      ultimo = r.status;

      if(r.status === 403) throw new Error("permiso");
      if(r.status === 400 && /API key/i.test(r.cuerpo)) throw new Error("llave");
      if(r.status === 404){ candidatos = null; break; }
      if(r.status === 400) break;
      if(!TRANSITORIOS.has(r.status) && r.status !== 0) break;
    }
  }

  if(ultimo === 429) throw new Error("cuota");
  if(ultimo === 0) throw new Error("conexion");
  if(ultimo >= 500) throw new Error("saturado");
  throw new Error(`error-${ultimo}`);
}

// ── Normalización ─────────────────────────────────────────────
// El modelo puede omitir campos o devolver tipos raros. Esto
// garantiza que la app siempre reciba una estructura utilizable.
const esFecha = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Comparación tolerante de títulos (sin acentos, mayúsculas ni espacios de más). */
const llaveTexto = (t) => String(t || "").toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

export function normalizarFases(raw){
  const lista = (Array.isArray(raw.fases) ? raw.fases : [])
    .filter((f) => f?.titulo)
    .map((f) => ({
      titulo: String(f.titulo).trim(),
      descripcion: String(f.descripcion || "").trim(),
      fechaLimite: esFecha(f.fechaLimite) ? f.fechaLimite : null,
    }));
  // Con todas las fechas, orden cronológico. Si a alguna le falta (por
  // ejemplo, "Inicio de obra"), se respeta el orden del contrato.
  if(lista.length && lista.every((f) => f.fechaLimite)){
    lista.sort((a, b) => a.fechaLimite.localeCompare(b.fechaLimite));
  }
  return lista.map((f, i) => ({ id: `f${i + 1}`, ...f }));
}

export function normalizar(raw){
  const reqs = Array.isArray(raw.requisitos) ? raw.requisitos : [];
  const fases = normalizarFases(raw);
  const porTitulo = new Map(fases.map((f) => [llaveTexto(f.titulo), f.id]));
  return {
    fases,
    titulo:      String(raw.titulo || "").trim() || "Contrato inteligente",
    resumen:     String(raw.resumen || "").trim(),
    fechaLimite: esFecha(raw.fechaLimite) ? raw.fechaLimite : null,
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
        fechaLimite: esFecha(r.fechaLimite) ? r.fechaLimite : null,
        obligatorio: r.obligatorio !== false,
        fase:        porTitulo.get(llaveTexto(r.fase)) || null,
        estado:      "pendiente",
        archivo:     null,
      })),
  };
}

/** Texto del contrato → estructura del expediente. */
export async function analizar(texto){
  const hoy = new Date().toISOString().slice(0, 10);
  const prompt = PROMPT.replace("{HOY}", hoy).replace("{TEXTO}", texto.trim().slice(0, 60000));

  const { text: salida, model } = await preguntar(prompt);

  let crudo;
  try{ crudo = JSON.parse(salida); }
  catch{ throw new Error("ilegible"); }

  const r = normalizar(crudo);
  if(!r.requisitos.length) throw new Error("sin-requisitos");

  return { ...r, modelo: model, analizadoEn: new Date().toISOString() };
}

/** Los motivos de arriba, en español, para enseñárselos a la persona. */
export const EXPLICA = {
  "llave":         "La llave del servicio de IA no es válida. Avísanos para revisarla.",
  "permiso":       "La llave no tiene permiso para usar este modelo.",
  "sin-modelos":   "El servicio de IA no tiene ningún modelo disponible ahora mismo.",
  "cuota":         "Se agotó la cuota de análisis por ahora. Espera un minuto e inténtalo de nuevo.",
  "conexion":      "El servidor no pudo comunicarse con el servicio de IA.",
  "saturado":      "El servicio de IA está saturado en este momento. Espera un par de minutos.",
  "vacio":         "El modelo no devolvió resultados. Prueba con un contrato más detallado.",
  "ilegible":      "El modelo devolvió una respuesta ilegible. Inténtalo de nuevo.",
  "sin-requisitos":"No se identificaron obligaciones concretas. Detalla más el contrato: entregables, pagos y fechas.",
};
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

// ── INTEGRIDAD DE LOS VÍNCULOS ────────────────────────────────

/**
 * Compara un comprobante enlazado contra el estado actual del documento
 * al que apunta. Al vincular guardamos el hash de su último bloque; aquí
 * se averigua qué pasó con esa huella desde entonces.
 *
 * La distinción clave: que a una factura le agreguen una firma después
 * de adjuntarla es normal, y su historia sigue intacta. Que la huella
 * registrada ya no aparezca en su cadena significa que la historia se
 * reescribió, y eso sí es una alerta.
 */
export function estadoVinculo(archivo, docActual) {
  if (!archivo || archivo.origen !== "interno") return null;
  if (!archivo.hash) return { estado: "sinHuella", texto: "Se adjuntó sin registrar huella." };
  if (!docActual) {
    return { estado: "faltante", texto: "El documento ya no existe o perdiste el acceso." };
  }

  const cadena = docActual.chain || [];
  const cabeza = cadena[cadena.length - 1];
  if (!cabeza) return { estado: "faltante", texto: "El documento no tiene historial." };

  if (cabeza.hash === archivo.hash) {
    return { estado: "vigente", texto: "Sin cambios desde que se adjuntó." };
  }

  // ¿La huella guardada sigue formando parte de su historia?
  const pos = cadena.findIndex((b) => b.hash === archivo.hash);
  if (pos >= 0) {
    const posteriores = cadena.slice(pos + 1);
    const acciones = [...new Set(posteriores.map((b) => b.action))];
    const n = posteriores.length;
    return {
      estado: "ampliado", nuevos: n, acciones,
      hashActual: cabeza.hash, desde: posteriores[0]?.timestamp || null,
      texto: `${n} bloque${n === 1 ? "" : "s"} nuevo${n === 1 ? "" : "s"} desde que se adjuntó: ${acciones.join(", ").toLowerCase()}.`,
    };
  }

  return {
    estado: "alterado", hashActual: cabeza.hash,
    texto: "La huella registrada ya no aparece en la historia de este documento. Su cadena fue reescrita o reemplazada.",
  };
}

/** Cuenta los estados de un mapa de vínculos, para la cabecera. */
export function resumenVinculos(mapa) {
  const vals = Object.values(mapa || {}).filter(Boolean);
  return {
    alterados: vals.filter((v) => v.estado === "alterado").length,
    faltantes: vals.filter((v) => v.estado === "faltante").length,
    ampliados: vals.filter((v) => v.estado === "ampliado").length,
    vigentes:  vals.filter((v) => v.estado === "vigente").length,
  };
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

// ── BITÁCORA DE CONSULTAS ─────────────────────────────────────
// ← NUEVO: registra quién abrió un documento compartido.
//
// Riesgo acotado a propósito: si cada apertura generara un bloque, la
// cadena crecería sin control (abrir un expediente 20 veces al día lo
// llenaría de ruido y encarecería cada lectura de Firestore).
//
// Por eso se registra UNA consulta por persona y día, y sólo en
// documentos compartidos: en uno privado, saber que el dueño lo abrió
// no aporta transparencia a nadie.

/** ¿Hay que asentar una consulta de esta persona ahora mismo? */
export function debeRegistrarConsulta(doc, uid, email) {
  if (!doc || !uid) return false;
  if (!(doc.sharedWith || []).length) return false;     // sin terceros, no hay a quién informar

  const hoy = new Date().toISOString().slice(0, 10);
  const yaHoy = (doc.chain || []).some(
    (b) => b.action === "CONSULTA" &&
           b.meta?.uid === uid &&
           (b.timestamp || "").slice(0, 10) === hoy
  );
  if (yaHoy) return false;

  // Sólo se registra a quien no es el dueño, o al dueño de un
  // expediente que ya comparte con otros.
  return doc.ownerUid !== uid || Boolean(email);
}

/** Agrupa las consultas por persona, para leerlas de un vistazo. */
export function resumenConsultas(chain = []) {
  const porPersona = new Map();
  for (const b of chain) {
    if (b.action !== "CONSULTA") continue;
    const clave = b.meta?.email || b.author || "desconocido";
    const prev = porPersona.get(clave) || { quien: b.author || clave, email: b.meta?.email || null, veces: 0, ultima: null };
    prev.veces += 1;
    if (!prev.ultima || b.timestamp > prev.ultima) prev.ultima = b.timestamp;
    porPersona.set(clave, prev);
  }
  return [...porPersona.values()].sort((a, b) => (b.ultima || "").localeCompare(a.ultima || ""));
}

// ── DETECCIÓN DE DUPLICADOS ───────────────────────────────────
// ← NUEVO: ya calculamos el SHA-256 de cada archivo al adjuntarlo.
// Con eso se detecta el mismo comprobante usado en dos lugares, que
// es un vector real de error y de comprobación duplicada de gastos.
// No hace falta índice aparte: se recorre lo que ya está cargado.

/**
 * Índice identidad → dónde aparece.
 *
 * ⚠️ La identidad depende del origen, y esto importa:
 *
 * - Un archivo subido se identifica por su SHA-256: dos PDF con el
 *   mismo contenido son el mismo comprobante aunque los renombren.
 *
 * - Un documento de chaindoc se identifica por su `docId`, NO por su
 *   hash. El hash que guardamos es el de su último bloque al momento
 *   de adjuntarlo: si adjuntas la misma factura a dos expedientes en
 *   días distintos y entre medias la firmaste, los hashes difieren
 *   aunque sea la misma factura. Comparar por hash no la detectaría.
 */
export function indiceHuellas(docs = []) {
  const idx = new Map();

  const anotar = (clave, ubi) => {
    if (!clave) return;
    if (!idx.has(clave)) idx.set(clave, []);
    idx.get(clave).push(ubi);
  };

  for (const doc of docs) {
    for (const r of doc.requisitos || []) {
      for (const a of archivosDe(r)) {
        const interno = a.origen === "interno";
        anotar(interno ? `doc:${a.docId}` : `sha:${a.hash}`, {
          docId: doc.id, docTitulo: doc.title,
          tipo: interno ? "documento" : "comprobante",
          reqId: r.id, reqTitulo: r.titulo,
          nombre: a.nombre, monto: a.monto ?? null, subidoEn: a.subidoEn,
          fuenteId: interno ? a.docId : null, numId: a.numId || null,
        });
      }
    }
    for (const img of doc.imagenes || []) {
      anotar(`sha:${img.hash}`, {
        docId: doc.id, docTitulo: doc.title, tipo: "imagen",
        nombre: img.nombre, monto: null, subidoEn: img.subidoEn,
      });
    }
  }
  return idx;
}

/**
 * Comprobantes que aparecen en más de un lugar.
 *
 * `alcance` marca la gravedad:
 * - entre-expedientes: el mismo gasto comprobado en dos operaciones.
 *   Es el caso grave y el que sube al panel de inicio.
 * - mismo-expediente: repetido en dos requisitos de la misma
 *   operación. Puede ser legítimo (una factura que cubre dos
 *   conceptos), pero su importe se cuenta doble en el presupuesto.
 */
export function duplicados(docs = []) {
  const grupos = [];
  for (const [clave, ubis] of indiceHuellas(docs)) {
    if (ubis.length < 2) continue;
    const docsDistintos = new Set(ubis.map((u) => u.docId));
    grupos.push({
      clave, hash: clave.startsWith("sha:") ? clave.slice(4) : null,
      esInterno: clave.startsWith("doc:"),
      ubicaciones: ubis,
      veces: ubis.length,
      nombre: ubis[0].nombre,
      numId: ubis[0].numId || null,
      monto: ubis.find((u) => u.monto != null)?.monto ?? null,
      alcance: docsDistintos.size > 1 ? "entre-expedientes" : "mismo-expediente",
    });
  }
  // Los que cruzan expedientes primero: son los que importan.
  return grupos.sort((a, b) =>
    (a.alcance === b.alcance ? b.veces - a.veces : a.alcance === "entre-expedientes" ? -1 : 1));
}

/** ¿Este documento ya está adjunto a algún expediente? Devuelve dónde. */
export function dondeEstaAdjunto(docId, docs = []) {
  const sitios = [];
  for (const doc of docs) {
    if (doc.id === docId) continue;
    for (const r of doc.requisitos || []) {
      for (const a of archivosDe(r)) {
        if (a.origen === "interno" && a.docId === docId) {
          sitios.push({ expId: doc.id, expTitulo: doc.title, reqId: r.id, reqTitulo: r.titulo });
        }
      }
    }
  }
  return sitios;
}

/** Duplicados que tocan un expediente concreto. */
export const duplicadosDe = (grupos, docId) =>
  grupos.filter((g) => g.ubicaciones.some((u) => u.docId === docId));

// ── PANEL DE VENCIMIENTOS ─────────────────────────────────────

/** Días desde la última actividad registrada. */
export function diasInactivo(doc) {
  if (!doc?.lastModified) return null;
  const ms = Date.now() - new Date(doc.lastModified).getTime();
  return Math.floor(ms / 86400000);
}

/**
 * Cruza todos los expedientes y los reparte en cubetas accionables.
 * Responde: qué urge, qué está detenido, qué ya cerró.
 */
export function panelExpedientes(docs = [], opciones = {}) {
  const { diasAviso = 7, diasQuieto = 14 } = opciones;
  const exps = docs.filter((x) => x.kind === "expediente");
  const dups = duplicados(docs);

  const filas = exps.map((x) => {
    const st = expedienteStatus(x);
    const mt = calcularMontos(x);
    return {
      doc: x, st, mt,
      inactivo: diasInactivo(x),
      duplicados: duplicadosDe(dups, x.id).length,
    };
  });

  const vencidos   = filas.filter((f) => f.st.vencido && !f.st.completo);
  const porVencer  = filas.filter((f) => !f.st.vencido && !f.st.completo &&
                                          f.st.dias != null && f.st.dias <= diasAviso);
  const completos  = filas.filter((f) => f.st.completo);
  const detenidos  = filas.filter((f) => !f.st.completo && !f.st.vencido &&
                                          (f.st.dias == null || f.st.dias > diasAviso) &&
                                          f.inactivo != null && f.inactivo >= diasQuieto);
  const enCurso    = filas.filter((f) => !f.st.completo && !f.st.vencido &&
                                          !porVencer.includes(f) && !detenidos.includes(f));

  return {
    total: filas.length,
    vencidos: vencidos.sort((a, b) => a.st.dias - b.st.dias),
    porVencer: porVencer.sort((a, b) => a.st.dias - b.st.dias),
    detenidos: detenidos.sort((a, b) => b.inactivo - a.inactivo),
    enCurso, completos,
    duplicados: dups,
    // Lo que exige atención hoy.
    alertas: vencidos.length + porVencer.length + dups.filter((d) => d.alcance === "entre-expedientes").length,
  };
}

// ── SOLICITUDES DE EVIDENCIA ──────────────────────────────────
// ← NUEVO: pedirle un comprobante a otra persona.
//
// Las solicitudes viven DENTRO del expediente, no en una colección
// aparte: quien recibe la petición necesita acceso al expediente de
// todos modos, así que pedir implica compartir. Un solo lugar, un
// solo permiso, y la lista de pendientes sale de los expedientes
// que ya se cargan.

export const ESTADOS_SOL = ["pendiente", "cumplida", "cancelada"];

/** Arma la solicitud que se guarda en el expediente. */
export function nuevaSolicitud({ reqId, reqTitulo, paraUid, paraEmail, paraNombre,
                                 deUid, deNombre, mensaje }) {
  return {
    sid: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    reqId, reqTitulo,
    paraUid: paraUid || null,
    paraEmail: (paraEmail || "").toLowerCase(),
    paraNombre: paraNombre || null,
    deUid, deNombre,
    mensaje: (mensaje || "").trim() || null,
    estado: "pendiente",
    creadaEn: new Date().toISOString(),
    resueltaEn: null,
  };
}

/** Solicitudes vivas de un requisito. */
export const solicitudesDe = (exp, reqId) =>
  (exp?.solicitudes || []).filter((s) => s.reqId === reqId && s.estado === "pendiente");

/**
 * Lo que a esta persona le pidieron, cruzando todos sus expedientes.
 * Incluye los vencidos y los ordena por urgencia.
 */
export function misPendientes(docs = [], uid, email) {
  const mail = (email || "").toLowerCase();
  const out = [];

  for (const doc of docs) {
    for (const s of doc.solicitudes || []) {
      if (s.estado !== "pendiente") continue;
      const paraMi = (s.paraUid && s.paraUid === uid) || (mail && s.paraEmail === mail);
      if (!paraMi) continue;

      const req = (doc.requisitos || []).find((r) => r.id === s.reqId);
      const st = expedienteStatus(doc);
      out.push({
        sol: s, doc, req,
        limite: req?.fechaLimite || doc.fechaLimite || null,
        dias: st.dias, vencido: st.vencido,
      });
    }
  }
  // Sin fecha al final; entre los que tienen, el más urgente primero.
  return out.sort((a, b) => {
    if (a.dias == null) return 1;
    if (b.dias == null) return -1;
    return a.dias - b.dias;
  });
}

/** Solicitudes que yo hice y sigo esperando. */
export function misEsperas(docs = [], uid) {
  const out = [];
  for (const doc of docs) {
    for (const s of doc.solicitudes || []) {
      if (s.estado !== "pendiente" || s.deUid !== uid) continue;
      out.push({ sol: s, doc });
    }
  }
  return out.sort((a, b) => (a.sol.creadaEn || "").localeCompare(b.sol.creadaEn || ""));
}

/** Marca como cumplidas las solicitudes de un requisito ya comprobado. */
export function cerrarSolicitudes(exp, reqId, porQuien) {
  const ahora = new Date().toISOString();
  let cerradas = 0;
  const solicitudes = (exp.solicitudes || []).map((s) => {
    if (s.reqId !== reqId || s.estado !== "pendiente") return s;
    cerradas++;
    return { ...s, estado: "cumplida", resueltaEn: ahora, cumplidaPor: porQuien || null };
  });
  return { solicitudes, cerradas };
}

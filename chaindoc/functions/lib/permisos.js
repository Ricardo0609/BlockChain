// Quién puede hacer qué sobre una operación, y qué campos acepta el servidor.
// Está aparte para poder probarlo sin arrancar Firebase.

import { HttpsError } from "firebase-functions/v2/https";

/** Acciones válidas para un bloque. Cualquier otra se rechaza. */
export const ACCIONES = new Set([
  "CREACIÓN", "EDICIÓN", "FIRMA", "COMPARTIDO", "EVIDENCIA", "VINCULADO",
  "CONSULTA", "SOLICITUD", "CONVERSIÓN", "EXPORTACIÓN", "MIGRACIÓN",
  "VALIDACIÓN",
]);

/**
 * Campos que el cliente puede cambiar. El resto los fija el servidor.
 *
 * ← ACTUALIZADO (Etapa 3): `sharedWith` y `roles` salieron de aquí. Los
 * accesos sólo cambian por las funciones de compartir, que comprueban
 * el rol de quien lo pide. Antes, cualquiera con acceso podía sumarse
 * gente editando el documento.
 */
export const CAMPOS_EDITABLES = new Set([
  "title", "content", "fields", "folder", "tplId",
  "kind", "requisitos", "fases", "solicitudes", "imagenes",
  "fechaLimite", "montoTotal", "moneda", "partes", "resumen", "analisis",
  "convertidoDe", "source", "sourceFile",
]);

// ── ROLES ─────────────────────────────────────────────────────
//
// Compartir ya no es "todo o nada". Al electricista que sube su factura
// no tiene por qué verle los pagos al plomero, ni tocar las fases.

export const ROLES = ["propietario", "editor", "aportador", "aprobador", "lector", "auditor"];

export const ROL_TEXTO = {
  propietario: "Propietario",
  editor:      "Editor",
  aportador:   "Aportador",
  aprobador:   "Aprobador",
  lector:      "Lector",
  auditor:     "Auditor",
};

/** Qué puede hacer cada rol. Lo que no está aquí, no se puede. */
export const PERMISOS = {
  propietario: ["ver", "editar", "subir", "retirar", "firmar", "compartir", "pedir", "aprobar", "exportar", "proteger", "vincular", "borrar"],
  editor:      ["ver", "editar", "subir", "retirar", "firmar", "pedir", "exportar", "proteger", "vincular"],
  aportador:   ["ver", "subir"],
  aprobador:   ["ver", "aprobar", "firmar", "exportar"],
  auditor:     ["ver", "exportar"],
  lector:      ["ver"],
};

/**
 * Rol de una persona en una operación.
 *
 * Compatibilidad: los documentos compartidos antes de los roles no
 * tienen mapa `roles`; a quien estaba en `sharedWith` se le trata como
 * editor, que es lo que de hecho podía hacer.
 */
export function rolDe(op, uid, email){
  if(!op) return null;
  if(op.ownerUid === uid) return "propietario";
  const correo = (email || "").toLowerCase();
  if(!correo) return null;
  const rol = op.roles?.[correo];
  if(rol && ROLES.includes(rol)) return rol;
  return (op.sharedWith || []).includes(correo) ? "editor" : null;
}

export const puede = (rol, accion) => Boolean(rol && PERMISOS[rol]?.includes(accion));

/** Traduce el evento que se quiere asentar al permiso que exige. */
export function permisoDeEvento(evento = {}){
  const tipo = evento.meta?.tipo;
  switch(evento.accion){
    case "EDICIÓN":
    case "CONVERSIÓN":   return "editar";
    case "FIRMA":        return "firmar";
    case "COMPARTIDO":   return "compartir";
    case "SOLICITUD":    return "pedir";
    case "EXPORTACIÓN":  return "exportar";
    case "VINCULADO":    return "vincular";
    case "CONSULTA":     return "ver";
    // Una validación la escribe el servidor con lo que dijo el SAT;
    // quien la pide sólo necesita poder ver el documento.
    case "VALIDACIÓN":   return "ver";
    case "EVIDENCIA":
      if(tipo === "baja" || tipo === "imagen-baja") return "retirar";
      if(tipo === "vinculo") return "vincular";
      return "subir";
    default:             return "editar";
  }
}

/**
 * Un aportador sólo sube a los requisitos que le pidieron. Su permiso
 * nace de la solicitud, así que no hay otra lista que mantener.
 */
export function puedeSubirA(op, rol, email, reqId){
  if(!puede(rol, "subir")) return false;
  if(rol !== "aportador") return true;
  const correo = (email || "").toLowerCase();
  return (op.solicitudes || []).some(
    (s) => s.reqId === reqId && (s.paraEmail || "").toLowerCase() === correo && s.estado === "pendiente");
}

export const LIMITES = {
  contenido: 2000,      // caracteres del texto del bloque
  meta: 8000,           // tamaño del meta serializado
  documento: 900000,    // tamaño del registro completo
  correos: 50,          // personas con acceso
};

export const esDueno = (op, uid) => op?.ownerUid === uid;

export const tieneAcceso = (op, uid, email) =>
  esDueno(op, uid) || (op?.sharedWith || []).includes((email || "").toLowerCase());

/** Normaliza y valida los campos que llegan del navegador. */
export function limpiarCambios(cambios = {}){
  const out = {};
  for(const [k, v] of Object.entries(cambios)){
    if(!CAMPOS_EDITABLES.has(k)) continue;          // se ignora en silencio
    out[k] = v === undefined ? null : v;
  }
  return out;
}

/** Revisa el evento que acompaña al bloque. */
export function validarEvento(evento){
  if(!evento || typeof evento !== "object") throw new HttpsError("invalid-argument", "Falta el evento.");
  const { accion, contenido, meta } = evento;
  if(!ACCIONES.has(accion)) throw new HttpsError("invalid-argument", `Acción desconocida: ${accion}`);
  const texto = String(contenido ?? "");
  if(texto.length > LIMITES.contenido) throw new HttpsError("invalid-argument", "El texto del bloque es demasiado largo.");
  if(meta != null){
    if(typeof meta !== "object" || Array.isArray(meta)) throw new HttpsError("invalid-argument", "meta debe ser un objeto.");
    if(JSON.stringify(meta).length > LIMITES.meta) throw new HttpsError("invalid-argument", "Los metadatos del bloque son demasiado grandes.");
  }
  return { accion, contenido: texto, meta: meta ?? null };
}

/**
 * Los accesos ya no viajan entre los campos editables: se cambian sólo
 * por las funciones de compartir. Esto queda como red de seguridad.
 */
export function revisarCambioDeAcceso(op, cambios){
  if("sharedWith" in cambios || "roles" in cambios){
    throw new HttpsError("permission-denied", "Los accesos se cambian desde «Compartir», no editando el documento.");
  }
}

/** ¿Hay que asentar una consulta de esta persona hoy? Misma regla que el cliente. */
export function debeRegistrarConsulta(op, bloques, uid, email){
  if(!op || !uid) return false;
  if(!(op.sharedWith || []).length) return false;
  const hoy = new Date().toISOString().slice(0, 10);
  const yaHoy = bloques.some(
    (b) => b.action === "CONSULTA" && b.meta?.uid === uid && (b.timestamp || "").slice(0, 10) === hoy);
  if(yaHoy) return false;
  return op.ownerUid !== uid || Boolean(email);
}
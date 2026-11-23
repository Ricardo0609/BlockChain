// Reglas del expediente que el servidor necesita para actualizar los
// requisitos al adjuntar o retirar un comprobante. Son las mismas que
// usa la interfaz, aquí sin depender de nada de Firebase.

import { estadoDe } from "./entregas.js";

/** Un requisito admite varios comprobantes; los expedientes viejos traían uno solo. */
export const archivosDe = (r) =>
  Array.isArray(r?.archivos) ? r.archivos : (r?.archivo ? [r.archivo] : []);

/** Identificador estable de un comprobante dentro de su requisito. */
export const aidDe = (a) => a?.aid || a?.path || a?.docId || a?.nombre || "";

/** Quita la clave `archivo` del formato antiguo (Firestore no admite undefined). */
export const sinArchivoViejo = (r) => { const resto = { ...r }; delete resto.archivo; return resto; };

/** Agrega un comprobante al requisito indicado. */
export function agregarArchivo(requisitos = [], reqId, nuevo){
  let encontrado = false;
  const out = requisitos.map((r) => {
    if(r.id !== reqId) return r;
    encontrado = true;
    // ← CAMBIADO (23 nov): el estado ya no es siempre «cumplido».
    // Si su dueño marcó este requisito como «necesita mi visto
    // bueno», queda en «por-revisar» hasta que lo mire. Ver
    // `entregas.js`, que es el gemelo donde vive la regla.
    const archivos = [...archivosDe(r), nuevo];
    return { ...sinArchivoViejo(r), estado: estadoDe(r, archivos), archivos };
  });
  return { requisitos: out, encontrado };
}

/** Retira un comprobante y devuelve también el que se quitó. */
export function quitarArchivo(requisitos = [], reqId, aid){
  let quitado = null;
  const out = requisitos.map((r) => {
    if(r.id !== reqId) return r;
    const lista = archivosDe(r);
    quitado = lista.find((a) => aidDe(a) === aid) || null;
    const restantes = lista.filter((a) => aidDe(a) !== aid);
    // Quitar el último archivo devuelve el requisito a «pendiente»;
    // quitar uno de varios recalcula, que con visto bueno pedido no
    // es lo mismo que «hay archivos, luego está cumplido».
    return { ...sinArchivoViejo(r), archivos: restantes,
             estado: estadoDe(r, restantes) };
  });
  return { requisitos: out, quitado };
}

/** Marca como cumplidas las solicitudes que este comprobante atiende. */
export function cerrarSolicitudes(exp, reqId, porQuien){
  const ahora = new Date().toISOString();
  let cerradas = 0;
  const solicitudes = (exp?.solicitudes || []).map((s) => {
    if(s.reqId !== reqId || s.estado !== "pendiente") return s;
    cerradas++;
    return { ...s, estado: "cumplida", resueltaEn: ahora, cumplidaPor: porQuien || null };
  });
  return { solicitudes, cerradas };
}
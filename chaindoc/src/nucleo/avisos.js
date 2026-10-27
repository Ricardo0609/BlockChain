// ─────────────────────────────────────────────────────────────
// avisos.js — Lo que encontró la revisión de anoche
//
// Cada madrugada el servidor mira qué fases y requisitos están por
// vencer, y vuelve a preguntarle al SAT por las facturas ya
// comprobadas: una vigente en septiembre puede estar cancelada en
// octubre, y el expediente se volvería falso en silencio.
//
// Por ahora esto se enseña dentro de la app. Cuando haya dominio
// propio, los mismos avisos saldrán también por correo; lo que decide
// QUÉ avisar ya está resuelto en el servidor.
// ─────────────────────────────────────────────────────────────

import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";

export async function leerAvisos(uid){
  if(!uid) return null;
  try{
    const s = await getDoc(doc(db, "avisos", uid));
    return s.exists() ? s.data() : { avisos: [], total: 0 };
  }catch(e){
    console.error("[chaindoc] no se pudieron leer los avisos:", e?.code || e);
    return null;
  }
}

/** Cada aviso, en una frase que se entienda sin contexto. */
export function TEXTO_AVISO(a){
  switch(a.tipo){
    case "factura-cancelada":
      return `El SAT canceló «${a.archivo}» en «${a.titulo}». Ese comprobante ya no sirve para deducir.`;
    case "factura-cambio":
      return `«${a.archivo}» cambió de estatus en el SAT (${a.antes} → ${a.ahora}) en «${a.titulo}».`;
    case "fase-vencida":
      return `La fase «${a.fase}» de «${a.titulo}» venció el ${a.fecha} y sigue incompleta.`;
    case "fase-por-vencer":
      return `La fase «${a.fase}» de «${a.titulo}» vence el ${a.fecha}.`;
    case "requisito-vencido":
      return `«${a.requisito}» de «${a.titulo}» venció el ${a.fecha} y sigue pendiente.`;
    case "requisito-por-vencer":
      return `«${a.requisito}» de «${a.titulo}» vence el ${a.fecha}.`;
    default:
      return `Hay algo que revisar en «${a.titulo}».`;
  }
}

/** Lo urgente primero: lo del SAT, luego lo vencido, luego lo que viene. */
const PESO = {
  "factura-cancelada": 0, "factura-cambio": 1,
  "fase-vencida": 2, "requisito-vencido": 3,
  "fase-por-vencer": 4, "requisito-por-vencer": 5,
};

export const ordenar = (lista = []) =>
  [...lista].sort((a, b) => (PESO[a.tipo] ?? 9) - (PESO[b.tipo] ?? 9));

export const esGrave = (a) =>
  ["factura-cancelada", "factura-cambio", "fase-vencida", "requisito-vencido"].includes(a.tipo);

// ── LO QUE YA NO HAY QUE REVISAR (27 oct) ─────────────────────
//
// Estos avisos los escribe el servidor de madrugada y se quedan
// quietos hasta la noche siguiente. Si durante el día borras el
// documento o cumples lo que faltaba, el aviso sobrevive: sigue ahí
// pidiéndote algo que ya hiciste, y al tocarlo te manda a un
// documento que ya no existe —«ya no puedes abrir ese documento»—,
// que es un callejón sin salida en la primera pantalla de la app.
//
// La lista de anoche se cruza con los documentos de ahora, que el
// navegador ya tiene. No se corrige el servidor: se deja de creer a
// ciegas una foto vieja.

/** Los comprobantes de un requisito; los expedientes viejos traían uno. */
const ARCHIVOS = (r) =>
  Array.isArray(r?.archivos) ? r.archivos : (r?.archivo ? [r.archivo] : []);

const PorTitulo = (lista, titulo) =>
  (lista || []).find((x) => (x?.titulo || "") === titulo) || null;

/**
 * Si este aviso sigue teniendo sentido a la luz del documento de hoy.
 *
 * `doc` es el documento vivo, o null si ya no está en tu lista —lo
 * borraron, te retiraron el acceso, o lo quitaste de tu vista.
 */
export function sigueValiendo(a, doc) {
  if (!doc) return false;

  switch (a?.tipo) {
    case "requisito-vencido":
    case "requisito-por-vencer": {
      const r = PorTitulo(doc.requisitos, a.requisito);
      // Sin el requisito, no hay nada que cumplir: lo quitaron del
      // contrato después de que se escribiera el aviso.
      return Boolean(r) && ARCHIVOS(r).length === 0;
    }

    case "fase-vencida":
    case "fase-por-vencer": {
      const f = PorTitulo(doc.fases, a.fase);
      if (!f) return false;
      const suyos = (doc.requisitos || []).filter((r) => r?.fase === f.id);
      // Una fase sin requisitos no está cumplida: está vacía. Avisar
      // de ella es justo lo que hace falta, igual que en el servidor.
      return suyos.length === 0 || suyos.some((r) => ARCHIVOS(r).length === 0);
    }

    case "factura-cancelada":
    case "factura-cambio":
      // Una factura cancelada no se «cumple»: se quita. Mientras el
      // comprobante siga colgado del expediente, el aviso vale.
      return (doc.requisitos || []).some(
        (r) => ARCHIVOS(r).some((x) => (x?.nombre || "") === a.archivo));

    default:
      // Un tipo que todavía no conocemos se respeta: vale más un
      // aviso de más que tragarse uno que no sabemos leer.
      return true;
  }
}

/**
 * La lista de anoche, sin lo que ya se resolvió hoy.
 *
 * Devuelve el mismo objeto que llega del servidor, con `avisos` y
 * `total` recortados. El total importa: si quedan dos avisos y la
 * cabecera sigue diciendo «4 cosas que revisar», el que no cuadra es
 * el contador.
 */
export function avisosVigentes(datos, docs = []) {
  if (!datos) return datos;
  const porId = new Map((docs || []).map((d) => [d.id, d]));
  const antes = datos.avisos || [];
  const lista = antes.filter((a) => sigueValiendo(a, porId.get(a?.opId) || null));

  const quitados = antes.length - lista.length;
  const total = Math.max(lista.length, (datos.total ?? antes.length) - quitados);
  return { ...datos, avisos: lista, total };
}
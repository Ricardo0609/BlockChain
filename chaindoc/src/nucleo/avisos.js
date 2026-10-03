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
// ─────────────────────────────────────────────────────────────
// borrado.js — Qué pasa de verdad al eliminar un documento
//
// Hasta aquí eliminar era `recursiveDelete`: el documento y su cadena
// entera dejaban de existir para todos. El dueño podía borrar un
// contrato ya firmado por las dos partes, o un expediente lleno de
// comprobantes que subió el otro, y el otro se quedaba sin nada que
// enseñarle a nadie. En una herramienta que vende pruebas, eso es el
// agujero por donde se sale el producto.
//
// La regla, en una frase: **se borra de verdad lo que sólo es tuyo;
// lo que ya es de dos, se te quita de la vista y sigue existiendo.**
//
// Dos cosas hacen que un documento deje de ser sólo tuyo:
//
//   1. **Alguien más lo firmó.** Desde que el otro firma, el documento
//      también es su prueba: dice qué firmó y cuándo. Compartirlo para
//      que lo lea no cuenta — mirar no deja nada que perder.
//   2. **Está adjunto como evidencia en un contrato.** Desde que se
//      adjunta forma parte de lo que ese contrato demuestra, y el
//      contrato puede ser de otro. Quitarlo de ahí por la puerta de
//      atrás vaciaría el expediente de alguien más.
//
// Cuando se oculta, se oculta SÓLO para quien lo pidió. El documento
// no se mueve, no cambia, sigue abriéndose por su enlace y sigue
// contando como evidencia donde esté. Lo único que pasa es que deja de
// salir en su lista, que es lo que de verdad se quería.
//
// Todo sale de la propia cadena del documento. No hay campo nuevo que
// mantener al día ni que migrar: los bloques ya estaban ahí.
// ─────────────────────────────────────────────────────────────

const BLOQUES = (d) => (Array.isArray(d?.chain) ? d.chain : []);

/**
 * Los expedientes en los que este documento está adjunto AHORA.
 *
 * Se cuentan las altas y se descuentan las bajas, por expediente. Un
 * documento que se adjuntó y luego se retiró no cuenta: ya no es
 * evidencia de nadie.
 */
export function vinculosVivos(doc) {
  const vivos = new Set();
  for (const b of BLOQUES(doc)) {
    if (b?.action !== "VINCULADO") continue;
    const exp = b?.meta?.expId;
    if (!exp) continue;
    if (b?.meta?.tipo === "baja") vivos.delete(exp);
    else vivos.add(exp);
  }
  return [...vivos];
}

/**
 * Dónde está usado este comprobante ahora mismo, requisito a requisito.
 *
 * `vinculosVivos` devuelve expedientes y nada más, y para lo suyo está
 * bien: para decidir si un documento se puede borrar da igual a qué
 * requisito estuviera atado, lo que importa es que pertenece al
 * contrato de alguien.
 *
 * Para el uso único no da igual. La regla, decidida el 10 de
 * noviembre: un comprobante «se usa una vez, tanto por contrato como
 * en general». Dos requisitos del mismo contrato ya son dos usos, y
 * `vinculosVivos` no los distingue porque mete los dos en el mismo
 * expediente y el Set los funde en uno.
 *
 * El motivo de la regla es el que da nombre al producto: el mismo
 * gasto comprobado dos veces es exactamente lo que esto existe para
 * que no pase. Que las dos veces sean en el mismo contrato no lo hace
 * menos: son dos obligaciones distintas cobradas con un solo papel.
 *
 * Una baja levanta sólo SU uso, el de su mismo requisito. Retirar el
 * recibo del requisito A no puede soltar el del B.
 */
export function usosVivos(doc) {
  const vivos = new Map();
  for (const b of BLOQUES(doc)) {
    if (b?.action !== "VINCULADO") continue;
    const expId = b?.meta?.expId;
    if (!expId) continue;
    const requisito = b?.meta?.requisito ?? null;
    // El \u0000 no aparece en un id, así que no hay forma de que dos
    // pares distintos se escriban igual al juntarlos.
    const clave = `${expId}\u0000${requisito ?? ""}`;
    if (b?.meta?.tipo === "baja") vivos.delete(clave);
    else vivos.set(clave, { expId, requisito });
  }
  return [...vivos.values()];
}

/**
 * Quién más ha dejado constancia aquí, sin contar al dueño.
 *
 * Mira los TRES sitios donde alguien que no eres tú deja algo que es
 * suyo: los bloques FIRMA de la cadena, las firmas del acuerdo —la
 * aceptación de la otra parte, que no escribe bloque de firma— y el
 * RECHAZO.
 *
 * ← NUEVO (6 nov): el rechazo. Faltaba, y era el hueco más feo de
 * todos: un contrato que la otra parte NO aceptó no tenía firmas ni
 * vínculos, así que se podía borrar del todo. Quien lo mandó podía
 * hacer desaparecer la constancia de que se lo rechazaron, y con ella
 * el motivo que la otra parte escribió. El «no» de alguien es suyo
 * igual que su «sí».
 */
export function firmasDeOtros(doc) {
  const dueno = doc?.ownerUid || null;
  const correoDueno = String(doc?.ownerEmail || "").toLowerCase();
  const nombres = new Set();

  for (const b of BLOQUES(doc)) {
    if (b?.action !== "FIRMA") continue;
    if (b?.autorUid && dueno && b.autorUid === dueno) continue;
    if (!b?.autorUid && b?.author && b.author === doc?.owner) continue;
    nombres.add(b.author || "alguien más");
  }

  for (const f of (Array.isArray(doc?.acuerdo?.firmas) ? doc.acuerdo.firmas : [])) {
    if (f?.parte !== "receptor") continue;
    if (f?.uid && dueno && f.uid === dueno) continue;
    if (String(f?.email || "").toLowerCase() === correoDueno && correoDueno) continue;
    nombres.add(f?.nombre || f?.email || "la otra parte");
  }

  const r = doc?.acuerdo?.rechazo;
  if (r && String(r.porEmail || "").toLowerCase() !== correoDueno) {
    nombres.add(r.porNombre || r.porEmail || "la otra parte");
  }

  return [...nombres];
}

/**
 * Qué hay que hacer al eliminar este documento, y por qué.
 *
 * `modo` es «borrar» cuando no hay nadie más de por medio, y
 * «ocultar» cuando sí. `motivos` es para decírselo a quien le dio al
 * botón: un documento que no desaparece sin explicar por qué es un
 * botón roto.
 */
export function decidirBorrado(doc) {
  const firmaron = firmasDeOtros(doc);
  const adjuntoEn = vinculosVivos(doc);
  const motivos = [];

  if (firmaron.length) {
    const rechazo = doc?.acuerdo?.rechazo;
    const soloRechazo = rechazo && firmaron.length === 1
      && !BLOQUES(doc).some((b) => b?.action === "FIRMA")
      && !(doc?.acuerdo?.firmas || []).some((f) => f?.parte === "receptor");
    if (soloRechazo) {
      // Decirle «lo firmó» a quien justamente NO lo firmó sería mentir
      // en el único sitio donde el producto no se lo puede permitir.
      motivos.push(`${firmaron[0]} no aceptó este contrato, y esa respuesta es suya.`);
    } else {
      motivos.push(firmaron.length === 1
        ? `${firmaron[0]} lo firmó, así que también es su prueba.`
        : `Lo firmaron ${firmaron.join(", ")}, así que también es su prueba.`);
    }
  }
  if (adjuntoEn.length) {
    motivos.push(adjuntoEn.length === 1
      ? "Está adjunto como evidencia en un contrato."
      : `Está adjunto como evidencia en ${adjuntoEn.length} contratos.`);
  }

  return {
    modo: motivos.length ? "ocultar" : "borrar",
    motivos,
    firmaron,
    adjuntoEn,
  };
}

/** Si este documento está oculto para esta persona. */
export const ocultoPara = (doc, uid) =>
  Boolean(uid) && (Array.isArray(doc?.ocultoPara) ? doc.ocultoPara : []).includes(uid);

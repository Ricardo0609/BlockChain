// borrado.js — LA COPIA DEL SERVIDOR.
//
// Es la que decide de verdad: el navegador tiene la suya para avisar
// antes de pulsar, pero quien borra o esconde es esta. De la marca en
// adelante es idéntica, byte a byte, a `src/nucleo/borrado.js`, y hay
// una prueba que lo comprueba. Si cambias una, cambia la otra.

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
 * Quién más ha firmado esto, sin contar al dueño.
 *
 * Mira los dos sitios donde queda una firma: los bloques FIRMA de la
 * cadena y las firmas del acuerdo —la aceptación de la otra parte en
 * un contrato—, porque esa segunda no escribe bloque de firma.
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
    motivos.push(firmaron.length === 1
      ? `${firmaron[0]} lo firmó, así que también es su prueba.`
      : `Lo firmaron ${firmaron.join(", ")}, así que también es su prueba.`);
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

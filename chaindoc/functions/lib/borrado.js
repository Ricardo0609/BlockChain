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

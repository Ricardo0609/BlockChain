// ─────────────────────────────────────────────────────────────
// secciones.js — Qué partes de un documento se enseñan
//
// Un documento de texto traía siempre dos bloques debajo del papel:
// «Evidencia visual» y las firmas. Para un acta de entrega los dos
// hacen falta; para una nota de reunión no hace falta ninguno, y
// salían igual, pidiendo fotos y firmas que nadie iba a poner. Una
// sección vacía que no se puede quitar no es neutra: parece un
// pendiente.
//
// Así que se pueden quitar. El campo es `secciones` y sólo guarda lo
// que se APAGÓ:
//
//     secciones: { evidencia: false }
//
// Ausente o `true` quiere decir que se ve, y por eso los documentos
// que ya existen siguen igual sin migrar nada: ninguno tiene el
// campo, así que ninguno cambia.
//
// La regla que importa está en `sePuedeQuitar`: una sección sólo se
// quita mientras está VACÍA. Esconder una firma ya puesta o una foto
// ya subida sería esconder una prueba, y es justo lo contrario de lo
// que hace esto. Lo que ya quedó asentado se queda a la vista.
// ─────────────────────────────────────────────────────────────

/** Las dos, con el texto de su botón. El orden es el de la pantalla. */
export const SECCIONES = [
  {
    id: "evidencia",
    titulo: "Evidencia visual",
    agregar: "Agregar sección de evidencias",
    // Lo que impide quitarla, dicho para quien lo lee, no para el log.
    ocupada: "Tiene fotos adjuntas. Retíralas y entonces podrás quitar la sección.",
  },
  {
    id: "firmas",
    titulo: "Firmas",
    agregar: "Agregar sección de firmas",
    ocupada: "Ya hay firmas. No se pueden esconder: son parte de la prueba.",
  },
];

const IDS = SECCIONES.map((s) => s.id);

/** Si esta sección se ve. Lo que no está apagado, está encendido. */
export const seVe = (d, id) => d?.secciones?.[id] !== false;

/** Las dos, resueltas, para llevarlas en el estado de la pantalla. */
export const seccionesDe = (d) =>
  Object.fromEntries(IDS.map((id) => [id, seVe(d, id)]));

/**
 * Deja sólo lo apagado, y sólo de las secciones que existen.
 *
 * Se guarda la ausencia en vez de la presencia para que un documento
 * normal no cargue con un campo que no dice nada, y para que añadir
 * una sección nueva mañana no obligue a tocar los de ayer.
 */
export function limpiarSecciones(secciones) {
  const fuera = {};
  for (const id of IDS) if (secciones?.[id] === false) fuera[id] = false;
  return Object.keys(fuera).length ? fuera : null;
}

/**
 * Si esta sección se puede quitar ahora mismo.
 *
 * Sólo mientras esté vacía. Ver la cabecera: una firma o una foto ya
 * asentadas no se esconden.
 */
export function sePuedeQuitar(id, { imagenes = 0, firmas = 0 } = {}) {
  if (id === "evidencia") return imagenes === 0;
  if (id === "firmas") return firmas === 0;
  return false;
}

/** El motivo, cuando no se puede. `null` cuando sí. */
export function motivoOcupada(id, cuentas) {
  if (sePuedeQuitar(id, cuentas)) return null;
  return SECCIONES.find((s) => s.id === id)?.ocupada || null;
}

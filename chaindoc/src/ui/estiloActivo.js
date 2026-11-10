// ─────────────────────────────────────────────────────────────
// estiloActivo.js — Qué estilo tiene el texto donde está el cursor
//
// La barra de estilos aplicaba sin decir nunca qué había puesto. Si
// pones el cursor en un párrafo en negrita, la B se veía igual que si
// estuvieras en uno normal: para saberlo había que pulsar y mirar qué
// pasaba, que es exactamente al revés de como debería ser.
//
// Esto lo pregunta al navegador. `queryCommandState` está marcado como
// obsoleto igual que `execCommand`, y por el mismo motivo se puede
// usar aquí: no decide nada ni se guarda en ningún sitio, sólo sirve
// para pintar un botón. Si un día deja de responder, los botones
// dejan de iluminarse y todo lo demás sigue funcionando.
//
// Recibe el documento como argumento en vez de tomar el global, que es
// lo que hace que esto se pueda probar sin un navegador delante.
// ─────────────────────────────────────────────────────────────

/** Los que o están o no están. */
export const INTERRUPTORES = [
  "bold", "italic", "insertUnorderedList", "insertOrderedList",
  "justifyLeft", "justifyCenter", "justifyRight", "justifyFull",
];

/** Las alineaciones, que son excluyentes entre sí. */
const ALINEACIONES = ["justifyLeft", "justifyCenter", "justifyRight", "justifyFull"];

/**
 * El bloque, normalizado a lo que entiende la barra.
 *
 * Cada navegador devuelve una cosa: "h2", "H2", "<h2>", "div", "" o
 * "normal" para lo mismo. Todo lo que no sea un título es "p", que es
 * lo que dice el botón «Normal».
 */
export function bloqueDe(valor) {
  const v = String(valor ?? "").toLowerCase().replace(/[<>]/g, "").trim();
  return ["h1", "h2", "h3"].includes(v) ? v : "p";
}

/**
 * Qué está activo ahora mismo.
 *
 * Devuelve siempre un objeto con la misma forma, incluso si el
 * navegador se niega a responder: un fallo aquí tiene que dejar la
 * barra apagada, nunca romper la edición.
 */
export function leerActivos(d) {
  const vacio = { bloque: "p" };
  if (!d || typeof d.queryCommandState !== "function") return vacio;

  const act = { bloque: "p" };
  for (const cmd of INTERRUPTORES) {
    try { act[cmd] = Boolean(d.queryCommandState(cmd)); }
    catch { act[cmd] = false; }
  }
  try { act.bloque = bloqueDe(d.queryCommandValue?.("formatBlock")); }
  catch { act.bloque = "p"; }

  // Si ninguna alineación se declara activa, es que el texto va como
  // viene, y eso es alineado a la izquierda. El navegador no lo dice
  // porque es el valor por defecto, pero el usuario SÍ lo ve así, y la
  // barra tiene que coincidir con lo que hay en pantalla.
  if (!ALINEACIONES.some((a) => act[a])) act.justifyLeft = true;

  return act;
}

/** Si este botón de la barra va iluminado. */
export function estaActivo(activos, cmd, valor) {
  if (!activos) return false;
  if (cmd === "formatBlock") return activos.bloque === bloqueDe(valor);
  return Boolean(activos[cmd]);
}

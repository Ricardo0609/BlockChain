// ─────────────────────────────────────────────────────────────
// rfc.js — El RFC, comprobado de verdad
//
// Hasta ahora el formulario aceptaba cualquier cosa con forma de RFC.
// Un RFC trae un dígito de control calculado a partir de los demás
// caracteres, igual que una tarjeta bancaria: con él se detecta al
// instante un dedazo o un RFC inventado, antes de que se cuele al
// expediente y nadie lo note hasta la auditoría.
//
// Este archivo es idéntico en `src/nucleo/rfc.js` (el navegador avisa
// mientras escribes) y en `functions/lib/rfc.js` (el servidor decide).
// Una prueba comprueba que no se separen.
// ─────────────────────────────────────────────────────────────

/**
 * Tabla oficial del SAT. Cada carácter admitido vale un número.
 * El espacio (37) sólo aparece al rellenar los RFC de empresa, que
 * tienen 12 caracteres en vez de 13.
 */
const VALORES = {
  "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  A: 10, B: 11, C: 12, D: 13, E: 14, F: 15, G: 16, H: 17, I: 18, J: 19,
  K: 20, L: 21, M: 22, N: 23, "&": 24, O: 25, P: 26, Q: 27, R: 28, S: 29,
  T: 30, U: 31, V: 32, W: 33, X: 34, Y: 35, Z: 36, " ": 37, "Ñ": 38,
};

/**
 * Forma general: 3 letras (empresa) o 4 (persona), fecha y homoclave.
 *
 * El último carácter se acepta aquí aunque sea una letra cualquiera:
 * de rechazarlo en este punto, un dedazo en el dígito se reportaría
 * como «esto no parece un RFC», que no ayuda a nadie. Lo atrapa el
 * dígito verificador, que además dice cuál debería ser.
 */
const FORMA = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/;

/**
 * Los RFC genéricos NO cumplen el dígito verificador: son excepciones
 * que el propio SAT define. Rechazarlos sería un error, porque
 * aparecen en facturas legítimas al público en general.
 */
export const GENERICOS = new Set([
  "XAXX010101000",   // público en general (nacional)
  "XEXX010101000",   // residentes en el extranjero
]);

export const normalizarRFC = (v) =>
  String(v || "").toUpperCase().replace(/[\s-]/g, "").trim();

/** ¿Es persona física (13) o moral (12)? */
export const tipoDeRFC = (rfc) => {
  const r = normalizarRFC(rfc);
  if (r.length === 13) return "fisica";
  if (r.length === 12) return "moral";
  return null;
};

/** La fecha embebida (AAMMDD) tiene que existir en el calendario. */
function fechaValida(rfc) {
  const inicio = rfc.length === 13 ? 4 : 3;
  const aa = +rfc.slice(inicio, inicio + 2);
  const mm = +rfc.slice(inicio + 2, inicio + 4);
  const dd = +rfc.slice(inicio + 4, inicio + 6);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false;
  // Siglo: el SAT no lo dice en el RFC, así que se prueban los dos.
  for (const siglo of [1900, 2000]) {
    const d = new Date(Date.UTC(siglo + aa, mm - 1, dd));
    if (d.getUTCMonth() === mm - 1 && d.getUTCDate() === dd) return true;
  }
  return false;
}

/**
 * Calcula el dígito verificador de un RFC, a partir de todo lo demás.
 *
 * Es la suma de cada carácter por su peso (13, 12, 11… 2), el resto
 * entre once, y ese resto restado de once. Dos casos especiales: si
 * da once el dígito es 0, y si da diez es la letra A.
 */
export function digitoVerificador(rfc) {
  const r = normalizarRFC(rfc);
  const base = (r.length === 12 ? " " : "") + r.slice(0, r.length === 12 ? 11 : 12);
  if (base.length !== 12) return null;

  let suma = 0;
  for (let i = 0; i < 12; i++) {
    const v = VALORES[base[i]];
    if (v === undefined) return null;        // carácter que no existe en la tabla
    suma += v * (13 - i);
  }

  const dif = 11 - (suma % 11);
  if (dif === 11) return "0";
  if (dif === 10) return "A";
  return String(dif);
}

/**
 * Revisa un RFC completo. Devuelve por qué falla, para poder decírselo
 * a la persona en lugar de un «no válido» a secas.
 *
 * motivo: "vacio" · "forma" · "fecha" · "digito"
 */
export function revisarRFC(valor) {
  const rfc = normalizarRFC(valor);
  if (!rfc) return { ok: false, motivo: "vacio" };
  if (GENERICOS.has(rfc)) return { ok: true, generico: true, tipo: tipoDeRFC(rfc) };
  if (!FORMA.test(rfc) || (rfc.length !== 12 && rfc.length !== 13)) {
    return { ok: false, motivo: "forma" };
  }
  if (!fechaValida(rfc)) return { ok: false, motivo: "fecha" };

  const esperado = digitoVerificador(rfc);
  if (esperado === null || esperado !== rfc[rfc.length - 1]) {
    return { ok: false, motivo: "digito", esperado };
  }
  return { ok: true, tipo: tipoDeRFC(rfc) };
}

export const rfcValido = (valor) => revisarRFC(valor).ok;

/** El porqué, en español, para enseñarlo bajo el campo. */
export const MOTIVOS_RFC = {
  vacio:  "Escribe el RFC.",
  forma:  "Un RFC son 12 caracteres (empresa) o 13 (persona): letras, la fecha y la homoclave.",
  fecha:  "La fecha que trae el RFC no existe en el calendario. Revisa los seis dígitos del centro.",
  digito: "El último carácter no corresponde con el resto del RFC. Revisa si hay un dedazo.",
};

/** Texto listo para mostrar. Cadena vacía si está bien. */
export function errorDeRFC(valor) {
  const r = revisarRFC(valor);
  return r.ok ? "" : MOTIVOS_RFC[r.motivo] || "RFC no válido.";
}
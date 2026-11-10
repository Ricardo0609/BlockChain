// ─────────────────────────────────────────────────────────────
// accionCorreo.js — Leer el enlace que Firebase manda por correo
//
// Confirmar el correo, restablecer la contraseña y deshacer un cambio
// de correo llegan los TRES por la misma dirección, distinguidos por
// un parámetro `mode`. Hasta hoy esa dirección era una página de
// Firebase: en inglés, con su marca, y con un diseño que no es el
// nuestro. Es la segunda pantalla que ve alguien que acaba de
// registrarse.
//
// Aquí sólo se LEE la dirección. Lo que se hace con el código vive en
// `auth.js`, y lo que se pinta en la pantalla. Separado así porque
// esto es lo único que se puede probar sin un navegador ni una cuenta
// de Firebase delante, y es donde está la parte que se equivoca.
// ─────────────────────────────────────────────────────────────

export const RUTA = "/accion";

/**
 * Los tres casos que Firebase manda por esta puerta.
 *
 * Hay que atenderlos los TRES o ninguno: la dirección es una sola, así
 * que en cuanto se apunta a la nuestra, los tres dejan de pasar por la
 * de Firebase. Quedarse con uno y dejar los otros dos no es una
 * opción, y por eso están aquí los tres desde el principio.
 */
export const MODOS = {
  verifyEmail: "confirmar",
  resetPassword: "contrasena",
  recoverEmail: "recuperar",
};

/**
 * Qué pide esta dirección, o null si no es de las nuestras.
 *
 * Devuelve `{ caso, codigo, continuar }`. `continuar` es el
 * `continueUrl` que Firebase arrastra: se lee para poder volver a
 * donde la persona estaba, y se descarta si apunta fuera de aquí
 * —si no, cualquiera podría mandar un enlace de confirmación que
 * acabe soltando a la persona en otro sitio.
 */
export function leerAccion(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.pathname.replace(/\/+$/, "") !== RUTA) return null;

  const p = u.searchParams;
  const caso = MODOS[p.get("mode")];
  const codigo = p.get("oobCode");
  if (!caso || !codigo) return null;

  return { caso, codigo, continuar: destinoSeguro(p.get("continueUrl"), u.origin) };
}

/**
 * El destino de vuelta, sólo si es de esta misma aplicación.
 *
 * Un enlace de correo lo puede componer cualquiera: si se siguiera el
 * `continueUrl` tal cual, bastaría mandarle a alguien un enlace de
 * «confirma tu correo» para soltarlo, ya identificado y confiado, en
 * una página de otro. Se queda la ruta; el origen se descarta.
 */
export function destinoSeguro(continuar, origen) {
  if (!continuar) return null;
  try {
    const u = new URL(continuar, origen);
    if (u.origin !== origen) return null;
    return u.pathname + u.search + u.hash;
  } catch { return null; }
}

/**
 * Qué salió mal, en palabras.
 *
 * Firebase distingue entre un código caducado y uno que no vale, pero
 * para quien lo lee son lo mismo salvo en una cosa: si venció, pedir
 * otro sirve; si no vale, no. Por eso «usado» y «vencido» se separan y
 * todo lo demás cae en «roto».
 *
 * `auth/invalid-action-code` es el caso raro y el más común a la vez:
 * Gmail y Outlook abren los enlaces solos para revisarlos, así que
 * mucha gente llega a uno ya consumido sin haber hecho nada. Decirle
 * «el enlace no es válido» a quien acaba de pulsarlo por primera vez
 * es acusarlo de algo que no hizo.
 */
export function porQueFallo(codigoDeError) {
  switch (codigoDeError) {
    case "auth/expired-action-code": return "vencido";
    case "auth/invalid-action-code": return "usado";
    case "auth/user-disabled":
    case "auth/user-not-found":      return "sin-cuenta";
    case "auth/weak-password":       return "floja";
    default:                         return "roto";
  }
}

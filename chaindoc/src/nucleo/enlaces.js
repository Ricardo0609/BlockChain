// Enlaces como evidencia.
//
// Hay entregables que no son un archivo: un sitio web publicado, un
// repositorio, un tablero. Hasta ahora había que subir una captura, que
// prueba menos que la dirección misma.
//
// Lo que un enlace prueba, y lo que NO:
//   - SÍ prueba qué dirección se entregó y en qué fecha. Eso queda en la
//     cadena como cualquier otro bloque y ya no se puede cambiar.
//   - NO prueba qué hay en esa dirección hoy. El dueño del sitio puede
//     cambiarlo o bajarlo mañana. Por eso la huella se calcula sobre el
//     texto de la dirección y la interfaz lo dice con todas sus letras,
//     en vez de enseñar un SHA-256 que parezca decir más de lo que dice.
//
// Esta misma regla vive en functions/lib/enlaces.js, porque el servidor
// no puede importar de src y es él quien decide de verdad. Si cambias
// una, cambia la otra: pruebas/enlaces.test.js compara las dos.

/** Lo único que se acepta. Todo lo demás es una vía de ataque, no un enlace. */
export const ESQUEMAS = ["http:", "https:"];
export const MAX_URL = 2048;

/** Prefijo del texto que se firma, para que una huella no se pueda confundir con otra cosa. */
export const PREFIJO_ENLACE = "chaindoc-enlace/1\n";

/**
 * Deja la dirección en su forma canónica, o explica por qué no sirve.
 * Devuelve { ok:true, url, host } o { ok:false, error }.
 */
export function normalizarEnlace(texto){
  const crudo = String(texto ?? "").trim();
  if(!crudo) return { ok:false, error:"Escribe una dirección." };
  if(crudo.length > MAX_URL) return { ok:false, error:"La dirección es demasiado larga." };

  // Nadie teclea «https://» a mano. Si no trae esquema, se asume https.
  // Ojo: esto NO rescata un «javascript:», que sí trae esquema y por eso
  // cae en la revisión de abajo en vez de volverse una dirección válida.
  const traeEsquema = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(crudo);
  let u;
  try{ u = new URL(traeEsquema ? crudo : `https://${crudo}`); }
  catch{ return { ok:false, error:"Eso no parece una dirección válida." }; }

  if(!ESQUEMAS.includes(u.protocol)){
    return { ok:false, error:"Sólo se aceptan direcciones que empiecen con http:// o https://." };
  }
  if(!u.hostname || !u.hostname.includes(".")){
    return { ok:false, error:"Falta el dominio. Por ejemplo: midominio.com/mi-pagina" };
  }
  if(u.href.length > MAX_URL) return { ok:false, error:"La dirección es demasiado larga." };

  return { ok:true, url:u.href, host:u.hostname.replace(/^www\./i, "") };
}

/** El nombre que se enseña cuando quien lo entrega no puso ninguno. */
export function nombreDeEnlace(nombre, host){
  const limpio = String(nombre ?? "").trim().slice(0, 120);
  return limpio || host || "enlace";
}

/** El texto exacto del que sale la huella. Igual en el cliente y en el servidor. */
export const textoFirmado = (url) => `${PREFIJO_ENLACE}${url}`;

/** Un enlace de evidencia se reconoce por esto, no por tener `url`. */
export const esEnlace = (a) => a?.origen === "enlace";

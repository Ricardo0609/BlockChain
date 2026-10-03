// ─────────────────────────────────────────────────────────────
// anclaje.js — Sellado de tiempo en Bitcoin (OpenTimestamps)
//
// EL PROBLEMA QUE RESUELVE
//
// Hasta aquí, la fecha de cada bloque la pone nuestro servidor. Eso
// basta para organizarse, pero no para discutir: si alguien pregunta
// «¿y quién dice que eso fue el 17 de septiembre?», la única respuesta
// es «lo dice mi servidor», y el servidor lo controlamos nosotros.
//
// El anclaje cambia la respuesta. Una vez al día se toma un solo hash
// que resume todos los bloques del día y se publica en la cadena de
// Bitcoin, a través de OpenTimestamps. Nadie puede reescribir Bitcoin
// —nosotros tampoco— así que a partir de ahí la fecha la sostiene una
// red independiente, no nuestra palabra.
//
// POR QUÉ UN ÁRBOL Y NO UN SELLO POR BLOQUE
//
// Sellar cada bloque por separado sería una petición por bloque a los
// calendarios. Con un árbol de Merkle se manda UNA sola raíz y cada
// bloque conserva su camino hasta ella: unos pocos hashes. El tercero
// recorre ese camino, llega a la raíz, y comprueba la raíz contra
// Bitcoin. Es gratis y escala.
//
// POR QUÉ ESTÁ ESCRITO A MANO
//
// La librería oficial de JavaScript arrastra 35 MB de dependencias,
// entre ellas `web3@0.18` y `request`, archivado desde 2020. Eso no
// entra al único lugar que escribe la cadena. El formato .ots está
// documentado y es pequeño, así que se implementa aquí y se comprueba
// contra el cliente oficial de Python, que es una implementación
// independiente: si los dos coinciden, el formato está bien.
//
// Lo que sale de aquí lo verifica cualquiera con las herramientas
// estándar, sin chaindoc y sin confiar en nosotros:
//
//     ots verify -d <hash del bloque> bloque.ots
//
// ─────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";

// ── Constantes del formato ────────────────────────────────────

/** Cabecera de un archivo .ots suelto (31 bytes). */
export const CABECERA = new Uint8Array([
  0x00,
  ...[..."OpenTimestamps"].map((c) => c.charCodeAt(0)),
  0x00, 0x00,
  ...[..."Proof"].map((c) => c.charCodeAt(0)),
  0x00,
  0xbf, 0x89, 0xe2, 0xe8, 0x84, 0xe8, 0x92, 0x94,
]);

export const VERSION = 1;

/** Operaciones. Sólo se usan estas tres; el formato define más. */
export const OP = {
  SHA256:  0x08,
  APPEND:  0xf0,
  PREPEND: 0xf1,
};

/** Marcas de estructura. */
export const BIFURCACION = 0xff;   // hay más de una rama a partir de aquí
export const ATESTACION  = 0x00;   // lo que sigue es una atestación

/** Etiquetas de atestación (8 bytes cada una). */
export const ETIQUETA = {
  // «un calendario se comprometió a incluir esto»; todavía no está en Bitcoin
  PENDIENTE: new Uint8Array([0x83, 0xdf, 0xe3, 0x0d, 0x2e, 0xf9, 0x0c, 0x8e]),
  // «esto está en la raíz de Merkle del bloque N de Bitcoin»
  BITCOIN:   new Uint8Array([0x05, 0x88, 0x96, 0x0d, 0x73, 0xd7, 0x19, 0x01]),
};

/** Calendarios públicos y gratuitos. Se mandan a todos: si uno se cae,
 *  los otros sostienen la prueba. */
export const CALENDARIOS = [
  "https://alice.btc.calendar.opentimestamps.org",
  "https://bob.btc.calendar.opentimestamps.org",
  "https://finney.calendar.eternitywall.com",
];

// ── Utilidades de bytes ───────────────────────────────────────

export const hex = (bytes) =>
  [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

export function deHex(texto){
  const limpio = String(texto || "").trim().toLowerCase();
  if(!/^[0-9a-f]*$/.test(limpio) || limpio.length % 2) {
    throw new Error("hex-invalido");
  }
  const salida = new Uint8Array(limpio.length / 2);
  for(let i = 0; i < salida.length; i++){
    salida[i] = parseInt(limpio.substr(i * 2, 2), 16);
  }
  return salida;
}

export const unir = (...trozos) => {
  const total = trozos.reduce((n, t) => n + t.length, 0);
  const salida = new Uint8Array(total);
  let i = 0;
  for(const t of trozos){ salida.set(t, i); i += t.length; }
  return salida;
};

export const iguales = (a, b) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

export const sha256 = (bytes) =>
  new Uint8Array(createHash("sha256").update(Buffer.from(bytes)).digest());

/** Entero de longitud variable, 7 bits por byte (el mismo de LEB128). */
export function varuint(n){
  if(!Number.isInteger(n) || n < 0) throw new Error("varuint-invalido");
  const salida = [];
  do {
    let b = n & 0x7f;
    n = Math.floor(n / 128);
    if(n > 0) b |= 0x80;
    salida.push(b);
  } while(n > 0);
  return new Uint8Array(salida);
}

/** Bloque de bytes precedido por su longitud. */
export const varbytes = (bytes) => unir(varuint(bytes.length), bytes);

// ── Lector secuencial ─────────────────────────────────────────

export function lector(bytes){
  let i = 0;
  return {
    get pos(){ return i; },
    get resto(){ return bytes.length - i; },
    fin(){ return i >= bytes.length; },
    byte(){
      if(i >= bytes.length) throw new Error("ots-truncado");
      return bytes[i++];
    },
    tomar(n){
      if(i + n > bytes.length) throw new Error("ots-truncado");
      const t = bytes.slice(i, i + n); i += n; return t;
    },
    varuint(){
      let valor = 0, turno = 0;
      for(;;){
        const b = this.byte();
        valor += (b & 0x7f) * Math.pow(2, turno);
        if(!(b & 0x80)) return valor;
        turno += 7;
        if(turno > 63) throw new Error("varuint-demasiado-grande");
      }
    },
    varbytes(){ return this.tomar(this.varuint()); },
  };
}

// ── Árbol de Merkle ───────────────────────────────────────────

/**
 * Arma el árbol sobre las hojas y devuelve la raíz y el camino de cada
 * hoja hasta ella.
 *
 * La combinación es la de OpenTimestamps: el padre es
 * `sha256(izquierda ++ derecha)`. Por eso cada paso del camino se
 * expresa con las operaciones del propio formato —añadir el hermano de
 * la derecha, o anteponer el de la izquierda, y luego sha256—, lo que
 * hace que la prueba de cada hoja sea un .ots legítimo y completo, sin
 * nada inventado por nosotros.
 *
 * Si un nivel tiene un número impar de nodos, el que sobra sube al
 * siguiente nivel tal cual. No se duplica: duplicar crearía dos árboles
 * distintos con la misma raíz, que es un problema conocido y evitable.
 */
export function arbolMerkle(hojas){
  if(!Array.isArray(hojas) || hojas.length === 0){
    throw new Error("sin-hojas");
  }
  const rutas = hojas.map(() => []);
  // Qué hojas cuelgan de cada nodo del nivel actual, para poder
  // apuntarles el paso que les toca.
  let nivel = hojas.map((h, i) => ({ hash: h, hojas: [i] }));

  while(nivel.length > 1){
    const siguiente = [];
    for(let i = 0; i < nivel.length; i += 2){
      const izq = nivel[i];
      const der = nivel[i + 1];
      if(!der){ siguiente.push(izq); continue; }   // impar: sube tal cual

      for(const h of izq.hojas) rutas[h].push({ op: "append",  dato: der.hash });
      for(const h of der.hojas) rutas[h].push({ op: "prepend", dato: izq.hash });

      siguiente.push({
        hash: sha256(unir(izq.hash, der.hash)),
        hojas: [...izq.hojas, ...der.hojas],
      });
    }
    nivel = siguiente;
  }

  return { raiz: nivel[0].hash, rutas };
}

/** Recorre un camino desde una hoja y devuelve a dónde llega. */
export function seguirRuta(hoja, ruta){
  let actual = hoja;
  for(const paso of ruta){
    actual = paso.op === "append"
      ? sha256(unir(actual, paso.dato))
      : sha256(unir(paso.dato, actual));
  }
  return actual;
}

// ── Serialización ─────────────────────────────────────────────

/** Los pasos del camino, como operaciones del formato. */
export function serializarRuta(ruta){
  const trozos = [];
  for(const paso of ruta){
    trozos.push(new Uint8Array([paso.op === "append" ? OP.APPEND : OP.PREPEND]));
    trozos.push(varbytes(paso.dato));
    trozos.push(new Uint8Array([OP.SHA256]));
  }
  return unir(...trozos);
}

export const atestacionPendiente = (uri) => unir(
  new Uint8Array([ATESTACION]),
  ETIQUETA.PENDIENTE,
  varbytes(varbytes(new TextEncoder().encode(uri))),
);

export const atestacionBitcoin = (altura) => unir(
  new Uint8Array([ATESTACION]),
  ETIQUETA.BITCOIN,
  varbytes(varuint(altura)),
);

/**
 * Une varias ramas que parten del mismo punto. El formato marca con
 * 0xff todas menos la última.
 */
export function unirRamas(ramas){
  const vivas = ramas.filter((r) => r && r.length);
  if(vivas.length === 0) throw new Error("sin-ramas");
  if(vivas.length === 1) return vivas[0];
  const trozos = [];
  vivas.forEach((r, i) => {
    if(i < vivas.length - 1) trozos.push(new Uint8Array([BIFURCACION]));
    trozos.push(r);
  });
  return unir(...trozos);
}

/**
 * Arma el archivo .ots de una hoja: la cabecera, el hash de la hoja,
 * su camino hasta la raíz, y lo que los calendarios dijeron de la raíz.
 *
 * @param {Uint8Array} hoja   el hash del bloque (32 bytes)
 * @param {Array}      ruta   pasos hasta la raíz
 * @param {Uint8Array} pruebaRaiz  serialización de lo que cuelga de la raíz
 */
export function armarOts(hoja, ruta, pruebaRaiz){
  if(hoja.length !== 32) throw new Error("hoja-no-es-sha256");
  return unir(
    CABECERA,
    varuint(VERSION),
    new Uint8Array([OP.SHA256]),   // la hoja ES un sha256
    hoja,
    serializarRuta(ruta),
    pruebaRaiz,
  );
}

// ── Lectura ───────────────────────────────────────────────────

/**
 * Lee un .ots y devuelve el hash al que se refiere y todas las
 * atestaciones que encuentra, cada una con el mensaje al que aplica
 * —que es justo lo que hace falta para pedirle al calendario la
 * versión actualizada.
 */
export function leerOts(bytes){
  const r = lector(bytes);
  const cab = r.tomar(CABECERA.length);
  if(!iguales(cab, CABECERA)) throw new Error("no-es-ots");
  const version = r.varuint();
  if(version !== VERSION) throw new Error(`ots-version-${version}`);
  const opArchivo = r.byte();
  if(opArchivo !== OP.SHA256) throw new Error("ots-no-sha256");
  const digest = r.tomar(32);

  const atestaciones = [];
  recorrer(r, digest, atestaciones);
  return { digest, atestaciones };
}

/** Recorre una rama aplicando las operaciones y juntando atestaciones. */
function recorrer(r, mensaje, salida){
  for(;;){
    if(r.fin()) return;
    const marca = r.byte();

    if(marca === BIFURCACION){
      // Las ramas comparten el mensaje de este punto.
      recorrer(r, mensaje, salida);
      continue;
    }

    if(marca === ATESTACION){
      const etiqueta = r.tomar(8);
      const carga = r.varbytes();
      if(iguales(etiqueta, ETIQUETA.PENDIENTE)){
        const interno = lector(carga);
        salida.push({
          tipo: "pendiente",
          uri: new TextDecoder().decode(interno.varbytes()),
          mensaje,
        });
      } else if(iguales(etiqueta, ETIQUETA.BITCOIN)){
        salida.push({
          tipo: "bitcoin",
          altura: lector(carga).varuint(),
          mensaje,
        });
      } else {
        salida.push({ tipo: "desconocida", etiqueta: hex(etiqueta), mensaje });
      }
      return;   // una atestación cierra su rama
    }

    if(marca === OP.SHA256){ mensaje = sha256(mensaje); continue; }
    if(marca === OP.APPEND){ mensaje = unir(mensaje, r.varbytes()); continue; }
    if(marca === OP.PREPEND){ mensaje = unir(r.varbytes(), mensaje); continue; }

    throw new Error(`ots-operacion-desconocida-0x${marca.toString(16)}`);
  }
}

/** ¿Ya está en Bitcoin, o los calendarios apenas lo prometieron? */
export function estadoDe(bytes){
  const { atestaciones } = leerOts(bytes);
  const enBitcoin = atestaciones.filter((a) => a.tipo === "bitcoin");
  return {
    confirmado: enBitcoin.length > 0,
    altura: enBitcoin.length ? Math.min(...enBitcoin.map((a) => a.altura)) : null,
    calendarios: atestaciones.filter((a) => a.tipo === "pendiente").map((a) => a.uri),
  };
}

// ── Calendarios ───────────────────────────────────────────────

const CABECERAS = { Accept: "application/vnd.opentimestamps.v1" };

/**
 * Le manda la raíz a un calendario y devuelve lo que responde: la
 * serialización de lo que cuelga de esa raíz, lista para pegarse
 * detrás del camino de cada hoja.
 *
 * `fetchImpl` se inyecta para poder probar sin red.
 */
export async function sellarEn(url, raiz, { fetchImpl = fetch, timeoutMs = 10000 } = {}){
  const corte = AbortSignal.timeout(timeoutMs);
  const res = await fetchImpl(`${url}/digest`, {
    method: "POST",
    headers: { ...CABECERAS, "Content-Type": "application/x-www-form-urlencoded" },
    body: Buffer.from(raiz),
    signal: corte,
  });
  if(!res.ok) throw new Error(`calendario-${res.status}`);
  const cuerpo = new Uint8Array(await res.arrayBuffer());
  if(!cuerpo.length) throw new Error("calendario-vacio");
  return cuerpo;
}

/**
 * Manda la raíz a varios calendarios a la vez y une lo que contesten.
 * Con que uno responda alcanza para tener prueba; los demás son
 * respaldo por si ese calendario desaparece algún día.
 */
export async function sellarRaiz(raiz, { calendarios = CALENDARIOS, fetchImpl = fetch, timeoutMs = 10000 } = {}){
  const intentos = await Promise.allSettled(
    calendarios.map((c) => sellarEn(c, raiz, { fetchImpl, timeoutMs })),
  );
  const ramas = [];
  const fallos = [];
  intentos.forEach((r, i) => {
    if(r.status === "fulfilled") ramas.push(r.value);
    else fallos.push({ calendario: calendarios[i], error: String(r.reason?.message || r.reason) });
  });
  if(!ramas.length){
    const e = new Error("ningun-calendario-respondio");
    e.fallos = fallos;
    throw e;
  }
  return { prueba: unirRamas(ramas), respondieron: ramas.length, fallos };
}

/**
 * Le pregunta al calendario si lo que prometió ya entró a Bitcoin. Los
 * calendarios tardan entre unas horas y un día: no es un fallo, es
 * cómo funciona. Devuelve null si todavía no.
 */
export async function pedirActualizacion(uri, mensaje, { fetchImpl = fetch, timeoutMs = 10000 } = {}){
  const res = await fetchImpl(`${uri}/timestamp/${hex(mensaje)}`, {
    headers: CABECERAS,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if(res.status === 404) return null;            // aún no
  if(!res.ok) throw new Error(`calendario-${res.status}`);
  const cuerpo = new Uint8Array(await res.arrayBuffer());
  return cuerpo.length ? cuerpo : null;
}

/**
 * Intenta convertir una prueba pendiente en una confirmada en Bitcoin.
 * Devuelve el .ots nuevo, o null si ningún calendario lo tiene todavía.
 *
 * Se reemplaza la prueba entera en vez de parcharla: es más simple de
 * razonar, y la prueba vieja no aporta nada que la nueva no tenga.
 */
export async function actualizarOts(bytes, { fetchImpl = fetch, timeoutMs = 10000 } = {}){
  const { atestaciones } = leerOts(bytes);
  if(atestaciones.some((a) => a.tipo === "bitcoin")) return null;   // ya estaba

  const pendientes = atestaciones.filter((a) => a.tipo === "pendiente");
  for(const p of pendientes){
    let nueva;
    try{
      nueva = await pedirActualizacion(p.uri, p.mensaje, { fetchImpl, timeoutMs });
    }catch{ continue; }
    if(!nueva) continue;

    // La respuesta cuelga del mensaje de ESA atestación, así que hay
    // que volver a armar el archivo desde la hoja hasta ese punto.
    const prefijo = cortarHasta(bytes, p.mensaje);
    if(!prefijo) continue;
    const candidato = unir(prefijo, nueva);
    try{
      if(estadoDe(candidato).confirmado) return candidato;
    }catch{ /* si no se puede leer, se descarta */ }
  }
  return null;
}

/**
 * Devuelve el archivo recortado justo antes de la atestación cuyo
 * mensaje es `objetivo`: la cabecera, la hoja y las operaciones que
 * llevan hasta ahí, sin lo que venía después.
 */
export function cortarHasta(bytes, objetivo){
  const r = lector(bytes);
  r.tomar(CABECERA.length);
  r.varuint();
  r.byte();
  let mensaje = r.tomar(32);
  if(iguales(mensaje, objetivo)) return bytes.slice(0, r.pos);

  // Sólo se sigue la rama principal: las operaciones que llevan de la
  // hoja a la raíz son las mismas para todas las ramas.
  for(;;){
    if(r.fin()) return null;
    const antes = r.pos;
    const marca = r.byte();
    if(marca === BIFURCACION || marca === ATESTACION) return null;
    if(marca === OP.SHA256) mensaje = sha256(mensaje);
    else if(marca === OP.APPEND) mensaje = unir(mensaje, r.varbytes());
    else if(marca === OP.PREPEND) mensaje = unir(r.varbytes(), mensaje);
    else return null;
    if(iguales(mensaje, objetivo)) return bytes.slice(0, r.pos);
    if(r.pos === antes) return null;
  }
}

// ── Lo que se guarda ──────────────────────────────────────────

/** Nombre del anclaje a partir de la fecha: uno por día. */
export const idDeAnclaje = (fecha = new Date()) =>
  fecha.toISOString().slice(0, 10);

/**
 * Deja el registro listo para guardar. Las hojas van en orden y ese
 * orden es lo que permite reconstruir el camino de cualquiera de
 * ellas más adelante, sin guardar un archivo por bloque.
 */
export function armarRegistro({ hojas, raiz, prueba, ahora = new Date(), fallos = [] }){
  return {
    id: idDeAnclaje(ahora),
    hojas: hojas.map(hex),
    raiz: hex(raiz),
    ots: Buffer.from(prueba).toString("base64"),
    estado: "pendiente",
    altura: null,
    creadoEn: ahora.toISOString(),
    confirmadoEn: null,
    calendariosFallidos: fallos,
  };
}

/** Reconstruye el .ots de una hoja concreta a partir del registro. */
export function otsDeHoja(registro, hashHoja){
  const i = (registro.hojas || []).indexOf(String(hashHoja).toLowerCase());
  if(i < 0) return null;
  const hojas = registro.hojas.map(deHex);
  const { raiz, rutas } = arbolMerkle(hojas);
  if(hex(raiz) !== registro.raiz) throw new Error("raiz-no-coincide");
  const prueba = new Uint8Array(Buffer.from(registro.ots, "base64"));
  // Se le quita a la prueba guardada su propia cabecera y hoja: aquí
  // sólo interesa lo que cuelga de la raíz.
  return armarOts(hojas[i], rutas[i], soloLoQueCuelga(prueba, raiz));
}

/** De un .ots de la raíz, se queda con lo que va después de la raíz. */
export function soloLoQueCuelga(prueba, raiz){
  // Si lo guardado es la respuesta cruda del calendario, ya es eso.
  if(prueba.length < CABECERA.length || !iguales(prueba.slice(0, CABECERA.length), CABECERA)){
    return prueba;
  }
  const r = lector(prueba);
  r.tomar(CABECERA.length); r.varuint(); r.byte();
  const hoja = r.tomar(32);
  if(!iguales(hoja, raiz)) throw new Error("prueba-no-es-de-esta-raiz");
  return prueba.slice(r.pos);
}
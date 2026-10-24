// ─────────────────────────────────────────────────────────────
// acuerdo.js — Los estados de un contrato con doble firma
//
// LA COPIA DEL SERVIDOR. Es la que decide de verdad: el navegador
// tiene la suya para no enseñar botones que van a fallar, pero quien
// manda es esta.
//
// De la marca en adelante es idéntica, byte a byte, a
// `src/nucleo/acuerdo.js`, y hay una prueba que lo comprueba. Si
// cambias una, cambia la otra.
// ─────────────────────────────────────────────────────────────

/** Los estados por los que pasa un acuerdo. El orden es el camino normal. */
export const ESTADOS = [
  "borrador",
  "en_firma",
  "vigente",
  "entregado",
  "cerrado",
  // salidas
  "rechazado",
  "sin_firmar",
  "sin_respuesta",
];

/** Cómo se le dice a cada estado en pantalla. Sin jerga. */
export const ETIQUETA = {
  borrador:      "Borrador",
  en_firma:      "Esperando firma",
  vigente:       "Vigente",
  entregado:     "Entregado · esperando conformidad",
  cerrado:       "Cerrado",
  rechazado:     "No aceptado",
  sin_firmar:    "Nunca se firmó",
  sin_respuesta: "Entregado · sin respuesta",
};

/** Para pintarlo: neutro, en espera, bien, mal. */
export const TONO = {
  borrador:      "neutro",
  en_firma:      "espera",
  vigente:       "bien",
  entregado:     "espera",
  cerrado:       "bien",
  rechazado:     "mal",
  sin_firmar:    "espera",
  sin_respuesta: "espera",
};

/**
 * Los plazos, en días. Un solo sitio para cambiarlos.
 *
 * Son el valor de arranque: un contrato puede traer los suyos en
 * `acuerdo.plazos`, que es lo que permite que una obra de seis meses
 * y un trabajo de dos días no compartan el mismo reloj.
 */
export const PLAZOS = {
  recordatorios: [3, 7],   // días tras pedir algo, para insistir
  silencio: 14,            // días sin respuesta antes de darla por no contestada
};

/**
 * Cuánto pesa una firma. De menos a más.
 *
 * Que existan tres no es un defecto: es lo que permite que alguien sin
 * cuenta acepte un contrato en treinta segundos. Lo que no se vale es
 * enseñarlas como si fueran la misma, y por eso están ordenadas.
 */
export const FUERZAS = ["enlace", "cuenta", "efirma"];

export const FUERZA_TEXTO = {
  enlace: "Firmó desde el enlace que se le envió",
  cuenta: "Firmó desde su cuenta",
  efirma: "Firmó con su e.firma del SAT",
};

/** Las dos partes de un acuerdo. */
export const PARTES = ["emisor", "receptor"];

/** Los dos momentos en que se firma. */
export const MOMENTOS = ["aceptacion", "conformidad"];

const ES_ARREGLO = (v) => Array.isArray(v) ? v : [];

/** Las firmas registradas en el acuerdo, sin las malformadas. */
export const firmasDe = (exp) =>
  ES_ARREGLO(exp?.acuerdo?.firmas).filter(
    (f) => PARTES.includes(f?.parte) && MOMENTOS.includes(f?.momento));

/** La firma de una parte en un momento, o null. */
export const firmaDe = (exp, parte, momento) =>
  firmasDe(exp).find((f) => f.parte === parte && f.momento === momento) || null;

/** Si las dos partes firmaron ese momento. */
export const firmaronLasDos = (exp, momento) =>
  PARTES.every((p) => Boolean(firmaDe(exp, p, momento)));

/**
 * Los plazos de este contrato, con los de arranque donde falten.
 *
 * Un plazo de cero o negativo no se respeta: sería un recordatorio que
 * se manda antes de pedir nada, o un silencio que vence al instante.
 */
export function plazosDe(exp) {
  const p = exp?.acuerdo?.plazos || {};
  const dias = ES_ARREGLO(p.recordatorios)
    .map((n) => Math.trunc(Number(n)))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  const silencio = Math.trunc(Number(p.silencio));
  return {
    recordatorios: dias.length ? dias : PLAZOS.recordatorios,
    silencio: Number.isFinite(silencio) && silencio > 0 ? silencio : PLAZOS.silencio,
  };
}

/** Días completos entre dos fechas. Negativo si `b` es anterior. */
export function diasEntre(a, b) {
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return Math.floor((tb - ta) / 86400000);
}

/**
 * El estado de un acuerdo, derivado de lo que pasó.
 *
 * Sólo mira el acuerdo y el calendario. No mira si los requisitos
 * están cumplidos a propósito: lo entregado cambia cada vez que
 * alguien sube un archivo, y el estado de un contrato no puede
 * moverse solo por eso.
 */
export function estadoAcuerdo(exp, { hoy = new Date() } = {}) {
  const a = exp?.acuerdo || null;
  const plazos = plazosDe(exp);

  // Sin acuerdo no hay doble firma: es un expediente de los de antes.
  if (!a || !a.pedidoEn) {
    return armar("borrador", { exp, plazos, hoy, sinAcuerdo: true });
  }

  // El rechazo manda sobre todo lo demás mientras no se vuelva a pedir.
  if (a.rechazo && !esPosterior(a.rechazo.fecha, a.pedidoEn)) {
    return armar("rechazado", { exp, plazos, hoy });
  }

  const aceptoEmisor = Boolean(firmaDe(exp, "emisor", "aceptacion"));
  const aceptoReceptor = Boolean(firmaDe(exp, "receptor", "aceptacion"));

  if (!aceptoEmisor) return armar("borrador", { exp, plazos, hoy });

  if (!aceptoReceptor) {
    // ← ARREGLADO (20 oct): la ventana para firmar la cierra el
    // SILENCIO, no la fecha límite del contrato. Eran dos relojes
    // metidos en uno.
    //
    // `fechaLimite` es cuándo hay que ENTREGAR el trabajo, y la saca
    // la IA del texto del contrato. Usarla aquí hacía que un contrato
    // con la fecha de entrega ya pasada naciera «sin_firmar» en el
    // mismo instante de mandarlo: el destinatario lo abría y se iba
    // derecho al expediente sin que nadie le pidiera firmar, y el
    // emisor no tenía ni cómo saber por qué.
    //
    // Que la entrega vaya tarde es asunto de las partes y lo dice el
    // expediente. No es motivo para que el contrato sea infirmable.
    const esperando = diasEntre(a.pedidoEn, hoy);
    const vencido = esperando != null && esperando > plazos.silencio;
    return armar(vencido ? "sin_firmar" : "en_firma", { exp, plazos, hoy });
  }

  // Aceptado por las dos partes.
  //
  // ← ACTUALIZADO (18 oct): un contrato sin conformidad NO se cierra
  // solo al estar todo entregado. Lo intenté así y cerraba la puerta
  // por dentro: «entregado todo» lo decide la lista de requisitos, y
  // en cuanto cuadraba ya no se podía adjuntar nada más — ni la
  // segunda factura del mismo requisito, ni la corrección de la
  // primera. Cierra quien lo mandó, cuando lo da por terminado.
  if (a.cerradoEn) return armar("cerrado", { exp, plazos, hoy });

  if (!a.requiereConformidad) {
    return armar("vigente", { exp, plazos, hoy });
  }

  if (firmaronLasDos(exp, "conformidad")) {
    return armar("cerrado", { exp, plazos, hoy });
  }

  if (!a.conformidadPedidaEn) {
    return armar("vigente", { exp, plazos, hoy });
  }

  const callado = diasEntre(a.conformidadPedidaEn, hoy);
  if (callado != null && callado >= plazos.silencio) {
    return armar("sin_respuesta", { exp, plazos, hoy });
  }
  return armar("entregado", { exp, plazos, hoy });
}

/** Rellena los datos que acompañan al estado. */
function armar(estado, { exp, plazos, hoy, sinAcuerdo = false }) {
  const a = exp?.acuerdo || {};
  const desde = estado === "entregado" || estado === "sin_respuesta"
    ? a.conformidadPedidaEn
    : a.pedidoEn;
  const esperando = desde ? diasEntre(desde, hoy) : null;

  return {
    estado,
    etiqueta: ETIQUETA[estado],
    tono: TONO[estado],
    sinAcuerdo,
    aceptoEmisor: Boolean(firmaDe(exp, "emisor", "aceptacion")),
    aceptoReceptor: Boolean(firmaDe(exp, "receptor", "aceptacion")),
    conformidadEmisor: Boolean(firmaDe(exp, "emisor", "conformidad")),
    conformidadReceptor: Boolean(firmaDe(exp, "receptor", "conformidad")),
    rechazo: a.rechazo || null,
    paraEmail: a.paraEmail || null,
    paraNombre: a.paraNombre || null,
    diasEsperando: esperando,
    plazos,
    // Cuándo toca insistir; null cuando no hay nada que esperar.
    proximoRecordatorio: esperaRespuesta(estado) && esperando != null
      ? plazos.recordatorios.find((d) => d > esperando) ?? null
      : null,
  };
}

/** Los estados en los que se está esperando a que alguien conteste. */
export const esperaRespuesta = (estado) =>
  estado === "en_firma" || estado === "entregado";

/** Si `b` es estrictamente posterior a `a`. Fechas inválidas: no. */
function esPosterior(a, b) {
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  return Number.isFinite(ta) && Number.isFinite(tb) && tb > ta;
}

/**
 * Qué deja hacer cada estado, al margen de quién seas.
 *
 * El permiso final es esto Y el del rol: el dueño de un contrato en
 * firma tampoco puede editarlo, y ahí está el valor de la firma. Si
 * el dueño pudiera cambiar lo firmado, la firma no diría nada.
 */
export const ACCIONES_POR_ESTADO = {
  borrador:      ["editar", "poner-en-firme", "borrar"],
  en_firma:      ["aceptar", "rechazar", "retirar-envio"],
  vigente:       ["subir", "vincular", "retirar", "pedir-conformidad", "cerrar"],
  entregado:     ["subir", "vincular", "retirar", "dar-conformidad", "reportar-faltante"],
  cerrado:       [],
  rechazado:     ["editar", "poner-en-firme", "borrar"],
  sin_firmar:    ["editar", "poner-en-firme", "borrar"],
  sin_respuesta: ["pedir-conformidad", "dar-conformidad"],
};

/** Lo que se puede hacer siempre, pase lo que pase. */
export const SIEMPRE = ["ver", "exportar"];

export const permiteEstado = (estado, accion) =>
  SIEMPRE.includes(accion) ||
  (ACCIONES_POR_ESTADO[estado] || []).includes(accion);

/**
 * El permiso de rol que hace falta para cada acción nueva.
 *
 * Se apoya en la tabla que ya existe (`accesos.js`) en vez de inventar
 * otra: así no hay dos sitios que puedan decir cosas distintas sobre
 * quién puede qué.
 */
export const PERMISO_DE_ACCION = {
  editar: "editar",
  "poner-en-firme": "editar",
  borrar: "borrar",
  aceptar: "aprobar",
  rechazar: "aprobar",
  "retirar-envio": "editar",
  subir: "subir",
  retirar: "retirar",
  "pedir-conformidad": "pedir",
  cerrar: "editar",
  "dar-conformidad": "aprobar",
  "reportar-faltante": "aprobar",
  ver: "ver",
  exportar: "exportar",
};

/**
 * ¿Puede esta persona hacer esto, ahora?
 *
 * `tienePermiso` es la mitad del rol —se le pasa `puede(rol, …)` de
 * accesos.js— y aquí se le suma la mitad del estado. Quien firma sin
 * cuenta no pasa por aquí: ese entra por su enlace de invitación, que
 * tiene su propia puerta.
 */
/**
 * Las acciones que el estado gobierna de verdad.
 *
 * El resto —firmar, compartir, pedir, proteger— pasan de largo: las
 * decide el rol y nada más. Sin esta lista, meter el estado dentro de
 * `exigir` bloquearía todo lo que no estuviera en la tabla, que es
 * casi todo.
 *
 * «borrar» queda fuera a propósito y está anotado como pendiente:
 * borrar un contrato que las dos partes firmaron destruye la prueba
 * de las dos, pero sin un archivar que lo sustituya, prohibirlo deja
 * a la gente sin salida.
 */
// ← ACTUALIZADO (23 oct): entra «vincular». Adjuntar un documento
// como evidencia es ENTREGAR, igual que subir un archivo, y se
// escapaba del estado: a un contrato que nadie habia firmado todavia
// no se le podia subir un PDF, pero si colgarle un documento. Dos
// puertas al mismo cuarto otra vez, y una sin cerradura.
export const GOBERNADAS = ["editar", "subir", "vincular", "retirar"];

/** Si el estado impide esta acción, al margen del rol. */
export const estadoBloquea = (estado, accion) =>
  GOBERNADAS.includes(accion) && !permiteEstado(estado, accion);

/**
 * Si este correo es el de la persona a la que se le mandó a firmar.
 *
 * Esta es LA regla de quién puede aceptar o rechazar, y vale tanto en
 * el servidor como en la pantalla. El rol no entra: un editor que es
 * el destinatario puede firmar, y un aprobador que no lo es, no.
 *
 * Se puede confiar en el correo porque `paraEmail` lo escribe el
 * servidor al poner el contrato en firme y el acuerdo no está entre
 * los campos editables: nadie puede ponerse de destinatario.
 */
export function esDestinatario(exp, email) {
  const para = (exp?.acuerdo?.paraEmail || "").toLowerCase().trim();
  const mio = String(email || "").toLowerCase().trim();
  return Boolean(para && mio && para === mio);
}

/** Si este contrato está esperando la firma de esta persona. */
export const esperaFirmaDe = (exp, email, hoy = new Date()) =>
  estadoAcuerdo(exp, { hoy }).estado === "en_firma" && esDestinatario(exp, email);

/**
 * Si a esta persona le toca decidir sobre este contrato, y en qué punto.
 *
 * Devuelve "pendiente" si todavía tiene que leerlo y contestar,
 * "rechazado" si ya dijo que no, y null si no es asunto suyo —porque
 * no es el destinatario, porque ya lo aceptó, o porque el contrato
 * siguió su camino.
 *
 * De esto depende a qué pantalla va al abrir el contrato: mientras
 * tenga algo que decidir, lo primero es el contrato, no el expediente.
 * Se deriva del estado y no de un «ya lo vio» guardado, que se
 * desincroniza en cuanto cambia de dispositivo.
 */
export function decideAhora(exp, email, hoy = new Date()) {
  if (!esDestinatario(exp, email)) return null;
  const { estado } = estadoAcuerdo(exp, { hoy });
  if (estado === "en_firma") return "pendiente";
  if (estado === "rechazado") return "rechazado";
  return null;
}

/** Si este documento está gobernado por la doble firma. */
export const tieneAcuerdo = (exp) => Boolean(exp?.acuerdo?.pedidoEn);

/**
 * La puerta de verdad: el estado sólo manda donde hay acuerdo.
 *
 * Sin esta comprobación, todo lo que no es un contrato con doble
 * firma —un recibo, una factura, un documento de texto— saldría de
 * `estadoAcuerdo` como «borrador», y en borrador no se puede subir
 * nada. Adjuntarle una foto a un recibo habría dejado de funcionar
 * en el momento de desplegar, sin que ninguna prueba del contrato lo
 * notara, porque el contrato sí funcionaba.
 */
export function bloquea(exp, accion, hoy = new Date()) {
  if (!tieneAcuerdo(exp)) return false;
  return estadoBloquea(estadoAcuerdo(exp, { hoy }).estado, accion);
}

export function puedeAhora(estado, accion, tienePermiso) {
  if (!permiteEstado(estado, accion)) return false;
  const necesita = PERMISO_DE_ACCION[accion];
  if (!necesita) return false;
  return Boolean(tienePermiso(necesita));
}

/** Por qué no se puede, para decírselo a alguien. */
export function motivoBloqueo(estado, accion) {
  if (permiteEstado(estado, accion)) return null;
  if (accion === "editar" || accion === "poner-en-firme") {
    if (estado === "en_firma") {
      return "El contrato ya se mandó a firmar y no puede cambiar. Retira el envío para volver a editarlo.";
    }
    if (estado === "vigente" || estado === "entregado") {
      return "Las dos partes aceptaron este contrato. Para cambiarlo hay que hacer una versión nueva y volver a firmarla.";
    }
    if (estado === "cerrado") return "Este contrato está cerrado.";
  }
  if (accion === "subir" || accion === "retirar") {
    if (estado === "borrador" || estado === "rechazado" || estado === "sin_firmar") {
      return "Todavía no hay acuerdo: primero las dos partes tienen que aceptarlo.";
    }
    if (estado === "cerrado") return "Este contrato está cerrado.";
  }
  if (accion === "aceptar" || accion === "rechazar") {
    return "Este contrato no está esperando tu firma.";
  }
  return "Esto no se puede hacer con el contrato como está ahora.";
}

/**
 * Los pasos válidos de un estado a otro.
 *
 * Existe para que una transición rara falle en el servidor en vez de
 * dejar el contrato en una combinación que nadie pensó.
 */
export const TRANSICIONES = {
  borrador:      ["en_firma"],
  en_firma:      ["vigente", "rechazado", "sin_firmar", "borrador"],
  vigente:       ["entregado", "cerrado"],
  entregado:     ["cerrado", "vigente", "sin_respuesta"],
  cerrado:       [],
  rechazado:     ["borrador", "en_firma"],
  sin_firmar:    ["borrador", "en_firma"],
  sin_respuesta: ["cerrado", "entregado"],
};

export const transicionValida = (de, a) =>
  ESTADOS.includes(de) && ESTADOS.includes(a) &&
  (TRANSICIONES[de] || []).includes(a);

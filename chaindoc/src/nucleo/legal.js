// ─────────────────────────────────────────────────────────────
// legal.js — Aviso de privacidad y términos de uso
//
// ⚠️ VERSIÓN PILOTO, REDACTADA SIN ABOGADO.
//
// Sirve para operar el piloto con unos pocos usuarios que saben que
// lo es. NO sirve para abrir al público: antes de eso tiene que
// revisarlo un abogado, y hay tres cosas que sólo él puede cerrar —
// el responsable (persona física o moral), el domicilio, y el alcance
// de la limitación de responsabilidad.
//
// Los textos viven aquí y no en un archivo aparte a propósito: así
// viajan con la versión desplegada y la que el usuario aceptó queda
// atada a un número, no a «lo que decía la página ese día».
//
// CÓMO SE CAMBIAN
// Cualquier cambio de fondo sube VERSION y cambia FECHA. Los usuarios
// que aceptaron una versión anterior vuelven a ver la pantalla. Una
// corrección de dedo no necesita subir la versión.
// ─────────────────────────────────────────────────────────────

/** Sube con cada cambio de fondo. Es lo que se guarda en el perfil. */
export const VERSION = 1;

export const FECHA = "30 de septiembre de 2026";

/**
 * Los datos que faltan por decidir. Están juntos a propósito: son lo
 * único que hay que cambiar el día que exista la empresa y el dominio,
 * y así no hay que ir a buscarlos entre el texto.
 */
export const RESPONSABLE = {
  nombre: "[Nombre del responsable: persona física o razón social]",
  domicilio: "[Domicilio en México]",
  correo: "[correo de contacto]",
  sitio: "[dominio]",
  producto: "chaindoc",
};

const R = RESPONSABLE;

// ── AVISO DE PRIVACIDAD ───────────────────────────────────────
//
// Sigue la estructura que pide la Ley Federal de Protección de Datos
// Personales en Posesión de los Particulares (artículos 15, 16 y 17) y
// su Reglamento: quién es el responsable, qué datos se recaban, para
// qué, con quién se comparten, cómo se ejercen los derechos ARCO, cómo
// se revoca el consentimiento, y cómo se avisa de los cambios.

export const AVISO = {
  titulo: "Aviso de privacidad",
  version: VERSION,
  fecha: FECHA,
  intro:
    `${R.nombre} (en adelante «el responsable»), con domicilio en ${R.domicilio}, ` +
    `es responsable del tratamiento de tus datos personales conforme a la Ley Federal ` +
    `de Protección de Datos Personales en Posesión de los Particulares.`,
  secciones: [
    {
      t: "Esto es una versión piloto",
      p: [
        `${R.producto} está en pruebas con un grupo reducido de usuarios. Funciona y ` +
        `tus datos se guardan con las protecciones que se describen abajo, pero el ` +
        `servicio puede cambiar, interrumpirse o reiniciarse mientras dure el piloto.`,
        "Te pedimos que durante esta etapa no subas información que no puedas " +
        "permitirte perder, y que conserves tus propias copias de los documentos y " +
        "comprobantes importantes.",
      ],
    },
    {
      t: "Qué datos recabamos",
      p: ["Recabamos únicamente lo necesario para que el servicio funcione:"],
      lista: [
        "**De tu cuenta:** nombre, correo electrónico y contraseña. La contraseña " +
        "la guarda y verifica Firebase Authentication; nosotros no la vemos.",
        "**De tu firma:** tu código de firma, guardado como una huella criptográfica " +
        "(scrypt con sal) de la que no se puede recuperar el código original. Si usas " +
        "Face ID o huella, se guarda la llave pública de tu dispositivo — nunca tu " +
        "huella dactilar ni tu rostro, que no salen de tu teléfono.",
        "**De tus documentos:** el contenido que escribes o subes, los archivos que " +
        "adjuntas, y los datos fiscales que incluyan (RFC, montos, folios de CFDI).",
        "**De tu actividad en el documento:** qué hiciste, cuándo y desde qué cuenta. " +
        "Esto es la cadena de bloques del documento y es el corazón del servicio: " +
        "sin ese registro no hay nada que probar.",
        "**Técnicos:** dirección IP y datos del navegador, que Firebase registra para " +
        "seguridad y para detectar abuso.",
      ],
      cierre:
        "No recabamos datos personales sensibles en el sentido de la ley (origen " +
        "racial o étnico, estado de salud, creencias, preferencias sexuales y " +
        "similares). Si tú los incluyes dentro de un documento, quedan bajo tu " +
        "control y tu responsabilidad.",
    },
    {
      t: "Para qué los usamos",
      lista: [
        "Crear y mantener tu cuenta, y dejarte entrar a ella.",
        "Guardar tus documentos y llevar su registro inalterable.",
        "Verificar tu identidad al firmar.",
        "Consultar ante el SAT el estatus de los comprobantes fiscales que subas, y " +
        "cruzar los RFC contra la lista del artículo 69-B publicada por el propio SAT.",
        "Publicar la fecha de tus registros en la cadena de Bitcoin, mediante " +
        "OpenTimestamps. Lo que se publica es **un solo código matemático** que resume " +
        "el conjunto de registros del día: no viaja ahí tu nombre, ni el contenido de " +
        "tus documentos, ni nada que permita identificarte o reconstruirlos.",
        "Avisarte de vencimientos y de cambios en el estatus de tus facturas.",
        "Responderte cuando nos escribas.",
      ],
      cierre:
        "No usamos tus datos para publicidad, no los vendemos y no los cedemos a " +
        "terceros con fines comerciales.",
    },
    {
      t: "Con quién se comparten",
      p: [
        "Para que el servicio funcione usamos proveedores que tratan datos por cuenta " +
        "nuestra y sólo para prestarnos su servicio:",
      ],
      lista: [
        "**Google (Firebase)** — alojamiento, base de datos, archivos y autenticación. " +
        "Los datos se almacenan en servidores de Google, incluidos servidores fuera de " +
        "México.",
        "**Google (Gemini)** — análisis del contenido de los contratos que decidas " +
        "analizar con la función de contrato inteligente. Sólo se envía el texto del " +
        "contrato que tú mandas analizar.",
        "**Servicio de Administración Tributaria (SAT)** — se consulta el estatus de " +
        "los comprobantes fiscales. Se envían únicamente los datos que el propio " +
        "comprobante ya contiene y que el SAT requiere para responder.",
        "**Calendarios públicos de OpenTimestamps** — reciben el código matemático " +
        "descrito arriba. No reciben datos personales.",
      ],
      cierre:
        "Fuera de estos casos, sólo compartimos datos con quien tú decidas —las " +
        "personas a las que compartes un documento o a las que mandas un enlace de " +
        "entrega— o cuando una autoridad competente lo requiera conforme a la ley.",
    },
    {
      t: "Lo que tú compartes",
      p: [
        "Cuando compartes un documento o mandas un enlace de entrega, quien lo reciba " +
        "verá lo que ese acceso permita ver. Tú decides el alcance, y en el caso del " +
        "enlace de entrega el invitado sólo ve la lista de comprobantes que le pediste: " +
        "no ve el contrato, ni los montos, ni lo que subieron otras personas.",
        "Quien entrega por enlace lo hace con una sesión anónima que sólo sirve para " +
        "dejar ese archivo. No le pedimos nombre, correo ni cuenta; si tú anotas su " +
        "correo, es porque tú lo escribiste para tu propio registro.",
      ],
    },
    {
      t: "Cuánto tiempo los conservamos",
      p: [
        "Mientras tengas cuenta activa, y después por el tiempo que la ley exija " +
        "conservar comprobantes fiscales y evidencia de operaciones.",
        "La cadena de bloques de un documento **no se puede modificar ni borrar** " +
        "parcialmente: es lo que le da valor como prueba. Si eliminas un documento, se " +
        "elimina junto con su cadena y sus archivos.",
      ],
    },
    {
      t: "Tus derechos ARCO",
      p: [
        "Tienes derecho a **acceder** a tus datos, **rectificarlos** si son inexactos, " +
        "**cancelarlos** cuando considere que no se requieren, y **oponerte** a su " +
        "tratamiento para fines específicos.",
        `Puedes ejercerlos escribiendo a ${R.correo}, indicando tu nombre, el correo ` +
        `con el que te registraste, qué derecho quieres ejercer y sobre qué datos. ` +
        `Responderemos en un plazo máximo de 20 días hábiles, y si procede lo haremos ` +
        `efectivo dentro de los 15 días hábiles siguientes.`,
        "Desde la aplicación puedes además, en cualquier momento y sin pedirlo: " +
        "corregir tu nombre, cambiar tu contraseña y tu código de firma, retirar " +
        "accesos que hayas dado, revocar enlaces de entrega, descargar tus documentos " +
        "y borrarlos.",
      ],
    },
    {
      t: "Revocar tu consentimiento",
      p: [
        `Puedes revocar el consentimiento para el tratamiento de tus datos escribiendo ` +
        `a ${R.correo}. Ten en cuenta que revocarlo implica cerrar tu cuenta, porque ` +
        `sin tratar esos datos el servicio no puede funcionar.`,
        "La revocación no afecta la conservación de la información que debamos guardar " +
        "por obligación legal.",
      ],
    },
    {
      t: "Cómo protegemos tus datos",
      lista: [
        "Todo viaja cifrado (HTTPS) y se almacena cifrado en reposo por la " +
        "infraestructura de Google.",
        "Tu código de firma y las contraseñas de documento se guardan como huellas " +
        "criptográficas irreversibles, separadas del documento.",
        "Sólo el servidor puede escribir en la cadena de bloques. El navegador no, " +
        "ni siquiera el tuyo.",
        "El acceso a cada documento se comprueba en el servidor en cada operación.",
        "Los intentos fallidos de firma se limitan a cinco, con espera de quince " +
        "minutos, para frenar los intentos por fuerza bruta.",
      ],
      cierre:
        "Ningún sistema es infalible. Si llegara a ocurrir una vulneración que afecte " +
        "de forma significativa tus derechos, te lo informaremos sin demora para que " +
        "puedas tomar medidas.",
    },
    {
      t: "Cookies y tecnologías similares",
      p: [
        "Usamos almacenamiento local del navegador para mantener tu sesión abierta y " +
        "recordar preferencias como tus carpetas. No usamos cookies de publicidad ni " +
        "de seguimiento de terceros.",
      ],
    },
    {
      t: "Menores de edad",
      p: [
        "El servicio está dirigido a personas mayores de edad. No recabamos " +
        "deliberadamente datos de menores.",
      ],
    },
    {
      t: "Cambios a este aviso",
      p: [
        "Si cambiamos este aviso, subiremos su número de versión y te pediremos que lo " +
        "leas la próxima vez que entres. La versión que aceptaste y la fecha quedan " +
        "guardadas en tu perfil.",
      ],
    },
    {
      t: "Autoridad",
      p: [
        "Si consideras que tu derecho a la protección de datos personales ha sido " +
        "vulnerado, puedes acudir ante la autoridad garante en materia de protección " +
        "de datos personales que resulte competente.",
      ],
    },
  ],
};

// ── TÉRMINOS DE USO ───────────────────────────────────────────

export const TERMINOS = {
  titulo: "Términos de uso",
  version: VERSION,
  fecha: FECHA,
  intro:
    `Estos términos rigen el uso de ${R.producto}, un servicio de ${R.nombre}. ` +
    `Al crear una cuenta aceptas lo que sigue.`,
  secciones: [
    {
      t: "Qué es este servicio, y qué no es",
      p: [
        `${R.producto} guarda documentos y lleva un registro encadenado de todo lo que ` +
        `les pasa: quién los creó, quién los editó, quién los firmó, qué comprobantes ` +
        `se adjuntaron y cuándo. Ese registro está hecho para que una alteración ` +
        `posterior sea detectable.`,
      ],
      lista: [
        "**No somos notario ni fedatario público.** No damos fe pública.",
        "**No damos asesoría legal, contable ni fiscal.** Las plantillas de contrato " +
        "son un punto de partida, no un documento revisado para tu caso.",
        "**No validamos la veracidad de lo que subes.** Probamos que un archivo existía " +
        "y no cambió; no que su contenido sea cierto.",
        "**La consulta al SAT es informativa.** Reproducimos la respuesta del SAT en el " +
        "momento de consultarla. La fuente oficial es el SAT, y su respuesta puede " +
        "cambiar después.",
      ],
    },
    {
      t: "Sobre la firma electrónica",
      p: [
        "La firma con código o con biometría que ofrece el servicio es una firma " +
        "electrónica simple. Sirve para acreditar que quien tenía acceso a tu cuenta " +
        "realizó esa acción en ese momento, y queda registrada de forma verificable.",
        "**No es una firma electrónica avanzada** en el sentido del Código de Comercio: " +
        "para eso hace falta la e.firma del SAT o un certificado equivalente. Si tu " +
        "operación necesita ese nivel, consúltalo con tu abogado antes de confiar en " +
        "esta firma.",
      ],
    },
    {
      t: "Sobre el sellado de tiempo",
      p: [
        "La fecha de tus registros se publica a diario en la cadena de Bitcoin " +
        "mediante OpenTimestamps, un protocolo abierto y gratuito. Eso permite " +
        "demostrar ante un tercero que un registro ya existía antes de cierto momento, " +
        "sin tener que confiar en nosotros.",
        "La confirmación tarda entre unas horas y un día, que es lo que se demora la " +
        "red de Bitcoin. Mientras tanto la prueba existe pero aparece como pendiente.",
        "No garantizamos la disponibilidad futura de los calendarios públicos de " +
        "OpenTimestamps ni de la red de Bitcoin, que son servicios de terceros ajenos " +
        "a nosotros.",
      ],
    },
    {
      t: "Tu cuenta",
      lista: [
        "Eres responsable de la veracidad de los datos con los que te registras.",
        "Eres responsable de guardar tu contraseña y tu código de firma. No los " +
        "compartas: cualquier acción hecha con ellos queda registrada a tu nombre.",
        "Si pierdes tu código de firma puedes cambiarlo desde configuración, pero eso " +
        "no altera lo que ya quedó firmado.",
        "Avísanos de inmediato si crees que alguien entró a tu cuenta.",
      ],
    },
    {
      t: "Lo que puedes y no puedes hacer",
      p: ["Puedes usar el servicio para cualquier fin lícito. No puedes usarlo para:"],
      lista: [
        "Subir contenido ilícito, o del que no tengas derecho a disponer.",
        "Suplantar a otra persona o empresa.",
        "Intentar vulnerar la seguridad del servicio, acceder a documentos ajenos, o " +
        "forzar sus límites de uso.",
        "Automatizar el uso del servicio de forma que afecte su funcionamiento para " +
        "los demás.",
      ],
      cierre:
        "Podemos suspender una cuenta que incumpla estas reglas, avisando en cuanto " +
        "sea razonablemente posible.",
    },
    {
      t: "De quién es lo que subes",
      p: [
        "Tuyo. Conservas todos los derechos sobre tus documentos y archivos. Nos das " +
        "permiso únicamente para almacenarlos, procesarlos y mostrarlos con el fin de " +
        "prestarte el servicio, y a quien tú decidas darle acceso.",
        "El software, la marca y el diseño de la aplicación son del responsable.",
      ],
    },
    {
      t: "Disponibilidad",
      p: [
        "Durante el piloto el servicio se ofrece **tal cual está**, sin compromiso de " +
        "disponibilidad continua. Puede haber interrupciones por mantenimiento o por " +
        "fallos de los proveedores de los que dependemos.",
        "Haremos lo razonable por avisar con antelación de cualquier interrupción " +
        "planeada y por no perder información.",
      ],
    },
    {
      t: "Límite de responsabilidad",
      p: [
        "El responsable no será responsable por daños indirectos, incidentales o " +
        "lucro cesante derivados del uso o la imposibilidad de uso del servicio.",
        "En particular, y dado que se trata de una versión piloto, no respondemos por " +
        "la pérdida de información: conserva siempre tus propias copias de lo que sea " +
        "importante.",
        "Nada de lo anterior limita la responsabilidad que no pueda excluirse conforme " +
        "a la ley aplicable.",
      ],
    },
    {
      t: "Precio",
      p: [
        "Durante el piloto el servicio es gratuito. Si en el futuro se cobra, se " +
        "avisará con antelación suficiente y nunca se cobrará sin tu aceptación " +
        "expresa.",
      ],
    },
    {
      t: "Terminación",
      p: [
        "Puedes cerrar tu cuenta cuando quieras. Antes de hacerlo, descarga lo que " +
        "quieras conservar: al cerrarla se eliminan tus documentos y sus cadenas.",
        "Podemos terminar el piloto avisando con antelación razonable y dándote tiempo " +
        "de exportar tu información.",
      ],
    },
    {
      t: "Cambios a estos términos",
      p: [
        "Si cambian, subiremos el número de versión y te pediremos que los leas la " +
        "próxima vez que entres.",
      ],
    },
    {
      t: "Ley aplicable",
      p: [
        "Estos términos se rigen por las leyes de los Estados Unidos Mexicanos. Para " +
        "cualquier controversia, las partes se someten a los tribunales competentes " +
        "del domicilio del responsable, renunciando a cualquier otro fuero.",
      ],
    },
  ],
};

export const DOCUMENTOS = { aviso: AVISO, terminos: TERMINOS };

/** ¿Este perfil aceptó la versión que está corriendo? */
export const aceptoVigente = (perfil) =>
  Number(perfil?.legal?.version || 0) >= VERSION;

/** Lo que se guarda en el perfil al aceptar. */
export const selloDeAceptacion = () => ({
  version: VERSION,
  fecha: FECHA,
  aceptadoEn: new Date().toISOString(),
});

/**
 * Los textos en plano, para el paquete de evidencia y para cuando
 * alguien los pida por escrito.
 */
export function comoTexto(doc){
  const partes = [
    doc.titulo.toUpperCase(),
    `Versión ${doc.version} · ${doc.fecha}`,
    "",
    doc.intro,
    "",
  ];
  for(const s of doc.secciones){
    partes.push(s.t.toUpperCase(), "");
    for(const p of s.p || []) partes.push(sinMarcas(p), "");
    for(const l of s.lista || []) partes.push("· " + sinMarcas(l));
    if(s.lista) partes.push("");
    if(s.cierre) partes.push(sinMarcas(s.cierre), "");
  }
  return partes.join("\n").trim();
}

/** Quita el **resaltado** para las versiones en texto plano. */
export const sinMarcas = (s) => String(s).replace(/\*\*(.+?)\*\*/g, "$1");

/** Parte un texto en trozos normales y resaltados, para pintarlo. */
export function trozos(s){
  return String(s).split(/(\*\*.+?\*\*)/g).filter(Boolean).map((t) =>
    t.startsWith("**") && t.endsWith("**")
      ? { fuerte: true, texto: t.slice(2, -2) }
      : { fuerte: false, texto: t });
}
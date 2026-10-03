// ─────────────────────────────────────────────────────────────
// sat.js — Preguntarle al SAT si la factura existe
//
// El SAT tiene un servicio público y gratuito, sin credenciales: el
// mismo que hay detrás del código QR de una factura impresa. Se le
// manda la «expresión impresa» y contesta si el comprobante está
// vigente, cancelado o no existe.
//
// Esto corre SÓLO en el servidor, y no por comodidad: una respuesta
// del SAT registrada por el navegador se podría falsificar con las
// herramientas de desarrollo en diez segundos. Registrada aquí, y
// encadenada como bloque de validación, se puede sostener frente a
// un tercero meses después.
// ─────────────────────────────────────────────────────────────

const ENDPOINT = "https://consultaqr.facturaelectronica.sat.gob.mx/ConsultaCFDIService.svc";
const ACCION = "http://tempuri.org/IConsultaCFDIService/Consulta";

/** El sobre SOAP que espera el servicio. */
export function sobreSOAP(expresion) {
  return `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
<soapenv:Header/><soapenv:Body><tem:Consulta><tem:expresionImpresa><![CDATA[${expresion}]]></tem:expresionImpresa></tem:Consulta></soapenv:Body></soapenv:Envelope>`;
}

const sacar = (xml, etiqueta) => {
  const m = xml.match(new RegExp(`<(?:[\\w.-]+:)?${etiqueta}[^>]*>([\\s\\S]*?)</`, "i"));
  return m ? m[1].trim() : null;
};

/**
 * Traduce la respuesta cruda del SAT a algo que se pueda guardar y
 * enseñar. `estado` es lo único de lo que depende la interfaz.
 *
 * estado: "vigente" · "cancelado" · "no-encontrado" · "desconocido"
 */
export function interpretar(xml) {
  if (!xml) return { estado: "desconocido", texto: "El SAT no respondió." };

  const codigo = sacar(xml, "CodigoEstatus");
  const estadoSAT = sacar(xml, "Estado");
  const cancelable = sacar(xml, "EsCancelable");
  const estatusCancelacion = sacar(xml, "EstatusCancelacion");
  const efos = sacar(xml, "ValidacionEFOS");

  // "N - 601" significa que el comprobante no está en los registros.
  const noEncontrado = /^N\s*-/.test(codigo || "") || /no.*encontr/i.test(estadoSAT || "");

  let estado = "desconocido";
  if (noEncontrado) estado = "no-encontrado";
  else if (/^cancelad/i.test(estadoSAT || "")) estado = "cancelado";
  else if (/^vigente/i.test(estadoSAT || "")) estado = "vigente";

  return {
    estado,
    texto: TEXTOS[estado],
    codigo: codigo || null,
    estadoSAT: estadoSAT || null,
    cancelable: cancelable || null,
    estatusCancelacion: estatusCancelacion || null,
    efos: efos || null,
    consultadoEn: new Date().toISOString(),
  };
}

export const TEXTOS = {
  "vigente":      "El SAT confirma que el comprobante está vigente.",
  "cancelado":    "El SAT reporta este comprobante como CANCELADO.",
  "no-encontrado": "El SAT no encuentra este comprobante. Puede ser falso o estar recién emitido.",
  "desconocido":  "No se pudo confirmar con el SAT en este momento.",
};

/**
 * Consulta real. Se le da un tiempo corto: el servicio del SAT se cae
 * con frecuencia, y más vale decir «no se pudo confirmar» que dejar a
 * alguien esperando.
 */
export async function consultarEstatus(expresion, { timeoutMs = 15000, fetchImpl = fetch } = {}) {
  if (!expresion) return { estado: "desconocido", texto: "Faltan datos del comprobante." };

  const corte = AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined;
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: ACCION },
      body: sobreSOAP(expresion),
      signal: corte,
    });
    if (!res.ok) {
      return { ...interpretar(null), http: res.status,
               texto: `El servicio del SAT respondió con error ${res.status}.` };
    }
    return interpretar(await res.text());
  } catch (e) {
    return { estado: "desconocido",
             texto: "No se pudo contactar al servicio del SAT. Se puede reintentar más tarde.",
             error: String(e?.message || e), consultadoEn: new Date().toISOString() };
  }
}
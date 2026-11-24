// Esquemas de las plantillas visuales (factura, recibo).

export const FORMS = {
  factura: {
    heading: "Factura",
    header: [
      { k:"fecha", label:"Fecha",  type:"date" },
      { k:"folio", label:"No",     type:"text", placeholder:"000" },
    ],
    rows: [
      [{ k:"emisor",      label:"Emisor",        type:"text",  placeholder:"Razón social", w:2 }],
      [{ k:"rfcEmisor",   label:"RFC emisor",    type:"text",  placeholder:"XAXX010101000" },
       { k:"rfcReceptor", label:"RFC receptor",  type:"text",  placeholder:"XAXX010101000" }],
      [{ k:"receptor",    label:"Receptor",      type:"text",  placeholder:"Razón social", w:2 }],
      [{ k:"concepto",    label:"Concepto",      type:"area",  placeholder:"Descripción de bienes o servicios", w:2 }],
      [{ k:"subtotal",    label:"Subtotal",      type:"money" },
       { k:"iva",         label:"IVA (16%)",     type:"money" }],
      [{ k:"total",       label:"Total",         type:"money" },
       { k:"formaPago",   label:"Forma de pago", type:"radio", options:["Depósito","Cheque","Efectivo"] }],
      [{ k:"uuid",        label:"Folio fiscal",  type:"text",  placeholder:"UUID del CFDI", w:2, mono:true }],
    ],
  },

  recibo: {
    // ← ACTUALIZADO (3 nov): decía «Recibo de nómina». Ya no se
    // pinta en pantalla, pero sigue encabezando el texto que se
    // hashea, y ahí llamar nómina a la compra de cemento era
    // meterle al registro un dato que nadie escribió.
    heading: "Recibo",
    header: [
      { k:"fecha", label:"Fecha", type:"date" },
      { k:"folio", label:"No",    type:"text", placeholder:"000" },
    ],
    rows: [
      [{ k:"recibiDe",    label:"Recibí de",     type:"text",  placeholder:"Empresa" },
       { k:"cantidad",    label:"Cantidad",      type:"money" }],
      [{ k:"cantidadTxt", label:"Cantidad con letra", type:"text", placeholder:"veinte mil pesos", w:2 }],
      [{ k:"concepto",    label:"Concepto",      type:"area",  placeholder:"Descripción del pago", w:2 }],
      [{ k:"recibidoPor", label:"Recibido por",  type:"text",  placeholder:"Nombre" },
       { k:"formaPago",   label:"Forma de pago", type:"radio", options:["Depósito","Cheque","Efectivo"] }],
    ],
  },
};

// ── QUITADO (24 nov): «Enviar periódicamente» ─────────────────
//
// Era un interruptor que no encendía nada. Se guardaba en el
// documento y entraba en el texto que se hashea, pero no existía
// ninguna línea de código que leyera `periodico`: ningún recibo se
// mandaba nunca, ni una vez. Un control que promete algo que el
// producto no hace es peor que no tenerlo, porque quien lo enciende
// se queda esperando.
//
// En su sitio va «Corregir», que sí hace algo: cambiar el archivo
// original por el bueno. Ver `corregirOriginal`.

/**
 * Un importe, escrito como se lee.
 *
 * ← NUEVO (24 nov): la plantilla imprimía el número tal cual, así
 * que treinta y cinco mil pesos salían «$35000.00». El resto del
 * producto sí lo separa; sólo esta pantalla no.
 *
 * Si lo que hay dentro no es un número —porque alguien escribió
 * «pendiente»— se devuelve tal cual. Lo que escribió una persona no
 * se esconde por no saber leerlo.
 */
/**
 * Una fecha, escrita como se lee.
 *
 * ← NUEVO (24 nov). Ricardo, al pedirlo: «hay que dejar la que lee,
 * es decir la que está en el recibo original». Así que esto NO toca
 * el dato: el valor guardado sigue siendo el que salió del archivo,
 * y lo único que cambia es cómo se dibuja.
 *
 * Tres cuidados, y los tres son el mismo: no inventar nada.
 *
 *   · LA HORA DEL MEDIODÍA NO ES UN CAPRICHO. `new Date("2026-11-19")`
 *     se lee como medianoche EN UTC, y en México eso es el día 18.
 *     La fecha del recibo se correría un día hacia atrás ella sola, y
 *     en un comprobante fiscal el día es el dato. Con las doce dentro,
 *     no hay huso que la mueva.
 *   · EL AÑO SE DICE SIEMPRE, y por eso no se usa `fmtFecha`, que lo
 *     esconde cuando es el de hoy. En un recibo, de qué año es no es
 *     un detalle.
 *   · Y LO QUE NO SEA UNA FECHA LIMPIA SE DEVUELVE TAL CUAL. Si el
 *     campo trae otra cosa, eso es lo que hay que ver: taparlo con un
 *     «—» escondería justo lo que la otra parte tiene que comparar
 *     contra el original.
 */
export const fechaLegible = (v) => {
  const txt = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(txt)) return txt;
  const f = new Date(`${txt}T12:00:00`);
  if (Number.isNaN(f.getTime())) return txt;
  return f.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
};

export const dinero = (v) => {
  const txt = String(v ?? "").trim();
  const n = Number(txt.replace(/[^0-9.-]/g, ""));
  if (!txt || !Number.isFinite(n) || !/\d/.test(txt)) return `$${txt}`;
  return `$${n.toLocaleString("es-MX", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
};

export const allFields = (s)=>[...(s.header||[]), ...s.rows.flat()];

// ← NUEVO: convierte los campos a texto para que la cadena siga
// hasheando contenido legible y el historial no se rompa.
export function serializeForm(formKey, fields){
  const s = FORMS[formKey]; if(!s) return "";
  const lines = [s.heading.toUpperCase(), ""];
  for(const f of allFields(s)){
    const v = fields[f.k];
    if(v===undefined || v===null || v==="" || v===false) continue;
    // El importe va aquí SIN separar, y la fecha SIN escribir en
    // largo, a propósito, y no con `dinero` ni `fechaLegible`.
    // Esto no es la pantalla: es el texto canónico que se hashea. Un
    // separador de miles es una convención de un idioma, y meterla
    // dentro de la huella haría que el mismo recibo tuviera una
    // huella distinta según dónde se mire. Lo que se separa es lo
    // que lee la persona; ver `FormDoc`.
    lines.push(`${f.label}: ${f.type==="toggle" ? "Sí" : f.type==="money" ? `$${v}` : v}`);
  }
  return lines.join("\n");
}

/**
 * La etiqueta que lee la persona, a partir del nombre interno.
 *
 * ← NUEVO (19 nov). Un bloque de la cadena que dijera «rfcEmisor
 * «ABC» → «XYZ»» obliga a quien lo lee a traducir nombres de
 * programador. Dice «RFC emisor», que es lo que pone en la pantalla
 * donde se cambió.
 */
export const etiquetaDe = (formKey, k) =>
  (FORMS[formKey] ? allFields(FORMS[formKey]) : []).find((f) => f.k === k)?.label || k;

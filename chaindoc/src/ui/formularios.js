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
      [{ k:"periodico",   label:"Enviar periódicamente", type:"toggle" }],
    ],
  },

  recibo: {
    heading: "Recibo de nómina",
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
      [{ k:"periodico",   label:"Enviar periódicamente", type:"toggle" }],
    ],
  },
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
    lines.push(`${f.label}: ${f.type==="toggle" ? "Sí" : f.type==="money" ? `$${v}` : v}`);
  }
  return lines.join("\n");
}

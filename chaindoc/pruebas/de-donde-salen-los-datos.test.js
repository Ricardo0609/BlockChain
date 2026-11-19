// Los datos de un comprobante salen del archivo, no de los dedos.
//
// LA REGLA, EN PALABRAS DE RICARDO (19 nov):
//
//   «Para llenar la información se lee el archivo y no a mano. Lo que
//    puede hacer el usuario es corregir la información una vez
//    llenada. ¿Y cómo sabremos que es verdadera? Porque se adjunta sí
//    o sí el archivo original y no se puede quitar, y así la otra
//    persona puede corroborar los datos y que no fueron alterados.»
//
// LO QUE HABÍA ANTES, Y QUE ES EL AGUJERO QUE ESTO TAPA:
//
//   · El recibo NO LEÍA NADA. La línea decía `formKey==="factura" ?
//     parseFactura(texto) : {}`, y ese `: {}` era un recibo entero
//     escrito a mano.
//   · La factura leía, pero ADIVINANDO con expresiones regulares
//     sobre el texto, mientras `leerCFDI` —el lector exacto del XML—
//     llevaba semanas escrito y sin usar en ninguna pantalla.
//   · Y el XML ni siquiera se podía subir: `.xml` no estaba en los
//     tipos aceptados, así que la promesa que ya salía en pantalla
//     —«si traes el XML leemos los datos exactos»— no tenía por dónde
//     cumplirse.
//
// LO QUE ESTAS PRUEBAS NO PUEDEN DEJAR PASAR, por orden de lo que
// costaría que fallara:
//
//   · Que un dato leído sea FALSO. Un hueco se ve y se corrige; un
//     número equivocado que parece bien se firma. Por eso aquí se
//     vigila tanto lo que llena como lo que SE NIEGA a llenar.
//   · Que el IVA se calcule restando. Da el número correcto sólo si
//     no hay retenciones, y en cuanto las hay —honorarios, fletes,
//     arrendamiento— miente sin que nadie se entere.
//   · Que `origenCampos` diga «archivo» de algo que ya tocó una
//     persona. Un registro que miente es peor que no tenerlo: se cree.
//   · Que una corrección no deje rastro de lo que decía antes.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sinComentarios } from "./sinComentarios.js";
import {
  camposDeCFDI, parseRecibo, parseFactura, extraerCampos, marcarCorrecciones, delArchivo,
} from "../src/nucleo/extraccion";
import { leerCFDI } from "../src/nucleo/cfdi";
import { etiquetaDe } from "../src/ui/formularios";
import { CAMPOS_EDITABLES } from "../src/nucleo/datos";

const leer = (r) => readFileSync(resolve(process.cwd(), r), "utf8");
const codigo = (r) => sinComentarios(leer(r));

// Una factura de obra con IVA trasladado Y una retención, que es el
// caso en el que restar total menos subtotal da mal.
const CON_RETENCION = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0"
  Serie="A" Folio="1234" Fecha="2026-09-15T10:32:41" Sello="AbCd1234SelloLargoXyZ98765"
  FormaPago="03" SubTotal="15000.00" Descuento="0.00" Moneda="MXN"
  Total="16200.00" TipoDeComprobante="I" MetodoPago="PUE">
  <cfdi:Emisor Rfc="COSC8001137NA" Nombre="Cementos del Norte SA de CV" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="XAXX010101000" Nombre="Constructora Garcia" UsoCFDI="G03"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="30111500" Cantidad="100" Descripcion="Bulto de cemento gris"
      ValorUnitario="120.00" Importe="12000.00"/>
    <cfdi:Concepto ClaveProdServ="30111600" Cantidad="10" Descripcion="Metro cubico de grava"
      ValorUnitario="300.00" Importe="3000.00"/>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosRetenidos="2400.00" TotalImpuestosTrasladados="3600.00"/>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      Version="1.1" UUID="a1b2c3d4-e5f6-7890-abcd-ef1234567890"
      FechaTimbrado="2026-09-15T10:35:02" SelloSAT="SelloDelSatMuyLargo=="/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

const SIN_IMPUESTOS = CON_RETENCION.replace(/\s*<cfdi:Impuestos[^>]*\/>/, "");

// ══════════════════════════════════════════════════════════════
// 1. EL XML: EXACTO, NO RECONOCIDO
// ══════════════════════════════════════════════════════════════
describe("una factura con su XML", () => {
  const f = camposDeCFDI(leerCFDI(CON_RETENCION));

  it("llena los siete campos que hacen falta para firmar", () => {
    expect(f).toMatchObject({
      fecha: "2026-09-15",
      emisor: "Cementos del Norte SA de CV",
      rfcEmisor: "COSC8001137NA",
      receptor: "Constructora Garcia",
      rfcReceptor: "XAXX010101000",
      total: "16200",
    });
    expect(f.concepto).toContain("Bulto de cemento gris");
  });

  it("y los de más, que son los que nadie se sabe de memoria", () => {
    expect(f.uuid).toBe("A1B2C3D4-E5F6-7890-ABCD-EF1234567890");
    expect(f.folio).toBe("A1234");      // serie + folio, que es «el número»
    expect(f.subtotal).toBe("15000");
    expect(f.formaPago).toBe("Depósito"); // clave 03 del SAT
  });

  // ── LA QUE MÁS IMPORTA DE ESTE ARCHIVO ──
  it("y el IVA lo LEE, no lo resta", () => {
    // Restar total menos subtotal daría 1,200 —porque la retención ya
    // está descontada del total— y 1,200 es un IVA perfectamente
    // creíble para una factura de 15,000. Nadie lo habría notado.
    expect(f.iva).toBe("3600");
    expect(f.iva).not.toBe("1200");
    const d = leerCFDI(CON_RETENCION);
    expect(d.total - d.subtotal).toBe(1200);   // la trampa, por escrito
  });

  it("y si la factura no trae impuestos, el campo se queda vacío", () => {
    // Una factura exenta o a tasa cero. Mejor hueco que inventado.
    const g = camposDeCFDI(leerCFDI(SIN_IMPUESTOS));
    expect(g.iva).toBeUndefined();
    expect(g.total).toBe("16200");
  });

  it("y una forma de pago que no es ninguna de las tres no se fuerza", () => {
    // El catálogo del SAT tiene más de veinte claves y la pantalla
    // tres botones. Meter una tarjeta de crédito en «Depósito» sería
    // escribir en el comprobante algo que el CFDI no dice.
    const tarjeta = CON_RETENCION.replace('FormaPago="03"', 'FormaPago="04"');
    expect(camposDeCFDI(leerCFDI(tarjeta)).formaPago).toBeUndefined();
  });

  it("y varios conceptos se ponen todos, no el primero", () => {
    // Quedarse con el primero sería decidir por el usuario cuál de
    // sus compras importa.
    expect(f.concepto).toContain("Bulto de cemento gris");
    expect(f.concepto).toContain("Metro cubico de grava");
  });
});

// ══════════════════════════════════════════════════════════════
// 2. EL RECIBO: QUE NO LEÍA NADA
// ══════════════════════════════════════════════════════════════
describe("un recibo escaneado", () => {
  it("se lee, que es lo que antes no pasaba", () => {
    const f = parseRecibo(
      "RECIBO No. 0042\n2026-10-03\n"
      + "Recibí de Constructora Garcia la cantidad de $20,000.00\n"
      + "(veinte mil pesos 00/100 M.N.)\n"
      + "Por concepto de anticipo de obra\n"
      + "Recibió por: Juan Pérez Soto\nPago por transferencia");
    expect(f).toMatchObject({
      fecha: "2026-10-03",
      recibiDe: "Constructora Garcia",
      cantidad: "20000.00",
      concepto: "anticipo de obra",
      recibidoPor: "Juan Pérez Soto",
      formaPago: "Depósito",
    });
    expect(f.cantidadTxt).toContain("veinte mil pesos");
  });

  // ── LO QUE SE NIEGA A LLENAR ──
  it("y con dos importes sin etiqueta NO elige uno", () => {
    // En un ticket el número grande puede ser el total, o la cuenta,
    // o el folio. Poner el equivocado es el error caro: el campo
    // llega lleno y se firma sin mirar.
    const f = parseRecibo("Pago $1,500.00 ref $99,999.00 gracias por su compra");
    expect(f.cantidad).toBeUndefined();
  });

  it("pero con uno solo sí, porque no hay nada que elegir", () => {
    expect(parseRecibo("Gracias por su pago de $1,500.00").cantidad).toBe("1500.00");
  });

  // ── LOS DOS QUE SALIERON AL PROBARLO ──
  //
  // Los dos de la misma familia, y es la familia que importa: no
  // dejaban el campo vacío, lo dejaban LLENO con algo creíble. Un
  // hueco se ve al revisar; un valor plausible en el sitio
  // equivocado se firma.

  it("y «RECIBO No. 0042» da folio 0042, no «No»", () => {
    // La etiqueta se comía a la etiqueta siguiente.
    expect(parseRecibo("RECIBO No. 0042").folio).toBe("0042");
    expect(parseRecibo("RECIBO No. 0042").folio).not.toBe("No");
  });

  it("y quien paga NO acaba en «Recibido por»", () => {
    // Había un «recibí» suelto entre las etiquetas de quien cobra, y
    // en «Recibí de Constructora García…» ganaba ésa por ir antes en
    // el texto: el pagador aparecía como el que recibió el dinero.
    const f = parseRecibo("Recibí de Constructora Garcia $500.00\nRecibió por: Juan Pérez");
    expect(f.recibiDe).toBe("Constructora Garcia");
    expect(f.recibidoPor).toBe("Juan Pérez");
  });

  it("y un nombre acaba donde acaba su línea", () => {
    // Con el texto aplastado en una sola línea, el valor seguía
    // tragando la siguiente: «Juan Pérez Soto Pago por transferencia».
    const f = parseRecibo("Recibió por: Juan Pérez Soto\nPago por transferencia");
    expect(f.recibidoPor).toBe("Juan Pérez Soto");
  });

  it("y de un texto que no es un recibo no saca nada", () => {
    const f = parseRecibo("Estimado cliente, le informamos que su pedido va en camino.");
    expect(Object.keys(f)).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════
// 3. LA PUERTA: QUÉ LECTOR TOCA
// ══════════════════════════════════════════════════════════════
describe("extraerCampos", () => {
  it("con un CFDI usa el lector exacto y lo dice", () => {
    const r = extraerCampos({ tplId: "factura", texto: CON_RETENCION });
    expect(r.exacto).toBe(true);
    expect(r.nada).toBe(false);
    expect(r.campos.iva).toBe("3600");
    expect(r.origen.total).toBe("archivo");
  });

  it("con un PDF de factura reconoce, y NO dice que es exacto", () => {
    // La diferencia entre las dos velocidades tiene que llegar hasta
    // la pantalla: «datos exactos del XML» es una promesa distinta de
    // «revísalos contra el original».
    const r = extraerCampos({ tplId: "factura", texto: "Total $ 1,160.00 RFC XAXX010101000" });
    expect(r.exacto).toBe(false);
    expect(r.campos.total).toBe("1160.00");
  });

  it("y el recibo pasa por su propio lector, no por el de factura", () => {
    const t = "Recibí de Juan la cantidad de $500.00 por concepto de renta";
    expect(extraerCampos({ tplId: "recibo", texto: t }).campos.recibiDe).toBe("Juan");
    // `parseFactura` sobre ese mismo texto no saca el «recibí de»:
    // son dos lectores distintos de verdad, no el mismo con otro nombre.
    expect(parseFactura(t).recibiDe).toBeUndefined();
  });

  it("y cuando no se lee nada lo dice, para que la pantalla avise", () => {
    const r = extraerCampos({ tplId: "recibo", texto: "qqqq wwww" });
    expect(r.nada).toBe(true);
    expect(r.campos).toEqual({});
  });

  it("y un documento que no es comprobante no pasa por aquí", () => {
    expect(extraerCampos({ tplId: null, texto: CON_RETENCION }).nada).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// 4. CORREGIR DEJA RASTRO
// ══════════════════════════════════════════════════════════════
describe("cuando alguien corrige un dato", () => {
  const origen = { total: "archivo", emisor: "archivo" };

  it("ese campo deja de decir «archivo»", () => {
    const r = marcarCorrecciones(
      { total: "16200", emisor: "Cementos" },
      { total: "16250", emisor: "Cementos" }, origen);
    expect(r.origen.total).toBe("mano");
    expect(r.origen.emisor).toBe("archivo");   // ése no se tocó
  });

  it("y queda lo que decía antes, que es lo comprobable", () => {
    // Que un campo esté marcado avisa; saber que el archivo decía
    // 16,200 y ahora dice 16,250 es lo que deja decidir a la otra
    // persona.
    const { corregidos } = marcarCorrecciones(
      { total: "16200" }, { total: "16250" }, origen);
    expect(corregidos).toEqual([
      { k: "total", antes: "16200", ahora: "16250", era: "archivo" },
    ]);
  });

  it("y un campo que se llena de cero también cuenta como mano", () => {
    const { origen: o } = marcarCorrecciones({}, { folio: "A1" }, {});
    expect(o.folio).toBe("mano");
  });

  it("pero guardar sin tocar nada no mancha nada", () => {
    const r = marcarCorrecciones(
      { total: "16200", emisor: "Cementos" },
      { total: "16200", emisor: "Cementos" }, origen);
    expect(r.corregidos).toHaveLength(0);
    expect(r.origen).toEqual(origen);
    expect(delArchivo(r.origen)).toBe(2);
  });

  it("y un campo borrado no deja un origen huérfano", () => {
    const { origen: o } = marcarCorrecciones({ total: "16200" }, { total: "" }, origen);
    expect("total" in o).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// 5. Y LLEGA HASTA LA PANTALLA
// ══════════════════════════════════════════════════════════════
describe("de la lectura a lo que se ve", () => {
  it("el XML ya se puede subir, que era el principio de todo", () => {
    const fi = codigo("src/fileImport.js");
    expect(fi).toMatch(/\.xml/);
    expect(fi).toMatch(/application\/xml/);   // Windows lo reporta así a veces
    expect(fi).toMatch(/name\.endsWith\("\.xml"\)/);
  });

  it("y al crear ya no hay un «: {}» que deje el recibo a mano", () => {
    const app = codigo("src/App.jsx");
    expect(app).not.toMatch(/formKey==="factura"\s*\)\s*\?\s*parseFactura/);
    expect(app).toMatch(/extraerCampos\(\{ tplId: formKey, texto: impText \}\)/);
    expect(app).toMatch(/origenCampos: formKey \? lectura\.origen : null/);
  });

  it("y el origen se puede guardar: está en los campos editables", () => {
    // Sin esto el servidor lo tira en silencio —`limpiarCambios`
    // ignora lo que no esté en la lista— y la marca no sobrevive a
    // recargar la página.
    expect(CAMPOS_EDITABLES).toContain("origenCampos");
    expect(leer("functions/lib/permisos.js")).toMatch(/"origenCampos"/);
  });

  it("y guardar una corrección asienta un bloque con el antes", () => {
    const app = codigo("src/App.jsx");
    expect(app).toMatch(/marcarCorrecciones\(d\.fields \|\| \{\}, fields, d\.origenCampos \|\| \{\}\)/);
    expect(app).toMatch(/Corrección a mano de/);
    expect(app).toMatch(/tipo:"correccion"/);
    // Y con la etiqueta que se lee en pantalla, no el nombre interno.
    expect(app).toMatch(/etiquetaDe\(d\.tplId, c\.k\)/);
    expect(etiquetaDe("factura", "rfcEmisor")).toBe("RFC emisor");
  });

  it("y el origen nuevo SE GUARDA, no sólo se calcula", () => {
    // ← AÑADIDA después de que un mutante se escapara (19 nov).
    //
    // Quité la línea que guarda `origenCampos` al corregir y las 1455
    // pruebas siguieron en verde. O sea que esto pasaba y nadie se
    // enteraba: corriges el total, aparece «a mano», recargas la
    // página y la marca ya no está. El dato queda cambiado y sin
    // rastro, que es exactamente lo contrario de lo que esto es.
    //
    // Yo comprobaba que la marca se CALCULA. Nada comprobaba que
    // llega al disco, que es lo único que importa.
    const app = codigo("src/App.jsx");
    expect(app).toMatch(/\.\.\.\(esComp \? \{ origenCampos: origenNuevo \} : \{\}\)/);
    // Y va dentro de los cambios que se mandan, no suelto.
    const i = app.indexOf("const up = await aplicar(d, evento,");
    expect(i).toBeGreaterThan(-1);
    expect(app.slice(i, i + 320)).toMatch(/origenCampos: origenNuevo/);
  });

  it("y sólo se marca lo escrito a mano, no lo que vino del archivo", () => {
    // Marcar los doce campos sería poner una etiqueta en cada línea,
    // y doce avisos no avisan de nada. Lo que destaca es la excepción.
    const fd = codigo("src/ui/FormDoc.jsx");
    expect(fd).toMatch(/origen\?\.\[k\] === "mano"/);
    expect(fd).not.toMatch(/=== "archivo"/);
    expect(leer("src/ui/estilos.js")).toMatch(/\.fd-mano\{/);
    expect(codigo("src/pantallas/Documento.jsx")).toMatch(/origen=\{d\.origenCampos\}/);
  });

  it("y el aviso dice POR QUÉ no se pudo leer, no que «no se reconoció»", () => {
    // Lo pidió Ricardo así: «un aviso que diga que no se puede leer el
    // archivo por baja resolución o los datos no son legibles».
    const app = codigo("src/App.jsx");
    expect(app).toMatch(/baja resolución/);
    // Sin comentarios: el porqué de haberlo quitado vive en uno justo
    // al lado, y leyendo el archivo entero se encontraría ahí.
    expect(app).not.toMatch(/No se reconocieron campos/);
    // Y no cierra la puerta: puede escribirlos él, marcados.
    expect(app).toMatch(/marcados como escritos a mano/);
  });
});

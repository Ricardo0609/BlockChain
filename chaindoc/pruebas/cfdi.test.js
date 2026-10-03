// Lectura del XML del CFDI.
//
// Se prueban las dos versiones que circulan (3.3 en minúsculas y 4.0
// capitalizada) porque un expediente viejo puede traer cualquiera.
import { describe, it, expect } from "vitest";
import {
  esCFDI, leerCFDI, expresionImpresa, revisarCFDI, coincideCon,
  camposDesdeCFDI, cotejarConRequisito, TIPOS,
} from "../functions/lib/cfdi.js";

const CFDI40 = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0"
  Serie="A" Folio="1234" Fecha="2026-09-15T10:32:41" Sello="AbCd1234SelloLargoXyZ98765"
  FormaPago="03" NoCertificado="00001000000504465028" SubTotal="15000.00"
  Descuento="0.00" Moneda="MXN" Total="17400.00" TipoDeComprobante="I" MetodoPago="PUE">
  <cfdi:Emisor Rfc="COSC8001137NA" Nombre="Cementos del Norte SA de CV" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="XAXX010101000" Nombre="Constructora Garcia" UsoCFDI="G03"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="30111500" Cantidad="100" Descripcion="Bulto de cemento gris"
      ValorUnitario="120.00" Importe="12000.00"/>
    <cfdi:Concepto ClaveProdServ="30111600" Cantidad="10" Descripcion="Metro cubico de grava"
      ValorUnitario="300.00" Importe="3000.00"/>
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      Version="1.1" UUID="a1b2c3d4-e5f6-7890-abcd-ef1234567890"
      FechaTimbrado="2026-09-15T10:35:02" SelloSAT="SelloDelSatMuyLargo=="/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

const CFDI33 = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/3" version="3.3"
  fecha="2024-03-02T09:00:00" subTotal="1000.00" total="1160.00" moneda="MXN"
  tipoDeComprobante="I" sello="viejoSello123">
  <cfdi:Emisor rfc="cosc8001137na" nombre="Proveedor Viejo"/>
  <cfdi:Receptor rfc="XAXX010101000" nombre="Cliente"/>
  <cfdi:Conceptos>
    <cfdi:Concepto cantidad="1" descripcion="Servicio de pintura" valorUnitario="1000.00" importe="1000.00"/>
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      UUID="11112222-3333-4444-5555-666677778888"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

describe("reconocer un CFDI", () => {
  it("distingue un CFDI de cualquier otro XML o texto", () => {
    expect(esCFDI(CFDI40)).toBe(true);
    expect(esCFDI(CFDI33)).toBe(true);
    expect(esCFDI("<html><body>hola</body></html>")).toBe(false);
    expect(esCFDI("%PDF-1.4 esto es un pdf")).toBe(false);
    expect(esCFDI("")).toBe(false);
    expect(esCFDI(null)).toBe(false);
  });

  it("no intenta leer lo que no es un CFDI", () => {
    expect(leerCFDI("<a>b</a>")).toBeNull();
  });
});

describe("CFDI 4.0", () => {
  const d = leerCFDI(CFDI40);

  it("saca el folio fiscal del timbre, no del folio interno", () => {
    expect(d.uuid).toBe("A1B2C3D4-E5F6-7890-ABCD-EF1234567890");
    expect(d.folio).toBe("1234");
    expect(d.timbrado).toBe(true);
  });

  it("saca los RFC y los nombres de las dos partes", () => {
    expect(d.rfcEmisor).toBe("COSC8001137NA");
    expect(d.nombreEmisor).toBe("Cementos del Norte SA de CV");
    expect(d.rfcReceptor).toBe("XAXX010101000");
  });

  it("saca los importes como números, no como texto", () => {
    expect(d.subtotal).toBe(15000);
    expect(d.total).toBe(17400);
    expect(d.moneda).toBe("MXN");
    expect(typeof d.total).toBe("number");
  });

  it("saca la fecha y la deja también en formato corto", () => {
    expect(d.fecha).toBe("2026-09-15T10:32:41");
    expect(d.fechaCorta).toBe("2026-09-15");
  });

  it("saca todos los conceptos con su importe", () => {
    expect(d.conceptos).toHaveLength(2);
    expect(d.conceptos[0].descripcion).toBe("Bulto de cemento gris");
    expect(d.conceptos[1].importe).toBe(3000);
  });

  it("identifica el tipo de comprobante", () => {
    expect(d.tipo).toBe("I");
    expect(TIPOS[d.tipo]).toBe("Ingreso");
  });
});

describe("CFDI 3.3, con los atributos en minúscula", () => {
  const d = leerCFDI(CFDI33);

  it("se lee igual que el 4.0", () => {
    expect(d.version).toBe("3.3");
    expect(d.total).toBe(1160);
    expect(d.uuid).toBe("11112222-3333-4444-5555-666677778888");
  });

  it("los RFC se devuelven siempre en mayúsculas", () => {
    expect(d.rfcEmisor).toBe("COSC8001137NA");
  });
});

describe("la expresión con la que se le pregunta al SAT", () => {
  it("lleva los dos RFC, el total con seis decimales y el folio fiscal", () => {
    const e = expresionImpresa(leerCFDI(CFDI40));
    expect(e).toContain("re=COSC8001137NA");
    expect(e).toContain("rr=XAXX010101000");
    expect(e).toContain("tt=17400.000000");
    expect(e).toContain("id=A1B2C3D4-E5F6-7890-ABCD-EF1234567890");
  });

  it("en el 4.0 agrega los últimos ocho del sello; en el 3.3 no", () => {
    expect(expresionImpresa(leerCFDI(CFDI40))).toContain("fe=oXyZ98765".slice(0, 3));
    expect(expresionImpresa(leerCFDI(CFDI40))).toMatch(/&fe=.{1,12}$/);
    expect(expresionImpresa(leerCFDI(CFDI33))).not.toContain("&fe=");
  });

  it("sin folio fiscal no hay nada que preguntar", () => {
    expect(expresionImpresa({ rfcEmisor: "A", rfcReceptor: "B", total: 1 })).toBeNull();
    expect(expresionImpresa(null)).toBeNull();
  });
});

describe("lo que se puede revisar sin preguntarle a nadie", () => {
  it("un CFDI completo no tiene problemas", () => {
    expect(revisarCFDI(leerCFDI(CFDI40))).toEqual([]);
  });

  it("avisa cuando el XML no está timbrado: es un borrador", () => {
    const sinTimbre = CFDI40.replace(/<tfd:TimbreFiscalDigital[\s\S]*?\/>/, "");
    const p = revisarCFDI(leerCFDI(sinTimbre));
    expect(p.map((x) => x.clave)).toContain("sin-timbre");
    expect(p[0].texto).toMatch(/borrador/i);
  });

  it("detecta que los conceptos no suman lo que dice el subtotal", () => {
    const alterado = CFDI40.replace('SubTotal="15000.00"', 'SubTotal="19000.00"');
    const p = revisarCFDI(leerCFDI(alterado));
    expect(p.map((x) => x.clave)).toContain("descuadre");
  });

  it("un archivo ilegible se reporta como tal, no revienta", () => {
    expect(revisarCFDI(null)[0].clave).toBe("ilegible");
  });
});

describe("¿la factura es la que el expediente esperaba?", () => {
  const d = leerCFDI(CFDI40);

  it("cuando todo coincide, no hay diferencias", () => {
    expect(coincideCon(d, { rfcEmisor: "cosc8001137na", total: 17400 })).toEqual([]);
  });

  it("señala el RFC que no corresponde", () => {
    const dif = coincideCon(d, { rfcEmisor: "AAA010101AAA" });
    expect(dif[0]).toMatchObject({ clave: "emisor", encontrado: "COSC8001137NA" });
  });

  it("señala el importe que no corresponde", () => {
    const dif = coincideCon(d, { total: 20000 });
    expect(dif[0]).toMatchObject({ clave: "total", esperado: 20000, encontrado: 17400 });
  });

  it("un centavo de diferencia se tolera; más, no", () => {
    expect(coincideCon(d, { total: 17400.009 })).toEqual([]);
    expect(coincideCon(d, { total: 17400.5 })).toHaveLength(1);
  });
});

describe("llenar el formulario desde el CFDI", () => {
  it("entrega los campos listos para el formulario de factura", () => {
    const f = camposDesdeCFDI(leerCFDI(CFDI40));
    expect(f).toMatchObject({
      uuid: "A1B2C3D4-E5F6-7890-ABCD-EF1234567890",
      rfcEmisor: "COSC8001137NA",
      fecha: "2026-09-15",
      total: "17400",
    });
    expect(f.concepto).toBe("Bulto de cemento gris; Metro cubico de grava");
  });

  it("sin CFDI devuelve un objeto vacío, no revienta", () => {
    expect(camposDesdeCFDI(null)).toEqual({});
  });
});

describe("¿es LA factura que correspondía?", () => {
  const d = leerCFDI(CFDI40);   // total 17400, subtotal 15000, fecha 2026-09-15

  it("cuadra si el monto pactado es el total", () => {
    expect(cotejarConRequisito(d, { monto: 17400 })).toEqual([]);
  });

  it("cuadra también si el monto se anotó sin IVA", () => {
    // Es lo normal: unos capturan con IVA y otros sin él. Avisar aquí
    // sería llenar la pantalla de falsas alarmas.
    expect(cotejarConRequisito(d, { monto: 15000 })).toEqual([]);
  });

  it("avisa cuando no cuadra con ninguno de los dos", () => {
    const a = cotejarConRequisito(d, { monto: 9000 });
    expect(a).toHaveLength(1);
    expect(a[0].clave).toBe("monto-mayor");
    expect(a[0].texto).toMatch(/9000.00.*17400.00/);
  });

  it("distingue si la factura vino por debajo de lo pactado", () => {
    expect(cotejarConRequisito(d, { monto: 30000 })[0].clave).toBe("monto-menor");
  });

  it("avisa si la factura llegó fuera del plazo", () => {
    const a = cotejarConRequisito(d, { fechaLimite: "2026-09-01" });
    expect(a[0].clave).toBe("fuera-de-plazo");
    expect(a[0].texto).toMatch(/2026-09-15.*2026-09-01/);
  });

  it("dentro del plazo no dice nada", () => {
    expect(cotejarConRequisito(d, { fechaLimite: "2026-12-31" })).toEqual([]);
  });

  it("avisa si se pidió un comprobante de pago y llega otra cosa", () => {
    const nomina = { ...d, tipo: "N" };
    expect(cotejarConRequisito(nomina, { tipo: "comprobante" })[0].clave).toBe("tipo-raro");
    expect(cotejarConRequisito(d, { tipo: "comprobante" })).toEqual([]);
  });

  it("sin monto ni plazo pactados no hay nada que cotejar", () => {
    expect(cotejarConRequisito(d, {})).toEqual([]);
    expect(cotejarConRequisito(d, { monto: 0 })).toEqual([]);
    expect(cotejarConRequisito(null, { monto: 100 })).toEqual([]);
  });

  it("junta varios avisos cuando hay varios problemas", () => {
    expect(cotejarConRequisito(d, { monto: 5000, fechaLimite: "2026-01-01" })).toHaveLength(2);
  });
});


describe("las dos copias no se separan", () => {
  it("functions/lib/cfdi.js es idéntico a src/nucleo/cfdi.js", async () => {
    const { readFileSync } = await import("node:fs");
    const a = readFileSync(new URL("../src/nucleo/cfdi.js", import.meta.url), "utf8");
    const b = readFileSync(new URL("../functions/lib/cfdi.js", import.meta.url), "utf8");
    expect(a).toBe(b);
  });
});
// La consulta al SAT y la lista 69-B.
//
// La llamada real no se prueba aquí (depende de un servicio ajeno que
// se cae seguido); lo que sí se prueba es que ninguna respuesta suya
// —incluida la de que no respondió— deje al sistema en un estado raro.
import { describe, it, expect } from "vitest";
import { sobreSOAP, interpretar, consultarEstatus, TEXTOS } from "../functions/lib/sat.js";
import {
  parsear69B, indexar, buscar, revisarRFCs, claveDeSituacion, SITUACIONES,
} from "../functions/lib/lista69b.js";

const respuesta = (estado, codigo = "S - Comprobante obtenido satisfactoriamente.") => `
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>
<ConsultaResponse xmlns="http://tempuri.org/"><ConsultaResult xmlns:a="http://schemas.datacontract.org/2004/07/Sat.Cfdi.Negocio.ConsultaCfdi.Servicio">
<a:CodigoEstatus>${codigo}</a:CodigoEstatus>
<a:EsCancelable>Cancelable sin aceptacion</a:EsCancelable>
<a:Estado>${estado}</a:Estado>
<a:EstatusCancelacion></a:EstatusCancelacion>
<a:ValidacionEFOS>200</a:ValidacionEFOS>
</ConsultaResult></ConsultaResponse></s:Body></s:Envelope>`;

describe("la pregunta al SAT", () => {
  it("arma el sobre con la expresión dentro", () => {
    const s = sobreSOAP("?re=AAA010101AAA&rr=BBB&tt=100.000000&id=X");
    expect(s).toContain("tem:Consulta");
    expect(s).toContain("?re=AAA010101AAA");
    expect(s).toContain("CDATA");
  });
});

describe("la respuesta del SAT", () => {
  it("vigente", () => {
    const r = interpretar(respuesta("Vigente"));
    expect(r.estado).toBe("vigente");
    expect(r.texto).toBe(TEXTOS.vigente);
    expect(r.consultadoEn).toBeTruthy();
  });

  it("cancelado, que es el caso que hay que ver a tiempo", () => {
    const r = interpretar(respuesta("Cancelado"));
    expect(r.estado).toBe("cancelado");
    expect(r.texto).toMatch(/CANCELADO/);
  });

  it("no encontrado: el comprobante puede ser falso", () => {
    const r = interpretar(respuesta("", "N - 601: La expresión impresa proporcionada no es válida."));
    expect(r.estado).toBe("no-encontrado");
    expect(r.texto).toMatch(/falso/i);
  });

  it("una respuesta vacía no se confunde con una negativa", () => {
    expect(interpretar(null).estado).toBe("desconocido");
    expect(interpretar("<xml/>").estado).toBe("desconocido");
  });

  it("guarda el código y los datos de cancelación tal como llegaron", () => {
    const r = interpretar(respuesta("Vigente"));
    expect(r.codigo).toMatch(/^S -/);
    expect(r.cancelable).toBe("Cancelable sin aceptacion");
    expect(r.efos).toBe("200");
  });
});

describe("cuando el SAT no está disponible", () => {
  it("un error de red no tumba nada: queda como desconocido", async () => {
    const r = await consultarEstatus("?re=A&rr=B&tt=1&id=X", {
      fetchImpl: async () => { throw new Error("getaddrinfo ENOTFOUND"); },
    });
    expect(r.estado).toBe("desconocido");
    expect(r.texto).toMatch(/reintentar/i);
  });

  it("un error HTTP se reporta con su número", async () => {
    const r = await consultarEstatus("?re=A&rr=B&tt=1&id=X", {
      fetchImpl: async () => ({ ok: false, status: 503 }),
    });
    expect(r.estado).toBe("desconocido");
    expect(r.texto).toMatch(/503/);
  });

  it("sin expresión no se llama a nadie", async () => {
    const r = await consultarEstatus(null, { fetchImpl: () => { throw new Error("no debió llamarse"); } });
    expect(r.estado).toBe("desconocido");
  });

  it("una respuesta buena se interpreta igual que siempre", async () => {
    const r = await consultarEstatus("?re=A&rr=B&tt=1&id=X", {
      fetchImpl: async () => ({ ok: true, text: async () => respuesta("Vigente") }),
    });
    expect(r.estado).toBe("vigente");
  });
});

// ── LISTA 69-B ────────────────────────────────────────────────

const CSV = `Listado completo de contribuyentes Articulo 69-B
No,RFC,Nombre del Contribuyente,Situacion del contribuyente,Numero y fecha de oficio global de presuncion
1,AAA010101AAA,"FACTURAS FALSAS, S.A. DE C.V.",Definitivo,500-05-2024-1234
2,BBB020202BB2,PROVEEDOR EN PROCESO SA,Presunto,500-05-2025-9999
3,CCC030303CC3,EMPRESA QUE SE DEFENDIO SA,Desvirtuado,500-05-2023-1111
4,DDD040404DD4,GANO EN TRIBUNAL SA,Sentencia Favorable,500-05-2022-2222
`;

describe("la lista 69-B", () => {
  const lista = parsear69B(CSV);

  it("lee las cuatro situaciones y descarta los encabezados", () => {
    expect(lista).toHaveLength(4);
    expect(lista.map((x) => x.situacion))
      .toEqual(["definitivo", "presunto", "desvirtuado", "sentencia"]);
  });

  it("respeta las comas dentro de comillas en la razón social", () => {
    expect(lista[0].nombre).toBe("FACTURAS FALSAS, S.A. DE C.V.");
  });

  it("clasifica el riesgo, que es lo que decide si se avisa", () => {
    expect(SITUACIONES.definitivo.riesgo).toBe("alto");
    expect(SITUACIONES.desvirtuado.riesgo).toBe("ninguno");
  });

  it("reconoce cómo escribe el SAT cada situación, con o sin acentos", () => {
    expect(claveDeSituacion("DEFINITIVO")).toBe("definitivo");
    expect(claveDeSituacion("Sentencia Favorable")).toBe("sentencia");
    expect(claveDeSituacion("Desvirtuados")).toBe("desvirtuado");
    expect(claveDeSituacion("otra cosa")).toBeNull();
  });

  it("no se cae con un archivo vacío o que no es el que esperaba", () => {
    expect(parsear69B("")).toEqual([]);
    expect(parsear69B(null)).toEqual([]);
    expect(parsear69B("hola,mundo\n1,2,3")).toEqual([]);
  });

  it("si un RFC aparece dos veces, manda la última situación", () => {
    const doble = parsear69B(CSV + "5,AAA010101AAA,FACTURAS FALSAS SA,Desvirtuado,500-1\n");
    expect(indexar(doble)["AAA010101AAA"].situacion).toBe("desvirtuado");
  });
});

describe("cruzar los RFC del expediente contra la lista", () => {
  const idx = indexar(parsear69B(CSV));

  it("encuentra al que está como definitivo", () => {
    const h = revisarRFCs(idx, ["AAA010101AAA"]);
    expect(h).toHaveLength(1);
    expect(h[0].riesgo).toBe("alto");
    expect(h[0].texto).toMatch(/no sirven para deducir/i);
  });

  it("también avisa del presunto, pero explicando que aún puede defenderse", () => {
    expect(revisarRFCs(idx, ["BBB020202BB2"])[0].texto).toMatch(/todavía puede/i);
  });

  it("NO avisa de quien se defendió y ganó", () => {
    expect(revisarRFCs(idx, ["CCC030303CC3", "DDD040404DD4"])).toEqual([]);
  });

  it("un RFC limpio no aparece, que es lo que pasa casi siempre", () => {
    expect(revisarRFCs(idx, ["COSC8001137NA"])).toEqual([]);
    expect(buscar(idx, "COSC8001137NA")).toBeNull();
  });

  it("no le importan minúsculas, espacios ni repetidos", () => {
    expect(revisarRFCs(idx, ["aaa010101aaa", "AAA010101AAA", " aaa-010101-aaa "]))
      .toHaveLength(1);
  });

  it("sin lista cargada no inventa hallazgos", () => {
    expect(revisarRFCs(null, ["AAA010101AAA"])).toEqual([]);
  });
});
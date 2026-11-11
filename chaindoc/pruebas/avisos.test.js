// Los avisos de la revision de anoche, contra los documentos de hoy.
//
// Los escribe el servidor de madrugada y se quedan quietos hasta la
// noche siguiente. Sin cruzarlos con lo que hay ahora, el panel de la
// primera pantalla te pide cosas que ya hiciste y te manda a
// documentos que ya no existen: tocas el aviso y sale «ya no puedes
// abrir ese documento». Un callejon sin salida, y en la pantalla que
// mas se ve.
import { describe, it, expect } from "vitest";
import {
  TEXTO_AVISO, ordenar, esGrave, sigueValiendo, avisosVigentes,
} from "../src/nucleo/avisos";

const archivo = (nombre) => ({ aid: nombre, nombre, hash: "h" });

function contrato(extra = {}){
  return {
    id: "c1", title: "Barda", kind: "expediente",
    fases: [{ id: "f1", titulo: "Entrega del adelanto" }],
    requisitos: [
      { id: "r1", titulo: "Adelanto del escrito", fase: "f1", obligatorio: true, archivos: [] },
      { id: "r2", titulo: "Factura de materiales", fase: "f1", obligatorio: true, archivos: [] },
    ],
    ...extra,
  };
}

const avisoReq  = (extra = {}) => ({ tipo: "requisito-vencido", opId: "c1",
  titulo: "Barda", requisito: "Adelanto del escrito", fecha: "2026-10-24", ...extra });
const avisoFase = (extra = {}) => ({ tipo: "fase-vencida", opId: "c1",
  titulo: "Barda", fase: "Entrega del adelanto", fecha: "2026-10-24", ...extra });
const avisoSAT  = (extra = {}) => ({ tipo: "factura-cancelada", opId: "c1",
  titulo: "Barda", archivo: "factura.pdf", ...extra });

describe("un aviso de un documento que ya no esta", () => {
  it("no vale: tocarlo mandaria a una pantalla de error", () => {
    expect(sigueValiendo(avisoReq(), null)).toBe(false);
    expect(sigueValiendo(avisoFase(), null)).toBe(false);
    expect(sigueValiendo(avisoSAT(), null)).toBe(false);
  });

  it("desaparece de la lista aunque el documento siga en el servidor", () => {
    // Lo que manda es si esta en TU lista: borrado, acceso retirado u
    // oculto para ti son el mismo caso desde aqui.
    const r = avisosVigentes({ avisos: [avisoReq()], total: 1 }, []);
    expect(r.avisos).toEqual([]);
    expect(r.total).toBe(0);
  });
});

describe("un aviso de algo que ya cumpliste", () => {
  it("el requisito con comprobante ya no se avisa", () => {
    const c = contrato();
    c.requisitos[0].archivos = [archivo("adelanto.pdf")];
    expect(sigueValiendo(avisoReq(), c)).toBe(false);
  });

  it("sin comprobante, sigue valiendo", () => {
    expect(sigueValiendo(avisoReq(), contrato())).toBe(true);
  });

  it("acepta el formato viejo de un solo archivo", () => {
    const c = contrato();
    delete c.requisitos[0].archivos;
    c.requisitos[0].archivo = { nombre: "adelanto.pdf" };
    expect(sigueValiendo(avisoReq(), c)).toBe(false);
  });

  it("un requisito que quitaron del contrato no se avisa", () => {
    const c = contrato();
    c.requisitos = c.requisitos.slice(1);
    expect(sigueValiendo(avisoReq(), c)).toBe(false);
  });
});

describe("las fases", () => {
  it("con algo suyo pendiente, el aviso vale", () => {
    const c = contrato();
    c.requisitos[0].archivos = [archivo("adelanto.pdf")];
    expect(sigueValiendo(avisoFase(), c)).toBe(true);
  });

  it("con todo lo suyo entregado, se va", () => {
    const c = contrato();
    c.requisitos.forEach((r) => { r.archivos = [archivo(r.id + ".pdf")]; });
    expect(sigueValiendo(avisoFase(), c)).toBe(false);
  });

  it("una fase vacia sigue avisando: esta vacia, no cumplida", () => {
    // Mismo cuidado que el servidor: «todos cumplidos» de una lista
    // vacia es verdadero, y la fase se quedaria sin aviso justo
    // cuando mas falta hace.
    const c = contrato({ requisitos: [] });
    expect(sigueValiendo(avisoFase(), c)).toBe(true);
  });

  it("una fase que ya no existe no se avisa", () => {
    expect(sigueValiendo(avisoFase(), contrato({ fases: [] }))).toBe(false);
  });
});

describe("los avisos del SAT", () => {
  it("mientras la factura siga colgada, el aviso vale", () => {
    const c = contrato();
    c.requisitos[1].archivos = [archivo("factura.pdf")];
    expect(sigueValiendo(avisoSAT(), c)).toBe(true);
  });

  it("una factura cancelada no se cumple: se quita", () => {
    // Si siguiera la regla de los requisitos, bastaria con tener un
    // comprobante para que el aviso se fuera — y el comprobante que
    // hay es justo el cancelado.
    expect(sigueValiendo(avisoSAT(), contrato())).toBe(false);
  });
});

describe("la lista entera", () => {
  const docs = () => {
    const c = contrato();
    c.requisitos[0].archivos = [archivo("adelanto.pdf")];
    return [c];
  };

  it("deja lo que sigue pendiente y quita lo demas", () => {
    const datos = { total: 4, avisos: [
      avisoReq(),                                  // cumplido -> fuera
      avisoReq({ requisito: "Factura de materiales" }), // pendiente -> queda
      avisoFase(),                                 // algo suyo falta -> queda
      avisoReq({ opId: "borrado" }),               // sin documento -> fuera
    ]};
    const r = avisosVigentes(datos, docs());
    expect(r.avisos.map((a) => a.requisito || a.fase))
      .toEqual(["Factura de materiales", "Entrega del adelanto"]);
  });

  it("el contador baja con la lista", () => {
    // Si quedan dos y la cabecera dice «4 cosas que revisar», el que
    // no cuadra es el contador.
    const datos = { total: 4, avisos: [avisoReq(), avisoReq({ opId: "x" })] };
    const r = avisosVigentes(datos, docs());
    expect(r.avisos).toHaveLength(0);
    expect(r.total).toBe(2);
  });

  it("nunca dice menos avisos de los que enseña", () => {
    const datos = { total: 1, avisos: [avisoFase(), avisoFase()] };
    const r = avisosVigentes(datos, docs());
    expect(r.total).toBeGreaterThanOrEqual(r.avisos.length);
  });

  it("sin avisos no se inventa nada", () => {
    expect(avisosVigentes(null, docs())).toBe(null);
    expect(avisosVigentes({ avisos: [], total: 0 }, docs()).avisos).toEqual([]);
    expect(avisosVigentes({ avisos: [avisoReq()], total: 1 }).avisos).toEqual([]);
  });

  it("un tipo que no conocemos se respeta", () => {
    const raro = { tipo: "algo-nuevo", opId: "c1", titulo: "Barda" };
    expect(sigueValiendo(raro, contrato())).toBe(true);
    // pero sin documento sigue sin valer: el callejon es el mismo
    expect(sigueValiendo(raro, null)).toBe(false);
  });
});

// ── COMO SE LEE EL FIN DE UN CONTRATO (11 nov) ──────────────────
describe("el aviso de que un contrato se acaba", () => {
  const fin = (extra) => ({
    tipo: "contrato-por-terminar", titulo: "Arrendamiento Av. Juarez 120",
    fecha: "2026-11-25", faltan: 14, sinRequisitos: true, ...extra,
  });

  it("sin requisitos habla de renovar, no de entregar", () => {
    // Un arrendamiento no se «entrega»: se acaba. Decirle a alguien
    // que «le falta por entregar» en un alquiler es ruido.
    const t = TEXTO_AVISO(fin());
    expect(t).toMatch(/renovarlo/);
    expect(t).not.toMatch(/entregar/);
  });

  it("con requisitos si habla de lo que falta", () => {
    const t = TEXTO_AVISO(fin({ sinRequisitos: false }));
    expect(t).toMatch(/falta por entregar/);
    expect(t).not.toMatch(/renovarlo/);
  });

  it("dice en cuanto, no solo la fecha", () => {
    // Una fecha sola obliga a contar con los dedos, y esa cuenta es
    // justo lo que decide si corre prisa.
    expect(TEXTO_AVISO(fin({ faltan: 14 }))).toMatch(/en dos semanas/);
    expect(TEXTO_AVISO(fin({ faltan: 7 }))).toMatch(/en una semana/);
    expect(TEXTO_AVISO(fin({ faltan: 3 }))).toMatch(/en 3 d[ií]as/);
    expect(TEXTO_AVISO(fin({ faltan: 1 }))).toMatch(/mañana/);
    expect(TEXTO_AVISO(fin({ faltan: 0 }))).toMatch(/hoy/);
  });

  it("uno ya terminado se dice en pasado y pesa como lo vencido", () => {
    const t = TEXTO_AVISO({ ...fin(), tipo: "contrato-terminado" });
    expect(t).toMatch(/termin[óo]/);
    expect(esGrave({ tipo: "contrato-terminado" })).toBe(true);
    // El de dos semanas no es grave: si lo fuera, taparia lo de manana.
    expect(esGrave({ tipo: "contrato-por-terminar" })).toBe(false);
  });

  it("y se ordena donde toca: lo terminado arriba, lo que viene al final", () => {
    const lista = [
      { tipo: "contrato-por-terminar" }, { tipo: "requisito-vencido" },
      { tipo: "contrato-terminado" }, { tipo: "factura-cancelada" },
    ];
    expect(ordenar(lista).map((x) => x.tipo)).toEqual([
      "factura-cancelada", "contrato-terminado", "requisito-vencido", "contrato-por-terminar",
    ]);
  });

  it("ninguno cae en el texto de reserva", () => {
    // El `default` dice «hay algo que revisar», que no sirve de nada.
    for(const tipo of ["contrato-por-terminar", "contrato-terminado"]){
      expect(TEXTO_AVISO({ ...fin(), tipo })).not.toMatch(/algo que revisar/);
    }
  });
});

describe("lo que ya hacia antes sigue igual", () => {
  it("cada aviso se lee sin contexto", () => {
    expect(TEXTO_AVISO(avisoReq()))
      .toBe("«Adelanto del escrito» de «Barda» venció el 2026-10-24 y sigue pendiente.");
    expect(TEXTO_AVISO({ tipo: "algo-nuevo", titulo: "Barda" }))
      .toBe("Hay algo que revisar en «Barda».");
  });

  it("lo urgente va primero", () => {
    const l = ordenar([avisoReq({ tipo: "requisito-por-vencer" }), avisoSAT(), avisoFase()]);
    expect(l.map((a) => a.tipo))
      .toEqual(["factura-cancelada", "fase-vencida", "requisito-por-vencer"]);
  });

  it("lo grave se marca", () => {
    expect(esGrave(avisoSAT())).toBe(true);
    expect(esGrave(avisoReq({ tipo: "requisito-por-vencer" }))).toBe(false);
  });
});

// Pruebas de las reglas del contrato inteligente, con el contrato de
// prueba de la remodelación (Café La Tortuga Lenta, $48,000).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  calcularMontos, expedienteStatus, estadoFases, faseActual, faseCritica,
  duplicados, claveDup, destinoDuplicado, dondeEstaAdjunto, estadoVinculo,
  montoDeDocumento, panelExpedientes, debeRegistrarConsulta, resumenConsultas,
  misPendientes, cerrarSolicitudes, archivosDe,
  rfcsDeExpediente, hayQueRevisarRFCs,
  conMontosVigentes, montoVigente,
} from "../src/smartContract";

const pdf = (aid, hash, monto, subidoEn = "2026-09-21T10:00:00Z") =>
  ({ aid, hash, nombre: `${aid}.pdf`, tipo: "application/pdf", monto, subidoEn });

function contrato(extra = {}){
  return {
    id: "cafe", title: "Remodelación barra", kind: "expediente", ownerUid: "U1",
    montoTotal: 48000, moneda: "MXN", fechaLimite: "2026-09-25", sharedWith: [],
    fases: [
      { id: "f1", titulo: "Compra de materiales", fechaLimite: "2026-09-22" },
      { id: "f2", titulo: "Revisión de avance",   fechaLimite: "2026-09-23" },
      { id: "f3", titulo: "Entrega final",        fechaLimite: "2026-09-25" },
    ],
    requisitos: [
      { id: "r1", titulo: "Materiales",   obligatorio: true, monto: 22000, fase: "f1", archivos: [] },
      { id: "r2", titulo: "Electricista", obligatorio: true, monto: 6500,  fase: "f2", archivos: [] },
      { id: "r3", titulo: "Plomero",      obligatorio: true, monto: 4500,  fase: "f2", archivos: [] },
      { id: "r4", titulo: "Mano de obra", obligatorio: true, monto: 15000, fase: "f3", archivos: [] },
    ],
    ...extra,
  };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-21T12:00:00Z")); });
afterEach(() => { vi.useRealTimers(); });

describe("montos", () => {
  it("sin comprobantes: se espera el total y no hay nada comprobado", () => {
    const m = calcularMontos(contrato());
    expect(m.esperado).toBe(48000);
    expect(m.comprobado).toBeNull();
    expect(m.descuadre).toBeNull();
  });

  it("varios comprobantes en un requisito se suman", () => {
    const c = contrato();
    c.requisitos[0].archivos = [pdf("a", "h1", 12000), pdf("b", "h2", 9500)];
    const m = calcularMontos(c);
    expect(m.comprobado).toBe(21500);
    expect(m.restante).toBe(26500);
    expect(m.desviaciones).toEqual([expect.objectContaining({ id: "r1", dif: -500, piezas: 2 })]);
  });

  it("marca exceso cuando lo comprobado pasa del contrato", () => {
    const c = contrato();
    c.requisitos[0].archivos = [pdf("a", "h1", 50000)];
    expect(calcularMontos(c).excedido).toBe(true);
  });

  it("tolera un peso de diferencia por redondeo", () => {
    const c = contrato();
    c.requisitos[1].archivos = [pdf("a", "h1", 6500.8)];
    expect(calcularMontos(c).desviaciones).toEqual([]);
  });

  it("avisa si los requisitos no suman lo mismo que el contrato", () => {
    expect(calcularMontos(contrato({ montoTotal: 50000 })).descuadre).toBe(-2000);
  });

  it("lee el importe de una factura con texto libre", () => {
    expect(montoDeDocumento({ fields: { total: "$ 8,500.00" } })).toBe(8500);
    expect(montoDeDocumento({ fields: { cantidad: "1200" } })).toBe(1200);
    expect(montoDeDocumento({ fields: {} })).toBeNull();
  });
});

describe("estado del expediente", () => {
  it("cuenta cumplidos y días restantes", () => {
    const c = contrato();
    c.requisitos[0].archivos = [pdf("a", "h1", 22000)];
    const st = expedienteStatus(c);
    expect([st.cumplidos, st.total, st.porcentaje, st.dias]).toEqual([1, 4, 25, 4]);
    expect(st.estado).toBe("abierto");
  });

  it("acepta el formato viejo de un solo archivo", () => {
    expect(archivosDe({ archivo: { nombre: "x" } })).toHaveLength(1);
  });
});

describe("fases", () => {
  it("la fase actual es la primera sin cumplir", () => {
    const c = contrato();
    c.requisitos[0].archivos = [pdf("a", "h1", 22000)];
    expect(faseActual(c).id).toBe("f2");
  });

  it("una fase vencida sin cumplir se marca vencida y es la crítica", () => {
    vi.setSystemTime(new Date("2026-09-24T12:00:00Z"));
    const c = contrato();
    c.requisitos[0].archivos = [pdf("a", "h1", 22000, "2026-09-21T10:00:00Z")];
    const f = estadoFases(c);
    expect(f.map(x => x.estado)).toEqual(["cumplida", "vencida", "pendiente"]);
    expect(faseCritica(c).id).toBe("f2");
  });

  it("calcula los días de retraso para la pena convencional", () => {
    const c = contrato();
    c.requisitos[0].archivos = [pdf("a", "h1", 22000, "2026-09-24T09:00:00Z")];
    expect(estadoFases(c)[0].retraso).toBe(2);
  });

  it("sin fases devuelve lista vacía", () => {
    expect(estadoFases(contrato({ fases: [] }))).toEqual([]);
  });
});

// ← NUEVO (16 oct): el importe de un comprobante que es un documento
// de chaindoc lo dice el documento, no la copia que se guardo al
// adjuntarlo.
//
// El error que esto cierra: al adjuntar un recibo se copiaba su
// importe al expediente y ahi se quedaba. Si despues corregias el
// recibo, el contrato seguia sumando la cifra vieja; y como el campo
// del expediente era editable, se podia dejar a mano una cifra
// distinta de la del recibo que la respalda. Dos verdades para el
// mismo dinero, sin que nada avisara.
describe("el importe manda desde el documento, no desde el contrato", () => {
  const recibo = (id, total) =>
    ({ id, title: `Recibo ${id}`, kind: "documento", tplId: "recibo", fields: { total } });
  const adjunto = (aid, docId, monto) =>
    ({ aid, origen: "interno", docId, numId: "01", nombre: "Recibo", monto });

  const conRecibos = () => contrato({ requisitos: [
    { id: "r1", titulo: "Materiales", monto: 22000, archivos: [
      adjunto("a1", "d1", 5000), adjunto("a2", "d2", 7000)] },
  ] });

  it("relee el importe del documento aunque la copia diga otra cosa", () => {
    const docs = [recibo("d1", "9000"), recibo("d2", "7000")];
    const v = conMontosVigentes(conRecibos(), docs);
    expect(archivosDe(v.requisitos[0]).map(a => a.monto)).toEqual([9000, 7000]);
  });

  it("corregir el recibo cambia lo comprobado en el contrato", () => {
    const antes = calcularMontos(conMontosVigentes(
      conRecibos(), [recibo("d1", "5000"), recibo("d2", "7000")]));
    expect(antes.comprobado).toBe(12000);

    const despues = calcularMontos(conMontosVigentes(
      conRecibos(), [recibo("d1", "5500"), recibo("d2", "7000")]));
    expect(despues.comprobado).toBe(12500);
  });

  it("si el documento se queda sin importe, deja de sumar", () => {
    const v = conMontosVigentes(conRecibos(), [recibo("d1", ""), recibo("d2", "7000")]);
    expect(archivosDe(v.requisitos[0])[0].monto).toBe(null);
    expect(calcularMontos(v).comprobado).toBe(7000);
  });

  it("un documento que no esta a la vista conserva lo ultimo que se supo", () => {
    // te compartieron el contrato pero no el recibo
    const v = conMontosVigentes(conRecibos(), [recibo("d2", "7000")]);
    expect(archivosDe(v.requisitos[0]).map(a => a.monto)).toEqual([5000, 7000]);
  });

  it("un archivo suelto no lo toca nadie: su importe se escribe a mano", () => {
    const exp = contrato({ requisitos: [
      { id: "r1", titulo: "Materiales", monto: 22000, archivos: [pdf("p1", "hh", 3000)] },
    ] });
    // aunque exista un documento con ese mismo aid, no es su origen
    const v = conMontosVigentes(exp, [{ id: "p1", fields: { total: "99999" } }]);
    expect(archivosDe(v.requisitos[0])[0].monto).toBe(3000);
  });

  it("lo que decide es el origen, no que traiga un docId suelto", () => {
    // Un enlace, o un registro viejo, puede acarrear un docId sin ser
    // un documento de chaindoc. Si bastara con el docId para releer, el
    // importe escrito a mano se sobrescribiria solo.
    const suelto = { aid: "x1", origen: "enlace", docId: "d1", monto: 3000 };
    expect(montoVigente(suelto, [recibo("d1", "99999")])).toBe(3000);
    expect(montoVigente({ aid: "x2", docId: "d1", monto: 10 },
                        [recibo("d1", "99999")])).toBe(10);
  });

  it("no modifica el expediente guardado: es una vista", () => {
    const exp = conRecibos();
    const copia = JSON.parse(JSON.stringify(exp));
    conMontosVigentes(exp, [recibo("d1", "9000"), recibo("d2", "1")]);
    expect(exp).toEqual(copia);
  });

  it("si nada cambia, devuelve el mismo objeto", () => {
    const exp = conRecibos();
    expect(conMontosVigentes(exp, [recibo("d1", "5000"), recibo("d2", "7000")])).toBe(exp);
    expect(conMontosVigentes(exp, [])).toBe(exp);
  });

  it("un requisito del formato viejo no acaba contando dos veces", () => {
    const exp = contrato({ requisitos: [
      { id: "r1", titulo: "Materiales", monto: 22000, archivo: adjunto("a1", "d1", 5000) },
    ] });
    const v = conMontosVigentes(exp, [recibo("d1", "8000")]);
    expect(archivosDe(v.requisitos[0])).toHaveLength(1);
    expect(v.requisitos[0].archivo).toBeUndefined();
    expect(calcularMontos(v).comprobado).toBe(8000);
  });

  it("un expediente sin requisitos no se rompe", () => {
    expect(conMontosVigentes({ requisitos: [] }, [])).toEqual({ requisitos: [] });
    expect(conMontosVigentes(null, [])).toBe(null);
  });

  it("montoVigente, caso por caso", () => {
    expect(montoVigente(adjunto("a1", "d1", 5000), [recibo("d1", "6000")])).toBe(6000);
    expect(montoVigente(adjunto("a1", "d1", 5000), [])).toBe(5000);
    expect(montoVigente(pdf("p1", "hh", 3000), [recibo("p1", "6000")])).toBe(3000);
    expect(montoVigente({ origen: "interno", docId: "d1" }, [recibo("d1", "6000")])).toBe(6000);
    expect(montoVigente(null, [])).toBe(null);
  });
});

describe("duplicados", () => {
  it("el mismo PDF en dos contratos es grave", () => {
    const a = contrato({ id: "A" }); const b = contrato({ id: "B" });
    a.requisitos[0].archivos = [pdf("x", "MISMO", 1000, "2026-09-20T10:00:00Z")];
    b.requisitos[0].archivos = [pdf("y", "MISMO", 1000, "2026-09-21T10:00:00Z")];
    const g = duplicados([a, b]);
    expect(g).toHaveLength(1);
    expect(g[0].alcance).toBe("entre-expedientes");
    expect(destinoDuplicado(g[0]).docId).toBe("B");          // el más reciente
    expect(destinoDuplicado(g[0], "B").docId).toBe("A");
  });

  it("una factura interna se identifica por su id aunque cambie su hash", () => {
    const a = contrato({ id: "A" }); const b = contrato({ id: "B" });
    a.requisitos[0].archivos = [{ aid: "1", origen: "interno", docId: "F1", hash: "antes" }];
    b.requisitos[1].archivos = [{ aid: "2", origen: "interno", docId: "F1", hash: "despues" }];
    expect(duplicados([a, b])[0].clave).toBe("doc:F1");
    expect(claveDup(a.requisitos[0].archivos[0])).toBe("doc:F1");
    expect(dondeEstaAdjunto("F1", [a, b]).map(s => s.expId)).toEqual(["A", "B"]);
  });

  it("repetido dentro del mismo contrato es de menor gravedad", () => {
    const a = contrato();
    a.requisitos[0].archivos = [pdf("x", "H", 100)];
    a.requisitos[1].archivos = [pdf("y", "H", 100)];
    expect(duplicados([a])[0].alcance).toBe("mismo-expediente");
  });
});

describe("integridad de vínculos", () => {
  const cadena = [{ hash: "b0", action: "CREACIÓN" }, { hash: "b1", action: "EDICIÓN" }];
  const adj = (hash) => ({ origen: "interno", docId: "F1", hash });

  it("vigente si la cabeza no cambió", () => {
    expect(estadoVinculo(adj("b1"), { chain: cadena }).estado).toBe("vigente");
  });
  it("ampliado si se agregaron bloques después (p. ej. una firma)", () => {
    const e = estadoVinculo(adj("b1"), { chain: [...cadena, { hash: "b2", action: "FIRMA" }] });
    expect(e.estado).toBe("ampliado"); expect(e.nuevos).toBe(1);
  });
  it("alterado si la huella ya no está en la historia", () => {
    expect(estadoVinculo(adj("b1"), { chain: [{ hash: "otro", action: "CREACIÓN" }] }).estado).toBe("alterado");
  });
  it("faltante si el documento ya no existe", () => {
    expect(estadoVinculo(adj("b1"), null).estado).toBe("faltante");
  });
});

describe("panel de vencimientos", () => {
  it("separa vencidos, por vencer y completos", () => {
    const vencido = contrato({ id: "V", fechaLimite: "2026-09-10", fases: [] });
    const pronto  = contrato({ id: "P", fechaLimite: "2026-09-24", fases: [] });
    const listo   = contrato({ id: "L", fases: [] });
    listo.requisitos.forEach(r => { r.archivos = [pdf(r.id, r.id + "h", r.monto)]; });
    const p = panelExpedientes([vencido, pronto, listo]);
    expect(p.vencidos.map(f => f.doc.id)).toEqual(["V"]);
    expect(p.porVencer.map(f => f.doc.id)).toEqual(["P"]);
    expect(p.completos.map(f => f.doc.id)).toEqual(["L"]);
  });
});

describe("consultas y solicitudes", () => {
  it("registra una consulta por persona y día, sólo si está compartido", () => {
    const d = contrato({ sharedWith: ["luis@x.com"], chain: [] });
    expect(debeRegistrarConsulta(contrato({ chain: [] }), "U2")).toBe(false);
    expect(debeRegistrarConsulta(d, "U2")).toBe(true);
    d.chain = [{ action: "CONSULTA", meta: { uid: "U2" }, timestamp: "2026-09-21T09:00:00Z" }];
    expect(debeRegistrarConsulta(d, "U2")).toBe(false);
  });

  it("agrupa las consultas por persona", () => {
    const r = resumenConsultas([
      { action: "CONSULTA", author: "Luis", meta: { email: "l@x" }, timestamp: "2026-09-20T01:00:00Z" },
      { action: "CONSULTA", author: "Luis", meta: { email: "l@x" }, timestamp: "2026-09-21T01:00:00Z" },
    ]);
    expect(r).toEqual([expect.objectContaining({ email: "l@x", veces: 2, ultima: "2026-09-21T01:00:00Z" })]);
  });

  it("pendientes por correo sin importar mayúsculas y cierre al comprobar", () => {
    const d = contrato({ solicitudes: [
      { sid: "s1", reqId: "r2", paraEmail: "luis@x.com", estado: "pendiente", deUid: "U1" },
    ] });
    expect(misPendientes([d], "U9", "Luis@X.com")).toHaveLength(1);
    const { solicitudes, cerradas } = cerrarSolicitudes(d, "r2", "Luis");
    expect(cerradas).toBe(1);
    expect(solicitudes[0].estado).toBe("cumplida");
  });
});

// ← NUEVO: «Revisar proveedores» sólo donde hay algo que revisar.
//
// El botón salía en todos los expedientes, incluso en uno sin una sola
// factura. Ahí no hacía nada, y de paso le decía al usuario que el
// producto es para gente con proveedores. El nicho de entrada vive en
// el discurso, no en las palabras de la pantalla.
describe("los RFC de un expediente", () => {
  it("un expediente sin nada fiscal no ofrece la revisión", () => {
    expect(hayQueRevisarRFCs({ kind:"expediente", requisitos:[
      { id:"r1", titulo:"Diseño del póster", tipo:"entregable",
        archivos:[{ aid:"a1", nombre:"poster.pdf", hash:"h1" }] },
    ] })).toBe(false);
    expect(hayQueRevisarRFCs({})).toBe(false);
    expect(hayQueRevisarRFCs(null)).toBe(false);
  });

  it("los recoge de las partes del contrato", () => {
    expect(rfcsDeExpediente({ partes:[
      { rol:"Contratista", nombre:"Luis", rfc:"PELU850315AB2" },
      { rol:"Cliente", nombre:"Ana" },
    ] })).toEqual(["PELU850315AB2"]);
  });

  it("los recoge de los campos del formulario", () => {
    expect(rfcsDeExpediente({ fields:{ rfcEmisor:"AAA010101AAA" } }))
      .toEqual(["AAA010101AAA"]);
  });

  it("los recoge de lo que el servidor sacó de cada CFDI", () => {
    const rfcs = rfcsDeExpediente({ requisitos:[
      { id:"r1", archivos:[{ aid:"a1", fiscal:{ rfcEmisor:"AAA010101AAA", rfcReceptor:"BBB020202BBB" } }] },
    ] });
    expect(rfcs.sort()).toEqual(["AAA010101AAA","BBB020202BBB"]);
  });

  it("no repite el mismo RFC escrito de dos formas", () => {
    expect(rfcsDeExpediente({
      fields:{ rfcEmisor:"aaa010101aaa" },
      partes:[{ nombre:"x", rfc:" AAA010101AAA " }],
    })).toEqual(["AAA010101AAA"]);
  });

  it("con un solo RFC en cualquier lado, la revisión se ofrece", () => {
    expect(hayQueRevisarRFCs({ partes:[{ nombre:"x", rfc:"AAA010101AAA" }] })).toBe(true);
  });
});

// ── ¿Qué comprobante lleva importe? (10 oct) ──────────────────
//
// El campo «Importe» salía en todo lo adjunto. En un entregable o un
// enlace no significa nada, y además engordaba el aviso de «N
// comprobantes sin importe anotado» con cosas que nunca van a tener
// uno: un reproche imposible de quitar.
import { llevaImporte } from "../src/smartContract";

describe("llevaImporte", () => {
  const archivo = { aid: "a1", nombre: "factura.pdf" };
  const enlace  = { aid: "a2", origen: "enlace", url: "https://x.com/", nombre: "Sitio" };

  it("sí, cuando el requisito es la prueba de un pago", () => {
    expect(llevaImporte({ tipo: "comprobante" }, archivo)).toBe(true);
  });

  it("no, cuando el requisito es un entregable o un papel", () => {
    expect(llevaImporte({ tipo: "entregable" }, archivo)).toBe(false);
    expect(llevaImporte({ tipo: "documento" },  archivo)).toBe(false);
  });

  it("la foto de un recibo conserva su campo", () => {
    // Lo que manda es PARA QUÉ sirve el requisito, no si la evidencia
    // es una imagen. En obra, el recibo de la ferretería llega como
    // foto del teléfono y su importe hay que poder anotarlo.
    const foto = { aid: "a3", nombre: "recibo.jpg", tipo: "image/jpeg" };
    expect(llevaImporte({ tipo: "comprobante" }, foto)).toBe(true);
  });

  it("un enlace nunca, ni en un requisito de pago", () => {
    expect(llevaImporte({ tipo: "comprobante" }, enlace)).toBe(false);
  });

  it("un importe ya anotado no se esconde jamás", () => {
    // Esconder un dato que alguien capturó es perderlo sin avisar.
    expect(llevaImporte({ tipo: "entregable" }, { ...archivo, monto: 500 })).toBe(true);
    expect(llevaImporte({ tipo: "comprobante" }, { ...enlace, monto: 500 })).toBe(true);
  });

  it("sin tipo (expedientes viejos) se enseña", () => {
    expect(llevaImporte({}, archivo)).toBe(true);
    expect(llevaImporte(undefined, archivo)).toBe(true);
  });
});

describe("el aviso de «sin importe anotado»", () => {
  const exp = (tipo, archivos) => ({
    moneda: "MXN", montoTotal: 1000,
    requisitos: [{ id: "r1", titulo: "X", tipo, monto: 1000, archivos }],
  });

  it("no cuenta lo que no puede llevar importe", () => {
    expect(calcularMontos(exp("entregable", [{ aid: "a1", nombre: "obra.jpg" }])).sinImporte).toBe(0);
    expect(calcularMontos(exp("comprobante",
      [{ aid: "a2", origen: "enlace", url: "https://x.com/" }])).sinImporte).toBe(0);
  });

  it("y sí cuenta la factura a la que de verdad le falta", () => {
    expect(calcularMontos(exp("comprobante", [{ aid: "a3", nombre: "factura.pdf" }])).sinImporte).toBe(1);
  });

  it("deja de contarla en cuanto se anota", () => {
    expect(calcularMontos(exp("comprobante",
      [{ aid: "a3", nombre: "factura.pdf", monto: 1000 }])).sinImporte).toBe(0);
  });
});

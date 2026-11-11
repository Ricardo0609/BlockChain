// La revisión diaria: qué avisa y qué no.
//
// Un sistema de avisos se rompe de dos maneras, y las dos son graves:
// avisando de más, hasta que la gente los ignora, o avisando de menos,
// hasta que no sirven. Estas pruebas cuidan las dos orillas.
import { describe, it, expect } from "vitest";
import {
  vencimientosDe, tocaRevisar, DIAS_AVISO, DIAS_REVISION,
} from "../functions/lib/revision.js";

const AHORA = Date.parse("2026-09-27T12:00:00.000Z");
const dia = 86400000;
const fecha = (n) => new Date(AHORA + n * dia).toISOString().slice(0, 10);

const op = (extra) => ({ id: "op1", title: "Barda de concreto", ownerUid: "U1", ...extra });

describe("vencimientos de fases", () => {
  const conFase = (fechaLimite, requisitos = []) => op({
    fases: [{ id: "f1", titulo: "Anticipo", fechaLimite }],
    requisitos,
  });

  it("avisa de una fase que vence dentro del plazo de anticipación", () => {
    const v = vencimientosDe(conFase(fecha(2)), AHORA);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ tipo: "fase-por-vencer", fase: "Anticipo", titulo: "Barda de concreto" });
  });

  it("no avisa de una que todavía está lejos", () => {
    expect(vencimientosDe(conFase(fecha(30)), AHORA)).toEqual([]);
  });

  it("una fase ya vencida se avisa distinto, porque no es lo mismo", () => {
    expect(vencimientosDe(conFase(fecha(-5)), AHORA)[0].tipo).toBe("fase-vencida");
  });

  it("justo en el límite de anticipación todavía avisa", () => {
    expect(vencimientosDe(conFase(fecha(DIAS_AVISO)), AHORA)).toHaveLength(1);
    expect(vencimientosDe(conFase(fecha(DIAS_AVISO + 1)), AHORA)).toEqual([]);
  });

  it("NO avisa de una fase cuyos requisitos ya están todos cumplidos", () => {
    const cumplida = conFase(fecha(1), [
      { id: "r1", fase: "f1", estado: "cumplido", titulo: "Factura" },
      { id: "r2", fase: "f1", estado: "cumplido", titulo: "Reporte" },
    ]);
    expect(vencimientosDe(cumplida, AHORA)).toEqual([]);
  });

  it("pero sí avisa si falta uno solo", () => {
    const aMedias = conFase(fecha(1), [
      { id: "r1", fase: "f1", estado: "cumplido", titulo: "Factura" },
      { id: "r2", fase: "f1", estado: "pendiente", titulo: "Reporte" },
    ]);
    expect(vencimientosDe(aMedias, AHORA).some((x) => x.tipo === "fase-por-vencer")).toBe(true);
  });

  it("una fase sin fecha no genera avisos", () => {
    expect(vencimientosDe(conFase(null), AHORA)).toEqual([]);
  });
});

describe("vencimientos de requisitos", () => {
  it("avisa de uno pendiente que está por vencer", () => {
    const v = vencimientosDe(op({ requisitos: [
      { id: "r1", titulo: "Factura de cemento", estado: "pendiente", fechaLimite: fecha(1) }] }), AHORA);
    expect(v[0]).toMatchObject({ tipo: "requisito-por-vencer", requisito: "Factura de cemento" });
  });

  it("NO avisa de uno ya cumplido, aunque su fecha haya pasado", () => {
    expect(vencimientosDe(op({ requisitos: [
      { id: "r1", titulo: "Factura", estado: "cumplido", fechaLimite: fecha(-10) }] }), AHORA))
      .toEqual([]);
  });

  it("distingue vencido de por vencer", () => {
    const v = vencimientosDe(op({ requisitos: [
      { id: "r1", titulo: "A", estado: "pendiente", fechaLimite: fecha(-1) },
      { id: "r2", titulo: "B", estado: "pendiente", fechaLimite: fecha(1) }] }), AHORA);
    expect(v.map((x) => x.tipo)).toEqual(["requisito-vencido", "requisito-por-vencer"]);
  });

  it("un expediente sin nada no genera ruido", () => {
    expect(vencimientosDe(op({}), AHORA)).toEqual([]);
    expect(vencimientosDe(op({ fases: [], requisitos: [] }), AHORA)).toEqual([]);
  });
});

// ── EL CONTRATO QUE SE ACABA (11 nov) ───────────────────────────
//
// El agujero, encontrado por Ricardo: «que pasa si alguien usa un
// contrato inteligente para hacer un contrato de arrendamiento, lo
// cual no pide adjuntar nada solo una firma de ambas partes [...] y si
// tiene fecha de fin».
//
// Hasta hoy la respuesta era: no pasa nada. NUNCA. Todo lo que se
// vigilaba colgaba de la lista de requisitos -fases y requisitos con
// fecha- y ese contrato no tiene lista. Se vencia y nadie se enteraba.
//
// No faltaba una funcionalidad: lo que habia estaba mirando al sitio
// equivocado.
describe("el contrato mismo, cuando se acaba", () => {
  const arrendamiento = (fin) =>
    op({ title: "Arrendamiento Av. Juarez 120", fechaLimite: fin, requisitos: [], fases: [] });

  it("LA QUE IMPORTA: un contrato sin requisitos SI avisa", () => {
    // Antes esto devolvia [] para cualquier fecha. Si vuelve a hacerlo,
    // el arrendamiento se vence en silencio otra vez.
    const v = vencimientosDe(arrendamiento(fecha(14)), AHORA);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({
      tipo: "contrato-por-terminar", faltan: 14, hito: 14, sinRequisitos: true,
    });
  });

  it("avisa a las dos semanas y a la semana, marcadas como hito", () => {
    // Los dos dias que se pidieron. El `hito` existe para que el correo
    // -cuando lo haya- salga solo en esos dos, y no catorce veces.
    expect(vencimientosDe(arrendamiento(fecha(14)), AHORA)[0].hito).toBe(14);
    expect(vencimientosDe(arrendamiento(fecha(7)), AHORA)[0].hito).toBe(7);
  });

  it("los dias de en medio avisan en la app, pero sin hito", () => {
    // Dentro de la app el aviso se reemplaza cada manana, asi que
    // repetirlo no molesta y desaparecer un dia si confundiria.
    const v = vencimientosDe(arrendamiento(fecha(10)), AHORA);
    expect(v[0].tipo).toBe("contrato-por-terminar");
    expect(v[0].faltan).toBe(10);
    expect(v[0].hito).toBe(null);
  });

  it("antes de las dos semanas, nada", () => {
    // La otra orilla: avisar de un arrendamiento que acaba en tres
    // meses es ensenarle a la gente a ignorar los avisos.
    expect(vencimientosDe(arrendamiento(fecha(15)), AHORA)).toEqual([]);
    expect(vencimientosDe(arrendamiento(fecha(90)), AHORA)).toEqual([]);
  });

  it("y cuando ya paso, lo dice en pasado", () => {
    const v = vencimientosDe(arrendamiento(fecha(-3)), AHORA);
    expect(v[0]).toMatchObject({ tipo: "contrato-terminado", faltan: -3 });
  });

  it("el dia exacto cuenta como hoy, no como vencido", () => {
    const v = vencimientosDe(arrendamiento(fecha(0)), AHORA);
    expect(v[0].tipo).toBe("contrato-por-terminar");
    expect(v[0].faltan).toBe(0);
  });

  it("uno ya cerrado no avisa de nada", () => {
    // Un arrendamiento que se dio por terminado antes de tiempo no
    // tiene que seguir recordandote una fecha que ya no significa nada.
    const cerrado = op({ fechaLimite: fecha(7), requisitos: [], cerradoEn: "2026-09-01" });
    expect(vencimientosDe(cerrado, AHORA)).toEqual([]);
  });

  it("sin fecha de fin no hay nada que avisar", () => {
    expect(vencimientosDe(op({ requisitos: [], fases: [] }), AHORA)).toEqual([]);
  });

  it("un contrato CON requisitos tambien avisa, y se distingue", () => {
    // Vale para los dos casos, pero se dicen distinto: ahi la fecha es
    // un plazo para terminar de entregar, no el fin de un alquiler.
    const conObra = op({
      fechaLimite: fecha(7),
      requisitos: [{ id: "r1", titulo: "Factura del material", estado: "pendiente" }],
    });
    const v = vencimientosDe(conObra, AHORA).filter((x) => x.tipo === "contrato-por-terminar");
    expect(v).toHaveLength(1);
    expect(v[0].sinRequisitos).toBe(false);
  });

  it("no tapa los avisos de las fases: conviven", () => {
    const mixto = op({
      fechaLimite: fecha(7),
      fases: [{ id: "f1", titulo: "Anticipo", fechaLimite: fecha(2) }],
      requisitos: [{ id: "r1", titulo: "Recibo", fase: "f1", estado: "pendiente" }],
    });
    const tipos = vencimientosDe(mixto, AHORA).map((x) => x.tipo).sort();
    expect(tipos).toContain("fase-por-vencer");
    expect(tipos).toContain("contrato-por-terminar");
  });
});

describe("qué facturas toca volver a consultar", () => {
  const conArchivo = (fiscal, extra = {}) => op({ requisitos: [
    { id: "r1", titulo: "Factura", archivos: [
      { aid: "a1", nombre: "f.xml", ruta: "evidencias/U1/op1/a1", fiscal, ...extra }] }] });

  it("una revisada hace tiempo, sí", () => {
    const v = tocaRevisar(conArchivo({ uuid: "U-1", estadoSAT: "vigente",
      revisadoEn: new Date(AHORA - (DIAS_REVISION + 1) * dia).toISOString() }), AHORA);
    expect(v).toHaveLength(1);
    expect(v[0].archivo.aid).toBe("a1");
  });

  it("una revisada ayer, no: consultar al SAT cuesta y no cambia tan seguido", () => {
    expect(tocaRevisar(conArchivo({ uuid: "U-1", estadoSAT: "vigente",
      revisadoEn: new Date(AHORA - dia).toISOString() }), AHORA)).toEqual([]);
  });

  it("una ya cancelada, no: eso ya se avisó y no va a mejorar", () => {
    expect(tocaRevisar(conArchivo({ uuid: "U-1", estadoSAT: "cancelado",
      revisadoEn: new Date(AHORA - 100 * dia).toISOString() }), AHORA)).toEqual([]);
  });

  it("un archivo que no es factura, no", () => {
    expect(tocaRevisar(conArchivo(null), AHORA)).toEqual([]);
  });

  it("una factura sin archivo guardado tampoco se puede revisar", () => {
    const sinRuta = op({ requisitos: [{ id: "r1", archivos: [
      { aid: "a1", fiscal: { uuid: "U-1", revisadoEn: new Date(0).toISOString() } }] }] });
    expect(tocaRevisar(sinRuta, AHORA)).toEqual([]);
  });

  it("una sin fecha de revisión se revisa: es la primera vez", () => {
    expect(tocaRevisar(conArchivo({ uuid: "U-1", estadoSAT: "vigente" }), AHORA)).toHaveLength(1);
  });

  it("devuelve también el requisito, que hace falta para cotejar el importe", () => {
    const v = tocaRevisar(conArchivo({ uuid: "U-1", estadoSAT: "vigente" }), AHORA);
    expect(v[0].req.id).toBe("r1");
  });

  it("un expediente sin requisitos no rompe nada", () => {
    expect(tocaRevisar(op({}), AHORA)).toEqual([]);
    expect(tocaRevisar(op({ requisitos: [{ id: "r1" }] }), AHORA)).toEqual([]);
  });
});

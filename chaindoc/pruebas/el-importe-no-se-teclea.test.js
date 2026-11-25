// El importe de un archivo suelto ya no se escribe a mano, y el
// archivo se puede ver desde su propia tarjeta.
//
// Ricardo, mirando un expediente con una foto que había subido la
// otra parte por un enlace (25 nov):
//
//   «Ahí es una foto que se subió y, según yo, habíamos dicho que ese
//    campo de importe no debería estar porque lo podrían alterar.»
//   «Y que ahí mismo también esté el botón de ver, para poder ver esa
//    imagen.»
//
// ── POR QUÉ PESABA MÁS DE LO QUE PARECÍA ─────────────────────
//
// No era sólo un campo de más. Esa cifra entra en `comprobado`, que
// `calcularMontos` compara con lo pactado, así que una cantidad
// TECLEADA sobre la foto de otra persona acababa sosteniendo el
// «faltan $3,000» del expediente. Un número escrito encima de una
// imagen no prueba nada, y aquí pesaba como si probara.
//
// La decisión, suya: sólo cuenta lo que se puede comprobar. El
// importe sale de un documento de OCTAVIN, que lo LEE del archivo.
// Quien necesite que su foto cuente, la convierte en recibo.
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { renderExpediente } from "../src/pantallas/Expediente.jsx";
import { calcularMontos, llevaImporte } from "../src/smartContract";

const nada = () => {};
const FOTO = { aid: "f1", nombre: "recibo de luz.png", tipo: "image/png",
  tam: 706560, hash: "7bb4".padEnd(64, "c"), subidoEn: "2026-11-25T17:08:00Z",
  subidoPor: "Entrega por invitación" };
const DOC = { aid: "i1", origen: "interno", docId: "d9", numId: "F-0007",
  nombre: "Factura del anticipo", monto: 35000, hash: "9f2c".padEnd(64, "a"),
  subidoEn: "2026-11-22T16:04:00Z", subidoPor: "Ricardo" };

const mkCtx = (archivos, { puedo = () => true, getFile = nada } = {}) => {
  const d = { id: "e1", kind: "expediente", numId: "OCT-0042", ownerUid: "U1",
    title: "Remodelación", content: "<p>Obra.</p>", moneda: "MXN",
    fases: [], chain: [], acuerdo: { pedidoEn: "2026-11-01", firmas: [] },
    requisitos: [{ id: "r1", titulo: "Comprobantes de servicios",
      tipo: "comprobante", obligatorio: true, estado: "cumplido", archivos }] };
  const ctx = {
    d, dv: d, docs: [d], uid: "U1", user: "Ricardo", acctEmail: "r@x.mx",
    expTab: "expediente", anclajesPorHash: {}, bioCreds: [], bioOk: false,
    filesOpen: {}, subiendoReq: null, modal: null, acu: { estado: "vigente" },
    puedo, puedoSubirA: () => true, revisando: null, showHashes: {}, getFile,
    vinculos: {}, verifVin: false, dupPorClave: {}, focoDup: null,
    reqTitulo: "", reqDesc: "", reqVisto: false, reqBusy: false, reqErr: "",
    rechMotivoAdj: "", accesos: [], saving: false, faseSel: null,
    enlReq: null, enlUrl: "", enlNom: "", enlErr: "", enlBusy: false,
    verificandoFiscal: null, esperaMiFirma: false, ROL_TEXTO: {}, ROL_AYUDA: {},
    claveDup: () => "k", destinoDuplicado: () => null,
  };
  for (const k of [
    "setExpTab", "setFasesEnOrden", "setFilesOpen", "setMIn", "setPass",
    "setShareModo", "setShareTodo", "setShareReqs", "setShareRol", "setModal",
    "setShowHashes", "setFocoDup", "setFaseSel", "setEnlaceNuevo", "setEnlUrl",
    "setEnlNom", "setReqTitulo", "setReqDesc", "setReqVisto", "setRechMotivoAdj",
    "attachEvidence", "removeEvidence", "openDoc", "irADuplicado",
    "cancelarSolicitud", "verificarFiscal", "aprobarEntrega", "pedirRechazo",
    "confirmarRechazo", "abrirEnlace", "cerrarEnlace", "guardarEnlace",
    "pedirRequisito", "quitarEsteRequisito", "guardarRequisito",
    "confirmarQuitarRequisito",
  ]) ctx[k] = nada;
  return ctx;
};
const pantalla = (archivos, opc) => renderToStaticMarkup(renderExpediente(mkCtx(archivos, opc)));
/** La pantalla SIN pintar: elementos de React, con sus manejadores. */
const arbol = (archivos, opc) => renderExpediente(mkCtx(archivos, opc));

/** El primer elemento del árbol que cumpla la condición. */
function buscar(nodo, cumple) {
  if (!nodo || typeof nodo !== "object") return null;
  if (Array.isArray(nodo)) {
    for (const x of nodo) { const r = buscar(x, cumple); if (r) return r; }
    return null;
  }
  if (cumple(nodo)) return nodo;
  return buscar(nodo.props?.children, cumple);
}

// ══════════════════════════════════════════════════════════════
// 1. NO HAY DONDE TECLEAR UN IMPORTE
// ══════════════════════════════════════════════════════════════
describe("el importe de una foto", () => {
  it("no tiene campo donde escribirse", () => {
    const html = pantalla([FOTO]);
    expect(html).toContain("recibo de luz.png");
    expect(html).not.toContain("exp-monto-in");
    expect(html).not.toContain('placeholder="0.00"');
  });

  it("y la fila del importe ni siquiera sale", () => {
    // Una fila «Importe: —» sobre una foto invita a buscar dónde se
    // pone, que es justo lo que ya no se puede.
    expect(pantalla([FOTO])).not.toContain("exp-monto");
  });

  it("pero un documento de OCTAVIN sí lo enseña, leído de él", () => {
    const html = pantalla([DOC]);
    expect(html).toContain("exp-monto");
    expect(html).toContain("del documento");
    expect(html).not.toContain("exp-monto-in");
  });

  it("y nadie quedó llamando al guardador que se fue", () => {
    // `setMontoReq` se borró con su campo. Si alguien lo vuelve a
    // invocar sin volver a escribirlo, la pantalla reventaría al
    // pulsar.
    expect(pantalla([FOTO, DOC])).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════
// 2. LO YA ANOTADO NO SE ESCONDE, PERO SE DICE QUIÉN LO PUSO
// ══════════════════════════════════════════════════════════════
describe("un importe que ya estaba escrito", () => {
  const VIEJA = { ...FOTO, monto: 1240.5 };

  it("se sigue viendo: el expediente se cuadró con él", () => {
    const html = pantalla([VIEJA]);
    expect(html).toContain("1,240.50");
  });

  it("pero marcado, para que nadie lo confunda con uno leído", () => {
    const html = pantalla([VIEJA]);
    expect(html).toContain("escrito a mano");
    expect(html).not.toContain("del documento");
  });

  it("y aun así no se puede cambiar", () => {
    expect(pantalla([VIEJA])).not.toContain("exp-monto-in");
  });
});

// ══════════════════════════════════════════════════════════════
// 3. LAS CUENTAS: SÓLO SUMA LO QUE SE PUEDE COMPROBAR
// ══════════════════════════════════════════════════════════════
describe("las cuentas del expediente", () => {
  const exp = (archivos) => ({ moneda: "MXN", montoTotal: 35000,
    requisitos: [{ id: "r1", titulo: "X", tipo: "comprobante",
      monto: 35000, archivos }] });

  it("una foto sin importe no reprocha nada", () => {
    // La otra mitad de quitar el campo. Si el aviso siguiera
    // contándolas, cada foto pediría para siempre un importe que ya
    // no hay forma de anotar.
    expect(calcularMontos(exp([FOTO])).sinImporte).toBe(0);
    expect(llevaImporte({ tipo: "comprobante" }, FOTO)).toBe(false);
  });

  it("y un documento al que le falta, sí", () => {
    const sinCifra = { ...DOC, monto: undefined };
    expect(calcularMontos(exp([sinCifra])).sinImporte).toBe(1);
  });

  it("lo comprobado sale del documento", () => {
    const m = calcularMontos(exp([DOC]));
    expect(m.comprobado).toBe(35000);
    expect(m.restante).toBe(0);
  });

  it("y un importe viejo escrito a mano sigue contando", () => {
    // No se le quita al expediente una cuenta que ya tenía hecha.
    expect(calcularMontos(exp([{ ...FOTO, monto: 1240.5 }])).comprobado).toBe(1240.5);
  });
});

// ══════════════════════════════════════════════════════════════
// 4. PODER VER EL ARCHIVO DESDE SU TARJETA
// ══════════════════════════════════════════════════════════════
describe("ver el archivo ahí mismo", () => {
  it("hay un botón «Ver» junto a «Retirar»", () => {
    // Antes la tarjeta enseñaba el nombre, el peso, la huella y un
    // botón de retirar, y ninguna forma de mirar lo que te acababan
    // de mandar: había que bajar a la lista de adjuntos y
    // desbloquearla. Es raro decidir si se retira algo sin poder
    // abrirlo, y más raro aún darle el visto bueno.
    const html = pantalla([FOTO]);
    expect(html).toContain(">Ver<");
    expect(html).toContain("Retirar");
  });

  it("y no sale sobre lo que no se puede previsualizar", () => {
    const raro = { ...FOTO, nombre: "hoja.xlsx",
      tipo: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
    expect(pantalla([raro])).not.toContain(">Ver<");
  });

  it("ni sobre un documento de OCTAVIN, que tiene el suyo", () => {
    const html = pantalla([DOC]);
    expect(html).toContain("Abrir documento");
    expect(html).not.toContain(">Ver<");
  });

  it("y «Ver huella» sigue siendo otra cosa, no se pisan", () => {
    const html = pantalla([FOTO]);
    expect(html).toContain("Ver huella");
    expect(html).toContain(">Ver<");
  });

  it("y ABRE el archivo, no lo descarga", () => {
    // Esto no se ve en el HTML: lo que separa ver de descargar es un
    // `false` dentro del manejador, y el texto del botón sale igual
    // de los dos modos. Un mutante que cambiara ese `false` por
    // `true` pasaría en verde mirando la pantalla, y quien pulsara
    // «Ver» se encontraría un archivo en su carpeta de descargas.
    // Así que aquí se pulsa el botón de verdad.
    const pedido = [];
    const vista = arbol([FOTO], { getFile: (a, bajar) => pedido.push({ a, bajar }) });
    const boton = buscar(vista, (el) =>
      el?.type === "button" && el?.props?.children === "Ver");
    expect(boton, "no se encontró el botón «Ver»").toBeTruthy();
    boton.props.onClick();
    expect(pedido).toHaveLength(1);
    expect(pedido[0].a.nombre).toBe("recibo de luz.png");
    expect(pedido[0].bajar).toBe(false);
  });
});

// Terminado y Cerrado son dos cosas distintas.
//
// LAS DEFINICIONES SON DE RICARDO (23 nov):
//
//   «Terminado cuando ya se adjuntaron todos los archivos y
//    finalizaron todas las fases. Cerrado cuando los dos firmaron
//    para concluir y aceptar de que ya está todo bien.»
//
// Y cómo llega, al preguntárselo: «la opción uno, o sea el que dice
// llega solo, pero que quede pendiente y que avise o se note que
// falta por firmar de cerrado».
//
// Esa segunda mitad es la que hace que la primera sirva de algo. Un
// «Terminado» a secas se lee como el final, y entonces nadie daría
// nunca las firmas de cierre: el estado «Cerrado» existiría en el
// código y no en la vida.
//
// ── LA TRAMPA QUE HAY QUE ESQUIVAR ───────────────────────────
//
// Esto ya se intentó el 18 de octubre y salió mal. El comentario que
// quedó en `estadoAcuerdo` lo cuenta: se hizo que el contrato se
// cerrara solo al estar todo entregado, y CERRÓ LA PUERTA POR
// DENTRO. «Entregado todo» lo decide la lista de requisitos, así que
// en cuanto cuadraba ya no se podía adjuntar nada más: ni la segunda
// factura del mismo requisito, ni la corrección de la primera.
//
// Lo que evita repetirlo es que «terminado» sea un CARTEL y no una
// puerta: tiene exactamente los mismos permisos que «vigente». La
// primera prueba de este archivo es ésa, y es la que no se puede
// dejar caer.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ACCIONES_POR_ESTADO, ESTADOS, ETIQUETA, TONO, TRANSICIONES,
  estadoAcuerdo, permiteEstado, transicionValida,
} from "../src/nucleo/acuerdo";
import { renderExpediente } from "../src/pantallas/Expediente.jsx";

const leer = (r) => readFileSync(resolve(process.cwd(), r), "utf8");

const HOY = new Date("2026-11-23T12:00:00Z");
const firma = (parte, momento) => ({
  parte, momento, fecha: "2026-11-01T10:00:00Z", nombre: parte, uid: parte,
});
/** Un contrato aceptado por las dos partes, con un requisito. */
const YO = "ricardo@octavin.mx";    // el emisor: quien mandó el contrato
const ELLA = "ana@x.mx";            // la receptora: quien lo recibió
const trato = ({ archivos = [], extra = {}, reqs } = {}) => ({
  id: "e1", kind: "expediente", owner: "Ricardo", ownerEmail: YO, chain: [],
  requisitos: reqs || [{ id: "r1", titulo: "Anticipo", obligatorio: true, archivos }],
  acuerdo: {
    pedidoEn: "2026-11-01T09:00:00Z", paraEmail: ELLA, paraNombre: "Ana",
    firmas: [firma("emisor", "aceptacion"), firma("receptor", "aceptacion")],
    ...extra,
  },
});
const ARCH = { aid: "a1", nombre: "f.pdf" };

// ── PINTAR LA PANTALLA DE VERDAD ──────────────────────────────
//
// Buscar el texto en el ARCHIVO no comprueba nada sobre la PANTALLA.
// Un mutante que cambie la condicion por `false` deja el texto
// intacto dentro de una rama muerta y una prueba que lee el codigo
// fuente pasa en verde mientras la persona no ve nada. Dos mutantes
// se escaparon asi antes de escribir esto.
//
// La pantalla es una funcion, no un componente, asi que se la puede
// llamar con un ctx y leer el HTML que sale. Y el `acu` sale de
// `estadoAcuerdo`, no a mano: asi se comprueba la cadena entera, del
// dato al pixel.
const nada = () => {};
const pantalla = (exp, { puedo = () => true, yo = YO, user = "Ricardo" } = {}) => {
  const acu = estadoAcuerdo(exp, { hoy: HOY });
  const ctx = {
    d: exp, docs: [exp], acu, vinculos: [], accesos: [], anclajesPorHash: {},
    user, acctEmail: yo,
    uid: "u1", expTab: "evidencia", faseSel: null, filesOpen: {}, showHashes: {},
    bioCreds: [], verifVin: {}, subiendoReq: {}, revisando: {}, focoDup: null,
    puedo, puedoSubirA: () => true, getFile: () => null, bioOk: false,
    esperaMiFirma: false, saving: false, verificandoFiscal: false,
    enlReq: null, enlUrl: "", enlNom: "", enlErr: "", enlBusy: false,
  };
  for (const k of [
    "setFaseSel", "setFilesOpen", "setFocoDup", "setMIn", "setModal",
    "setMontoReq", "setPass", "setExpTab", "setShowHashes", "setShareModo",
    "setShareTodo", "setShareReqs", "setShareRol", "setEnlaceNuevo",
    "setEnlUrl", "setEnlNom", "setFasesEnOrden", "attachEvidence",
    "removeEvidence", "openDoc", "irADuplicado", "cancelarSolicitud",
    "verificarFiscal", "aprobarEntrega", "pedirRechazo", "abrirEnlace",
    "cerrarEnlace", "guardarEnlace", "pedirRequisito", "quitarEsteRequisito",
  ]) ctx[k] = nada;
  return { html: renderToStaticMarkup(renderExpediente(ctx)), acu };
};
/** Lo que dice la banda de arriba, en texto plano. */
const banda = (html) => {
  const m = html.match(/class="acu-banda-d">([^<]*)/);
  return m ? m[1] : "";
};
const conforme = (parte) => firma(parte, "conformidad");

// ══════════════════════════════════════════════════════════════
// 1. LA QUE NO SE PUEDE DEJAR CAER
// ══════════════════════════════════════════════════════════════
describe("terminado no cierra ninguna puerta", () => {
  it("deja hacer EXACTAMENTE lo mismo que vigente", () => {
    // Si alguien le quita una acción a esta lista, el expediente se
    // congelará solo en cuanto cuadren las cuentas, que es el fallo
    // del 18 de octubre otra vez.
    expect(ACCIONES_POR_ESTADO.terminado).toEqual(ACCIONES_POR_ESTADO.vigente);
  });

  it("y en concreto se puede seguir entregando y corrigiendo", () => {
    for (const a of ["subir", "vincular", "retirar", "pedir-mas", "revisar"]) {
      expect(permiteEstado("terminado", a), a).toBe(true);
    }
  });

  it("y firmar el cierre, que es lo que toca", () => {
    expect(permiteEstado("terminado", "dar-conformidad")).toBe(true);
    expect(permiteEstado("terminado", "cerrar")).toBe(true);
  });

  it("pero no editar el contrato: está firmado", () => {
    expect(permiteEstado("terminado", "editar")).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// 2. CUÁNDO LLEGA, Y CUÁNDO SE VA
// ══════════════════════════════════════════════════════════════
describe("terminado llega solo", () => {
  it("en cuanto está todo entregado", () => {
    expect(estadoAcuerdo(trato({ archivos: [ARCH] }), { hoy: HOY }).estado)
      .toBe("terminado");
  });

  it("y antes de eso es vigente", () => {
    expect(estadoAcuerdo(trato(), { hoy: HOY }).estado).toBe("vigente");
  });

  it("pero NO si no había nada que entregar", () => {
    // `todoEntregado` de una lista vacía es `true` —«todos» de
    // ninguno—, así que sin esta condición un expediente sin un solo
    // requisito nacería «Terminado» sin que nadie hubiera entregado
    // nada.
    expect(estadoAcuerdo(trato({ reqs: [] }), { hoy: HOY }).estado).toBe("vigente");
    // Ni con requisitos sólo opcionales: tampoco obligan a nadie.
    expect(estadoAcuerdo(trato({ reqs: [{ id: "r1", obligatorio: false }] }),
      { hoy: HOY }).estado).toBe("vigente");
  });

  // ── Y SE VA, QUE ES LA OTRA MITAD ──
  it("y VUELVE a vigente si el dueño pide algo más", () => {
    // Es lo que demuestra que no congela nada. Si el camino fuera de
    // una sola dirección, «terminado» sería «cerrado» con otro
    // nombre.
    const t = trato({ archivos: [ARCH] });
    t.requisitos.push({ id: "r2", titulo: "Acta", obligatorio: true, archivos: [] });
    expect(estadoAcuerdo(t, { hoy: HOY }).estado).toBe("vigente");
    expect(transicionValida("terminado", "vigente")).toBe(true);
  });

  it("y si le rechaza un comprobante, también", () => {
    // Un archivo rechazado no es una entrega: es un intento. Ver
    // `ENTREGADO` en acuerdo.js.
    const t = trato({ archivos: [{ ...ARCH, rechazo: { motivo: "No" } }] });
    expect(estadoAcuerdo(t, { hoy: HOY }).estado).toBe("vigente");
  });

  it("y si espera su visto bueno, todavía no está terminado", () => {
    const t = trato({ reqs: [{ id: "r1", obligatorio: true, requiereVisto: true,
                               estado: "por-revisar", archivos: [ARCH] }] });
    expect(estadoAcuerdo(t, { hoy: HOY }).estado).toBe("vigente");
  });
});

// ══════════════════════════════════════════════════════════════
// 3. CERRADO ES OTRA COSA
// ══════════════════════════════════════════════════════════════
describe("cerrado: los dos firmaron", () => {
  it("con las dos conformidades", () => {
    const t = trato({ archivos: [ARCH], extra: { firmas: [
      firma("emisor", "aceptacion"), firma("receptor", "aceptacion"),
      firma("emisor", "conformidad"), firma("receptor", "conformidad"),
    ] } });
    expect(estadoAcuerdo(t, { hoy: HOY }).estado).toBe("cerrado");
  });

  it("y con una sola NO se cierra: sigue terminado", () => {
    // LA DISTINCIÓN ENTERA. Media firma no es el acuerdo de los dos,
    // y leerla como cierre es justo el malentendido que este
    // producto existe para evitar.
    const t = trato({ archivos: [ARCH], extra: { firmas: [
      firma("emisor", "aceptacion"), firma("receptor", "aceptacion"),
      firma("emisor", "conformidad"),
    ] } });
    const e = estadoAcuerdo(t, { hoy: HOY });
    expect(e.estado).toBe("terminado");
    expect(e.conformidadEmisor).toBe(true);
    expect(e.conformidadReceptor).toBe(false);
  });

  it("y cerrado no deja hacer nada más", () => {
    expect(ACCIONES_POR_ESTADO.cerrado).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════
// 4. QUE SE NOTE QUE FALTA FIRMAR
// ══════════════════════════════════════════════════════════════
describe("y se nota lo que falta", () => {
  it("la etiqueta lo lleva dentro, no dice «Terminado» a secas", () => {
    expect(ETIQUETA.terminado).toMatch(/falta firmar/i);
    expect(ETIQUETA.terminado).not.toBe("Terminado");
  });

  it("y se pinta como algo pendiente, no como algo logrado", () => {
    expect(TONO.terminado).toBe("espera");
    expect(TONO.cerrado).toBe("bien");
  });

  // ── Y AHORA PINTANDO LA PANTALLA ──
  it("la banda dice que faltan las DOS firmas", () => {
    const { html, acu } = pantalla(trato({ archivos: [ARCH] }));
    expect(acu.estado).toBe("terminado");
    expect(banda(html)).toMatch(/Falta que las dos partes firmen/);
  });

  // ── Y LO DICE SEGÚN QUIÉN MIRA ──
  //
  // Esto se escribió mal la primera vez: la banda hablaba como si
  // quien mira fuera siempre quien mandó el contrato. A la otra
  // parte le decía «falta que firmes tú» cuando ya había firmado, y
  // le ponía su propio nombre como el de la persona que falta.
  const SOLO_ELLA = { firmas: [firma("emisor", "aceptacion"),
    firma("receptor", "aceptacion"), conforme("receptor")] };
  const SOLO_YO = { firmas: [firma("emisor", "aceptacion"),
    firma("receptor", "aceptacion"), conforme("emisor")] };
  const comoElla = { yo: ELLA, user: "Ana" };

  it("si ya firmó ella y falto yo: a MÍ me dice «firmes tú»", () => {
    expect(banda(pantalla(trato({ archivos: [ARCH], extra: SOLO_ELLA })).html))
      .toMatch(/Falta que firmes tú/);
  });

  it("y a ELLA, en ese mismo caso, la manda a quien falta: a mí", () => {
    expect(banda(pantalla(trato({ archivos: [ARCH], extra: SOLO_ELLA }), comoElla).html))
      .toMatch(/Falta que firme Ricardo/);
  });

  it("si firmé yo y falta ella: a MÍ me la nombra", () => {
    expect(banda(pantalla(trato({ archivos: [ARCH], extra: SOLO_YO })).html))
      .toMatch(/Falta que firme Ana/);
  });

  it("y a ELLA, en ese mismo caso, le dice «firmes tú»", () => {
    expect(banda(pantalla(trato({ archivos: [ARCH], extra: SOLO_YO }), comoElla).html))
      .toMatch(/Falta que firmes tú/);
  });

  it("y a quien no es parte —un auditor— no le dice «tú» nunca", () => {
    const mirona = { yo: "auditor@despacho.mx", user: "Auditor" };
    for (const extra of [SOLO_ELLA, SOLO_YO]) {
      const t = banda(pantalla(trato({ archivos: [ARCH], extra }), mirona).html);
      expect(t).not.toMatch(/firmes tú/);
      expect(t).toMatch(/Falta que firme (Ricardo|Ana)/);
    }
  });

  it("y dice que todavía se puede subir, que es verdad", () => {
    expect(banda(pantalla(trato({ archivos: [ARCH] })).html))
      .toMatch(/se puede seguir subiendo lo que haga falta/);
  });

  it("y la banda se pinta en ámbar, no en verde", () => {
    expect(pantalla(trato({ archivos: [ARCH] })).html)
      .toContain('class="acu-banda espera"');
  });

  it("y enseña el camino: un botón a donde se firma", () => {
    // Un cartel que dice «falta firmar» sin decir dónde deja a la
    // persona buscando.
    expect(pantalla(trato({ archivos: [ARCH] })).html)
      .toContain("Ir a firmar el cierre");
  });

  it("y ese botón BAJA a la barra de firmas, que es donde se firma", () => {
    // La primera versión saltaba a la pestaña «Contrato», que sólo
    // enseña el texto: no se firma ahí. El botón de firmar está
    // abajo, fuera de las pestañas. Se vio siguiendo el clic.
    // Ojo: se mira el manejador DE ESTE BOTÓN, no el archivo entero.
    // Desde el 26 de noviembre hay otro botón que sí lleva a la
    // pestaña del contrato —el de corregir lo que no aceptaron—, y
    // buscar en todo el archivo confundiría uno con otro.
    const e = leer("src/pantallas/Expediente.jsx");
    const i = e.indexOf("Ir a firmar el cierre");
    expect(i).toBeGreaterThan(-1);
    const boton = e.slice(e.lastIndexOf("<button", i), i);
    expect(boton).toMatch(/getElementById\("sign-bar"\)/);
    expect(boton).not.toMatch(/setExpTab/);
    // Y el destino existe de verdad.
    expect(leer("src/pantallas/Documento.jsx")).toMatch(/className="sign-bar" id="sign-bar"/);
  });

  it("pero ese botón NO sale a quien no le toca firmar", () => {
    const t = trato({ archivos: [ARCH] });
    // A quien no puede firmar —un lector— sólo le daría un callejón.
    expect(pantalla(t, { puedo: (a) => a !== "firmar" }).html)
      .not.toContain("Ir a firmar el cierre");
    // Ni a un auditor, que no es parte del acuerdo por mucho rol que
    // tenga: la conformidad no es suya.
    expect(pantalla(t, { yo: "auditor@despacho.mx", user: "Auditor" }).html)
      .not.toContain("Ir a firmar el cierre");
    // Ni a quien ya firmó.
    expect(pantalla(trato({ archivos: [ARCH], extra: SOLO_YO })).html)
      .not.toContain("Ir a firmar el cierre");
    // Ni a quien ya dejó su bloque de firma en la cadena, aunque el
    // acuerdo todavía no lo haya registrado: es la misma condición
    // que usa la barra de abajo, y tienen que decir lo mismo.
    const conBloque = trato({ archivos: [ARCH] });
    conBloque.chain = [{ action: "FIRMA", author: "Ricardo" }];
    expect(pantalla(conBloque).html).not.toContain("Ir a firmar el cierre");
  });

  it("y nada de esto sale cuando todavía falta entregar", () => {
    const { html, acu } = pantalla(trato());
    expect(acu.estado).toBe("vigente");
    expect(banda(html)).not.toMatch(/Falta que/);
    expect(html).not.toContain("Ir a firmar el cierre");
  });
});

// ══════════════════════════════════════════════════════════════
// 5. LA MÁQUINA SIGUE ENTERA
// ══════════════════════════════════════════════════════════════
describe("el estado nuevo no deja huecos", () => {
  it("está en la lista, con su etiqueta, su tono y su tabla", () => {
    expect(ESTADOS).toContain("terminado");
    for (const e of ESTADOS) {
      expect(ACCIONES_POR_ESTADO[e], e).toBeDefined();
      expect(ETIQUETA[e], e).toBeTruthy();
      expect(TONO[e], e).toBeTruthy();
      expect(TRANSICIONES[e], e).toBeDefined();
    }
  });

  it("y se puede llegar a él desde donde tiene sentido", () => {
    expect(transicionValida("vigente", "terminado")).toBe(true);
    expect(transicionValida("terminado", "cerrado")).toBe(true);
    // Nunca desde un borrador: hace falta que las dos partes lo hayan
    // aceptado para que haya algo que dar por terminado.
    expect(transicionValida("borrador", "terminado")).toBe(false);
    expect(transicionValida("cerrado", "terminado")).toBe(false);
  });

  it("y los dos gemelos de acuerdo.js siguen siendo idénticos", () => {
    const marca = "/** Los estados por los que pasa un acuerdo.";
    const corte = (r) => {
      const t = leer(r);
      const i = t.indexOf(marca);
      expect(i, r).toBeGreaterThan(-1);
      return t.slice(i);
    };
    expect(corte("functions/lib/acuerdo.js")).toBe(corte("src/nucleo/acuerdo.js"));
  });
});

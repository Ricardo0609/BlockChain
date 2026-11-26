// Lo que no aceptaron se puede corregir. Lo que aceptaron, no.
//
// Ricardo, después de probar el rechazo de punta a punta (26 nov):
//
//   «Se pudo rechazar el contrato sin problema, peero creo que se nos
//    pasó añadir el después, o sea el poder editar ese expediente.»
//   «Quiero que sólo se pueda editar después si se llega a rechazar,
//    sólo si lo rechazan; si lo aceptan se queda igual sellado y no
//    se puede editar.»
//
// ── POR QUÉ ESTO ES LA LÍNEA DEL PRODUCTO ────────────────────
//
// Un contrato aceptado que se pudiera reescribir no probaría nada:
// la otra parte habría firmado un texto y quedaría atada a otro. Es
// exactamente lo que este producto existe para impedir.
//
// Y al revés, un contrato rechazado que no se pudiera corregir deja
// a la persona con un cartel que dice «puedes corregirlo y volver a
// mandarlo» y ninguna puerta detrás. Eso era lo que había.
//
// Así que la mitad interesante de este archivo no es que se pueda
// editar: es que NO se pueda en los demás estados.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { renderExpediente } from "../src/pantallas/Expediente.jsx";
import { ACCIONES_POR_ESTADO, estadoAcuerdo, permiteEstado } from "../src/nucleo/acuerdo";
import { ID_PAPEL } from "../src/nucleo/texto";
import { ESTILOS } from "../src/ui/estilos.js";

const HOY = new Date("2026-11-26T12:00:00Z");
const nada = () => {};
const firma = (parte, momento) => ({ parte, momento, fecha: "2026-11-20T10:00:00Z",
  nombre: parte === "emisor" ? "Ricardo" : "Alberto Lira",
  uid: parte === "emisor" ? "U1" : "U2" });
const RECHAZO = { porNombre: "Alberto Lira", motivo: "El importe no es el que acordamos",
  detalle: "habíamos acordado 6,000", fecha: "2026-11-25T18:00:00Z" };

/** Un expediente en el estado que haga falta. */
const expediente = ({ firmas, rechazo } = {}) => ({
  id: "e1", kind: "expediente", numId: "OCT-0042", owner: "Ricardo",
  ownerUid: "U1", ownerEmail: "r@x.mx", moneda: "MXN",
  content: "<h1>Contrato</h1><p>El importe pactado es de $4,860.00 mensuales.</p>",
  fases: [], chain: [], secciones: null,
  requisitos: [{ id: "r1", titulo: "Pago", tipo: "comprobante",
    obligatorio: true, estado: "pendiente", archivos: [] }],
  acuerdo: { pedidoEn: "2026-11-20T09:00:00Z", paraEmail: "alberto@x.mx",
    paraNombre: "Alberto Lira",
    firmas: firmas || [firma("emisor", "aceptacion")],
    ...(rechazo ? { rechazo } : {}) },
});
const RECHAZADO = () => expediente({ rechazo: RECHAZO });
const ACEPTADO = () => expediente({
  firmas: [firma("emisor", "aceptacion"), firma("receptor", "aceptacion")] });

const mkCtx = (d, { editMode = false, setEdit = nada, setExpTab = nada,
                    reenviando = null, bioOk = false, bioCreds = [],
                    pass = "", releyendo = false } = {}) => {
  const acu = estadoAcuerdo(d, { hoy: HOY });
  const ctx = {
    d, dv: d, docs: [d], uid: "U1", user: "Ricardo", acctEmail: "r@x.mx",
    acu, puedo: (a) => permiteEstado(acu.estado, a), puedoSubirA: () => true,
    editMode, setEdit, expTab: "expediente", setExpTab,
    // Igual que lo calcula App.jsx, que es de donde viene.
    corrigiendoContrato: editMode && d.kind === "expediente",
    reenviando, bioOk, bioCreds, pass, firmaBusy: false, enFirmeErr: "",
    setReenviando: nada, reenviarAhora: nada, releyendo,
    anclajesPorHash: {}, filesOpen: {},
    subiendoReq: null, modal: null, revisando: null, showHashes: {},
    vinculos: {}, verifVin: false, dupPorClave: {}, focoDup: null,
    reqTitulo: "", reqDesc: "", reqVisto: false, reqBusy: false, reqErr: "",
    rechMotivoAdj: "", accesos: [], saving: false, faseSel: null,
    enlReq: null, enlUrl: "", enlNom: "", enlErr: "", enlBusy: false,
    verificandoFiscal: null, esperaMiFirma: false, ROL_TEXTO: {}, ROL_AYUDA: {},
    claveDup: () => "k", destinoDuplicado: () => null,
  };
  for (const k of [
    "setFasesEnOrden", "setFilesOpen", "setMIn", "setPass", "setShareModo",
    "setShareTodo", "setShareReqs", "setShareRol", "setModal", "setShowHashes",
    "setFocoDup", "setFaseSel", "setEnlaceNuevo", "setEnlUrl", "setEnlNom",
    "setReqTitulo", "setReqDesc", "setReqVisto", "setRechMotivoAdj", "setDirty",
    "attachEvidence", "removeEvidence", "openDoc", "getFile", "irADuplicado",
    "cancelarSolicitud", "verificarFiscal", "aprobarEntrega", "pedirRechazo",
    "confirmarRechazo", "abrirEnlace", "cerrarEnlace", "guardarEnlace",
    "pedirRequisito", "quitarEsteRequisito", "guardarRequisito",
    "confirmarQuitarRequisito",
  ]) if (!ctx[k]) ctx[k] = nada;
  return ctx;
};
const pinta = (d, opc) => renderToStaticMarkup(renderExpediente(mkCtx(d, opc)));
const arbol = (d, opc) => renderExpediente(mkCtx(d, opc));

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
const botonDe = (vista, texto) => buscar(vista, (el) =>
  el?.type === "button" && JSON.stringify(el.props?.children || "").includes(texto));

// ══════════════════════════════════════════════════════════════
// 1. LA PUERTA SÓLO SE ABRE DONDE DEBE
// ══════════════════════════════════════════════════════════════
describe("sólo se corrige lo que no aceptaron", () => {
  it("un contrato rechazado ofrece corregirse", () => {
    const d = RECHAZADO();
    expect(estadoAcuerdo(d, { hoy: HOY }).estado).toBe("rechazado");
    expect(pinta(d)).toContain("Editar el contrato");
  });

  it("un contrato ACEPTADO no, y eso es lo importante", () => {
    // Si esto cayera, quien aceptó quedaría atado a un texto distinto
    // del que leyó. Es la línea entera del producto.
    const d = ACEPTADO();
    expect(estadoAcuerdo(d, { hoy: HOY }).estado).toBe("vigente");
    expect(pinta(d)).not.toContain("Editar el contrato");
  });

  it("ni mientras la otra parte lo está leyendo", () => {
    const d = expediente();
    expect(estadoAcuerdo(d, { hoy: HOY }).estado).toBe("en_firma");
    expect(pinta(d)).not.toContain("Editar el contrato");
  });

  it("y una vez mandado, el cartel rojo se va y dice que esperes", () => {
    // Ricardo: «una vez enviado ya no volverá a aparecer la opción de
    // volver a editar; se cambiará ese aviso en rojo a el que aparece
    // que esperes a que lo firme la otra parte».
    //
    // Eso no se programa aquí: sale solo de que el estado pase a
    // «en firma». Pero que salga solo no quiere decir que salga, así
    // que se comprueba.
    const html = pinta(expediente());
    expect(html).toContain("Esperando a Alberto Lira");
    expect(html).not.toContain("no lo aceptó");
    expect(html).not.toContain("Editar el contrato");
  });

  it("ni a quien no es el dueño, aunque esté rechazado", () => {
    // Un lector o un auditor ven el cartel rojo; corregir el contrato
    // no es suyo. Lo cazó un mutante: quitar `puedo("editar")` de la
    // condición no rompía ninguna prueba porque ninguna miraba desde
    // fuera de la silla del dueño.
    const html = renderToStaticMarkup(renderExpediente({
      ...mkCtx(RECHAZADO()), puedo: (a) => a !== "editar" }));
    expect(html).not.toContain("Editar el contrato");
  });

  it("y TAMPOCO cuando nadie contestó, que es otro caso", () => {
    // «Sin firmar» —se mandó y nadie dijo nada en N días— también
    // permite editar, y su cartel también promete corregir. Pero
    // Ricardo pidió esta puerta para el rechazo: «sólo si lo
    // rechazan». Si algún día se quiere también ahí, se decide y se
    // cambia esta prueba; lo que no vale es que entre sola.
    const d = expediente();
    d.acuerdo.pedidoEn = "2026-10-01T09:00:00Z";
    expect(estadoAcuerdo(d, { hoy: HOY }).estado).toBe("sin_firmar");
    expect(permiteEstado("sin_firmar", "editar")).toBe(true);
    expect(pinta(d)).not.toContain("Editar el contrato");
  });

  it("y el permiso de fondo dice lo mismo, no sólo la pantalla", () => {
    // La pantalla es comodidad; la regla vive en la tabla, y el
    // servidor la vuelve a mirar.
    expect(permiteEstado("rechazado", "editar")).toBe(true);
    expect(permiteEstado("vigente", "editar")).toBe(false);
    expect(permiteEstado("en_firma", "editar")).toBe(false);
    expect(permiteEstado("cerrado", "editar")).toBe(false);
    expect(ACCIONES_POR_ESTADO.cerrado).toEqual([]);
  });

  it("el botón lleva a la pestaña donde de verdad se escribe", () => {
    // Un botón que dijera «editar» y dejara a la persona en una
    // pantalla de sólo lectura es el callejón del 24 de noviembre
    // otra vez.
    const pasos = [];
    const vista = arbol(RECHAZADO(), {
      setEdit: (v) => pasos.push(["edit", v]),
      setExpTab: (v) => pasos.push(["tab", v]),
    });
    const boton = botonDe(vista, "Editar el contrato");
    expect(boton).toBeTruthy();
    boton.props.onClick();
    expect(pasos).toEqual([["tab", "contrato"], ["edit", true]]);
  });

  it("y no se ofrece dos veces cuando ya estás corrigiendo", () => {
    expect(pinta(RECHAZADO(), { editMode: true })).not.toContain("Editar el contrato");
  });
});

// ══════════════════════════════════════════════════════════════
// 2. MIENTRAS SE CORRIGE
// ══════════════════════════════════════════════════════════════
describe("corrigiendo el contrato", () => {
  const editando = () => pinta(RECHAZADO(), { editMode: true });

  it("el papel está puesto, y es el de siempre", () => {
    // Guardar lee del DOM por este identificador. Si el papel no
    // estuviera montado, guardar escribiría el texto de antes.
    const html = editando();
    expect(html).toContain(`id="${ID_PAPEL}"`);
    expect(html).toContain('contentEditable="true"');
    expect(html).toContain("paper-ta");
  });

  it("y NO está cuando no se está corrigiendo", () => {
    expect(pinta(RECHAZADO())).not.toContain(`id="${ID_PAPEL}"`);
    expect(pinta(ACEPTADO(), { editMode: true })).toBeTruthy();
  });

  it("sólo queda la pestaña del contrato", () => {
    // Y esto no es limpieza. Si alguien se fuera a «Archivos» a mitad
    // de la corrección, el papel se desmontaría y guardar escribiría
    // encima el texto de antes SIN DECIR NADA. Perder lo escrito en
    // silencio es el peor final posible.
    const html = editando();
    expect(html).toContain("Contrato");
    for (const otra of ["Línea de tiempo", "Archivos", "Con acceso"]) {
      expect(html, otra).not.toContain(`>${otra}<`);
    }
  });

  it("y el motivo del rechazo sigue a la vista", () => {
    // Se vio recorriendo el camino: el cartel rojo vive en la pestaña
    // «Expediente», así que al entrar a corregir desaparecía, y con
    // él la única frase que dice qué hay que cambiar. Corregir de
    // memoria lo que otro objetó es como se manda dos veces el mismo
    // error.
    const html = editando();
    expect(html).toContain("Alberto Lira");
    expect(html).toContain("El importe no es el que acordamos");
    expect(html).toContain("habíamos acordado 6,000");
  });

  it("y el contrato que se edita es el que había, no uno en blanco", () => {
    expect(editando()).toContain("4,860.00");
  });
});

// ══════════════════════════════════════════════════════════════
// 3. GUARDAR Y VOLVER A ENVIAR
// ══════════════════════════════════════════════════════════════
//
// Ricardo: «que mejor diga guardar y volver a enviar, y se vuelva a
// enviar el corregido».
//
// Guardar a secas dejaba el contrato corregido y QUIETO: el trabajo
// hecho, la otra parte sin enterarse, y el acuerdo parado sin que
// nada dijera que faltaba un paso. Y ese paso vivía en el menú de
// compartir, donde nadie lo iba a buscar después de corregir.
describe("el botón que cierra el círculo", () => {
  const ARCHIVO = readFileSync(
    resolve(process.cwd(), "src/pantallas/Documento.jsx"), "utf8");

  it("mientras corriges, el botón dice a dónde lleva", () => {
    expect(ARCHIVO).toContain('"Guardar y volver a enviar"');
    // Y fuera de ahí sigue diciendo «Guardar» a secas: en un
    // documento de texto no hay nada que volver a enviar.
    expect(ARCHIVO).toMatch(/corrigiendoContrato \? "Guardar y volver a enviar" : "Guardar"/);
  });

  it("y hace otra cosa, no sólo decirlo", () => {
    expect(ARCHIVO).toMatch(/onClick=\{corrigiendoContrato \? guardarYVolverAEnviar : save\}/);
  });

  it("no pregunta a quién: va a quien ya se le mandó", () => {
    // Ricardo: «al darle guardar y enviar me manda al modal de a
    // quién le quiero compartir, lo cual no debería, porque ya
    // sabemos a quién mandamos». Preguntar un dato que ya se tiene
    // es pedirlo por pedirlo.
    const app = readFileSync(resolve(process.cwd(), "src/App.jsx"), "utf8");
    const i = app.indexOf("const guardarYVolverAEnviar");
    expect(i).toBeGreaterThan(-1);
    const fn = app.slice(i, app.indexOf("\n  };", i));
    expect(fn).not.toMatch(/setModal/);
    expect(fn).toMatch(/correo: up\.acuerdo\?\.paraEmail/);
    expect(fn).toMatch(/nombre: up\.acuerdo\?\.paraNombre/);
    // Y si guardar falló, no sigue a ciegas.
    expect(fn).toMatch(/if\(!up\) return;/);
  });

  it("pero SÍ pide el código: el servidor borra la firma y escribe otra", () => {
    // Lo único que no se automatizó, y a propósito. Mandar un
    // contrato es firmarlo; `ponerEnFirme` borra la firma anterior y
    // escribe una nueva sobre el texto NUEVO. Saltárselo dejaría en
    // la cadena que el emisor firmó un documento que nunca vio.
    const exp = readFileSync(
      resolve(process.cwd(), "src/pantallas/Expediente.jsx"), "utf8");
    expect(exp).toMatch(/Tu código de firma/);
    expect(exp).toMatch(/reenviarAhora/);
    // Y el servidor sigue exigiéndolo, que es donde está la cerradura.
    const srv = readFileSync(resolve(process.cwd(), "functions/index.js"), "utf8");
    const i = srv.indexOf("export const ponerEnFirme");
    const fn = srv.slice(i, srv.indexOf("\nexport const ", i + 10));
    expect(fn).toMatch(/comprobarIdentidad\(uid, \{/);
    expect(fn).toMatch(/momento: "aceptacion"/);
  });

  it("y «estoy corrigiendo» exige estar editando, no sólo ser expediente", () => {
    // Esta prueba mira el CÓDIGO, y lo dice porque no es lo normal
    // aquí: la regla vive en App.jsx, que ninguna prueba pinta, así
    // que no hay pantalla donde verla fallar. La cazó un mutante que
    // quitaba `editMode` y no rompía nada.
    //
    // Si cayera, un expediente estaría «corrigiendo» siempre: papel
    // de escribir en vez del contrato, una sola pestaña, y la barra
    // de abajo desaparecida para siempre.
    const app = readFileSync(resolve(process.cwd(), "src/App.jsx"), "utf8");
    expect(app).toMatch(/corrigiendoContrato: editMode && d\?\.kind==="expediente"/);
  });

  it("y deja la pantalla donde está la banda, no en el contrato", () => {
    const app = readFileSync(resolve(process.cwd(), "src/App.jsx"), "utf8");
    const i = app.indexOf("const guardarYVolverAEnviar");
    const fn = app.slice(i, app.indexOf("\n  };", i));
    expect(fn).toMatch(/setExpTab\("expediente"\)/);
  });
});

// ══════════════════════════════════════════════════════════════
// 4. Y MIENTRAS SE CORRIGE, NADA DE EXPORTAR
// ══════════════════════════════════════════════════════════════
describe("la barra de abajo", () => {
  it("no sale mientras se corrige el contrato", () => {
    // Ricardo: «al estar editándolo aparecen esos dos botones abajo,
    // quítalos». Y hay una razón más allá del estorbo: revisar los
    // adjuntos y exportar el paquete se hacen sobre lo que YA está
    // asentado, y lo que hay en pantalla es un texto a medio escribir
    // sin guardar. Exportar «la evidencia» de algo sin guardar es
    // prometer una prueba de lo que no existe.
    const doc = readFileSync(
      resolve(process.cwd(), "src/pantallas/Documento.jsx"), "utf8");
    expect(doc).toMatch(/\{d\.kind==="expediente" && !editMode && \(\s*\n\s*<div className="acc-final">/);
  });
});

// ══════════════════════════════════════════════════════════════
// 5. RELEER EL CONTRATO CORREGIDO
// ══════════════════════════════════════════════════════════════
//
// Ricardo, viendo que el expediente seguía diciendo $5,500 después
// de corregir el contrato a 6,000: «al darle guardar y enviar vuelve
// a analizar el contrato para ver qué cambió y actualizar los datos
// en el expediente».
//
// El texto y las tarjetas de arriba —importe, fecha límite, partes—
// salían del MISMO análisis, y al corregir el texto sólo cambiaba
// uno de los dos. Un contrato que dice 6,000 con una tarjeta que
// dice 5,500 al lado es el expediente contradiciéndose, y lo que se
// firma es el texto.
describe("releer el contrato al reenviarlo", () => {
  const APP = readFileSync(resolve(process.cwd(), "src/App.jsx"), "utf8");
  const FN = APP.slice(APP.indexOf("const releerContrato"),
    APP.indexOf("\n  /** Lo que el relectura cambia"));

  it("se vuelve a analizar lo GUARDADO, no lo que había antes", () => {
    expect(FN).toMatch(/aTextoPlano\(up\.content \|\| ""\)/);
    expect(FN).toMatch(/analyzeContract\(texto/);
  });

  it("y se escriben encima importe, fecha, partes y resumen", () => {
    const campos = APP.slice(APP.indexOf("const camposDelAnalisis"),
      APP.indexOf("const puedeRehacerRequisitos"));
    for (const k of ["montoTotal", "moneda", "fechaLimite", "partes", "resumen"]) {
      expect(campos, k).toMatch(new RegExp(`${k}: res\\.${k}`));
    }
  });

  it("la cadena dice QUÉ cambió, no sólo que se releyó", () => {
    // Si el importe pasa de 5,500 a 6,000, eso queda escrito: es
    // exactamente lo que la otra parte objetó.
    expect(FN).toMatch(/Al releer el contrato corregido/);
    expect(FN).toMatch(/c\.etiqueta/);
    expect(FN).toMatch(/tipo:"releido"/);
  });

  it("y no asienta nada si no cambió nada", () => {
    expect(FN).toMatch(/if\(cambios\.length\)\{/);
  });

  it("si la relectura falla, NO se pierde la corrección", () => {
    // El texto ya está guardado y es lo que vale. Se avisa y se sigue
    // con los datos de antes, que es peor que releerlos y muchísimo
    // mejor que tirar lo que la persona acaba de escribir.
    expect(FN).toMatch(/catch\(err\)\{/);
    expect(FN).toMatch(/Se manda con los de antes/);
    expect(FN).toMatch(/finally\{ setReleyendo\(false\); \}/);
  });

  it("y los puntos a cumplir NO se rehacen si ya hay algo entregado", () => {
    // Hoy no puede haberlo —un contrato rechazado nunca estuvo
    // vigente, y sin estarlo no se sube nada— pero la función no sabe
    // desde dónde la llaman. Rehacer la lista con comprobantes dentro
    // los dejaría colgando de puntos que ya no existen.
    const g = APP.slice(APP.indexOf("const puedeRehacerRequisitos"),
      APP.indexOf("const puedeRehacerRequisitos") + 200);
    expect(g).toMatch(/!\(doc\.requisitos\|\|\[\]\)\.some\(r=>\(r\.archivos\|\|\[\]\)\.length\)/);
    const campos = APP.slice(APP.indexOf("const camposDelAnalisis"),
      APP.indexOf("const puedeRehacerRequisitos"));
    expect(campos).toMatch(/puedeRehacerRequisitos\(doc\)/);
  });
});


// ══════════════════════════════════════════════════════════════
// 6. EL PASO DE FIRMA, EN LA PANTALLA
// ══════════════════════════════════════════════════════════════
//
// Lo de arriba comprueba que App.jsx no abra el modal. Esto
// comprueba lo que la persona VE, que es otra cosa: un mutante que
// quite el campo del código deja intacto el texto del archivo y
// pasaría en verde leyendo el código fuente.
describe("el paso de firma que sale en su sitio", () => {
  const A_QUIEN = { correo: "alberto@x.mx", nombre: "Alberto Lira" };
  const conPaso = (opc = {}) =>
    pinta(RECHAZADO(), { reenviando: A_QUIEN, ...opc });

  it("dice a quién se manda, sin preguntarlo", () => {
    const html = conPaso();
    expect(html).toContain("Se vuelve a mandar a");
    expect(html).toContain("Alberto Lira");
    expect(html).toContain("alberto@x.mx");
  });

  it("y pide el código ahí mismo", () => {
    // El servidor borra la firma anterior y escribe una nueva sobre
    // el texto corregido. Sin este campo, esa firma se haría sin que
    // nadie la autorice y la cadena diría que el emisor firmó un
    // documento que nunca vio.
    const html = conPaso();
    expect(html).toContain('type="password"');
    expect(html).toContain("Tu código de firma");
    expect(html).toContain("Firmar y enviar");
  });

  it("con biometría ofrece las DOS, nunca sólo la huella", () => {
    // ESTA PRUEBA EXISTE POR UN FALLO QUE VIO RICARDO.
    //
    // La primera versión enseñaba sólo la huella cuando había
    // biometría. Él canceló el aviso del navegador —«NotAllowedError:
    // the operation either timed out or was not allowed»— y se quedó
    // encerrado: el único botón volvía a pedirle la huella.
    //
    // Un camino de firma sin salida es de los peores callejones que
    // puede haber, porque la huella falla por cosas que no dependen
    // de la persona: el lector, el navegador, el tiempo de espera.
    const html = conPaso({ bioOk: true, bioCreds: [{ id: "c1" }] });
    expect(html).toContain("Tu código de firma");
    expect(html).toContain("o usa tu código");
    expect(html).toMatch(/Firmar y mandar con/);
  });

  it("y es el MISMO botón de biometría que usa el modal", () => {
    // No una copia: si cambia allí, cambia aquí.
    const exp = readFileSync(
      resolve(process.cwd(), "src/pantallas/Expediente.jsx"), "utf8");
    expect(exp).toMatch(/import \{ renderBotonBio \} from "\.\.\/ui\/BotonBio"/);
    expect(exp).toMatch(/renderBotonBio\(\{ bioOk, bioCreds, ocupado: firmaBusy/);
  });

  it("y sin biometría no se enseña un camino que no existe", () => {
    const html = conPaso();
    expect(html).toContain("Tu código de firma");
    expect(html).not.toContain("o usa tu código");
  });

  it("no se puede mandar con el código a medias", () => {
    expect(conPaso({ pass: "12" })).toMatch(/disabled[^>]*>\s*Firmar y enviar|Firmar y enviar/);
    const flojo = arbol(RECHAZADO(), { reenviando: A_QUIEN, pass: "12" });
    const b = botonDe(flojo, "Firmar y enviar");
    expect(b.props.disabled).toBe(true);
    const bueno = arbol(RECHAZADO(), { reenviando: A_QUIEN, pass: "1234" });
    expect(botonDe(bueno, "Firmar y enviar").props.disabled).toBe(false);
  });

  it("y se puede dejar para luego", () => {
    expect(conPaso()).toContain("Ahora no");
  });

  it("mientras está el paso de firma, no se ofrece editar otra vez", () => {
    // Dos puertas al mismo sitio, una encima de la otra: volver a
    // editar aquí tiraría el paso de firma a medias sin decirlo.
    expect(conPaso()).not.toContain("Editar el contrato");
  });

  it("y sin paso de firma, no hay campo de código suelto", () => {
    expect(pinta(RECHAZADO())).not.toContain("Tu código de firma");
  });
});

// ══════════════════════════════════════════════════════════════
// 7. SIN ESPERA MUERTA
// ══════════════════════════════════════════════════════════════
//
// Ricardo: «al darle guardar y enviar no se tarde en regresarte o
// mandarte aquí para poderlo firmar, porque actualmente se tarda y
// eso genera fricción».
//
// La culpa era del orden. La relectura es una llamada a la IA y
// tarda segundos; se hacía ANTES de enseñar el paso de firma, así
// que la persona se quedaba mirando una pantalla que no cambiaba,
// sin saber si había pulsado bien.
describe("la espera no bloquea la pantalla", () => {
  const APP = readFileSync(resolve(process.cwd(), "src/App.jsx"), "utf8");
  // El cuerpo del botón, acotado por su propio nombre y por el de la
  // función que llama. Se recorta así, y no repitiendo el trozo que
  // usa el bloque de más arriba, porque dos pedazos de prueba con el
  // mismo texto dentro hacen que un guión de parches se pise a sí
  // mismo: lo cazó la comprobación de idempotencia.
  const BOTON = APP.slice(APP.indexOf("const guardarYVolverAEnviar = async"),
    APP.indexOf("const releerContrato = async"));

  it("el paso de firma sale ANTES de releer, no después", () => {
    const iPaso = BOTON.indexOf("setReenviando(");
    const iRelee = BOTON.indexOf("releerContrato(");
    expect(iPaso).toBeGreaterThan(-1);
    expect(iRelee).toBeGreaterThan(iPaso);
  });

  it("y no se espera a que termine: corre por detrás", () => {
    // Sin `await`. Si lo llevara, volveríamos a la espera muerta.
    expect(BOTON).toMatch(/\n {4}releerContrato\(up\);/);
    expect(BOTON).not.toMatch(/await releerContrato/);
  });

  it("pero NO se puede mandar hasta que termine", () => {
    // Mandarlo antes dejaría salir el contrato con el importe viejo,
    // que es justo el fallo que vino a arreglar todo esto.
    const exp = readFileSync(
      resolve(process.cwd(), "src/pantallas/Expediente.jsx"), "utf8");
    expect(exp).toMatch(/disabled=\{firmaBusy \|\| releyendo \|\| pass\.trim\(\)\.length<4\}/);
    expect(exp).toMatch(/ocupado: firmaBusy \|\| releyendo/);
  });

  it("y mientras tanto lo dice, no deja a nadie adivinando", () => {
    const html = pinta(RECHAZADO(), {
      reenviando: { correo: "alberto@x.mx", nombre: "Alberto Lira" },
      releyendo: true });
    expect(html).toContain("Releyendo el contrato");
    expect(html).toContain("Alberto Lira");   // y el paso ya está ahí
  });
});

// ══════════════════════════════════════════════════════════════
// 8. EL TAMAÑO DE LAS COSAS
// ══════════════════════════════════════════════════════════════
describe("el botón de biometría y el campo del código", () => {
  it("el botón ya no se estira de pared a pared", () => {
    // Ricardo: «se ve muy grande lo de firmar con biometría, está muy
    // largo el botón». En un modal estrecho el 100% se lee bien; en
    // una banda ancha era un botón de lado a lado para una acción que
    // no es la principal.
    const bio = readFileSync(resolve(process.cwd(), "src/ui/BotonBio.jsx"), "utf8");
    expect(bio).not.toMatch(/style=\{\{width:"100%"\}\}/);
    expect(bio).toContain("bio-btn");
    expect(ESTILOS).toMatch(/\.bio-btn\{[^}]*max-width:320px/);
  });

  it("y el campo del código usa el estilo de los campos, no ninguno", () => {
    // Llevaba `className="in"`, que no existe en la hoja: salía como
    // un campo crudo del navegador.
    const exp = readFileSync(
      resolve(process.cwd(), "src/pantallas/Expediente.jsx"), "utf8");
    expect(exp).toMatch(/className="inp inp-fila"/);
    expect(ESTILOS).toMatch(/\.inp\{/);
    expect(ESTILOS).toMatch(/\.inp-fila\{/);
    // Y no queda ninguna clase inventada rondando.
    expect(exp).not.toMatch(/className="in"/);
  });
});

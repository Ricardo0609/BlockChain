// El enlace del contrato ya no va atado a un correo.
//
// Lo pidió Ricardo el 17 de noviembre, con el motivo dentro: «sólo el
// código, para que este enlace se lo puedas compartir por el medio
// que el usuario quiera y no esté atado al correo; el input de correo
// sólo se usa para el correo atado a la cuenta».
//
// Y es la causa exacta del callejón que se encontró: el campo de
// correo vacío apagaba TAMBIÉN el botón de «mandar a alguien sin
// cuenta», o sea que para dar un enlace había que escribir el dato
// que el enlace no iba a usar.
//
// LO QUE ESTO ROMPE POR DENTRO, Y QUE ES LO QUE VIGILAN ESTAS
// PRUEBAS. Hasta hoy, QUÉ enlace era uno se DEDUCÍA del correo: si
// el correo del enlace coincidía con el destinatario del contrato,
// era el enlace del contrato y podía aceptarlo; si no, era el de
// pedirle un comprobante a alguien y no podía aceptar nada.
//
// Esa deducción es justo lo que impedía que a un proveedor al que le
// pides una factura pudiera poner el contrato entero en vigor. Y se
// queda sin nada que comparar en cuanto el enlace no lleva correo:
// dos correos vacíos no son el mismo correo.
//
// Por eso ahora se DICE en vez de deducirse, con una marca que
// escribe sólo `ponerEnFirme`. Lo que estas pruebas no pueden dejar
// pasar, por orden de lo que pasaría si fallara:
//
//   · Que la marca no pueda venir del navegador. Si viajara en la
//     petición, cualquiera con un enlace de comprobantes se haría
//     uno capaz de aceptar el contrato.
//   · Que `crearInvitacion` —el de los comprobantes— no la ponga
//     nunca.
//   · Que los enlaces de ANTES, que no traen marca, sigan
//     funcionando por el correo. Son credenciales ya repartidas y no
//     se pueden cambiar hacia atrás.
//   · Que sin correo no se afirme nada que no se haya comprobado:
//     ni «esa persona no tiene cuenta», ni un correo al lado de la
//     firma.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sinComentarios } from "./sinComentarios.js";
import { armarInvitacion } from "../functions/lib/invitaciones.js";
import { esDestinatario } from "../src/nucleo/acuerdo";

const leer = (r) => readFileSync(resolve(process.cwd(), r), "utf8");
const codigo = (r) => sinComentarios(leer(r));
const callable = (nombre) => {
  const s = leer("functions/index.js");
  const i = s.indexOf(`export const ${nombre}`);
  expect(i, nombre).toBeGreaterThan(-1);
  return s.slice(i, s.indexOf("\n});", i));
};

const CONTRATO = { opId: "o1", reqIds: ["r1"], creadaPor: "Ricardo", creadaPorUid: "U1" };

// ══════════════════════════════════════════════════════════════
// 1. LA MARCA
// ══════════════════════════════════════════════════════════════
describe("qué enlace es éste", () => {
  it("se guarda dicho, no deducido", () => {
    const { registro } = armarInvitacion({ ...CONTRATO, paraElContrato: true });
    expect(registro.paraElContrato).toBe(true);
    expect(registro.correo).toBeNull();
  });

  it("y por omisión NO lo es", () => {
    // El de pedir comprobantes entra por aquí: no pasa el campo.
    const { registro } = armarInvitacion({ ...CONTRATO, correo: "ana@x.com" });
    expect(registro.paraElContrato).toBe(false);
  });

  it("y es un booleano de verdad, no lo que le pasen", () => {
    // Un string, un 1 o un objeto son truthy. Si esto guardara el
    // valor tal cual, un `paraElContrato: "no"` entraría como sí.
    for(const x of ["no", 1, {}, [], "false"]){
      const { registro } = armarInvitacion({ ...CONTRATO, paraElContrato: x });
      expect(registro.paraElContrato, String(x)).toBe(false);
    }
  });
});

// ══════════════════════════════════════════════════════════════
// 2. QUIÉN LA PONE
// ══════════════════════════════════════════════════════════════
describe("la marca la escribe sólo quien manda el contrato", () => {
  it("`ponerEnFirme` sí", () => {
    expect(callable("ponerEnFirme")).toMatch(/paraElContrato: true,/);
  });

  it("`crearInvitacion` nunca", () => {
    // Es el de pedir comprobantes. Si la pusiera, a quien le pides
    // una factura podría poner el contrato entero en vigor.
    expect(callable("crearInvitacion")).not.toMatch(/paraElContrato/);
  });

  it("y NO sale de la petición, en ningún sitio", () => {
    // LA QUE IMPORTA de todo este archivo. Si esto viajara en
    // `req.data`, la marca no protegería nada: se la pondría quien
    // quisiera.
    const srv = codigo("functions/index.js");
    expect(srv).not.toMatch(/req\.data\??\.?\s*\.?paraElContrato/);
    expect(srv).not.toMatch(/paraElContrato\s*[:=]\s*req\./);
    // Y el navegador ni la menciona.
    expect(codigo("src/App.jsx")).not.toMatch(/paraElContrato/);
  });
});

// ══════════════════════════════════════════════════════════════
// 3. QUIÉN PUEDE ACEPTAR
// ══════════════════════════════════════════════════════════════
describe("acuerdoParaInvitado", () => {
  const fn = () => {
    const s = leer("functions/index.js");
    const i = s.indexOf("function acuerdoParaInvitado");
    expect(i).toBeGreaterThan(-1);
    return s.slice(i, s.indexOf("\n}", i));
  };

  it("acepta por la marca O por el correo de antes", () => {
    const limpio = sinComentarios(fn());
    expect(limpio).toMatch(/const esParte = registro\?\.paraElContrato === true\s*\n?\s*\|\| esDestinatario\(op, registro\.correo\)/);
  });

  it("y «=== true», no a secas", () => {
    // Lo que llega es un documento de Firestore: un campo que no
    // existe es `undefined`, y uno viejo podría traer cualquier cosa.
    expect(fn()).toMatch(/paraElContrato === true/);
  });

  it("los enlaces de antes siguen entrando por el correo", () => {
    // No traen marca y son credenciales ya repartidas: no se pueden
    // cambiar hacia atrás. Ésta es la regla que les queda.
    const op = { acuerdo: { paraEmail: "ana@x.com" } };
    expect(esDestinatario(op, "ana@x.com")).toBe(true);
    expect(esDestinatario(op, "otro@x.com")).toBe(false);
  });

  it("y dos vacíos NO son el mismo correo", () => {
    // Si `esDestinatario` fuera permisiva con los vacíos, CUALQUIER
    // enlace sin correo —incluido el de pedir comprobantes— habría
    // pasado por parte del contrato el día que quitamos el correo.
    // Que pida los dos llenos es lo que impidió ese agujero.
    expect(esDestinatario({ acuerdo: { paraEmail: null } }, null)).toBe(false);
    expect(esDestinatario({ acuerdo: { paraEmail: "" } }, "")).toBe(false);
    expect(esDestinatario({ acuerdo: {} }, undefined)).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// 4. EL SERVIDOR, SIN CORREO
// ══════════════════════════════════════════════════════════════
describe("ponerEnFirme sin correo", () => {
  const t = () => callable("ponerEnFirme");

  it("sólo lo permite si se pidió el enlace a propósito", () => {
    // Sin esto, un fallo del navegador que mandara el correo vacío
    // pondría el contrato en firme para nadie.
    expect(sinComentarios(t())).toMatch(
      /const correo = \(conEnlace && !pedido\) \? null : correoValido\(pedido\)/);
  });

  it("y entonces no busca cuenta ni reparte acceso", () => {
    const limpio = sinComentarios(t());
    expect(limpio).toMatch(/const tieneCuenta = correo\s*\n?\s*\?/);
    expect(limpio).toMatch(/if\(correo && !rolDe\(op, null, correo\)\) await ponerAcceso/);
    expect(limpio).toMatch(/if\(correo && !tieneCuenta && !conEnlace\)/);
  });

  it("y el enlace se crea siempre, porque es la única vía", () => {
    expect(sinComentarios(t())).toMatch(
      /const haceFaltaElEnlace = !correo \|\| !tieneCuenta \|\| conEnlace;/);
  });

  it("y la cadena no se inventa un destinatario", () => {
    // Lo que se escribe tiene que ser verdad. «Mandado a firmar a
    // undefined» sería peor que no decir a quién.
    expect(t()).toMatch(/mandado a firmar por enlace, sin correo/);
  });

  it("pero el correo sigue valiéndose cuando lo hay", () => {
    // No está prohibido: quien lo escriba se lleva la versión fuerte,
    // la que deja «desde el enlace enviado a ana@x.com» al lado de la
    // firma. Ver `aceptarPorInvitacion`.
    expect(callable("aceptarPorInvitacion")).toMatch(/desde el enlace enviado a \$\{correo\}/);
    expect(callable("aceptarPorInvitacion")).toMatch(/desde un enlace de invitación/);
  });
});

// ══════════════════════════════════════════════════════════════
// 5. Y LA PANTALLA NO AFIRMA LO QUE NO SABE
// ══════════════════════════════════════════════════════════════
describe("la pantalla del enlace recién creado", () => {
  it("no dice «esa persona no tiene cuenta» si no hubo a quién buscar", () => {
    expect(codigo("src/App.jsx"))
      .toMatch(/sinCuenta: Boolean\(correo\) && r\.tieneCuenta === false/);
  });

  it("y el navegador deja pasar el correo vacío sólo por enlace", () => {
    const app = sinComentarios(leer("src/App.jsx"));
    const i = app.indexOf("const mandarAFirmar = async(");
    const c = app.slice(i, app.indexOf("\n  };", i));
    expect(c).toMatch(/const porEnlace = conEnlace === true;/);
    expect(c).toMatch(/if\(!correo && !porEnlace\)\{/);
  });
});

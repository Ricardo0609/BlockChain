// Leer y aceptar un contrato desde un enlace, sin cuenta.
//
// Lo encontro Ricardo probando el 12 de noviembre: compartio un
// expediente por enlace a alguien sin cuenta y vio que esa persona
// solo podia subir archivos. «En ambos casos lo primero que se debe
// hacer es poder leerlo».
//
// Tenia razon, y el hueco era peor de lo que parecia: se le pedia a
// alguien la factura del material sin dejarle ver el contrato que
// dice que material, por cuanto y para cuando. Cumplir a ciegas.
//
// Lo que se vigila aqui, por orden de gravedad:
//
//   1. QUE NO ACEPTE QUIEN NO ES PARTE. Un enlace puede ser para un
//      proveedor al que solo se le pide una factura. Si ese pudiera
//      aceptar, cualquiera a quien se le pida un comprobante pondria
//      en vigor el contrato entero.
//   2. QUE LA CADENA NO MIENTA. Teclear un nombre no comprueba una
//      identidad. El bloque no puede decir «Firmado por Juan Perez»:
//      dice que acepto quien DECLARA llamarse asi, desde el enlace
//      enviado a tal correo. Cada pieza de esa frase es comprobable.
//   3. Que se pueda leer el contrato, que es lo que se pidio.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { vistaPublica } from "../functions/lib/invitaciones.js";

const leer = (r) => readFileSync(resolve(process.cwd(), r), "utf8");

const REGISTRO = { opId: "e1", creadaPor: "Ricardo", correo: "juan@proveedor.com",
                   expiraEn: "2026-12-01T00:00:00.000Z", reqIds: ["r1"], entregas: 0 };
const OP = {
  title: "Obra Casa Reforma", kind: "expediente",
  content: "<h1>Contrato de obra</h1><p>Monto: $30,000.00</p>",
  requisitos: [
    { id: "r1", titulo: "Factura del material", descripcion: "El CFDI", tipo: "comprobante" },
    { id: "r2", titulo: "Fotos del avance", tipo: "entregable" },
  ],
};

describe("lo que ve quien abre el enlace", () => {
  it("AHORA SI: el contrato", () => {
    // La prueba de lo que se pidio. Si esto vuelve a null, se vuelve
    // a pedir cumplir algo que no se puede leer.
    expect(vistaPublica(REGISTRO, OP).contrato).toBe(OP.content);
  });

  it("y sigue viendo lo suyo: titulo, quien se lo pide y que le toca", () => {
    const v = vistaPublica(REGISTRO, OP);
    expect(v.documento).toBe("Obra Casa Reforma");
    expect(v.pedidoPor).toBe("Ricardo");
    expect(v.requisitos).toHaveLength(1);
    expect(v.requisitos[0].titulo).toBe("Factura del material");
  });

  it("pero NO los requisitos que no le tocan", () => {
    // Poder leer el acuerdo del que formas parte no es poder asomarte
    // al trabajo de los demas.
    const ids = vistaPublica(REGISTRO, OP).requisitos.map((r) => r.id);
    expect(ids).toEqual(["r1"]);
    expect(ids).not.toContain("r2");
  });

  it("ni la cadena, ni los archivos de otros", () => {
    const v = vistaPublica(REGISTRO, { ...OP, chain: [{ action: "FIRMA" }] });
    expect(v).not.toHaveProperty("chain");
    expect(v).not.toHaveProperty("ownerUid");
    expect(JSON.stringify(v)).not.toMatch(/ruta|evidencias\//);
  });

  it("un documento sin contrato no revienta", () => {
    expect(vistaPublica(REGISTRO, { ...OP, content: undefined }).contrato).toBe(null);
  });
});

// ── LA QUE IMPORTA ──────────────────────────────────────────────
describe("quien puede aceptar, y quien no", () => {
  const srv = () => leer("functions/index.js");
  const puerta = () => {
    const s = srv();
    const i = s.indexOf("function acuerdoParaInvitado");
    expect(i).toBeGreaterThan(-1);
    return s.slice(i, s.indexOf("\n}", i));
  };

  it("solo si el correo del enlace es el destinatario del contrato", () => {
    // El corazon del asunto. Sin esto, cualquiera a quien se le pida
    // un comprobante pone en vigor el contrato entero.
    expect(puerta()).toMatch(/esDestinatario\(op, registro\.correo\)/);
    expect(puerta()).toMatch(/no-eres-parte/);
  });

  it("y solo si el estado del acuerdo lo permite", () => {
    expect(puerta()).toMatch(/permiteEstado\(estado, "aceptar"\)/);
  });

  it("nada de esto aplica si no es un expediente", () => {
    expect(puerta()).toMatch(/op\?\.kind !== "expediente"/);
  });

  it("la funcion de aceptar vuelve a comprobar las dos cosas", () => {
    // La pantalla esconde el boton; eso no cierra nada. Quien sepa
    // llamar la funcion la llama igual.
    const s = srv();
    const i = s.indexOf("export const aceptarPorInvitacion");
    expect(i).toBeGreaterThan(-1);
    const dentro = s.slice(i, i + 3000);
    expect(dentro).toMatch(/acuerdoParaInvitado\(registro, op\)/);
    expect(dentro).toMatch(/porQueNo === "no-eres-parte"/);
    expect(dentro).toMatch(/if\(!puerta\.puedeAceptar\)/);
    // Y que el enlace siga siendo valido: abrirInvitacion comprueba
    // revocada, vencida y caducada.
    expect(dentro).toMatch(/abrirInvitacion\(req\.data\?\.testigo\)/);
  });
});

// ── QUE LA CADENA NO MIENTA ─────────────────────────────────────
//
// Teclear un nombre no comprueba una identidad: quien tenga el enlace
// puede escribir cualquiera. Ya habia un comentario en el codigo que
// lo decia para las entregas: «Decir "Firmado por Juan Perez" seria
// mentir en el unico lugar donde este producto no se puede permitir
// mentir». Aceptar un contrato pesa mas que subir un archivo, asi que
// vale el doble.
describe("lo que queda escrito en la cadena", () => {
  const trozo = () => {
    const s = leer("functions/index.js");
    const i = s.indexOf("export const aceptarPorInvitacion");
    return s.slice(i, i + 3500);
  };

  it("dice DECLARA llamarse, no «firmado por»", () => {
    expect(trozo()).toMatch(/declara llamarse \$\{nombre\}/);
    expect(trozo()).not.toMatch(/Firmado por \$\{nombre\}/);
  });

  it("y nombra el correo al que fue el enlace, que es lo que pesa", () => {
    // El nombre solo no prueba nada. La frase entera si: hubo una
    // invitacion a ese correo, alguien con ese enlace acepto, y dio
    // ese nombre.
    expect(trozo()).toMatch(/desde el enlace enviado a \$\{correo\}/);
  });

  it("la firma se marca con fuerza «enlace», no «cuenta»", () => {
    // `fuerza` ya distinguia «cuenta» de «efirma». Esta es mas debil
    // que las dos y tiene que decirlo en la firma misma, para que
    // nadie tenga que deducirlo leyendo el texto.
    expect(trozo()).toMatch(/fuerza: "enlace"/);
    expect(trozo()).toMatch(/metodo: "nombre-escrito"/);
    expect(trozo()).not.toMatch(/fuerza: "cuenta"/);
  });

  it("se guarda el nombre tal cual lo declararon", () => {
    expect(trozo()).toMatch(/nombreDeclarado: nombre/);
  });

  it("sin uid, porque no hay cuenta detras", () => {
    // Poner un uid prestado -el del dueno, por ejemplo- haria creer
    // que hay una sesion identificada detras de esa aceptacion.
    expect(trozo()).toMatch(/uid: null/);
  });

  it("y entra como receptor del acuerdo, en su momento", () => {
    expect(trozo()).toMatch(/parte: "receptor", momento: "aceptacion"/);
  });
});

describe("el nombre que se escribe", () => {
  const trozo = () => {
    const s = leer("functions/index.js");
    const i = s.indexOf("export const aceptarPorInvitacion");
    return s.slice(i, i + 1600);
  };

  it("el servidor exige nombre y apellido", () => {
    // No comprueba nada -nada que se teclee puede- pero corta el «x»
    // y el «ok» escritos sin leer, que es lo unico que un campo de
    // texto puede hacer por la seriedad del acto.
    expect(trozo()).toMatch(/nombre\.length < 5 \|\| !nombre\.includes\(" "\)/);
    expect(trozo()).toMatch(/nombre\.length > 120/);
  });

  it("y la pantalla lo pide igual, para no ir y volver", () => {
    const app = leer("src/App.jsx");
    const i = app.indexOf("const aceptarInvitacion");
    expect(i).toBeGreaterThan(-1);
    const dentro = app.slice(i, app.indexOf("\n  };", i));
    expect(dentro).toMatch(/nombre\.length < 5 \|\| !nombre\.includes\(" "\)/);
  });

  it("los espacios de mas se recortan en los dos lados", () => {
    // «Juan   Perez  » y «Juan Perez» tienen que quedar igual en la
    // cadena: si no, el mismo nombre se ve distinto segun como se
    // tecleo.
    expect(trozo()).toMatch(/\.trim\(\)\.replace\(\/\\s\+\/g, " "\)/);
    const app = leer("src/App.jsx");
    const i = app.indexOf("const aceptarInvitacion");
    expect(app.slice(i, i + 400)).toMatch(/\.trim\(\)\.replace\(\/\\s\+\/g, " "\)/);
  });
});

describe("la pantalla del enlace", () => {
  const pant = () => leer("src/pantallas/Entrega.jsx");

  it("el contrato va ANTES de los botones de entregar", () => {
    // Leer primero. Si la lista de archivos estuviera arriba, la
    // gente subiria sin bajar a leer, que es exactamente lo de antes.
    // Se mira donde se PINTA, no donde se define. La primera version
    // de esta prueba miraba la posicion del texto «entrega-contrato»
    // en el archivo -que es la declaracion, arriba del todo- y por
    // eso dejo escapar un mutante que quitaba el contrato del render
    // y lo pegaba al final.
    const s = pant();
    const pinta = s.indexOf("\n      {contrato}");
    const lista = s.indexOf('<div className="entrega-lista">');
    expect(pinta, "{contrato} no se pinta en ningun sitio").toBeGreaterThan(-1);
    expect(lista).toBeGreaterThan(-1);
    expect(pinta).toBeLessThan(lista);
  });

  it("y abierto cuando todavia hay que decidir", () => {
    // Plegado cuando ya aceptaste -lo que importa entonces es lo que
    // falta entregar- y abierto cuando toca responder.
    expect(pant()).toMatch(/<details className="entrega-contrato" open=\{meToca\}>/);
  });

  it("el titular dice que toca ahora, no siempre lo mismo", () => {
    // Encabezar con «Te piden comprobantes» a quien lo que tiene
    // delante es una decision lo manda a buscar archivos.
    expect(pant()).toMatch(/meToca \? "Te mandaron un contrato"/);
  });

  it("avisa de lo que va a quedar escrito ANTES de pulsar", () => {
    // Que no se lleve la idea de que esto prueba quien es.
    const s = pant();
    expect(s).toMatch(/declara llamarse/);
    expect(s).toMatch(/entrega-aceptar-n/);
  });

  it("y si ya se acepto, lo dice con quien y cuando", () => {
    expect(pant()).toMatch(/entrega-aceptado/);
    expect(pant()).toMatch(/acu\.aceptadoPor\?\.nombre/);
  });

  it("no ofrece aceptar a quien no es parte", () => {
    expect(pant()).toMatch(/const meToca = Boolean\(acu\?\.puedeAceptar\) && !acu\?\.yaRespondido/);
  });
});

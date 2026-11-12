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

// ── PRIMERO DECIDIR, DESPUES ENTREGAR (12 nov) ──────────────────
//
// Segunda pasada de Ricardo sobre lo mismo: «si se entra por primera
// vez se debe aceptar primero». Tiene razon, y no es cosmetico.
//
// Una lista de «Subir» debajo de un contrato sin aceptar invita a
// hacer el trabajo antes de decir que si. Quien sube primero ya no
// decide libre: decide con el esfuerzo hecho. Y si acaba
// rechazandolo, habra entregado evidencia a un contrato que no
// existe.
describe("mientras no haya respondido, no se ve nada mas", () => {
  const pant = () => leer("src/pantallas/Entrega.jsx");

  it("la lista de entregar queda detras de la decision", () => {
    // El guardia. Si desaparece, vuelve el orden de antes.
    expect(pant()).toMatch(/\{meToca \? null : <>/);
  });

  it("y lo que tapa incluye la lista, el pie y la invitacion a OCTAVIN", () => {
    // Que el guardia abarque hasta el final y no solo el primer
    // bloque: lo de media pantalla tapada es peor que nada.
    const s = pant();
    const abre = s.indexOf("{meToca ? null : <>");
    // Buscado DESDE la apertura, no desde el principio del archivo:
    // el texto `</>}` aparece tambien en los carteles de «no te
    // toca», que estan mas arriba, y la primera version de esta
    // prueba se quedaba con aquel y fallaba sin motivo.
    const cierra = s.indexOf("      </>}", abre);
    expect(abre).toBeGreaterThan(-1);
    expect(cierra).toBeGreaterThan(abre);
    const dentro = s.slice(abre, cierra);
    expect(dentro).toContain('className="entrega-lista"');
    expect(dentro).toContain('className="entrega-cta"');
  });

  it("pero el contrato SI se ve: es lo que hay que leer para decidir", () => {
    const s = pant();
    expect(s.indexOf("{contrato}")).toBeLessThan(s.indexOf("{meToca ? null : <>"));
  });
});

describe("decir que no", () => {
  const srv = () => {
    const s = leer("functions/index.js");
    const i = s.indexOf("export const rechazarPorInvitacion");
    expect(i).toBeGreaterThan(-1);
    return s.slice(i, i + 3500);
  };

  it("existe: un contrato con una sola salida no es un acuerdo", () => {
    expect(srv()).toMatch(/onCall/);
    expect(leer("src/nucleo/invitaciones.js")).toMatch(/rechazarPorInvitacion/);
  });

  it("pide el motivo, igual que a quien tiene cuenta", () => {
    // Un «no» sin razon deja a la otra parte sin saber que arreglar y
    // el contrato atascado.
    expect(srv()).toMatch(/if\(!motivo\)/);
    expect(srv()).toMatch(/Di por qué no lo aceptas/);
  });

  it("y el nombre, con la misma honestidad que al aceptar", () => {
    expect(srv()).toMatch(/declara llamarse \$\{nombre\}/);
    expect(srv()).toMatch(/fuerza: "enlace"/);
  });

  it("vuelve a comprobar que es parte y que el estado lo permite", () => {
    expect(srv()).toMatch(/porQueNo === "no-eres-parte"/);
    expect(srv()).toMatch(/permiteEstado\(puerta\.estado, "rechazar"\)/);
  });

  it("no borra nada: queda asentado el rechazo con su fecha", () => {
    expect(srv()).toMatch(/rechazo: \{/);
    expect(srv()).toMatch(/tipo: "rechazado"/);
  });

  it("la pantalla ofrece las dos salidas sin esconder el no", () => {
    const s = leer("src/pantallas/Entrega.jsx");
    expect(s).toMatch(/No lo acepto/);
    expect(s).toMatch(/Acepto este contrato/);
    // Del mismo ancho: en cuanto una es mas grande, la pantalla
    // empuja.
    expect(leer("src/ui/estilos.js")).toMatch(/\.entrega-aceptar-b \.btn\{flex:1\}/);
  });

  it("el motivo sale solo al decir que no, no de entrada", () => {
    // Pedirlo antes sugiere que la respuesta esperada es el rechazo.
    expect(leer("src/pantallas/Entrega.jsx")).toMatch(/\{invRechazando && \(/);
  });
});

// ── LA PUERTA QUE FALTABA (12 nov) ──────────────────────────────
//
// Tercera pasada de Ricardo sobre lo mismo, y la que da con el fondo:
// «sigo sin poder aceptar desde un link sin cuenta, me aparece igual
// que antes».
//
// No era el codigo de aceptar, que estaba bien. Era que NADIE creaba
// un enlace que sirviera para eso. «Mandar a firmar» le daba acceso
// al correo del destinatario -acceso DENTRO de la aplicacion, que
// sin cuenta no lleva a ningun sitio- y no generaba enlace. Y el
// enlace de pedir comprobantes nace con `correo: null`, asi que
// `acuerdoParaInvitado` decia, correctamente, que esa persona no es
// parte del acuerdo.
//
// La capacidad existia y era inalcanzable. Esto vigila la puerta.
describe("mandar a firmar entrega el enlace", () => {
  const trozo = () => {
    const s = leer("functions/index.js");
    const i = s.indexOf("export const ponerEnFirme");
    expect(i).toBeGreaterThan(-1);
    return s.slice(i, s.indexOf("\n});", i));
  };

  it("LA QUE IMPORTA: se crea un enlace al poner el contrato en firme", () => {
    expect(trozo()).toMatch(/armarInvitacion\(\{/);
    expect(trozo()).toMatch(/return \{ doc, enlace \}/);
  });

  it("y va a nombre del DESTINATARIO, que es lo que lo hace servir", () => {
    // Si naciera sin correo -como los de pedir comprobantes- la
    // pantalla del enlace no ofreceria aceptar nada, que es
    // exactamente el fallo que esto arregla.
    expect(trozo()).toMatch(/reqIds: pendientes, correo,/);
  });

  it("cubre lo que falta por entregar, para que sirva despues tambien", () => {
    expect(trozo()).toMatch(/\.filter\(\(r\) => r\.estado !== "cumplido"\)/);
  });

  it("dura mas que un enlace de comprobantes", () => {
    // Esto no es un recado: es el contrato. Quien lo recibe puede
    // querer ensenarselo a alguien antes de aceptar.
    expect(trozo()).toMatch(/dias: 30,/);
  });

  it("y si falla el enlace, el contrato queda igual de mandado", () => {
    // El contrato YA se asento. Caerse por no poder crear una
    // comodidad seria perder lo importante por lo accesorio.
    expect(trozo()).toMatch(/\}catch\(e\)\{/);
    expect(trozo()).toMatch(/no se pudo crear el enlace/);
    expect(trozo()).toMatch(/let enlace = null;/);
  });

  it("la pantalla lo ensena en vez de cerrarse sin mas", () => {
    const app = leer("src/App.jsx");
    expect(app).toMatch(/if\(r\.enlace\)\{/);
    expect(app).toMatch(/paraFirmar: true, correo,/);
  });

  it("y el texto dice que primero se lee y se decide", () => {
    // El mismo modal sirve para los dos enlaces y no dicen lo mismo.
    const m = leer("src/modales/Compartir.jsx");
    expect(m).toMatch(/enlaceNuevo\.paraFirmar/);
    expect(m).toMatch(/aceptarlo o no aceptarlo/);
    expect(m).toMatch(/Hasta que lo acepte no verá lo que hay que entregar/);
  });
});

// ── NO ES UNA OPCION, ES LO QUE PASA (12 nov, por la tarde) ─────
//
// Por la manana convertí «mandárselo para que lo firme» en una
// tercera opcion del modal, porque Ricardo no encontraba por donde
// mandar un contrato. La quito en cuanto la vio:
//
//   «no debe ser una opcion, porque es algo que si o si se debe
//    hacer, es algo que esta integrado»
//
// Tenia razon y yo me equivoque de solucion. Mandar a firmar no es
// una forma de compartir entre varias: es lo que pasa cuando
// compartes un contrato con la otra parte. Una opcion para algo que
// ya ocurre solo le da a elegir a la gente sobre algo que no se
// elige.
//
// Lo que si se queda de aquella tanda: el enlace que sale al
// mandarlo, y el texto corregido de la segunda opcion.
describe("compartir tiene DOS opciones, no tres", () => {
  const m = () => leer("src/modales/Compartir.jsx");

  it("la tercera no esta", () => {
    expect(m()).not.toMatch(/Mandárselo para que lo firme/);
    expect(m()).not.toMatch(/modo==="firmar"/);
  });

  it("mandar a firmar cuelga del rol, que es donde vive", () => {
    // «Involucrado» ES la otra parte. Darle acceso es mandarselo a
    // firmar, sin preguntar.
    expect(m()).toMatch(/const mandaAFirmar = modo==="completo" && rol==="involucrado"/);
  });

  it("y el enlace sin cuenta sigue saliendo al mandarlo", () => {
    // Esto es lo que de verdad faltaba, y se queda.
    const srv = leer("functions/index.js");
    const i = srv.indexOf("export const ponerEnFirme");
    expect(srv.slice(i, srv.indexOf("\n});", i))).toMatch(/return \{ doc, enlace \}/);
    expect(leer("src/App.jsx")).toMatch(/paraFirmar: true, correo,/);
  });
});

describe("lo que se promete al compartir es verdad", () => {
  it("«solo pedirle comprobantes» ya NO dice que no vera el contrato", () => {
    // Desde el 12 de noviembre quien abre un enlace SI lee el
    // contrato. El texto viejo —«no ve el contenido, ni los montos»—
    // le prometia a quien comparte una privacidad que el producto ya
    // no da. Un texto obsoleto en una pantalla de permisos no es un
    // detalle: es una promesa falsa.
    const m = leer("src/modales/Compartir.jsx");
    expect(m).not.toMatch(/No ve el contenido,\s*\n?\s*ni los montos/);
    expect(m).toMatch(/Lee el contrato y sube lo que le toca/);
  });

  it("y dice lo que si sigue sin ver", () => {
    const m = leer("src/modales/Compartir.jsx");
    expect(m).toMatch(/No ve la historia\s*\n?\s*del documento ni lo que subieron los demás/);
    expect(m).toMatch(/No firma\s*\n?\s*nada/);
  });
});

// ── UNA PUERTA CERRADA EN SILENCIO (12 nov) ─────────────────────
//
// Quinta pasada. El diagnostico dijo que Ricardo tenia los once
// guiones corridos y las funciones desplegadas, asi que la causa no
// era esa. Al descartarla aparecio la de verdad, y era de diseno:
//
//     const meToca = Boolean(acu?.puedeAceptar) && !acu?.yaRespondido;
//     ... : null;
//
// Si no te tocaba aceptar, la pantalla no ensenaba NADA. Ni el boton
// ni una explicacion. Quien abria el enlace veia el contrato y se
// quedaba sin saber si le faltaba algo por hacer; y quien lo mando
// tampoco entendia por que no pasaba nada. Eso es lo que Ricardo
// describio cuatro veces como «sigue igual que antes».
//
// Una puerta que se cierra en silencio es peor que una cerrada con
// un cartel: la primera parece rota, la segunda se entiende.
describe("cuando no se puede aceptar, se dice por que", () => {
  const pant = () => leer("src/pantallas/Entrega.jsx");
  const srv = () => leer("functions/index.js");

  it("LA QUE IMPORTA: ya no se queda en blanco", () => {
    // Si esto vuelve a ser `: null`, vuelve el silencio.
    expect(pant()).toMatch(/\) : acu && acu\.porQueNo \? \(/);
    expect(pant()).toMatch(/entrega-nota/);
  });

  it("un borrador contesta en vez de devolver null", () => {
    // Antes `!op.acuerdo` salia por null y la pantalla no tenia nada
    // con que explicarse. Un borrador no es un error: es una fase.
    expect(srv()).toMatch(/if\(!op\.acuerdo\)\{/);
    expect(srv()).toMatch(/porQueNo: "sin-mandar"/);
  });

  it("las tres razones se dicen distinto, porque llevan a sitios distintos", () => {
    const s = pant();
    expect(s).toMatch(/todavía no se manda a firmar/);   // borrador
    expect(s).toMatch(/es para entregar comprobantes/);  // no es parte
    expect(s).toMatch(/Ya no hay nada que responder/);   // fase pasada
  });

  it("y cada una dice que SI se puede hacer", () => {
    // Un cartel que solo dice «no» deja a la persona igual de parada.
    const s = pant();
    expect(s).toMatch(/Mientras tanto puedes leerlo aquí/);
    expect(s).toMatch(/Puedes leerlo para saber a/);
  });

  it("el contrato se sigue viendo en los tres casos", () => {
    // Leer no depende de poder responder: el contrato va fuera del
    // bloque de la decision.
    const s = pant();
    expect(s.indexOf("{contrato}")).toBeLessThan(s.indexOf("{aceptar}"));
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

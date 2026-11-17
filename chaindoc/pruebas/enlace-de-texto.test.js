// Mandar un documento de TEXTO por enlace a alguien sin cuenta.
//
// Lo pidio Ricardo el 15 de noviembre, pensando en un freelance: «se
// usa el documento de texto para solo hacer el acuerdo y firmarlo».
// Dos partes, un texto, dos firmas. Sin expediente, sin requisitos y
// sin comprobantes.
//
// Y con dos versiones, que son suyas:
//
//   1. «La normal que solo muestra el documento de texto escrito, no
//      puede editar solo leerlo, si llega a tener candado de
//      seguridad igual pide la clave que el usuario le
//      proporcionara».
//   2. «Si tiene activada la seccion de firma primero tendra que
//      estar firmado por el para poderlo compartir, y la persona que
//      no tiene cuenta al ingresar igual podra ver el texto y hasta
//      abajo habra un input y un texto que diga: ingresa tu nombre
//      completo para firmar si estas de acuerdo».
//
// LO QUE ESTAS PRUEBAS VIGILAN DE VERDAD, por orden de lo que pasaria
// si fallara:
//
//   · Que un documento con candado NO mande su texto hasta que la
//     clave acierte. No que la pantalla lo esconda: que no viaje.
//     Esconder en el navegador algo que ya llego no esconde nada.
//   · Que el proposito del enlace lo decida el SERVIDOR leyendo el
//     documento, y no venga en la peticion. Si viniera, cualquiera
//     podria pedir un enlace de «firma» para un expediente.
//   · Que no se pueda mandar a firmar algo que su dueño no ha
//     firmado, porque hasta entonces el texto todavia se edita: la
//     otra persona leeria una cosa y firmaria otra.
//   · Que un enlace de firma se gaste al usarse.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sinComentarios } from "./sinComentarios.js";
import {
  propositoDe, esDeTexto, conFirmas, firmasDe, firmoElDueno,
  armarInvitacion, revisarInvitacion, vistaPublica,
  autorDeclarado, PROPOSITOS,
} from "../functions/lib/invitaciones.js";

const leer = (r) => readFileSync(resolve(process.cwd(), r), "utf8");
/** El archivo sin comentarios: los de aqui citan codigo malo a proposito. */
const codigo = (r) => sinComentarios(leer(r));

const srv = () => leer("functions/index.js");
/** El cuerpo de una funcion exportada del servidor. */
const callable = (nombre) => {
  const s = srv();
  const i = s.indexOf(`export const ${nombre}`);
  expect(i, nombre).toBeGreaterThan(-1);
  return s.slice(i, s.indexOf("\n});", i));
};

const texto = (extra = {}) => ({ id: "d1", kind: "documento", content: "<p>Acuerdo</p>", ...extra });
const expediente = (extra = {}) => ({ id: "e1", kind: "expediente", requisitos: [], ...extra });

// ══════════════════════════════════════════════════════════════
// DOS COSAS DE `estilos.js` QUE YA ROMPI MAS DE UNA VEZ
// ══════════════════════════════════════════════════════════════
describe("estilos.js sigue siendo un solo texto", () => {
  it("solo dos comillas invertidas en todo el archivo", () => {
    // `estilos.js` es UNA plantilla de JavaScript: empieza con una
    // comilla invertida y acaba con otra. Una tercera dentro -aunque
    // sea en un comentario de CSS, que para JavaScript no es un
    // comentario- parte el archivo en dos y el proyecto deja de
    // construir con un error que señala a una linea cualquiera.
    //
    // Me ha pasado TRES veces en este proyecto, siempre por escribir
    // un nombre de clase entre comillas dentro de una explicacion.
    // Se cierra aqui: esta prueba cuesta un milisegundo y aquel fallo
    // costo dos vueltas de depuracion cada vez.
    const s = leer("src/ui/estilos.js");
    expect((s.match(/`/g) || []).length).toBe(2);
    expect(s).toMatch(/^export const ESTILOS = `/m);
  });

  it("una nota de prosa es un parrafo, no una fila de cajas", () => {
    // El fallo que vio Ricardo en su captura: de una frase de tres
    // lineas solo se leia el final, «acaba donde no debia.».
    //
    // La causa: habia DOS reglas `.enl-nota`. La de abajo pisaba el
    // color y el tamano pero NO el display, asi que el flex de la de
    // arriba seguia valiendo para todas. Una nota en flex coloca cada
    // trozo -texto, negrita, texto- en una caja de la misma fila, la
    // fila se pasa de ancho y se sale del modal.
    const css = leer("src/ui/estilos.js");
    const conIcono = css.indexOf(".enl-nota.con-icono{");
    expect(conIcono, "el flex tiene que estar acotado a .con-icono").toBeGreaterThan(-1);
    // La regla general dice display:block, y lo dice ella misma.
    const i = css.indexOf(".enl-nota{");
    expect(i).toBeGreaterThan(-1);
    expect(css.slice(i, css.indexOf("}", i))).toMatch(/display:block/);
    // Y ninguna regla `.enl-nota` suelta vuelve a ponerla en flex.
    for(const m of css.matchAll(/\.enl-nota\{([^}]*)\}/g)){
      expect(m[1], m[0]).not.toMatch(/display:\s*flex/);
    }
    // La unica con icono se marca en el JSX, no se adivina.
    expect(leer("src/ui/CampoEnlace.jsx")).toMatch(/className="enl-nota con-icono"/);
  });

  it("una fila de botones de enmedio no tapa lo que va debajo", () => {
    // LA CAUSA DE VERDAD de lo que vio Ricardo, y la encontre midiendo
    // el modal en un navegador: `.modal > .modal-row` convierte
    // CUALQUIER fila de botones hija del modal en una barra pegajosa
    // -fondo blanco, z-index 1, margin-bottom de -24px-. Eso esta bien
    // para el pie, que es para lo que se escribio; pero cuando debajo
    // de la fila va una nota, esos -24px la meten por debajo de la
    // barra y el blanco se pinta encima. La nota perdia su primera
    // linea y parecia una frase cortada a mitad.
    const css = leer("src/ui/estilos.js");
    const i = css.indexOf(".modal > .modal-row.enmedio{");
    expect(i, "la salida de la barra pegajosa").toBeGreaterThan(-1);
    const regla = css.slice(i, css.indexOf("}", i));
    for(const p of ["position:static", "background:transparent",
                    "margin-bottom:0", "z-index:auto"]){
      expect(regla, p).toContain(p);
    }

    // Y las filas que llevan texto debajo estan marcadas. Se cuentan
    // en el JSX porque una regla CSS no puede saber cual es el pie:
    // `:last-child` no sirve -debajo del pie hay mas elementos- y
    // `:last-of-type` mira la etiqueta, que es `div` en todas.
    const m = codigo("src/modales/Compartir.jsx");
    const filas = [...m.matchAll(/className="modal-row( enmedio)?"/g)];
    // ← ACTUALIZADO (16 nov): seis, con la de «dar acceso» de un
    // comprobante. Lo que se vigila no es el numero sino que NINGUNA
    // fila con texto debajo se quede sin marcar, asi que se cuentan
    // las dos clases por separado y no solo el total.
    expect(filas.length).toBe(7);
    // Cinco de enmedio -dar acceso de texto, mandar sin cuenta de
    // texto, dar acceso de comprobante, y las DOS del expediente
    // desde el 17 de nov: la de con cuenta y la de sin cuenta- y dos
    // pies, que siguen pegados a proposito.
    expect(filas.filter(f => f[1]).length).toBe(5);
    // Lo que de verdad se vigila: que ninguna fila con texto debajo
    // se quede sin marcar. Las unicas sin marcar son los dos pies.
    expect(filas.filter(f => !f[1]).length).toBe(2);
  });
});

// ══════════════════════════════════════════════════════════════
// PARA QUE SIRVE CADA ENLACE
// ══════════════════════════════════════════════════════════════
describe("el proposito sale del documento", () => {
  it("un expediente siempre es de entrega", () => {
    expect(propositoDe(expediente())).toBe("entrega");
    // Incluso si alguien le apagara la seccion de firmas: un
    // expediente no se firma con el nombre escrito, se acepta.
    expect(propositoDe(expediente({ secciones: { firmas: false } }))).toBe("entrega");
  });

  it("un documento de texto con firmas es de firma", () => {
    expect(propositoDe(texto())).toBe("firma");
    expect(propositoDe(texto({ secciones: {} }))).toBe("firma");
    expect(propositoDe(texto({ secciones: { evidencia: false } }))).toBe("firma");
  });

  it("y sin firmas, de lectura", () => {
    expect(propositoDe(texto({ secciones: { firmas: false } }))).toBe("lectura");
  });

  it("ausente quiere decir ENCENDIDA, igual que en secciones.js", () => {
    // Es la regla de `src/nucleo/secciones.js`: se guarda solo lo que
    // se APAGO. Si aqui se leyera al contrario, un documento de texto
    // recien creado -que no tiene el campo- se mandaria como de
    // lectura cuando su dueño ve la seccion de firmas en pantalla.
    expect(conFirmas({})).toBe(true);
    expect(conFirmas({ secciones: {} })).toBe(true);
    expect(conFirmas({ secciones: { firmas: true } })).toBe(true);
    expect(conFirmas({ secciones: { firmas: false } })).toBe(false);
  });

  it("solo los tres, y los dos de texto se reconocen", () => {
    expect(PROPOSITOS).toEqual(["entrega", "lectura", "firma"]);
    expect(esDeTexto("lectura")).toBe(true);
    expect(esDeTexto("firma")).toBe(true);
    expect(esDeTexto("entrega")).toBe(false);
    expect(esDeTexto(undefined)).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// LA QUE MAS IMPORTA: EL CANDADO
// ══════════════════════════════════════════════════════════════
describe("un documento protegido no manda su texto", () => {
  const { registro } = armarInvitacion({
    opId: "d1", reqIds: [], proposito: "firma", correo: "a@b.com",
  });
  const conCandado = texto({
    protegido: true,
    chain: [{ action: "FIRMA", author: "Ana", timestamp: "2026-11-15T10:00:00.000Z" }],
  });

  it("cerrado: ni el texto, ni las firmas, ni los requisitos", () => {
    const v = vistaPublica(registro, conCandado, { abierto: false });
    expect(v.bloqueado).toBe(true);
    expect(v.contrato).toBe(null);
    expect(v.firmas).toEqual([]);
    expect(v.requisitos).toEqual([]);
  });

  it("abierto: ahora si", () => {
    const v = vistaPublica(registro, conCandado, { abierto: true });
    expect(v.bloqueado).toBe(false);
    expect(v.contrato).toBe("<p>Acuerdo</p>");
    expect(v.firmas).toHaveLength(1);
  });

  it("sin candado no hay nada que abrir", () => {
    const v = vistaPublica(registro, texto(), { abierto: false });
    expect(v.bloqueado).toBe(false);
    expect(v.contrato).toBe("<p>Acuerdo</p>");
  });

  it("tambien aprieta con el campo viejo, `password`", () => {
    // Los documentos de antes guardaban la clave en claro dentro del
    // propio documento. Si solo se mirara `protegido`, esos quedarian
    // abiertos de par en par justo por ser los viejos.
    const v = vistaPublica(registro, texto({ password: "x" }), { abierto: false });
    expect(v.bloqueado).toBe(true);
    expect(v.contrato).toBe(null);
  });

  it("y `verInvitacion` pide la vista CERRADA", () => {
    // Aqui es donde se decide de verdad. Si esta llamada no llevara
    // `abierto: false`, todo lo de arriba daria igual: el texto
    // viajaria en la primera respuesta y las pruebas seguirian
    // verdes.
    expect(callable("verInvitacion")).toMatch(/vistaPublica\(registro, op, \{ abierto: false \}\)/);
  });

  it("la clave se comprueba contra el sello, no contra el documento", () => {
    const c = callable("abrirPorInvitacion");
    expect(c).toMatch(/comprobarSecreto\(texto, guardado\.clave\)/);
    // Y con el mismo freno de intentos que para quien tiene cuenta:
    // aqui hace mas falta, porque no hay sesion que bloquear.
    expect(c).toMatch(/estadoIntentos\(guardado\.intentos \|\| \{\}\)/);
    expect(c).toMatch(/trasIntento\(guardado\.intentos, ok\)/);
    expect(c).toMatch(/if\(!ok\) throw new HttpsError\("permission-denied"/);
  });
});

// ══════════════════════════════════════════════════════════════
// QUIEN LO MANDA, Y CUANDO PUEDE
// ══════════════════════════════════════════════════════════════
describe("crear el enlace", () => {
  it("un enlace de texto va sin requisitos", () => {
    const { registro } = armarInvitacion({ opId: "d1", reqIds: [], proposito: "lectura" });
    expect(registro.proposito).toBe("lectura");
    expect(registro.reqIds).toEqual([]);
  });

  it("pero uno de entrega sin requisitos sigue siendo un error", () => {
    // Un enlace de entrega que no pide nada no es un enlace, es un
    // agujero: deja subir archivos a un expediente sin decir a que
    // requisito van.
    expect(() => armarInvitacion({ opId: "e1", reqIds: [] })).toThrow("sin-requisitos");
    expect(() => armarInvitacion({ opId: "e1", reqIds: [], proposito: "entrega" }))
      .toThrow("sin-requisitos");
  });

  it("un proposito inventado se rechaza", () => {
    expect(() => armarInvitacion({ opId: "d1", reqIds: [], proposito: "todo" }))
      .toThrow("proposito-raro");
  });

  it("un enlace de texto no se da por agotado", () => {
    // El tope cuenta ARCHIVOS, y aqui no se sube ninguno.
    const vivo = { proposito: "lectura", entregas: 0, maxArchivos: 0,
                   expiraEn: "2099-01-01T00:00:00.000Z" };
    expect(revisarInvitacion(vivo).ok).toBe(true);
    // Lo demas sigue valiendo: vencer y retirarse.
    expect(revisarInvitacion({ ...vivo, revocada: true }).motivo).toBe("revocada");
    expect(revisarInvitacion({ ...vivo, expiraEn: "2020-01-01T00:00:00.000Z" }).motivo)
      .toBe("vencida");
    // Y uno de entrega SI se agota.
    expect(revisarInvitacion({ proposito: "entrega", entregas: 20, maxArchivos: 20,
                               expiraEn: "2099-01-01T00:00:00.000Z" }).motivo).toBe("agotada");
  });

  it("el proposito lo calcula el servidor, no lo manda el navegador", () => {
    // Si viniera en la peticion, cualquiera con permiso de pedir
    // comprobantes podria pedir un enlace de «firma» para un
    // expediente y ponerlo en vigor con un nombre escrito.
    const c = callable("crearInvitacion");
    expect(c).toMatch(/const proposito = propositoDe\(op\);/);
    // Lo que se saca de `req.data` esta escrito en una sola linea, y
    // `proposito` no esta en ella.
    const saca = c.match(/const \{[^}]*\} = req\.data \|\| \{\};/)[0];
    expect(saca).not.toMatch(/proposito/);
  });

  it("compartir un texto es «compartir»; pedir comprobantes es «pedir»", () => {
    expect(callable("crearInvitacion")).toMatch(
      /exigir\(op, uid, email, esDeTexto\(proposito\) \? "compartir" : "pedir"\)/);
  });

  it("no se manda a firmar lo que su dueño no ha firmado", () => {
    // La regla es de Ricardo y no es una formalidad: un documento de
    // texto se puede editar hasta que alguien lo firma, asi que sin
    // esa firma lo que se manda no esta fijo.
    const c = callable("crearInvitacion");
    expect(c).toMatch(/if\(proposito === "firma" && !firmoElDueno\(op, autor\)\)/);
    expect(c).toMatch(/failed-precondition/);
  });

  it("ni un documento vacio", () => {
    expect(callable("crearInvitacion")).toMatch(/if\(!String\(op\.content \|\| ""\)\.trim\(\)\)/);
  });
});

describe("si el dueño ya firmo", () => {
  const firma = (extra = {}) => ({ action: "FIRMA", author: "Ricardo", ...extra });

  it("por uid, que es lo exacto", () => {
    const d = { ownerUid: "u1", chain: [firma({ meta: { uid: "u1" } })] };
    expect(firmoElDueno(d, "Ricardo")).toBe(true);
    const otro = { ownerUid: "u1", chain: [firma({ meta: { uid: "u2" } })] };
    expect(firmoElDueno(otro, "Ricardo")).toBe(false);
  });

  it("por nombre en los bloques de antes, que no llevan uid", () => {
    const d = { ownerUid: "u1", chain: [firma()] };
    expect(firmoElDueno(d, "Ricardo")).toBe(true);
    expect(firmoElDueno(d, "Otra Persona")).toBe(false);
    // Sin nombre con el que comparar no se adivina: mejor pedir una
    // firma de mas que dar por firmado lo que no lo esta.
    expect(firmoElDueno(d, null)).toBe(false);
  });

  it("una firma hecha DESDE un enlace nunca cuenta", () => {
    // Si contara, bastaria con mandarse el enlace a uno mismo, firmar
    // con el nombre del dueño y la puerta quedaria abierta. Y el uid
    // de esos bloques es el del dueño, porque es quien asienta.
    const d = { ownerUid: "u1", chain: [
      firma({ meta: { uid: "u1", fuerza: "enlace" } }),
    ] };
    expect(firmoElDueno(d, "Ricardo")).toBe(false);
  });

  it("sin firmas, no", () => {
    expect(firmoElDueno({ ownerUid: "u1", chain: [] }, "Ricardo")).toBe(false);
    expect(firmoElDueno({ ownerUid: "u1" }, "Ricardo")).toBe(false);
    expect(firmasDe({ chain: [{ action: "EDICIÓN" }] })).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════
// FIRMAR, Y NO FIRMAR
// ══════════════════════════════════════════════════════════════
describe("firmar un documento de texto por enlace", () => {
  it("un enlace de lectura no firma", () => {
    expect(callable("firmarPorInvitacion"))
      .toMatch(/if\(registro\.proposito !== "firma"\)/);
  });

  it("y uno de firma se gasta al usarse", () => {
    // Dos firmas con dos nombres distintos desde el mismo enlace no
    // serian dos partes, serian una persona probando.
    const c = callable("firmarPorInvitacion");
    expect(c).toMatch(/if\(registro\.respuesta\)/);
    expect(c).toMatch(/respuesta: \{ tipo: "firmado", nombre/);
  });

  it("si le quitaron la seccion de firmas, tampoco", () => {
    // Firmar donde ya no hay firmas dejaria un bloque que la pantalla
    // del dueño no enseña: una prueba invisible es peor que ninguna.
    expect(callable("firmarPorInvitacion")).toMatch(/if\(!conFirmas\(op\)\)/);
  });

  it("escribe un bloque de FIRMA con la fuerza del enlace", () => {
    const c = callable("firmarPorInvitacion");
    expect(c).toMatch(/accion: "FIRMA"/);
    expect(c).toMatch(/fuerza: "enlace"/);
    expect(c).toMatch(/metodo: "nombre-escrito"/);
    // El enlace ES el permiso, y ya se comprobo arriba.
    expect(c).toMatch(/exigirAcceso: false/);
  });

  it("y el autor dice lo que se puede probar, no mas", () => {
    // Teclear un nombre no comprueba una identidad. Si el bloque
    // dijera «Firmado por Juan Perez» estariamos afirmando algo que
    // nadie comprobo, que es justo lo que este producto no se puede
    // permitir.
    expect(autorDeclarado("Juan Perez", "juan@proveedor.com"))
      .toBe("Juan Perez (declarado, desde el enlace enviado a juan@proveedor.com)");
    expect(autorDeclarado("Juan Perez", null))
      .toBe("Juan Perez (declarado, desde un enlace de invitación)");
    // Y nunca el nombre solo: lo que de verdad pesa es el correo.
    expect(autorDeclarado("Juan Perez", "j@b.com")).toContain("j@b.com");
    expect(callable("firmarPorInvitacion")).toMatch(/autorDeclarado\(nombre, correo\)/);
  });

  it("el uid entra en la marca de una firma de cuenta", () => {
    // Hace falta para poder contestar «¿ya firmo el dueño?» sin
    // comparar nombres, que es lo que se rompe en cuanto alguien se
    // cambia el nombre del perfil.
    const s = srv();
    const i = s.indexOf("async function marcaDeFirma");
    expect(i).toBeGreaterThan(-1);
    const cuerpo = s.slice(i, s.indexOf("\n}", i));
    expect(cuerpo).toMatch(/return \{ uid, sello: s\.clave/);
    // Tambien cuando falla el sello: si no, una firma sin sello
    // quedaria sin uid y dejaria de contar como del dueño.
    expect(cuerpo).toMatch(/return \{ uid, sello: null \}/);
  });
});

describe("no firmarlo vale igual", () => {
  it("un documento de texto se rechaza sin pasar por el acuerdo", () => {
    // Un documento de texto no tiene `acuerdo` con estados. Antes
    // esto contestaba «este documento no es un contrato» y dejaba sin
    // salida a quien no estaba de acuerdo.
    const c = callable("rechazarPorInvitacion");
    const i = c.indexOf('if(esDeTexto(registro.proposito))');
    expect(i).toBeGreaterThan(-1);
    // Y va ANTES de la puerta del acuerdo, que es la que fallaba.
    expect(i).toBeLessThan(c.indexOf("acuerdoParaInvitado(registro, op)"));
  });

  it("con motivo, y queda en la cadena", () => {
    const c = callable("rechazarPorInvitacion");
    expect(c).toMatch(/Di por qué no lo aceptas/);
    const dentro = c.slice(c.indexOf('if(esDeTexto(registro.proposito))'));
    expect(dentro).toMatch(/no firmó el documento: \$\{razon\}/);
    expect(dentro).toMatch(/tipo: "rechazado"/);
    expect(dentro).toMatch(/respuesta: \{ tipo: "rechazado"/);
  });

  it("y no cierra ni borra nada", () => {
    // No destruye: queda asentado que lo leyo y no lo firmo, y quien
    // lo mando corrige y vuelve a mandarlo.
    //
    // El trozo se corta en su propio `return`, no al final de la
    // funcion: debajo sigue la rama del expediente, que SI escribe
    // `camposServidor` -ahi hay un acuerdo con estados- y una
    // busqueda hasta el final la encontraria y daria esto por roto.
    const c = callable("rechazarPorInvitacion");
    const i = c.indexOf('if(esDeTexto(registro.proposito))');
    const fin = c.indexOf("return { ok: true, bloques:", i);
    expect(fin).toBeGreaterThan(i);
    const dentro = c.slice(i, fin);
    expect(dentro).not.toMatch(/camposServidor/);
    expect(dentro).not.toMatch(/delete\(/);
  });
});

// ══════════════════════════════════════════════════════════════
// EL MODAL, QUE ES LO QUE EL VIO
// ══════════════════════════════════════════════════════════════
describe("compartir un documento de texto", () => {
  const m = () => codigo("src/modales/Compartir.jsx");

  it("«acceso completo» no sale en un documento de texto", () => {
    // «Quita lo que dice acceso completo ya que eso solo es para el
    // de expediente». Era el nombre de un modo que solo existia
    // porque al lado habia otro -«solo pedirle comprobantes»- que en
    // un documento de texto no existe.
    const s = m();
    const i = s.indexOf("Acceso completo");
    expect(i).toBeGreaterThan(-1);
    // Esta dentro de la rama de los expedientes: el `soloLectura ?`
    // de arriba elige los papeles y deja esto en el `else`.
    expect(s.slice(0, i)).toMatch(/\{soloLectura \? rolesCompletos\.map/);
  });

  it("auditor fuera: dos papeles, editor y lector", () => {
    // «Vas a quitar el de auditor, porque igual eso solo es para
    // expedientes».
    expect(m()).toMatch(/const COMPLETOS = \["editor", "lector"\];/);
    expect(m()).not.toMatch(/const COMPLETOS = \["editor", "lector", "auditor"\]/);
  });

  it("la pregunta se queda, con los dos papeles por respuesta", () => {
    const s = m();
    expect(s).toMatch(/¿Cómo quieres compartirlo\?/);
    const i = s.indexOf("¿Cómo quieres compartirlo?");
    expect(s.slice(i, i + 700)).toMatch(/rolesCompletos\.map/);
  });

  it("y en la version 2 no hay ninguna pregunta de papel", () => {
    // «Para la version 2 vas a quitar todas las opciones de antes y
    // solo vas a dejar la pregunta: a quien».
    const s = m();
    // ← ACTUALIZADO (16 nov): lleva `&& !comprobante` desde que una
    // factura dejo de caer en esta rama por descarte.
    expect(s).toMatch(/\{!paraFirmar && !comprobante && \(<>/);
    // ← ACTUALIZADO (16 nov): tambien excluye a los comprobantes. Sin
    // ese `!comprobante`, una factura -que tampoco es expediente-
    // caia aqui por descarte y se le ofrecia enlace sin cuenta.
    expect(s).toMatch(
      /const paraFirmar = !esExpediente && !comprobante && seVe\(d, "firmas"\);/);
    // El papel no se elige: se deduce.
    expect(s).toMatch(/const PARA_FIRMAR = "aprobador";/);
    expect(s).toMatch(/const rol = paraFirmar \? PARA_FIRMAR/);
  });

  it("«aprobador» ve y firma, pero no edita lo que firma", () => {
    // Es la razon de elegir ese papel y no «editor»: quien va a
    // firmar un texto no puede poder cambiarlo. Si esto cambiara en
    // accesos.js, el modal estaria dando permiso de edicion sin
    // decirlo.
    const permisos = leer("src/nucleo/accesos.js");
    // Desde PERMISOS, no desde la primera «aprobador:» que aparezca:
    // la primera esta en ROL_TEXTO y solo dice su nombre bonito.
    const tabla = permisos.indexOf("export const PERMISOS");
    expect(tabla).toBeGreaterThan(-1);
    const i = permisos.indexOf("aprobador:", tabla);
    expect(i).toBeGreaterThan(-1);
    const linea = permisos.slice(i, permisos.indexOf("\n", i));
    expect(linea).toContain('"ver"');
    expect(linea).toContain('"firmar"');
    expect(linea).not.toContain('"editar"');
  });

  it("el boton de dar acceso lleva el rol dentro, a mano", () => {
    // `onClick={doShare}` le pasaria el EVENTO del clic como primer
    // argumento, y ahora el primer argumento es el ROL. Es el fallo
    // exacto del 12 de nov con `conBio`, en otro sitio.
    const s = m();
    expect(s).not.toMatch(/onClick=\{doShare\}/);
    expect(s).toMatch(/onClick=\{\(\)=>doShare\(rol\)\}/);
    // Y la funcion no se fia tampoco: los dos extremos.
    const app = leer("src/App.jsx");
    const i = app.indexOf("const doShare = async(rolDado)=>{");
    expect(i).toBeGreaterThan(-1);
    expect(app.slice(i, app.indexOf("\n  };", i)))
      .toMatch(/const rolAUsar = typeof rolDado === "string" \? rolDado : shareRol;/);
  });

  it("debajo de «dar acceso» va una O y el enlace sin cuenta", () => {
    // Las palabras y el orden son suyos: «debajo del boton de dar
    // acceso vas a poner: O y de bajo de eso vas a poner otro boton
    // que diga: mandar a alguien sin cuenta».
    const s = m();
    const i = s.indexOf("Dar acceso");
    expect(i).toBeGreaterThan(-1);
    const abajo = s.slice(i);
    const o = abajo.indexOf('<div className="sign-or"><span>O</span></div>');
    const boton = abajo.indexOf("Mandar a alguien sin cuenta");
    expect(o).toBeGreaterThan(-1);
    expect(boton).toBeGreaterThan(o);   // el boton DEBAJO de la O
    expect(abajo.slice(0, boton)).toMatch(/onClick=\{crearEnlace\}/);
  });

  it("y ese boton se apaga -con el motivo escrito- si el dueño no firmo", () => {
    const s = m();
    expect(s).toMatch(/const faltaMiFirma = paraFirmar && !yoFirme;/);
    expect(s).toMatch(/disabled=\{saving\|\|faltaMiFirma\}/);
    // Escrito, no solo en el `title`: en un telefono no hay tooltip.
    expect(s).toMatch(/\{faltaMiFirma \? \(/);
    expect(s).toMatch(/fírmalo tú primero<\/b>/);
  });

  it("los enlaces de un documento de texto se pueden ver y retirar", () => {
    // Si se pueden crear, hace falta poder retirarlos: un enlace que
    // no se puede retirar es un acceso permanente regalado sin
    // saberlo. Antes el boton solo salia en los expedientes.
    const s = m();
    const i = s.indexOf("Ver enlaces creados");
    expect(i).toBeGreaterThan(-1);
    expect(s.slice(Math.max(0, i - 200), i)).not.toMatch(/esExpediente &&\s*\($/);
    expect(s).toMatch(/e\.proposito === "firma" \? "Para leerlo y firmarlo"/);
  });

  it("crearEnlace no exige requisitos en un documento de texto", () => {
    // Antes contestaba «no falta ningun comprobante por entregar»,
    // que ademas de inutil es confuso: nadie habia pedido ninguno.
    const app = leer("src/App.jsx");
    const i = app.indexOf("const crearEnlace = async()=>{");
    const c = app.slice(i, app.indexOf("\n  };", i));
    expect(c).toMatch(/const esExp = d\.kind==="expediente";/);
    expect(c).toMatch(/if\(esExp && shareTodo && pendientes\.length === 0\)/);
    expect(c).toMatch(/if\(esExp && !shareTodo && shareReqs\.length === 0\)/);
    // Y no manda requisitos que no existen.
    expect(c).toMatch(/todoLoQueFalta: esExp \? !!shareTodo : false/);
    expect(c).toMatch(/reqIds: \(esExp && !shareTodo\) \? shareReqs : \[\]/);
  });
});

// ══════════════════════════════════════════════════════════════
// LA PANTALLA DE QUIEN ABRE EL ENLACE
// ══════════════════════════════════════════════════════════════
describe("la pantalla del enlace", () => {
  const e = () => leer("src/pantallas/Entrega.jsx");

  it("el candado se pide antes de cualquier otra cosa", () => {
    const s = e();
    const i = s.indexOf("if(invitacion.bloqueado) return (");
    expect(i).toBeGreaterThan(-1);
    // Antes de la rama de texto Y antes de la lista de requisitos: si
    // fuera despues, la pantalla ya habria pintado el documento.
    expect(i).toBeLessThan(s.indexOf('if(invitacion.proposito === "lectura"'));
    expect(i).toBeLessThan(s.indexOf("const reqs = invitacion.requisitos"));
    expect(s.slice(i, i + 1500)).toMatch(/Este documento está protegido/);
    expect(s.slice(i, i + 1500)).toMatch(/onClick=\{abrirConClave\}/);
  });

  it("un documento de texto tiene su propia pantalla", () => {
    const s = e();
    const i = s.indexOf('if(invitacion.proposito === "lectura" || invitacion.proposito === "firma")');
    expect(i).toBeGreaterThan(-1);
    // Y va antes de lo de los requisitos, que aqui no vienen a cuento.
    expect(i).toBeLessThan(s.indexOf("const reqs = invitacion.requisitos"));
  });

  it("el texto se enseña abierto, no plegado", () => {
    // En un expediente el contrato acompaña a una lista de cosas que
    // hacer y cabe plegado. Aqui el documento ES la pagina: plegarlo
    // seria esconder lo unico que hay.
    //
    // SIN COMENTARIOS, y hace falta: el comentario que explica esta
    // misma decision cita «<details>» para contar lo que NO se usa, y
    // una busqueda a secas se queda con esa cita y da por roto el
    // codigo correcto. Ya me paso en este proyecto con otra prueba.
    const s = codigo("src/pantallas/Entrega.jsx");
    const i = s.indexOf('if(invitacion.proposito === "lectura"');
    expect(i).toBeGreaterThan(-1);
    const fin = s.indexOf("const reqs = invitacion.requisitos", i);
    expect(fin).toBeGreaterThan(i);
    const dentro = s.slice(i, fin);
    expect(dentro).toMatch(/className="entrega-texto"/);
    expect(dentro).not.toMatch(/<details/);
  });

  it("y el texto que pide la firma es el que pidio Ricardo, tal cual", () => {
    expect(e()).toContain("Ingresa tu nombre completo para firmar si estás de acuerdo");
  });

  it("se puede no estar de acuerdo, y decir por que", () => {
    // El mismo proceso que en un expediente: si hay una salida, hay
    // dos, y quien llega sin cuenta es justo el que menos margen
    // tiene para decir que no.
    const s = e();
    const i = s.indexOf('if(invitacion.proposito === "lectura"');
    const dentro = s.slice(i, s.indexOf("const reqs = invitacion.requisitos"));
    expect(dentro).toMatch(/No estoy de acuerdo/);
    expect(dentro).toMatch(/¿Por qué no lo firmas\?/);
    expect(dentro).toMatch(/onClick=\{rechazarInvitacion\}/);
    expect(dentro).toMatch(/onClick=\{firmarInvitacion\}/);
  });

  it("y se dice ANTES de firmar lo que la firma prueba", () => {
    // Que no se lleve la idea de que esto prueba quien es: prueba que
    // alguien con este enlace firmo y dio este nombre.
    const s = e();
    const i = s.indexOf("Quedará escrito que firmó quien declara llamarse así");
    expect(i).toBeGreaterThan(-1);
    expect(s.slice(i, i + 260)).toMatch(/Se puede firmar una sola vez/);
  });

  it("en un enlace de lectura no hay nada que pulsar", () => {
    const s = e();
    const i = s.indexOf('if(invitacion.proposito === "lectura"');
    const dentro = s.slice(i, s.indexOf("const reqs = invitacion.requisitos"));
    // Todo lo de firmar cuelga de `paraFirmar`.
    expect(dentro).toMatch(/const paraFirmar = invitacion\.proposito === "firma";/);
    expect(dentro).toMatch(/\{paraFirmar && resp \?/);
    expect(dentro).toMatch(/sólo deja leer/);
  });

  it("las firmas que ya tiene se enseñan con su fuerza, sin recortar", () => {
    // El nombre sale tal cual lo escribio el servidor, con su
    // «(declarado, desde el enlace enviado a ...)» si vino por un
    // enlace: esa frase es la que dice cuanto prueba cada firma.
    const s = e();
    expect(s).toMatch(/className="entrega-firmas"/);
    expect(s).toMatch(/<span>\{f\.autor\}<\/span>/);
    const v = vistaPublica(
      { proposito: "firma", expiraEn: null, maxArchivos: 20 },
      { kind: "documento", content: "<p>x</p>", chain: [
        { action: "FIRMA", author: "Ricardo", timestamp: "2026-11-15T10:00:00.000Z" },
        { action: "FIRMA", author: "Juan Perez (declarado, desde el enlace enviado a j@b.com)",
          timestamp: "2026-11-15T11:00:00.000Z", meta: { fuerza: "enlace" } },
        { action: "EDICIÓN", author: "Ricardo" },
      ] });
    expect(v.firmas).toHaveLength(2);
    expect(v.firmas[0].fuerza).toBe("cuenta");
    expect(v.firmas[1].fuerza).toBe("enlace");
    expect(v.firmas[1].autor).toContain("declarado");
  });

  it("y el dueño ve que esa firma prueba menos", () => {
    // En la lista de firmas del documento, una de cuenta y una de
    // enlace se veian igual. No valen igual el dia que haya una
    // discusion, y eso tiene que verse sin leer con lupa el nombre
    // del autor. `firmaDe(b)` mira `meta.signature`, que una firma
    // por enlace no tiene, asi que ninguna de las dos etiquetas de
    // antes -e.firma, biometria- salia aqui.
    const doc = codigo("src/pantallas/Documento.jsx");
    expect(doc).toMatch(/\{b\.meta\?\.fuerza==="enlace" && \(/);
    expect(doc).toMatch(/Firmada por enlace, sin cuenta/);
    // Y el correo al lado, que es lo que de verdad pesa.
    expect(doc).toMatch(/b\.meta\?\.correo \? ` · \$\{b\.meta\.correo\}` : ""/);
    // En gris, no en el verde de las comprobadas: ver estilos.js.
    const css = leer("src/ui/estilos.js");
    const i = css.indexOf(".enlace-badge{");
    expect(i).toBeGreaterThan(-1);
    const regla = css.slice(i, css.indexOf("}", i));
    expect(regla).toMatch(/--gris-500/);
    expect(regla).not.toMatch(/#1a7f4b/);
  });

  it("un enlace de entrega no trae firmas aunque el documento las tenga", () => {
    // A quien se le pide una factura no se le enseña quien firmo el
    // contrato: puede leer el acuerdo del que forma parte, no
    // asomarse al resto.
    const v = vistaPublica(
      { proposito: "entrega", reqIds: [], expiraEn: null, maxArchivos: 20 },
      { kind: "expediente", chain: [{ action: "FIRMA", author: "Ricardo" }] });
    expect(v.firmas).toEqual([]);
  });
});

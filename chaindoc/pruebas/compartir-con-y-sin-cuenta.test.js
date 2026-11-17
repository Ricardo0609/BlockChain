// Compartir un expediente: con cuenta y sin cuenta, cada cosa en su sitio.
//
// EL FALLO, dicho por Ricardo el 17 de noviembre: «comparti un
// expediente a alguien que tenia cuenta, pero al darle compartir me
// salio el modal como si le hubiera dado a compartir a alguien sin
// cuenta». Y su conclusion, que es la correcta: «ese modal para
// copiar el link es solo cuando se quiere compartir a alguien que no
// tiene cuenta».
//
// LA CAUSA ERA UN RAZONAMIENTO MIO, escrito en el codigo el 12 de
// noviembre: «el enlace se crea SIEMPRE, tenga cuenta o no (...) el
// enlace no estorba: si la otra parte tiene cuenta, lo vera igual al
// entrar».
//
// Las dos frases eran verdad por separado. Juntas daban esto: a quien
// tiene cuenta se le entrega DENTRO de la aplicacion, y enseñarle
// ademas una pantalla que dice «mandale esto para que lo firme» le
// hace creer que lo primero no funciono. Un mensaje correcto en el
// momento equivocado desinforma igual que uno falso.
//
// Y de paso quedaban invitaciones vivas que nadie iba a abrir. Una
// invitacion es una credencial; las credenciales que sobran son las
// que acaban usandose mal.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sinComentarios } from "./sinComentarios.js";
import { ACCIONES_POR_ESTADO } from "../src/nucleo/acuerdo";

const leer = (r) => readFileSync(resolve(process.cwd(), r), "utf8");
const codigo = (r) => sinComentarios(leer(r));
const enFirme = () => {
  const s = leer("functions/index.js");
  const i = s.indexOf("export const ponerEnFirme");
  expect(i).toBeGreaterThan(-1);
  return s.slice(i, s.indexOf("\n});", i));
};

// ══════════════════════════════════════════════════════════════
// 1. EL SERVIDOR DECIDE, PORQUE ES QUIEN SABE
// ══════════════════════════════════════════════════════════════
describe("el enlace se crea cuando sirve", () => {
  it("si tiene cuenta y no se pidio enlace, no se crea ninguno", () => {
    const t = enFirme();
    // ← ACTUALIZADO (17 nov): entra «!correo». Desde hoy el enlace
    // del contrato puede ir sin correo —lo pidio Ricardo, para
    // mandarlo por donde quiera— y sin correo el enlace es la UNICA
    // via: no hay cuenta a la que hacerselo llegar por dentro.
    expect(t).toMatch(/const haceFaltaElEnlace = !correo \|\| !tieneCuenta \|\| conEnlace;/);
    expect(t).toMatch(/if\(haceFaltaElEnlace\)\{/);
    // Y el cliente recibe con que decidir.
    expect(t).toMatch(/return \{ doc, enlace, tieneCuenta \}/);
  });

  it("si NO tiene cuenta y no se pidio, se niega antes de firmar", () => {
    // LA QUE IMPORTA del servidor. Negarse despues seria peor: el
    // contrato quedaria en firme, firmado por su dueño, y mandado a
    // una direccion donde no hay nadie.
    const t = enFirme();
    // ← ACTUALIZADO (17 nov): con «correo &&» delante. Sin correo no
    // hay a quien buscar en el directorio, asi que no hay nada que
    // negar: es un enlace y punto.
    const i = t.indexOf("if(correo && !tieneCuenta && !conEnlace)");
    expect(i).toBeGreaterThan(-1);
    expect(i, "antes de comprobar la identidad").toBeLessThan(t.indexOf("comprobarIdentidad"));
    expect(i, "antes de asentar nada").toBeLessThan(t.indexOf("await asentar"));
    expect(i, "antes de dar acceso").toBeLessThan(t.indexOf("ponerAcceso"));
  });

  it("y el error dice QUE BOTON usar, no solo que no se pudo", () => {
    expect(enFirme()).toMatch(/usa «Mandar a alguien sin cuenta»/);
  });

  it("mira el directorio, el mismo sitio que mira el navegador", () => {
    // Si el servidor mirara otra cosa, podria decir que no hay cuenta
    // donde la pantalla dice que si.
    expect(enFirme()).toMatch(/db\.doc\(`directorio\/\$\{correo\}`\)/);
    // Y solo cuando hay correo que buscar.
    expect(enFirme()).toMatch(/const tieneCuenta = correo/);
    expect(leer("src/auth.js")).toMatch(/doc\(db, "directorio", dirId\(email\)\)/);
  });

  it("y `conEnlace` tiene que venir explicito, no truthy", () => {
    // El fallo del 12 de nov con `conBio` fue exactamente esto en
    // otro sitio: algo que no era una bandera llego donde iba una.
    expect(enFirme()).toMatch(/const conEnlace = req\.data\?\.conEnlace === true;/);
  });
});

// ══════════════════════════════════════════════════════════════
// 2. LA PANTALLA DEL ENLACE, SOLO CUANDO HAY ENLACE
// ══════════════════════════════════════════════════════════════
describe("la pantalla de copiar el link", () => {
  const app = () => codigo("src/App.jsx");

  it("sale si vino un enlace; si no, el modal se cierra", () => {
    const s = app();
    const i = s.indexOf("const mandarAFirmar = async(");
    const c = s.slice(i, s.indexOf("\n  };", i));
    expect(c).toMatch(/if\(r\.enlace\)\{/);
    expect(c).toMatch(/\}else\{\s+setModal\(null\);/);
  });

  it("y dice que esa persona no tiene cuenta, que es el porque", () => {
    // Sin esa frase, la pantalla vuelve a parecer un paso raro en vez
    // de la consecuencia de algo.
    const s = app();
    // ← ACTUALIZADO (17 nov): con `Boolean(correo) &&` delante. Sin
    // correo el servidor no busco a nadie, asi que decir «esa persona
    // no tiene cuenta» seria inventarselo.
    expect(s).toMatch(/sinCuenta: Boolean\(correo\) && r\.tieneCuenta === false/);
    expect(codigo("src/modales/Compartir.jsx"))
      .toMatch(/\{enlaceNuevo\.sinCuenta && <><b>Esa persona no tiene cuenta/);
  });

  it("el aviso de «mandado» ya no promete lo que no paso", () => {
    // Cuando sale el enlace, el contrato esta firmado y ESPERANDO a
    // que lo mandes tu. Decir «mandado a X» ahi seria mentir: no se
    // ha mandado a nadie todavia.
    const s = app();
    const i = s.indexOf("const mandarAFirmar = async(");
    const c = s.slice(i, s.indexOf("\n  };", i));
    const conEnlace = c.slice(c.indexOf("if(r.enlace){"), c.indexOf("}else{"));
    expect(conEnlace).toMatch(/listo para mandar/);
    expect(conEnlace).not.toMatch(/mandado a firmar a/);
  });
});

// ══════════════════════════════════════════════════════════════
// 3. SIN CUENTA EN LOS DOS MODOS
// ══════════════════════════════════════════════════════════════
describe("sin cuenta cabe en los dos modos", () => {
  const m = () => codigo("src/modales/Compartir.jsx");

  it("siempre en «solo pedirle comprobantes»", () => {
    // Ese enlace deja subir archivos a una lista de pendientes y
    // nada mas: si se filtra, lo peor que permite es un PDF de mas
    // que el dueño ve y retira.
    expect(m()).toMatch(/const sinCuentaAqui = esExpediente && \(modo!=="completo" \|\| mandaAFirmar\);/);
  });

  it("en «acceso completo», SOLO para la otra parte", () => {
    // Lo eligio Ricardo al preguntarselo. Un enlace de acceso
    // completo para un lector dejaria leer el expediente entero
    // -montos, historial, comprobantes de todos- a cualquiera que lo
    // reenviara, sin saber quien lo abrio ni poder retirarselo.
    const s = m();
    expect(s).toMatch(/modo!=="completo" \|\| mandaAFirmar/);
    // Y se dice por que, en la nota, en vez de dejar un hueco.
    expect(s).toMatch(/el único enlace sin cuenta de un expediente es el de la otra parte/);
  });

  it("los dos caminos tienen la misma forma en todas las pantallas", () => {
    // Un documento de texto ya se compartia asi desde el 15 de nov.
    // Que las tres pantallas de compartir se lean igual no es
    // estetica: es que quien aprendio una no tenga que aprender otra.
    const s = m();
    const oes = [...s.matchAll(/<div className="sign-or"><span>O<\/span><\/div>/g)];
    expect(oes.length, "una O en texto y otra en expediente").toBe(2);
    const botones = [...s.matchAll(/Mandar a alguien sin cuenta/g)];
    expect(botones.length).toBe(2);
  });

  it("el boton de sin cuenta sabe a cual de los dos llamar", () => {
    const s = m();
    expect(s).toMatch(/const mandarSinCuenta = \(\) => mandaAFirmar/);
    // Con el `true` que le dice al servidor que el enlace se pidio.
    expect(s).toMatch(/mandarAFirmar\(mIn, null, false, true\)/);
    expect(s).toMatch(/: crearEnlace\(\);/);
  });

  // ── REVERTIDO (17 nov): EL ENLACE YA NO PIDE CORREO ──────
  //
  // Esto decia «pide el correo antes de mandar un contrato a firmar»,
  // porque el enlace iba atado a un correo. Ricardo lo cambio, y el
  // porque es suyo: «solo el codigo, para que este enlace se lo
  // puedas compartir por el medio que el usuario quiera y no este
  // atado al correo; el input de correo solo se usa para el correo
  // atado a la cuenta».
  //
  // Y es la causa exacta del callejon que se encontro: el campo de
  // correo vacio apagaba TAMBIEN el boton de sin cuenta, o sea que
  // para dar un enlace habia que escribir el dato que el enlace no
  // iba a usar.
  it("el de sin cuenta NO pide el correo: solo el codigo", () => {
    const s = m();
    expect(s).toMatch(/disabled=\{saving\|\|firmaBusy\|\|!verificado\|\|faltaElCodigo\}/);
    expect(s).not.toMatch(/\(mandaAFirmar && !mIn\.trim\(\)\)/);
  });

  it("y el de con cuenta si, porque es a donde llega", () => {
    const s = m();
    const i = s.indexOf('"Firmar y mandar"}');
    expect(i).toBeGreaterThan(-1);
    // Con el codigo. Lo vi en pantalla antes de entregarlo: este
    // boton salia ENCENDIDO con el cartel «escribe tu codigo de
    // firma» debajo. El servidor ya se negaba; esto es no ofrecer un
    // boton que va a fallar.
    expect(s.slice(i - 300, i))
      .toMatch(/disabled=\{firmaBusy\|\|!mIn\.trim\(\)\|\|!verificado\|\|faltaElCodigo\}/);
  });

  it("y cada boton dice POR QUE esta apagado, por separado", () => {
    // Un boton apagado y mudo no es una proteccion: es un callejon
    // sin salida con el cartel por dentro. Y un motivo compartido
    // mentiria, porque los dos caminos ya no piden lo mismo.
    const s = m();
    expect(s).toMatch(/const motivoConCuenta =/);
    expect(s).toMatch(/const motivoSinCuenta = sinVerificar \|\| porElCodigo;/);
    expect(s).toMatch(/\{motivoArriba && <div className="enl-nota apagado">/);
    expect(s).toMatch(/\{motivoSinCuenta && <div className="enl-nota apagado">/);
    // Y cuando a los dos les falta LO MISMO, se dice una vez. Dos
    // carteles iguales no explican el doble: se leen como un fallo,
    // que es como salia en pantalla antes de corregirlo.
    expect(s).toMatch(/const motivoArriba = \(sinCuentaAqui && motivoConCuenta === motivoSinCuenta\)/);
    // Y el del correo SOLO sale en el camino que lo usa.
    expect(s).not.toMatch(/motivoSinCuenta[\s\S]{0,120}correo de esa persona/);
    expect(leer("src/ui/estilos.js")).toMatch(/\.enl-nota\.apagado\{/);
  });
});

// ══════════════════════════════════════════════════════════════
// 4. «INVOLUCRADO» SE VE SIEMPRE
// ══════════════════════════════════════════════════════════════
//
// Ricardo: «añade el rol de involucrado en expedientes, aqui si va
// (...) visualmente en expedientes no aparece el rol de involucrado».
//
// Estaba, y se quitaba de la lista en cuanto el contrato se mandaba.
// La regla de fondo era correcta -un contrato ya mandado no se manda
// otra vez- y la forma de contarla era mala: un sitio donde habia
// tres opciones y ahora hay dos no se lee como «esto ya no se
// puede», se lee como un fallo.
describe("el rol Involucrado en un expediente", () => {
  const m = () => codigo("src/modales/Compartir.jsx");

  it("nunca se quita de la lista", () => {
    const s = m();
    expect(s).toMatch(/const rolesCompletos = esExpediente \? ROLES_OFRECIDOS : COMPLETOS;/);
    // La version de antes lo filtraba fuera.
    expect(s).not.toMatch(/ROLES_OFRECIDOS\.filter\(r=>r!=="involucrado"\)/);
  });

  it("cuando no se puede elegir, sale apagado y con el motivo", () => {
    const s = m();
    expect(s).toMatch(/const porQueNoInvolucrado =/);
    expect(s).toMatch(/\$\{no\?"off":""\}/);
    expect(s).toMatch(/disabled=\{Boolean\(no\)\}/);
    // El motivo ocupa el sitio de la ayuda, no se añade debajo: si no,
    // el usuario leeria lo que PODRIA hacer y justo debajo que no.
    expect(s).toMatch(/\{no \|\| ROL_AYUDA\[r\]\}/);
    // Y dice a quien se mando, que es lo que hace util el aviso.
    expect(s).toMatch(/Ya mandaste este contrato a \$\{acu\?\.paraEmail/);
  });

  it("y no se queda elegido un rol que esta apagado", () => {
    // Si `rol` siguiera siendo «involucrado» con el radio apagado, el
    // boton de abajo seria «Firmar y mandar» para algo que no se
    // puede mandar.
    const s = m();
    expect(s).toMatch(/const elegibles = rolesCompletos\.filter\(/);
    expect(s).toMatch(/elegibles\.includes\(shareRol\) \? shareRol : elegibles\[0\]/);
  });

  it("la condicion es «se puede poner en firme», no «es borrador»", () => {
    // ← Lo que arregla de paso. Mirar `estado==="borrador"` dejaba
    // fuera dos estados donde el contrato SI vuelve a estar en tus
    // manos: rechazado y sin_firmar. La pregunta correcta ya estaba
    // contestada en `acuerdo.js` para el servidor, asi que se usa esa
    // misma: dos copias de una regla acaban discrepando.
    const s = m();
    expect(s).toMatch(/permiteEstado\(acu\?\.estado \|\| "borrador", "poner-en-firme"\)/);
    expect(s).not.toMatch(/acu\?\.estado==="borrador"/);
  });

  it("y esos dos estados de verdad lo permiten", () => {
    // No vale con que la pantalla pregunte bien si la tabla dice otra
    // cosa: esto comprueba la tabla.
    for(const e of ["borrador", "rechazado", "sin_firmar"]){
      expect(ACCIONES_POR_ESTADO[e], e).toContain("poner-en-firme");
    }
    for(const e of ["en_firma", "vigente", "entregado", "cerrado"]){
      expect(ACCIONES_POR_ESTADO[e], e).not.toContain("poner-en-firme");
    }
  });
});

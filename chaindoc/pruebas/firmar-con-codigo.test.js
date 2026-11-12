// Que donde se pueda firmar con huella, se pueda tambien con codigo.
//
// El fallo, dicho por Ricardo el 12 de noviembre: «queria aceptarlo y
// firmar de aceptado con mi codigo pero me aparece como si quisiera
// firmar con huella o biometria y no me deja usar el codigo».
//
// La causa no estaba en la pantalla de firmar, que ofrece las dos
// cosas bien. Estaba en como se llamaba a la funcion:
//
//     <button onClick={aceptarElContrato}>
//
// React le pasa el EVENTO del clic como primer argumento. Y la
// funcion es `async(conBio=false)`, asi que `conBio` recibia el
// evento, que es truthy: creia que se le habia pedido biometria y no
// miraba el codigo nunca.
//
// El mismo boton de al lado tenia la misma forma con otro resultado:
// `onClick={mandarAFirmar}` metia el evento donde va el CORREO, y
// `String(evento)` da "[object Object]" -sin arroba-, asi que decia
// «escribe el correo de la otra parte» con el correo escrito
// delante. Ese mensaje señalaba a un sitio donde no estaba el fallo,
// que es lo que mas cuesta de depurar.
//
// Se arregla en los dos extremos a proposito: en la llamada porque es
// el fallo, y en la funcion porque esto va a volver a pasar.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const leer = (r) => readFileSync(resolve(process.cwd(), r), "utf8");

/**
 * El archivo SIN comentarios.
 *
 * Hace falta: los comentarios que explican este mismo fallo citan
 * `onClick={aceptarElContrato}` para contar que estaba mal, y una
 * busqueda a secas se queda con esa cita y da por roto el codigo
 * correcto. Ya me paso antes en este proyecto con otra prueba que
 * buscaba una frase que estaba en un comentario mio.
 */
const codigo = (r) => leer(r)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
const app = () => leer("src/App.jsx");

// ── LA QUE IMPORTA ──────────────────────────────────────────────
describe("un evento de clic no se hace pasar por una bandera", () => {
  const cuerpo = (nombre) => {
    const s = app();
    const i = s.indexOf(`const ${nombre} = async(`);
    expect(i, nombre).toBeGreaterThan(-1);
    return s.slice(i, s.indexOf("\n  };", i));
  };

  it("aceptar el contrato exige true de verdad, no algo truthy", () => {
    // Si vuelve a mirar `conBio` a secas, vuelve el fallo exacto de
    // hoy: pide la huella y el codigo no se usa jamas.
    const c = cuerpo("aceptarElContrato");
    expect(c).toMatch(/const bio = conBio === true;/);
    expect(c).toMatch(/if\(bio && !bioCreds\.length\)/);
    expect(c).toMatch(/if\(!bio && pass\.trim\(\)\.length<4\)/);
    expect(c).not.toMatch(/if\(conBio &&/);
    expect(c).not.toMatch(/if\(!conBio &&/);
  });

  it("mandar a firmar, igual", () => {
    const c = cuerpo("mandarAFirmar");
    expect(c).toMatch(/const bio = conBio === true;/);
    expect(c).not.toMatch(/if\(conBio &&/);
  });

  it("y el correo solo cuenta si es texto", () => {
    // `String(evento)` da "[object Object]", que no lleva arroba.
    const c = cuerpo("mandarAFirmar");
    expect(c).toMatch(/typeof correoDe === "string" \? correoDe : null/);
  });

  it("el nombre tambien", () => {
    expect(cuerpo("mandarAFirmar")).toMatch(/typeof nombreDe === "string" \? nombreDe : null/);
  });

  it("la prueba de firma se elige por `bio`, no por lo que llego", () => {
    // El ultimo sitio donde se podria colar: si aqui se siguiera
    // mirando `conBio`, las comprobaciones de arriba pasarian y el
    // comportamiento seguiria mal.
    for(const n of ["aceptarElContrato", "mandarAFirmar"]){
      expect(cuerpo(n), n).toMatch(/const prueba = bio\s*\n?\s*\?/);
    }
  });
});

describe("ningun boton manda el evento donde no toca", () => {
  it("los de firmar llaman a mano", () => {
    // `onClick={fn}` con una funcion que recibe banderas o valores es
    // la forma exacta del fallo. Aqui se prohibe para las tres.
    const m = codigo("src/modales/Acuerdo.jsx");
    for(const fn of ["aceptarElContrato", "mandarAFirmar", "rechazarElContrato"]){
      expect(m, fn).not.toMatch(new RegExp(`onClick=\\{${fn}\\}`));
      expect(m, fn).toMatch(new RegExp(`onClick=\\{\\(\\)=>${fn}\\(`));
    }
  });

  it("y en ningun otro modal tampoco", () => {
    // Barrido: ninguna de las dos funciones con banderas puede estar
    // puesta pelada en ningun sitio.
    for(const f of ["src/modales/Compartir.jsx", "src/modales/Firma.jsx",
                    "src/pantallas/Documento.jsx", "src/App.jsx"]){
      const s = codigo(f);
      expect(s, f).not.toMatch(/onClick=\{aceptarElContrato\}/);
      expect(s, f).not.toMatch(/onClick=\{mandarAFirmar\}/);
    }
  });
});

// ── LAS DOS VIAS, DONDE SE FIRME ────────────────────────────────
//
// La peticion de Ricardo era mas ancha que el fallo: «checa que no en
// todos lados donde se pueda firmar con biometria y codigo que se
// puedan usar los dos y que no se interpongan».
describe("donde se firma, las dos vias estan", () => {
  it("el boton de huella no esconde el codigo: va antes y con su «o»", () => {
    const b = leer("src/ui/BotonBio.jsx");
    expect(b).toMatch(/o usa tu código/);
    // Y devuelve null cuando no hay biometria, dejando el codigo como
    // unica via, que es lo correcto.
    expect(b).toMatch(/if\(!bioOk \|\| !\(bioCreds \|\| \[\]\)\.length\) return null;/);
  });

  it("aceptar el contrato ofrece las dos", () => {
    const m = leer("src/modales/Acuerdo.jsx");
    const i = m.indexOf('if(modal.t==="aceptar")');
    expect(i).toBeGreaterThan(-1);
    const dentro = m.slice(i, m.indexOf('if(modal.t==="rechazar")', i));
    expect(dentro).toMatch(/renderBotonBio\(/);
    expect(dentro).toMatch(/Tu código de firma/);
    expect(dentro).toMatch(/aceptarElContrato\(true\)/);   // la de huella
    expect(dentro).toMatch(/aceptarElContrato\(\)/);       // la de codigo
  });

  it("mandarlo a firmar, tambien", () => {
    const m = leer("src/modales/Acuerdo.jsx");
    expect(m).toMatch(/mandarAFirmar\(null, null, true\)/);  // huella
    expect(m).toMatch(/onClick=\{\(\)=>mandarAFirmar\(\)\}/); // codigo
  });

  it("y firmar el documento, que es donde ya estaba bien", () => {
    const f = leer("src/modales/Firma.jsx");
    expect(f).toMatch(/canBio/);
    expect(f).toMatch(/aceptaEfirma\(d\)\s*&&/);
  });
});

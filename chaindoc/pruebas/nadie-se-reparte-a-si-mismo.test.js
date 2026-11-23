// Quien reparte accesos no se los reparte a sí mismo.
//
// LA REGLA, EN PALABRAS DE RICARDO (23 nov):
//
//   «El auditor sólo puede cambiar el de las otras personas, no el
//    suyo ni el del dueño o creador del expediente.»
//
// ── POR QUÉ NO ES UN DETALLE ─────────────────────────────────
//
// El 17 de noviembre el Auditor ganó «compartir», porque Ricardo lo
// pidió así: «el auditor puede repartir los accesos, compartir a
// otras personas, descargar los archivos adjuntos, no tiene que
// firmar el contrato ni nada más».
//
// Y «repartir accesos» incluía repartírselos a uno mismo. O sea que
// un Auditor podía ponerse de Involucrado, y con ello ganaba
// «firmar». Una escalera de dos peldaños desde el rol que existe
// JUSTO para mirar sin comprometerse. El rol se vaciaba solo.
//
// LO QUE YA ESTABA Y NO HACÍA FALTA TOCAR, comprobado antes de
// escribir nada: al dueño no se le puede dar un papel —`ponerAcceso`
// se niega— ni quitárselo —no vive en la lista de roles, así que no
// hay nada que quitar—. La mitad de la frase de Ricardo ya se
// cumplía; lo que faltaba era la otra mitad.
//
// Y SE APLICA A TODOS, NO SÓLO AL AUDITOR. El Editor tiene
// «compartir» desde hace semanas y la misma escalera. Arreglar el
// que se vio y dejar el otro sería arreglar la anécdota.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sinComentarios } from "./sinComentarios.js";
import { ROLES, puede } from "../src/nucleo/accesos";

const leer = (r) => readFileSync(resolve(process.cwd(), r), "utf8");
const codigo = (r) => sinComentarios(leer(r));
const callable = (nombre) => {
  const s = leer("functions/index.js");
  const i = s.indexOf(`export const ${nombre}`);
  expect(i, nombre).toBeGreaterThan(-1);
  return s.slice(i, s.indexOf("\n});", i));
};

// ══════════════════════════════════════════════════════════════
// 1. LA ESCALERA QUE SE CIERRA
// ══════════════════════════════════════════════════════════════
describe("por qué hacía falta", () => {
  it("el que reparte accesos no firma, y el que firma no reparte", () => {
    // Si estos dos permisos se juntaran en un rol, la regla de este
    // archivo dejaría de proteger nada: ya no haría falta la
    // escalera, se llegaría de un salto.
    // Salvo el propietario, que los tiene los dos y da igual: no
    // vive en la lista de roles, así que no hay papel suyo que
    // cambiar ni escalera que subir. Es ya la cima.
    for (const r of ROLES.filter((x) => x !== "propietario")) {
      expect(puede(r, "compartir") && puede(r, "firmar"), r).toBe(false);
    }
  });

  it("y el Auditor sigue siendo el que mira sin comprometerse", () => {
    expect(puede("auditor", "compartir")).toBe(true);
    expect(puede("auditor", "firmar")).toBe(false);
    expect(puede("auditor", "aprobar")).toBe(false);
  });

  it("mientras que el Involucrado sí firma: por eso era el peldaño", () => {
    expect(puede("involucrado", "firmar")).toBe(true);
    expect(puede("involucrado", "compartir")).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// 2. EL SERVIDOR SE NIEGA
// ══════════════════════════════════════════════════════════════
describe("en el servidor", () => {
  it("cambiar el papel de uno mismo se rechaza", () => {
    expect(callable("compartirOperacion"))
      .toMatch(/exigirQueNoSeaUnoMismo\(email, correo, "cambiar"\)/);
  });

  it("y quitárselo también, porque para eso está «dejar de ver»", () => {
    // Salirse no es peligroso. Pero ya existe su propio botón, y dos
    // puertas al mismo cuarto es el error que este producto ya ha
    // cometido tres veces: la gente usa la que dice su cabeza.
    expect(callable("quitarAcceso"))
      .toMatch(/exigirQueNoSeaUnoMismo\(email, correo, "quitar"\)/);
  });

  it("y va DESPUÉS de comprobar el permiso, no antes", () => {
    // Al revés, a quien no tiene acceso al documento se le contaría
    // que su propio correo está o no en la lista.
    for (const n of ["compartirOperacion", "quitarAcceso"]) {
      const c = sinComentarios(callable(n));
      expect(c.indexOf("exigirQueNoSeaUnoMismo"), n)
        .toBeGreaterThan(c.indexOf('exigir(op, uid, email, "compartir")'));
    }
  });

  it("y ANTES de escribir nada", () => {
    const c = sinComentarios(callable("compartirOperacion"));
    expect(c.indexOf("await ponerAcceso"))
      .toBeGreaterThan(c.indexOf("exigirQueNoSeaUnoMismo"));
  });

  it("compara sin importar mayúsculas ni espacios", () => {
    // Los correos entran por un formulario. «Ana@X.com » y
    // «ana@x.com» son la misma persona, y si la comparación fuera
    // literal la regla se saltaría escribiendo una mayúscula.
    const f = leer("functions/index.js");
    const i = f.indexOf("function exigirQueNoSeaUnoMismo");
    const cuerpo = f.slice(i, f.indexOf("\n}", i));
    expect(cuerpo).toMatch(/String\(email \|\| ""\)\.toLowerCase\(\)/);
    expect(cuerpo).toMatch(/String\(correo \|\| ""\)\.toLowerCase\(\)/);
  });

  it("y dice qué hacer en vez de sólo decir que no", () => {
    const f = leer("functions/index.js");
    const i = f.indexOf("function exigirQueNoSeaUnoMismo");
    expect(f.slice(i, i + 900)).toMatch(/Dejar de ver este documento/);
    expect(f.slice(i, i + 900)).toMatch(/Pídeselo a quien sea dueño/);
  });
});

// ══════════════════════════════════════════════════════════════
// 3. EL DUEÑO, QUE YA ESTABA
// ══════════════════════════════════════════════════════════════
describe("y el dueño sigue intocable", () => {
  it("no se le puede dar un papel", () => {
    // ← CORREGIDA (23 nov) después de que un mutante se escapara.
    //
    // Esto comprobaba que el MENSAJE «ya es la dueña del documento»
    // estuviera escrito. Apagué la condición —`if(false)`— dejando el
    // mensaje donde estaba, y la prueba siguió en verde: la regla ya
    // no existía y nadie se enteraba.
    //
    // Un texto de error no es una regla. Es lo que la regla dice
    // cuando salta.
    const f = sinComentarios(leer("functions/index.js"));
    const i = f.indexOf("async function ponerAcceso");
    const cuerpo = f.slice(i, i + 900);
    expect(cuerpo).toMatch(
      /if\(op\.ownerUid && correo === \(op\.ownerEmail \|\| ""\)\.toLowerCase\(\)\)\{/);
    expect(cuerpo).toMatch(/ya es la dueña del documento/);
  });

  it("ni quitárselo, porque no vive en la lista de roles", () => {
    // `quitarAcceso` busca en `roles` y el dueño no está ahí: sale
    // antes de tocar nada. No hace falta una regla nueva; hace falta
    // que esto siga siendo verdad.
    const c = sinComentarios(callable("quitarAcceso"));
    expect(c).toMatch(/const antes = rolDe\(op, null, correo\);\s*\n\s*if\(!antes\) return/);
  });
});

// ══════════════════════════════════════════════════════════════
// 4. Y LA PANTALLA NO OFRECE LO QUE VA A FALLAR
// ══════════════════════════════════════════════════════════════
describe("en la lista de accesos", () => {
  const c = codigo("src/modales/Compartir.jsx");

  it("tu propia fila no lleva la «×» de retirar", () => {
    expect(c).toMatch(/const esMiFila = \(a\) =>/);
    expect(c).toMatch(/!esMiFila\(a\) && \(\s*\n\s*<button className="smart-x"/);
  });

  it("pero se ve, con «tú» donde iba el botón", () => {
    // Sin nada en ese hueco, la fila propia parece la única a la que
    // le falta algo, y eso se lee como un fallo en vez de una regla.
    expect(c).toMatch(/\{esMiFila\(a\) && <span className="rol-yo">tú<\/span>\}/);
    expect(leer("src/ui/estilos.js")).toMatch(/\.rol-yo\{/);
  });

  it("y compara con el correo de la sesión, no con el uid", () => {
    // El acceso se guarda por correo; el uid no aparece en esa lista.
    expect(c).toMatch(/String\(a\?\.correo\|\|""\)\.toLowerCase\(\) === String\(acctEmail\|\|""\)\.toLowerCase\(\)/);
    expect(c).toMatch(/accesos, acctEmail,/);
  });
});

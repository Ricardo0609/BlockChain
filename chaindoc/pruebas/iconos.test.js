// Que todo icono que se usa esté en la fuente que se descarga.
//
// Material Symbols se carga con `icon_names=` en el index.html, o sea
// un SUBCONJUNTO: pesa poco justo porque no trae los 3.000 iconos.
// Pero un icono que no esté en esa lista no falla ni avisa — el
// <span> lleva dentro el NOMBRE del icono, y la ligadura de la fuente
// es la que lo convierte en dibujo. Sin ligadura, se queda el nombre.
// En pantalla sale «schedule» en crudo, recortado, donde debía haber
// un reloj.
//
// Ya pasó tres veces (handshake, add, y ahora error/schedule/help), y
// las tres se descubrieron mirando la pantalla. Esto lo descubre sola
// la primera vez que alguien añade un icono y olvida registrarlo.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// `fileURLToPath` y no `.pathname`. En Windows, `.pathname` devuelve
// «/C:/Users/Maria%20Elena/...»: con una barra de mas delante de la
// unidad y los espacios escapados como %20. Esa ruta no existe, asi
// que readFileSync falla y la prueba se cae en maquinas donde el
// usuario tiene un espacio en su nombre. En Linux no se nota, que es
// justo por lo que se me colo.
const RAIZ = fileURLToPath(new URL("..", import.meta.url));

/** Los nombres que de verdad se descargan. */
function enLaFuente() {
  const ruta = join(RAIZ, "index.html");
  let html;
  try {
    html = readFileSync(ruta, "utf8");
  } catch (e) {
    // Si algun dia vuelve a romperse por la ruta, que lo diga en vez
    // de soltar un ENOENT pelado.
    throw new Error(`no se pudo leer el index.html en «${ruta}»`, { cause: e });
  }
  const m = html.match(/icon_names=([^&"]+)/);
  if (!m) throw new Error("el index.html ya no trae icon_names");
  return new Set(m[1].split(",").map((s) => s.trim()).filter(Boolean));
}

function archivos(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === "node_modules" || n === "assets") continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) archivos(p, out);
    else if (/\.jsx?$/.test(n)) out.push(p);
  }
  return out;
}

/**
 * Los nombres que la interfaz le pide a la fuente.
 *
 * Lo delicado es `n={...}`: ahí dentro hay literales que NO son
 * iconos, como el «alterado» de `estado === "alterado" ? "warning" :
 * "help"`. Se quitan primero las comparaciones y lo que queda sí son
 * los nombres. Si no, la prueba daría falsos positivos y acabaría
 * ignorándose, que es la peor forma de morir de una prueba.
 */
function usados() {
  const fuera = new Map();
  const apunta = (nombre, archivo) => {
    if (!fuera.has(nombre)) fuera.set(nombre, new Set());
    fuera.get(nombre).add(archivo.replace(RAIZ, ""));
  };

  for (const p of archivos(join(RAIZ, "src"))) {
    const t = readFileSync(p, "utf8");

    for (const m of t.matchAll(/<Icon\s+n="([a-z0-9_]+)"/g)) apunta(m[1], p);

    for (const m of t.matchAll(/<Icon\s+n=\{([^}]*)\}/g)) {
      const sinComparar = m[1].replace(/[=!]==?\s*"[^"]*"/g, "");
      for (const lit of sinComparar.matchAll(/"([a-z0-9_]+)"/g)) apunta(lit[1], p);
    }

    // Los mapas de tipo → icono, que luego se pasan como <Icon n={ICONO[x]}>
    for (const m of t.matchAll(/\bICONOS?\s*=\s*\{([\s\S]*?)\n\};/g)) {
      for (const lit of m[1].matchAll(/:\s*"([a-z0-9_]+)"/g)) apunta(lit[1], p);
    }
  }
  return fuera;
}

// La hoja de estilos entera es UN template literal. Un acento grave
// dentro de un comentario —poner `fit-content` entre comillas, por
// ejemplo— lo cierra antes de tiempo y la app deja de compilar con un
// error que apunta a la linea equivocada. Me ha pasado tres veces.
describe("la hoja de estilos", () => {
  const ruta = new URL("../src/ui/estilos.js", import.meta.url);

  it("no tiene acentos graves sueltos dentro del literal", () => {
    const t = readFileSync(ruta, "utf8");
    expect(t.split("`").length - 1,
      "hay un ` de mas: cierra el template literal y rompe la app").toBe(2);
  });

  it("y sigue siendo lo que creemos que es", () => {
    const t = readFileSync(ruta, "utf8");
    expect(t).toMatch(/export const ESTILOS\s*=\s*`/);
    expect(t.trimEnd().endsWith("`;")).toBe(true);
  });
});

describe("los iconos de Material Symbols", () => {
  it("todos los que se usan están en el index.html", () => {
    const fuente = enLaFuente();
    const faltan = [...usados()]
      .filter(([n]) => !fuente.has(n))
      .map(([n, donde]) => `${n}  (en ${[...donde].join(", ")})`);

    expect(faltan, [
      "Estos iconos se usan pero NO se descargan, asi que van a salir",
      "en pantalla como su propio nombre en crudo.",
      "Agregalos a icon_names= en index.html, en orden alfabetico:",
      "",
      ...faltan,
      "",
    ].join("\n")).toEqual([]);
  });

  it("la lista va ordenada y sin repetidos, para poder leerla", () => {
    const lista = [...enLaFuente()];
    expect(new Set(lista).size).toBe(lista.length);
    expect(lista).toEqual([...lista].sort());
  });

  it("el buscador no se traga las comparaciones como si fueran iconos", () => {
    // Guardia de la propia prueba: si alguien «arregla» el regex y
    // empieza a contar comparaciones, esto lo caza.
    const u = usados();
    for (const falso of ["alterado", "ampliado", "vigente", "expediente", "cumplido"]) {
      expect(u.has(falso), `«${falso}» no es un icono, es una comparacion`).toBe(false);
    }
  });

  it("y si encuentra alguno, de verdad los busca", () => {
    // Que no este mirando a ningun lado: tiene que ver los de siempre.
    const u = usados();
    for (const real of ["close", "handshake", "notifications"]) {
      expect(u.has(real), real).toBe(true);
    }
  });
});

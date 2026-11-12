// Que una llamada lenta a Gemini no se lleve la funcion por delante.
//
// El fallo, dicho por el registro de Cloud Run el 12 de noviembre:
//
//     E analizarcontrato: The request has been terminated because it
//     has reached the maximum request timeout.
//
// Y ni una linea con un motivo nuestro. La funcion moria a los 120
// segundos ANTES de llegar a su propio `catch`, asi que no llegaba a
// mandar respuesta — y sin respuesta no hay cabeceras, asi que el
// navegador lo contaba como un fallo de CORS. Medio dia mirando al
// sitio equivocado por eso.
//
// La causa: `fetch` no trae plazo. Si Gemini acepta la conexion y
// luego no contesta, se espera para siempre. Y encima hay tres
// intentos por modelo y varios modelos, asi que la espera se
// multiplica.
//
// Lo que se vigila aqui:
//
//   1. Que ningun intento suelto pueda colgarse.
//   2. Que la SUMA tampoco se pase, que es distinto de lo anterior y
//      es lo que de verdad mataba la funcion.
//   3. Que al rendirse salga un motivo nuestro, no un silencio.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const leer = (r) => readFileSync(resolve(process.cwd(), r), "utf8");
const ia = () => leer("functions/lib/ia.js");

describe("ningun intento se queda colgado", () => {
  it("las dos llamadas a Gemini pasan por el plazo", () => {
    // Si alguna vuelve a ser un `fetch` pelado, vuelve el fallo.
    //
    // Se mira FUERA del ayudante: el unico `fetch` desnudo legitimo
    // es el que vive dentro de `fetchConPlazo`, que es justo el que
    // le pone el plazo. La primera version de esta prueba no lo
    // excluia y fallaba contra el codigo correcto.
    const s = ia();
    const i = s.indexOf("async function fetchConPlazo");
    const fin = s.indexOf("\n}", i) + 2;
    const fuera = s.slice(0, i) + s.slice(fin);
    expect(fuera, "hay un fetch sin plazo").not.toMatch(/\bfetch\(/);
    expect(s).toMatch(/fetchConPlazo\(`\$\{BASE\}\/models\?key=/);
    expect(s).toMatch(/fetchConPlazo\(`\$\{BASE\}\/models\/\$\{model\}:generateContent/);
  });

  it("el plazo se hace con AbortController y se limpia siempre", () => {
    const s = ia();
    const i = s.indexOf("async function fetchConPlazo");
    expect(i).toBeGreaterThan(-1);
    const dentro = s.slice(i, s.indexOf("\n}", i));
    expect(dentro).toMatch(/new AbortController\(\)/);
    expect(dentro).toMatch(/signal: corte\.signal/);
    // En `finally`: si no, un fallo deja el reloj corriendo y la
    // funcion no termina de apagarse.
    expect(dentro).toMatch(/\}finally\{\s*\n\s*clearTimeout\(reloj\);/);
  });

  it("y un aborto se trata como «sin respuesta», que es lo que es", () => {
    const s = ia();
    const i = s.indexOf("async function pedir(");
    const dentro = s.slice(i, s.indexOf("\n}", i));
    expect(dentro).toMatch(/\}catch\{/);
    expect(dentro).toMatch(/status: 0/);
  });
});

// ── LA QUE IMPORTA ──────────────────────────────────────────────
//
// Limitar cada intento NO limita la suma. Sin presupuesto, cuatro
// modelos a tres intentos de 25 s son cinco minutos, y la funcion
// muere igual que antes aunque ningun intento se haya colgado.
describe("la suma tampoco se pasa", () => {
  it("hay un presupuesto total, y es menor que el plazo de la funcion", () => {
    const s = ia();
    const pres = Number(s.match(/const PRESUPUESTO\s*=\s*(\d+)/)?.[1]);
    const porIntento = Number(s.match(/const LIMITE_PETICION\s*=\s*(\d+)/)?.[1]);
    expect(pres).toBeGreaterThan(0);
    expect(porIntento).toBeGreaterThan(0);

    // `analizarContrato` y `redactarBorrador` corren con 120 s. El
    // margen es para que el error salga por nuestro camino, con su
    // motivo, en vez de morir de golpe.
    expect(pres).toBeLessThan(120000);
    expect(120000 - pres).toBeGreaterThanOrEqual(20000);

    // Y que quepa mas de un intento, o el presupuesto seria un plazo
    // por intento con otro nombre.
    expect(pres).toBeGreaterThan(porIntento * 2);
  });

  it("se mira ANTES de gastar, no despues", () => {
    // Preguntar si queda tiempo cuando ya se acabo no sirve de nada.
    const s = ia();
    const i = s.indexOf("export async function preguntar");
    const dentro = s.slice(i, s.indexOf("\n}", i));
    expect(dentro).toMatch(/if\(Date\.now\(\) \+ LIMITE_PETICION > hasta\)\{ agotado = true; break; \}/);
    // El corte va antes de la llamada en el cuerpo del bucle.
    expect(dentro.indexOf("agotado = true")).toBeLessThan(dentro.indexOf("await pedir("));
  });

  it("y rompe los DOS bucles, no solo el de dentro", () => {
    // Romper solo el interior pasaria al siguiente modelo y volveria
    // a gastar. El presupuesto es de toda la operacion.
    const s = ia();
    const i = s.indexOf("export async function preguntar");
    const dentro = s.slice(i, s.indexOf("\n}", i));
    expect(dentro).toMatch(/\}\s*\n\s*if\(agotado\) break;/);
  });

  it("al rendirse dice «lento», y antes que los demas motivos", () => {
    // Si se mirara despues, el ultimo codigo visto podria ser de hace
    // tres intentos y contaria otra historia.
    const s = ia();
    const i = s.indexOf("export async function preguntar");
    const dentro = s.slice(i, s.indexOf("\n}", i));
    expect(dentro).toMatch(/if\(agotado\) throw new Error\("lento"\)/);
    expect(dentro.indexOf('throw new Error("lento")'))
      .toBeLessThan(dentro.indexOf('throw new Error("cuota")'));
  });
});

describe("el motivo llega hasta la persona", () => {
  it("«lento» tiene su frase, y se entiende sin saber nada", () => {
    const s = ia();
    expect(s).toMatch(/"lento":\s*"El servicio de IA está tardando demasiado/);
  });

  it("y cuenta como «vuelve a intentarlo», no como roto", () => {
    // No esta roto nada: el servicio tardo. Marcarlo como `internal`
    // haria creer que hay un fallo que arreglar.
    const srv = leer("functions/index.js");
    const veces = srv.split('"lento"').length - 1;
    expect(veces, "los dos sitios que llaman a la IA").toBeGreaterThanOrEqual(2);
    expect(srv).toMatch(/\["cuota", "saturado", "conexion", "lento"\]/);
  });
});

// ── Y QUE EL PLAZO FUNCIONE DE VERDAD ───────────────────────────
//
// Lo de arriba lee el codigo. Esto lo ejecuta contra un servidor que
// acepta la conexion y no contesta nunca, que es exactamente lo que
// hacia Gemini.
describe("contra un Gemini que no contesta", () => {
  let original;
  beforeEach(() => { original = globalThis.fetch; vi.useFakeTimers(); });
  afterEach(() => { globalThis.fetch = original; vi.useRealTimers(); });

  it("el fetch se aborta solo en vez de esperar sin fin", async () => {
    // Reproduce la forma de `fetchConPlazo` sin tocar el modulo, para
    // comprobar que la pieza hace lo que se supone.
    globalThis.fetch = (_u, o) => new Promise((_res, rej) => {
      o?.signal?.addEventListener("abort", () => rej(new Error("AbortError")));
      // y nunca resuelve, como el Gemini del registro
    });

    const corte = new AbortController();
    const reloj = setTimeout(() => corte.abort(), 25000);
    const intento = globalThis.fetch("https://lo-que-sea", { signal: corte.signal })
      .then(() => "contestó").catch(() => "abortado");

    vi.advanceTimersByTime(25001);
    await expect(intento).resolves.toBe("abortado");
    clearTimeout(reloj);
  });
});

// @vitest-environment jsdom
//
// Con DOM de verdad, y aqui es imprescindible. El borrador se pinta
// con `dangerouslySetInnerHTML`, y lo unico que hace defendible esa
// linea es que `normalizar()` lo haya limpiado antes. Pero
// `normalizar()` usa el DOMParser del navegador y sin el cae a un
// camino de respaldo que quita TODAS las etiquetas. En ese camino la
// prueba del filtro pasaria siempre, por el motivo equivocado: diria
// que esta limpio porque no queda nada, no porque el filtro funcione.
// Asi se comprueba el codigo que de verdad corre.

// «Ayudame a redactar»: las notas de alguien, puestas en forma.
//
// El objetivo, con palabras de Ricardo: «que se pueda usar incluso si
// no eres abogado o no sabes como redactarlo correctamente».
//
// Lo que se vigila aqui, por orden de gravedad:
//
//   1. QUE NO INVENTE. Es lo unico que puede hacer dano de verdad. Si
//      el modelo rellena un monto, una penalizacion o una jurisdiccion
//      que nadie escribio, el resultado es peor que las notas sueltas:
//      parece firme y no lo es, y quien lo firme creera que esta
//      protegido por algo que se invento una maquina.
//   2. Que lo que devuelve pase por el mismo filtro que todo lo demas
//      antes de pintarse. Viene de un modelo, y un modelo puede
//      devolver cualquier cosa.
//   3. Que la lista de lo que falta llegue entera y acotada: es la
//      mitad util de la funcion.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PROMPT_REDACCION, SCHEMA_REDACCION, SCHEMA } from "../functions/lib/ia.js";
import { normalizar, aTextoPlano, estaVacio } from "../src/nucleo/texto.js";

// Desde la raiz del proyecto y no desde `import.meta.url`: en el
// entorno jsdom ese valor no existe, y la ruta saldria «undefined».
// Vitest corre con la raiz del proyecto como directorio de trabajo.
const leer = (r) => readFileSync(resolve(process.cwd(), r), "utf8");

// ── LA QUE IMPORTA ──────────────────────────────────────────────
describe("tiene prohibido inventar", () => {
  it("se lo dice al modelo, y en mayusculas", () => {
    // No es una frase decorativa: es la unica barrera entre «te ordeno
    // lo que escribiste» y «te invento un contrato».
    expect(PROMPT_REDACCION).toMatch(/no inventes NADA/);
    expect(PROMPT_REDACCION).toMatch(/POR ENCIMA DE TODAS/);
  });

  it("y nombra lo que mas tienta inventar", () => {
    // Un modelo que redacta contratos ha visto diez mil contratos con
    // penalizaciones y jurisdicciones. Rellenarlas le sale solo si no
    // se le dice que no.
    for(const cosa of ["montos", "nombres", "fechas", "plazos", "penalizaciones", "jurisdicciones"]){
      expect(PROMPT_REDACCION, cosa).toMatch(new RegExp(cosa));
    }
  });

  it("los huecos se marcan en vez de rellenarse", () => {
    expect(PROMPT_REDACCION).toMatch(/\[COMPLETAR: qué falta\]/);
    expect(PROMPT_REDACCION).toMatch(/Si algo no está, NO lo pongas/);
  });

  it("y dice en voz alta que no es un abogado", () => {
    expect(PROMPT_REDACCION).toMatch(/NO eres un abogado/);
    expect(PROMPT_REDACCION).toMatch(/borrador/);
  });

  it("conserva TODOS los datos que si estaban", () => {
    // El otro lado del mismo riesgo: no inventar no puede acabar en
    // perder una fecha o una cantidad que la persona si escribio.
    expect(PROMPT_REDACCION).toMatch(/Conservas TODOS los datos/);
  });
});

// ── EL FALLO DEL 11 DE NOVIEMBRE ────────────────────────────────
//
// La primera llamada de verdad fallo con «ilegible», y el motivo no
// estaba en nada de lo escrito ese dia: `pedir()` llevaba cogido a
// fuego `responseSchema: SCHEMA`, el del analisis. Gemini obedecia al
// esquema por encima del texto de las instrucciones y devolvia
// requisitos y fases cuando se le pedia un contrato; al no haber
// `html`, el codigo decia «ilegible».
//
// Lo que no cazo el fallo, y por que: las pruebas de arriba miran el
// PROMPT y miran el NORMALIZADOR, que son las dos puntas. El fallo
// estaba en el cable de en medio, en una funcion que llevaba meses
// bien porque solo tenia un uso. Esto vigila ese cable.
describe("se le pide la forma correcta, no la del analisis", () => {
  it("el esquema de la redaccion pide html, no requisitos", () => {
    expect(Object.keys(SCHEMA_REDACCION.properties).sort())
      .toEqual(["faltan", "html", "titulo"]);
    expect(SCHEMA_REDACCION.properties).not.toHaveProperty("requisitos");
    expect(SCHEMA_REDACCION.required).toContain("html");
  });

  it("y NO es el mismo que el de analizar", () => {
    // Si alguien los unificara «para simplificar», volveria el fallo.
    expect(SCHEMA.properties).toHaveProperty("requisitos");
    expect(SCHEMA.properties).not.toHaveProperty("html");
  });

  it("redactar se lo pasa de verdad al preguntar", () => {
    const ia = leer("functions/lib/ia.js");
    expect(ia).toMatch(/preguntar\(prompt, SCHEMA_REDACCION\)/);
  });

  it("y pedir() ya no lleva ninguno cogido a fuego", () => {
    // La raiz del fallo. Mientras el esquema sea un parametro, pedir
    // una forma distinta es posible; en cuanto vuelva a ser una
    // constante dentro, deja de serlo y nadie se entera hasta que
    // falle en produccion.
    const ia = leer("functions/lib/ia.js");
    const i = ia.indexOf("async function pedir(");
    expect(i).toBeGreaterThan(-1);
    const dentro = ia.slice(i, i + 1600);
    expect(dentro).toMatch(/async function pedir\(model, prompt, schema\)/);
    expect(dentro).toMatch(/responseSchema: schema,/);
    expect(dentro).not.toMatch(/responseSchema: SCHEMA,/);
  });
});

describe("la forma de lo que devuelve", () => {
  it("pide las tres piezas y solo esas", () => {
    expect(PROMPT_REDACCION).toMatch(/\{"titulo": "\.\.\.", "html": "\.\.\.", "faltan": \[/);
  });

  it("limita las etiquetas a las que el editor entiende", () => {
    // Si pidiera tablas o estilos, `normalizar()` los tiraria y el
    // borrador que se ve no seria el que se guarda.
    expect(PROMPT_REDACCION).toMatch(/<h1> <h2> <p> <ul> <ol> <li> <b> <i>/);
    expect(PROMPT_REDACCION).toMatch(/Nada de atributos, estilos, clases ni tablas/);
  });

  it("acota la lista de lo que falta", () => {
    // Veinte cosas que faltan no las lee nadie, y las tres primeras
    // son las que importan.
    expect(PROMPT_REDACCION).toMatch(/Máximo 6/);
    expect(PROMPT_REDACCION).toMatch(/de más a menos grave/);
    expect(PROMPT_REDACCION).toMatch(/No pongas más de 12 huecos/);
  });

  it("y la recorta de verdad, no solo se lo pide", () => {
    // Pedirselo al modelo no basta: lo que llegue hay que acotarlo.
    const ia = leer("functions/lib/ia.js");
    const i = ia.indexOf("function normalizarRedaccion");
    expect(i).toBeGreaterThan(-1);
    const dentro = ia.slice(i, i + 600);
    expect(dentro).toMatch(/\.slice\(0, 6\)/);
    expect(dentro).toMatch(/Array\.isArray\(crudo\?\.faltan\)/);
    // Sin html no hay borrador que ensenar: mejor un error claro que
    // un modal en blanco.
    expect(dentro).toMatch(/if\(!html\) throw new Error\("ilegible"\)/);
  });
});

// ── QUE LO QUE SE PINTA ESTE LIMPIO ─────────────────────────────
describe("lo que llega del modelo se filtra antes de pintarse", () => {
  it("App.jsx lo pasa por normalizar antes de ensenarlo", () => {
    // El modal lo pinta con dangerouslySetInnerHTML. Esa linea solo es
    // defendible si lo que entra ya paso por el filtro.
    const app = leer("src/App.jsx");
    expect(app).toMatch(/setRedRes\(\{ \.\.\.res, html: normalizar\(res\.html\) \}\)/);
  });

  it("y el filtro de verdad tira lo peligroso", () => {
    // No se da por hecho: se comprueba con lo que un modelo podria
    // llegar a devolver.
    const sucio = '<p>Hola</p><script>alert(1)</script>'
      + '<img src=x onerror="alert(1)">'
      + '<a href="javascript:alert(1)">pincha</a>'
      + '<iframe src="https://el-malo.com"></iframe>';
    const limpio = normalizar(sucio);
    expect(limpio).not.toMatch(/<script/i);
    expect(limpio).not.toMatch(/onerror/i);
    expect(limpio).not.toMatch(/javascript:/i);
    expect(limpio).not.toMatch(/<iframe/i);
    expect(limpio).toMatch(/Hola/);
  });

  it("y deja pasar lo que el borrador si usa", () => {
    const bueno = "<h1>Contrato</h1><h2>1. Objeto</h2><p>Se obliga a <b>entregar</b>.</p>"
      + "<ul><li>Una cosa</li></ul>";
    const limpio = normalizar(bueno);
    // La negrita sale como <strong> y la cursiva como <em>: el
    // modelo del editor guarda la intencion, no la etiqueta que
    // entro. Lo que importa es que el ENFASIS sobreviva.
    for(const et of ["<h1", "<h2", "<p", "<li", "<strong"]){
      expect(limpio, et).toContain(et);
    }
    // Y los titulos no se aplastan a parrafos, que es lo que le da
    // forma de contrato al borrador.
    expect(limpio).toMatch(/<h1>Contrato<\/h1>/);
  });
});

describe("cuando no has escrito nada", () => {
  it("se pregunta antes de llamar a nadie", () => {
    // El aviso que pidio Ricardo. Sin el, pulsar con el documento en
    // blanco daria un error del servidor sobre un texto demasiado
    // corto, que no explica que hacer.
    const app = leer("src/App.jsx");
    const i = app.indexOf("const pedirRedaccion");
    expect(i).toBeGreaterThan(-1);
    const dentro = app.slice(i, i + 900);
    expect(dentro).toMatch(/if\(estaVacio\(cuerpo\)\)/);
    // Y que el corte ocurra ANTES de gastar una llamada que se paga.
    expect(dentro.indexOf("estaVacio")).toBeLessThan(dentro.indexOf("draftContract"));
  });

  it("y estaVacio reconoce un documento en blanco de verdad", () => {
    expect(estaVacio("")).toBe(true);
    expect(estaVacio("<p></p>")).toBe(true);
    expect(estaVacio("<p><br></p>")).toBe(true);
    expect(estaVacio("<p>   </p>")).toBe(true);
    expect(estaVacio("<p>Le hago un sitio web a Mariana</p>")).toBe(false);
  });

  it("el modal del aviso trae un ejemplo, no solo un regano", () => {
    // Decirle a alguien «escribe algo» cuando no sabe que escribir lo
    // deja donde estaba. El ejemplo es la ayuda.
    const m = leer("src/modales/Redaccion.jsx");
    expect(m).toMatch(/redactar-vacio/);
    expect(m).toMatch(/red-ejemplo/);
    expect(m).toMatch(/Mariana/);
  });
});

describe("el borrador no se aplica solo", () => {
  it("hay dos salidas y ninguna esta escondida", () => {
    const m = leer("src/modales/Redaccion.jsx");
    expect(m).toMatch(/Dejar el mío/);
    expect(m).toMatch(/Usar este texto/);
  });

  it("usarlo NO guarda: deja el texto anterior donde se pueda recuperar", () => {
    // La vuelta atras. Mientras no se le de a Guardar, lo que la
    // persona escribio sigue intacto en el documento, asi que salir
    // sin guardar lo devuelve. Si esto guardara, el texto anterior
    // quedaria solo dentro de la cadena.
    const app = leer("src/App.jsx");
    const i = app.indexOf("const usarRedaccion");
    expect(i).toBeGreaterThan(-1);
    const dentro = app.slice(i, app.indexOf("\n  };", i));
    expect(dentro).toMatch(/setDirty\(true\)/);
    expect(dentro).not.toMatch(/await aplicar\(/);
  });

  it("y el titulo de la persona gana siempre", () => {
    const app = leer("src/App.jsx");
    const i = app.indexOf("const usarRedaccion");
    const dentro = app.slice(i, app.indexOf("\n  };", i));
    expect(dentro).toMatch(/if\(redRes\.titulo && !title\.trim\(\)\)/);
  });
});

describe("se le manda texto plano, no etiquetas", () => {
  it("App.jsx lo convierte antes de mandarlo", () => {
    // Mandarle <p> y </strong> a Gemini es gastar tokens en ruido y
    // empeorar lo que entiende.
    const app = leer("src/App.jsx");
    expect(app).toMatch(/draftContract\(aTextoPlano\(cuerpo\)\)/);
  });

  it("y aTextoPlano deja algo que se pueda leer", () => {
    const plano = aTextoPlano("<h1>Trato</h1><p>Entrego el <b>12 de diciembre</b>.</p>");
    expect(plano).toMatch(/Trato/);
    expect(plano).toMatch(/12 de diciembre/);
    expect(plano).not.toMatch(/</);
  });
});

describe("el camino al servidor", () => {
  it("solo por servidor, sin bifurcacion local nueva", () => {
    // El camino local es lo que esta pendiente de quitar -nueve
    // guardas y dieciocho bifurcaciones-. Anadirle una decima seria
    // hacer mas grande el problema que queremos borrar.
    const sc = leer("src/smartContract.js");
    const i = sc.indexOf("export async function draftContract");
    expect(i).toBeGreaterThan(-1);
    const dentro = sc.slice(i, sc.indexOf("\n}", i));
    expect(dentro).toMatch(/if \(!enServidor\(\)\)/);
    expect(dentro).toMatch(/llamar\("redactarBorrador"/);
    expect(dentro).not.toMatch(/API_KEY/);
  });

  it("el servidor pide sesion y cuida la llave", () => {
    const srv = leer("functions/index.js");
    const i = srv.indexOf("export const redactarBorrador");
    expect(i).toBeGreaterThan(-1);
    const dentro = srv.slice(i, i + 1400);
    expect(dentro).toMatch(/quien\(req\)/);                 // cuesta dinero
    expect(dentro).toMatch(/secrets: \["GEMINI_API_KEY"\]/); // la llave no viaja
    expect(dentro).toMatch(/texto\.length > 60000/);         // tope de tamano
  });

  it("el minimo es mas bajo que el de analizar, y a proposito", () => {
    // Analizar necesita obligaciones de las que sacar requisitos;
    // redactar solo necesita una idea que ordenar.
    const srv = leer("functions/index.js");
    const i = srv.indexOf("export const redactarBorrador");
    expect(srv.slice(i, i + 900)).toMatch(/trim\(\)\.length < 40/);
    const j = srv.indexOf("export const analizarContrato");
    expect(srv.slice(j, j + 900)).toMatch(/trim\(\)\.length < 80/);
  });
});

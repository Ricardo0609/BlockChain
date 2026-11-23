// Un recibo o una factura ya no se escriben: se leen de un archivo.
//
// El encuadre es de Ricardo, el 16 de noviembre, y ordena todo lo
// demas: «mi plataforma no emite recibos ni facturas». Si OCTAVIN no
// los emite, un comprobante de aqui no puede ser un papel que
// escribes y firmas -una declaracion tuya sobre ti mismo-: tiene que
// ser la LECTURA de un documento que ya existia, con el documento al
// lado para que cualquiera coteje.
//
// De ahi salen las cuatro reglas que estas pruebas vigilan:
//
//   1. NO SE EMPIEZA EN BLANCO. Factura: solo subir archivo. Recibo:
//      subir o escanear, «porque sigue habiendo tickets o recibos
//      fisicos». En ninguno «crear desde cero».
//   2. EL ORIGINAL SE GUARDA DE VERDAD. Hasta ayer no: `sourceFile`
//      guardaba el NOMBRE del archivo y el archivo se tiraba, asi que
//      la regla de respaldo del 10 de noviembre se cumplia con una
//      cadena de texto.
//   3. EL ORIGINAL NO SE QUITA. «Este archivo original no se va a
//      poder quitar». En el servidor, que es donde se quita.
//   4. NUNCA POR ENLACE. «No tiene sentido compartirselo a alguien
//      que no tiene cuenta porque no estas emitiendo una factura o
//      recibo que quieras mandar, solamente estas respaldando la
//      informacion».
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sinComentarios } from "./sinComentarios.js";
import { METODOS_DE, METHODS, QUE_ARCHIVO } from "../src/nucleo/catalogos";
import { originalDe, esElOriginal, faltaRespaldo } from "../src/nucleo/comprobantes";
import { propositoDe, esComprobante as esComprSrv } from "../functions/lib/invitaciones.js";

const leer = (r) => readFileSync(resolve(process.cwd(), r), "utf8");
const codigo = (r) => sinComentarios(leer(r));

const srv = () => leer("functions/index.js");
const callable = (nombre) => {
  const s = srv();
  const i = s.indexOf(`export const ${nombre}`);
  expect(i, nombre).toBeGreaterThan(-1);
  return s.slice(i, s.indexOf("\n});", i));
};

// ══════════════════════════════════════════════════════════════
// 1. CON QUE SE PUEDE EMPEZAR
// ══════════════════════════════════════════════════════════════
describe("de donde salen los datos", () => {
  it("una factura solo se sube: ni en blanco ni con la camara", () => {
    // «Practicamente todas las facturas se emiten digitales», asi que
    // fotografiar una factura es fotografiar la impresion de un
    // archivo que ya tienes: se pierde el XML -lo unico verificable
    // contra el SAT- y se gana ruido de OCR.
    expect(METODOS_DE("factura")).toEqual(["subir"]);
  });

  it("un recibo tambien se escanea, porque hay tickets de papel", () => {
    expect(METODOS_DE("recibo")).toEqual(["subir", "escanear"]);
  });

  it("en ninguno de los dos se empieza en blanco", () => {
    // LA QUE IMPORTA de este grupo. Un comprobante escrito a mano y
    // firmado por quien lo escribio no prueba nada, y salia con la
    // misma cadena y la misma firma que uno de verdad.
    expect(METODOS_DE("factura")).not.toContain("cero");
    expect(METODOS_DE("recibo")).not.toContain("cero");
    expect(METODOS_DE("factura")).not.toContain("escanear");
  });

  it("lo demas sigue con los tres de siempre", () => {
    expect(METODOS_DE(null)).toEqual(METHODS.map((m) => m.id));
    expect(METODOS_DE("inteligente")).toContain("cero");
  });

  it("la pantalla filtra por ahi, no por su cuenta", () => {
    // Si la pantalla se escribiera su propia lista, cambiar la regla
    // en un sitio no la cambiaria en el otro.
    const c = codigo("src/modales/Crear.jsx");
    expect(c).toMatch(/const metodos = METODOS_DE\(tpl\);/);
    expect(c).toMatch(/METHODS\.filter\(m=>metodos\.includes\(m\.id\)\)/);
    // Y dice que archivo quiere, para los dos.
    expect(QUE_ARCHIVO.factura).toMatch(/XML/);
    expect(QUE_ARCHIVO.recibo).toMatch(/ticket|transferencia/);
    expect(c).toMatch(/QUE_ARCHIVO\[tpl\]/);
  });
});

// ══════════════════════════════════════════════════════════════
// 2. EL ARCHIVO SE GUARDA DE VERDAD
// ══════════════════════════════════════════════════════════════
describe("el original deja de ser una cadena de texto", () => {
  it("el File se guarda al leerlo, no solo su nombre", () => {
    // El agujero: `handleFile` sacaba el texto y tiraba el archivo;
    // de el solo quedaba `impMeta.name`. `faltaRespaldo` aceptaba esa
    // cadena como prueba.
    const app = leer("src/App.jsx");
    expect(app).toMatch(/const \[impFile,setImpFile\] = useState\(null\);/);
    expect(app).toMatch(/setImpFile\(file\);/);
    // Y se suelta al empezar de nuevo, para no subir el de antes.
    const i = app.indexOf("const resetImport =");
    expect(app.slice(i, app.indexOf("\n", i))).toMatch(/setImpFile\(null\)/);
  });

  it("y sube al crear el comprobante, con su huella", () => {
    const app = leer("src/App.jsx");
    const i = app.indexOf("const createDoc = async()=>{");
    const c = app.slice(i, app.indexOf("\n  };", i));
    expect(c).toMatch(/if\(isImport && formKey && impFile\)/);
    expect(c).toMatch(/subirArchivo\(\{ uid, docId:id, file:impFile \}\)/);
    expect(c).toMatch(/llamar\("registrarOriginal"/);
    // Si falla la subida, el documento se queda sin original y se
    // dice: perder tambien los datos ya extraidos seria peor.
    expect(c).toMatch(/descartarSubida\(ruta\)/);
    expect(c).toMatch(/Adjúntalo desde el documento/);
  });

  it("solo UNO es el original, y se distingue de las demas fotos", () => {
    expect(esElOriginal({ esOriginal: true })).toBe(true);
    expect(esElOriginal({ nombre: "foto.jpg" })).toBe(false);
    expect(esElOriginal(null)).toBe(false);
    const doc = { tplId: "recibo", imagenes: [
      { path: "a", nombre: "extra.jpg" },
      { path: "b", nombre: "ticket.jpg", esOriginal: true },
    ] };
    expect(originalDe(doc).path).toBe("b");
    expect(faltaRespaldo(doc)).toBe(false);
    // Sin el marcado, no hay respaldo por muchas fotos que haya.
    expect(faltaRespaldo({ tplId: "recibo", imagenes: [{ path: "a" }] })).toBe(true);
  });

  it("el servidor no deja un segundo original", () => {
    // Sin esto, «el original» seria el que cada pantalla decidiera
    // enseñar, y bastaria con subir otro encima para cambiar de que
    // documento salieron los datos.
    const c = callable("registrarOriginal");
    expect(c).toMatch(/if\(\(actual\.imagenes \|\| \[\]\)\.some\(\(x\) => x\.esOriginal\)\)/);
    expect(c).toMatch(/ya tiene su archivo original/);
  });

  it("ni uno en un documento que no es comprobante", () => {
    expect(callable("registrarOriginal"))
      .toMatch(/if\(actual\.tplId !== "recibo" && actual\.tplId !== "factura"\)/);
  });

  it("acepta XML y PDF, que es donde `registrarImagen` no servia", () => {
    // El original de una factura normalmente NO es una imagen:
    // `registrarImagen` rechaza todo lo que no empiece por `image/`,
    // que esta bien para la galeria y es lo contrario de lo que hace
    // falta aqui. Por eso es una puerta aparte y no un parametro.
    const s = srv();
    const i = s.indexOf("const TIPOS_ORIGINAL");
    expect(i).toBeGreaterThan(-1);
    const lista = s.slice(i, s.indexOf("];", i));
    for(const t of ["image/", "application/pdf", "text/xml", "application/xml"]){
      expect(lista, t).toContain(t);
    }
    expect(callable("registrarOriginal")).toMatch(/TIPOS_ORIGINAL\.some/);
    // Y la galeria normal sigue siendo solo de imagenes.
    expect(callable("registrarImagen")).toMatch(/if\(!tipo\.startsWith\("image\/"\)\)/);
  });

  it("la cadena dice que es EL ORIGINAL, no «una imagen»", () => {
    // Quien lea la cadena dentro de dos años tiene que poder
    // distinguir el documento del que salieron los datos de las fotos
    // que se añadieron despues.
    const c = callable("registrarOriginal");
    expect(c).toMatch(/contenido: `Archivo original/);
    expect(c).toMatch(/tipo: "original"/);
    expect(c).toMatch(/esOriginal: true/);
  });
});

// ══════════════════════════════════════════════════════════════
// 3. LA QUE MAS IMPORTA: NO SE QUITA
// ══════════════════════════════════════════════════════════════
describe("el original no se quita", () => {
  it("el servidor se niega, que es donde se quita de verdad", () => {
    // Ricardo lo pidio como «este archivo original no se va a poder
    // quitar». Un boton que no se pinta no quita nada: lo quita quien
    // llame a la funcion.
    const c = callable("quitarImagen");
    expect(c).toMatch(/if\(img\.esOriginal\)/);
    expect(c).toMatch(/no se puede quitar/);
    // Y se niega ANTES de borrar nada del almacen: si fuera despues,
    // el archivo ya estaria perdido cuando llega la negativa.
    expect(c.indexOf("if(img.esOriginal)"))
      .toBeLessThan(c.indexOf("bucket().file(ruta).delete()"));
  });

  it("sin servidor tambien, porque ahi esa es la unica puerta", () => {
    const app = leer("src/App.jsx");
    const i = app.indexOf("const quitarImagenLocal = async(path)=>{");
    expect(i).toBeGreaterThan(-1);
    expect(app.slice(i, app.indexOf("\n  };", i))).toMatch(/if\(img\?\.esOriginal\)/);
  });

  it("y en pantalla no sale una x apagada, sale una etiqueta", () => {
    // Una x apagada invita a preguntarse que falta para poder usarla,
    // y aqui no falta nada: no se quita nunca.
    const doc = codigo("src/pantallas/Documento.jsx");
    expect(doc).toMatch(/\{img\.esOriginal \? \(/);
    expect(doc).toMatch(/className="gal-org"/);
    const i = doc.indexOf("img.esOriginal ? (");
    const trozo = doc.slice(i, i + 420);
    expect(trozo).toMatch(/Original/);
    // La x queda en el `else`, no al lado.
    expect(trozo).toMatch(/\) : loEdito && \(/);
  });
});

// ══════════════════════════════════════════════════════════════
// 4. LOS DE ANTES, Y LA SALIDA
// ══════════════════════════════════════════════════════════════
describe("los comprobantes de antes", () => {
  it("piden el archivo ahi donde se dice que falta", () => {
    // Antes decia «adjuntalo abajo» y mandaba a la galeria, que esta
    // al final y se llama «Evidencia visual»: quien busca donde
    // poner el XML de una factura no va a pensar que es ahi.
    const doc = codigo("src/pantallas/Documento.jsx");
    expect(doc).toMatch(/const viejoSinOriginal = sinOriginalViejo\(d\);/);
    expect(doc).toMatch(/onChange=\{e=>\{ adjuntarOriginal\(e\.target\.files\?\.\[0\]\); /);
    // Y el aviso ya no depende de estar sin firmar: el caso que mas
    // lo necesita es justo uno ya firmado.
    expect(doc).toMatch(/\{esRecibo && faltaRespaldo\(d\) && loEdito &&/);
    // Una factura acepta XML; un recibo no lo pide.
    const i = doc.indexOf("adjuntarOriginal(e.target.files");
    const alrededor = doc.slice(Math.max(0, i - 400), i);
    expect(alrededor).toMatch(/\.xml/);
  });

  it("adjuntarOriginal existe y pasa por el servidor cuando lo hay", () => {
    const app = leer("src/App.jsx");
    const i = app.indexOf("const adjuntarOriginal = async(file)=>{");
    expect(i).toBeGreaterThan(-1);
    const c = app.slice(i, app.indexOf("\n  };", i));
    expect(c).toMatch(/llamar\("registrarOriginal", \{ opId:d\.id/);
    expect(c).toMatch(/registrarOriginalLocal\(d, \{ file, ruta, thumb \}\)/);
    expect(c).toMatch(/descartarSubida\(ruta\)/);
  });
});

// ══════════════════════════════════════════════════════════════
// 5. NUNCA POR ENLACE
// ══════════════════════════════════════════════════════════════
describe("un comprobante solo se comparte con cuenta", () => {
  it("el servidor no le da proposito a un enlace de comprobante", () => {
    // Esto hace falta HOY, no algun dia: desde el 15 de noviembre un
    // documento que no es expediente recibe enlace de lectura o de
    // firma, y una factura no es un expediente. Sin esta regla, el
    // trabajo de ayer le habria abierto justo la puerta que Ricardo
    // quiere cerrada.
    expect(propositoDe({ tplId: "factura" })).toBe(null);
    expect(propositoDe({ tplId: "recibo" })).toBe(null);
    expect(esComprSrv({ tplId: "recibo" })).toBe(true);
    // Y lo demas sigue igual.
    expect(propositoDe({ kind: "expediente" })).toBe("entrega");
    expect(propositoDe({ kind: "documento" })).toBe("firma");
    expect(propositoDe({ kind: "documento", secciones: { firmas: false } })).toBe("lectura");
  });

  it("y `crearInvitacion` se niega con eso", () => {
    const c = callable("crearInvitacion");
    expect(c).toMatch(/if\(proposito === null\)/);
    expect(c).toMatch(/sólo se comparten con alguien que tenga cuenta/);
    // Antes de crear nada: si fuera despues, el enlace ya existiria.
    expect(c.indexOf("if(proposito === null)"))
      .toBeLessThan(c.indexOf("armarInvitacion"));
  });

  it("y el modal no ofrece el enlace ni apagado", () => {
    // No esta esperando algo: es que no existe para esto. Un boton
    // apagado invita a preguntarse que le falta.
    const m = codigo("src/modales/Compartir.jsx");
    expect(m).toMatch(/const comprobante = esComprobante\(d\);/);
    const i = m.indexOf("{comprobante ? (<>");
    expect(i).toBeGreaterThan(-1);
    // ← ACTUALIZADA (23 nov): el limite era «</>) : !esExpediente ?
    // (<>». Al separar los dos modales, el camino del expediente se
    // fue de este archivo y ese `!esExpediente` ya no hace falta.
    const dentro = m.slice(i, m.indexOf("</>) : (<>", i));
    expect(dentro).toMatch(/Dar acceso/);
    expect(dentro).not.toMatch(/Mandar a alguien sin cuenta/);
    expect(dentro).not.toMatch(/sign-or/);
    expect(dentro).toMatch(/no deja saber quién lo abrió/);
  });

  it("ni papel que elegir: lector, porque solo su dueño lo edita", () => {
    const m = codigo("src/modales/Compartir.jsx");
    expect(m).toMatch(/: comprobante \? "lector"/);
    // Y es verdad que solo su dueño lo edita, no solo una frase.
    const comp = leer("src/nucleo/comprobantes.js");
    expect(comp).toMatch(/export const soloSuDueno/);
  });
});

// ══════════════════════════════════════════════════════════════
// 6. LA HERRAMIENTA CON LA QUE SE MIRA EL CODIGO
// ══════════════════════════════════════════════════════════════
//
// Esto no prueba el producto: prueba la lupa. Y hace falta porque la
// lupa estaba rota y nadie se habria enterado.
describe("quitar comentarios sin romper el codigo", () => {
  it("una cadena con barra-asterisco dentro no abre un comentario", () => {
    // EL FALLO. `accept="image/*"` abria un comentario que corria
    // hasta el siguiente cierre de verdad, a cientos de lineas, y se
    // llevaba por delante todo lo de en medio.
    const s = sinComentarios('const a = "image/*";\nconst b = 2;\nconst c = 3;');
    expect(s).toContain('"image/*"');
    expect(s).toContain("const b = 2;");
    expect(s).toContain("const c = 3;");
  });

  it("y el archivo de verdad sobrevive entero", () => {
    // `Documento.jsx` es el que tiene `image/*`. Antes, de aqui en
    // adelante no quedaba casi nada.
    const doc = codigo("src/pantallas/Documento.jsx");
    expect(doc).toContain('accept="image/*"');
    expect(doc).toMatch(/adjuntarOriginal\(e\.target\.files/);
    expect(doc).toMatch(/className="gal-org"/);
    // Y no se quedo corto: el original tiene mas de 25 000 caracteres
    // y la version rota devolvia unos pocos cientos.
    expect(doc.length).toBeGreaterThan(20000);
  });

  it("pero los comentarios SI se van, que es para lo que esta", () => {
    expect(sinComentarios("a(); // b();\nc();")).not.toContain("b()");
    expect(sinComentarios("a(); /* b(); */ c();")).not.toContain("b()");
    expect(sinComentarios("a(); /* b();\n   d(); */ c();")).not.toContain("d()");
    // El salto de linea se conserva: si no, dos lineas se pegarian y
    // una busqueda de «^algo» dejaria de encontrarlo.
    expect(sinComentarios("a(); // x\nb();")).toBe("a(); \nb();");
  });

  it("una comilla escapada no cierra la cadena antes de tiempo", () => {
    const s = sinComentarios('const a = "dice \\"hola/*\\" y ya";\nconst b = 1;');
    expect(s).toContain("const b = 1;");
  });
});

describe("un solo camino no se pregunta", () => {
  it("la factura llega al paso 2 con el metodo ya elegido", () => {
    // Hacer clic en la unica tarjeta posible para poder seguir no es
    // elegir: es un paso de mas entre el usuario y lo que venia a
    // hacer. «Siempre hay que pensar en el usuario y las rutas que va
    // a tomar, que no sea tan complejo».
    const c = codigo("src/modales/Crear.jsx");
    expect(c).toMatch(/const ms = METODOS_DE\(t\.id\);/);
    expect(c).toMatch(/setMethod\(ms\.length===1 \? ms\[0\] : null\);/);
    // Y con uno solo no se pinta la rejilla con una tarjeta sola.
    expect(c).toMatch(/\{metodos\.length>1 && \(<>/);
  });
});

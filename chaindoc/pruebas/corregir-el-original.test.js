// Corregir el archivo original, y el importe que se lee.
//
// LO QUE PIDIÓ RICARDO (24 nov), en sus palabras:
//
//   «En lugar del botón enviar periódicamente coloca uno que diga
//    corregir recibo, esto para poder subir uno nuevo, por que qué
//    tal si subí el que no era, y vuelve a hacer el mismo proceso de
//    leerlo; peeero en la cadena o en el historial se registra que se
//    hizo ese cambio para que quede transparencia de que se cambió.»
//
// Y dos decisiones que tomó al preguntárselo:
//
//   · El archivo viejo SE BORRA del almacén; de él quedan su nombre,
//     su huella y la fecha en la cadena.
//   · Gana el archivo nuevo en TODO, también donde alguien hubiera
//     corregido a mano: si el documento estaba equivocado, sus
//     correcciones también lo estaban.
//
// ── LA TENSIÓN QUE HAY QUE RESPETAR ──────────────────────────
//
// Al lado de esto vive una regla escrita con todas sus letras: el
// original NO SE QUITA, nunca, ni por su dueño. Su motivo es que
// quitarlo no deja rastro, y sin él el comprobante vuelve a ser un
// papel que alguien escribió sobre sí mismo —uno que ya lleva firma
// y cadena detrás, o sea con mejor pinta de prueba que antes—.
//
// Esto no quita: SUSTITUYE, y lo dice. El comprobante no se queda
// sin original ni un instante y la huella del que estaba queda en la
// cadena. Si alguna de esas dos cosas se cae, «corregir» se
// convierte en la puerta trasera de «quitar», y estas pruebas están
// para que no pase.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { sinComentarios } from "./sinComentarios.js";
import { FORMS, allFields, serializeForm, dinero, fechaLegible } from "../src/ui/formularios";
import { FormDoc } from "../src/ui/FormDoc.jsx";
import { renderDocumento } from "../src/pantallas/Documento.jsx";

const leer = (r) => readFileSync(resolve(process.cwd(), r), "utf8");
const codigo = (r) => sinComentarios(leer(r));
const SERVIDOR = () => codigo("functions/index.js");
/** El cuerpo de una función del servidor, para no mirar en la de al lado. */
const callable = (nombre) => {
  const t = SERVIDOR();
  const i = t.indexOf(`export const ${nombre} = onCall(`);
  expect(i, nombre).toBeGreaterThan(-1);
  const j = t.indexOf("\nexport const ", i + 10);
  return t.slice(i, j === -1 ? undefined : j);
};

// ══════════════════════════════════════════════════════════════
// 1. EL INTERRUPTOR QUE NO ENCENDÍA NADA
// ══════════════════════════════════════════════════════════════
describe("«Enviar periódicamente» se fue", () => {
  it("ya no está en ninguna de las dos plantillas", () => {
    for (const k of Object.keys(FORMS)) {
      expect(allFields(FORMS[k]).map((f) => f.k), k).not.toContain("periodico");
    }
  });

  it("y no quedó nadie llamándolo", () => {
    // Era un control que prometía mandar el recibo solo, y no había
    // una sola línea que lo leyera. Si algún día vuelve, que vuelva
    // con su motor detrás.
    for (const f of ["src/App.jsx", "src/ui/FormDoc.jsx", "src/ui/formularios.js",
                     "functions/index.js"]) {
      expect(codigo(f), f).not.toMatch(/periodico/);
    }
  });
});

// ══════════════════════════════════════════════════════════════
// 2. EL IMPORTE, COMO SE LEE
// ══════════════════════════════════════════════════════════════
describe("el importe lleva separador de miles", () => {
  it("treinta y cinco mil se leen como treinta y cinco mil", () => {
    expect(dinero("35000.00")).toBe("$35,000.00");
    expect(dinero(1234567.5)).toBe("$1,234,567.50");
    expect(dinero("900")).toBe("$900.00");
  });

  it("y lo que no es un número se devuelve tal cual", () => {
    // Lo que escribió una persona no se esconde por no saber leerlo.
    expect(dinero("pendiente")).toBe("$pendiente");
    expect(dinero("")).toBe("$");
  });

  it("se ve así en la pantalla, no sólo en la función", () => {
    const html = renderToStaticMarkup(
      FormDoc({ formKey: "recibo", fields: { cantidad: "35000.00" }, editable: false,
                onChange: () => {} }));
    expect(html).toContain("$35,000.00");
    expect(html).not.toContain("$35000.00");
  });

  it("pero el texto que se hashea NO se separa", () => {
    // Un separador de miles es una convención de un idioma. Meterlo
    // dentro de la huella haría que el mismo recibo tuviera huellas
    // distintas según dónde se mire.
    expect(serializeForm("recibo", { cantidad: "35000.00" }))
      .toContain("Cantidad: $35000.00");
  });
});

// ══════════════════════════════════════════════════════════════
// 2 bis. LA FECHA ES LA DEL ARCHIVO, Y NO SE MUEVE
// ══════════════════════════════════════════════════════════════
//
// Ricardo, al pedirlo: «hay que dejar la que lee, es decir la que
// está en el recibo original». Esto sólo cambia cómo se dibuja; el
// valor guardado no se toca. Las pruebas de aquí están para que
// «dibujar» no se convierta, sin que nadie lo note, en «cambiar».
describe("la fecha se escribe en largo pero no se mueve", () => {
  it("se lee como la lee una persona", () => {
    expect(fechaLegible("2026-11-19")).toBe("19 de noviembre de 2026");
  });

  it("y NO se corre un día por el huso horario", () => {
    // El fallo que esto evita: `new Date("2026-11-19")` es medianoche
    // en UTC, que en México es el día 18. La fecha del recibo se
    // correría sola hacia atrás, y en un comprobante el día es EL
    // dato. Por eso la función mete las doce dentro.
    for (const d of ["2026-01-01", "2026-11-19", "2026-12-31"]) {
      expect(fechaLegible(d), d).toContain(d.slice(8, 10).replace(/^0/, ""));
      expect(fechaLegible(d), d).toContain(d.slice(0, 4));
    }
    expect(fechaLegible("2026-01-01")).toBe("1 de enero de 2026");
  });

  it("y dice SIEMPRE el año, aunque sea el de hoy", () => {
    // Por eso no se usa `fmtFecha`, que lo esconde. En un recibo, de
    // qué año es no es un detalle.
    const esteAnio = `${new Date().getFullYear()}-06-15`;
    expect(fechaLegible(esteAnio)).toContain(String(new Date().getFullYear()));
  });

  it("y lo que no sea una fecha limpia se devuelve tal cual", () => {
    // Taparlo con un «—» escondería justo lo que la otra parte tiene
    // que comparar contra el original.
    expect(fechaLegible("19/11/2026")).toBe("19/11/2026");
    expect(fechaLegible("pendiente")).toBe("pendiente");
    expect(fechaLegible("2026-13-45")).toBe("2026-13-45");
    expect(fechaLegible("")).toBe("");
  });

  it("en la pantalla sale en largo, y el valor sigue siendo el del archivo", () => {
    const html = renderToStaticMarkup(
      FormDoc({ formKey: "recibo", fields: { fecha: "2026-11-19" }, editable: false,
                onChange: () => {} }));
    expect(html).toContain("19 de noviembre de 2026");
    expect(html).not.toContain("18 de noviembre");
  });

  it("pero al editarla se vuelve a ver el dato crudo, que es lo que se guarda", () => {
    // El <input type="date"> trabaja en ISO. Si se le metiera el
    // texto largo, el campo saldría vacío y guardar lo borraría.
    const html = renderToStaticMarkup(
      FormDoc({ formKey: "recibo", fields: { fecha: "2026-11-19" }, editable: true,
                onChange: () => {} }));
    expect(html).toContain('value="2026-11-19"');
    expect(html).not.toContain("19 de noviembre de 2026");
    // Y sigue siendo un campo de fecha, con su calendario. Si pasara
    // a ser texto libre, lo que se guardara dejaría de ser una fecha
    // y `fechaLegible` tendría que rendirse y enseñarla cruda.
    expect(html).toMatch(/type="date"[^>]*value="2026-11-19"|value="2026-11-19"[^>]*type="date"/);
  });

  it("y el texto que se hashea tampoco cambia", () => {
    expect(serializeForm("recibo", { fecha: "2026-11-19" }))
      .toContain("Fecha: 2026-11-19");
  });
});

// ══════════════════════════════════════════════════════════════
// 3. EL BOTÓN: CUÁNDO SALE Y CUÁNDO NO
// ══════════════════════════════════════════════════════════════
describe("«Corregir recibo»", () => {
  const pinta = (extra = {}) => renderToStaticMarkup(
    FormDoc({ formKey: "recibo", fields: { cantidad: "35000.00" }, onChange: () => {},
              editable: false,
              corregir: { ocupado: false, acepta: ".pdf,image/*", alElegir: () => {} },
              ...extra }));

  it("sale, y dice lo que va a pasar", () => {
    const html = pinta();
    expect(html).toContain("Corregir recibo");
    expect(html).toMatch(/los datos se vuelven a leer de él/);
    // Y que el cambio queda asentado: es la mitad de la promesa.
    expect(html).toMatch(/queda asentado/);
  });

  it("y en una factura dice factura, no recibo", () => {
    const html = renderToStaticMarkup(
      FormDoc({ formKey: "factura", fields: {}, editable: false, onChange: () => {},
                corregir: { ocupado: false, acepta: ".xml", alElegir: () => {} } }));
    expect(html).toContain("Corregir factura");
  });

  it("no sale si no se lo dan", () => {
    expect(pinta({ corregir: null })).not.toContain("Corregir recibo");
  });

  it("y mientras lee, lo dice y no se deja pulsar otra vez", () => {
    const html = pinta({ corregir: { ocupado: true, acepta: "", alElegir: () => {} } });
    expect(html).toContain("Leyendo el archivo…");
    expect(html).toMatch(/disabled/);
  });

});

// ══════════════════════════════════════════════════════════════
// 3 bis. QUIÉN LO VE — PINTANDO LA PANTALLA ENTERA
// ══════════════════════════════════════════════════════════════
//
// Quién ve el botón no lo decide `FormDoc`: lo decide la pantalla
// del documento. Y leer esa condición en el código fuente no
// comprueba que esté viva: un `false &&` delante deja el texto
// intacto y la prueba en verde. Eso pasó el 23 de noviembre con otra
// pantalla, así que esta se pinta.
describe("quién ve el botón, en la pantalla de verdad", () => {
  const nada = () => {};
  const ORIGINAL = { path:"org1", ruta:"u/1/org1.pdf", nombre:"recibo.pdf",
    tipo:"application/pdf", tam:94000, hash:"ab12".padEnd(64, "c"),
    subidoEn:"2026-11-19T10:00:00Z", subidoPor:"Ricardo", esOriginal:true };

  const pinta = ({ edit = false, original = true, puedo = () => true,
                   corrigiendo = false } = {}) => {
    const d = { id:"r1", kind:"documento", tplId:"recibo", numId:"REC-0023",
      title:"Recibo", owner:"Ricardo", ownerUid:"U1", ownerEmail:"r@x.mx",
      content:"RECIBO", fields:{ cantidad:"35000.00" }, origenCampos:{},
      imagenes: original ? [ORIGINAL] : [], chain:[], secciones:null };
    const ctx = {
      d, docs:[d], uid:"U1", user:"Ricardo", acctEmail:"r@x.mx",
      fields:d.fields, title:d.title, content:d.content, editMode:edit,
      corrigiendo, corregirOriginal:nada, puedo, puedoSubirA:()=>true,
      MAX_IMGS:12, bioCreds:[], vinculos:{}, accesos:[], anclajesPorHash:{},
      filesOpen:{}, showHashes:{}, histOpen:false, histTab:"linea",
      secciones:null, unlocked:true, cuerpoDelEditor:()=>d.content,
      puedeConvertir:()=>false, convOculto:[], notif:null, modal:null,
      bioOk:false, bioBusy:false, saving:false, ocupado:null,
      verifVin:false, verificandoFiscal:null, faseSel:null,
    };
    for (const k of [
      "setFields","setTitle","setContent","setDirty","setEdit","setModal","setPass",
      "setHistOpen","setHistTab","setSecciones","setShowHashes","setFilesOpen",
      "setFaseSel","setMIn","setMIn2","setEnlaceNuevo","addImage","removeImage",
      "adjuntarOriginal","openDoc","goHome","doVerify","abrirProtegido","getFile",
      "exportarPaquete","moveTo","revokeShare","save","renombrar","verificarFiscal",
      "notify","renderBarraEstilos",
    ]) ctx[k] = nada;
    return renderToStaticMarkup(renderDocumento(ctx));
  };

  it("sale en modo lectura, con su original puesto", () => {
    expect(pinta()).toContain("Corregir recibo");
  });

  it("NO sale mientras editas a mano", () => {
    // Ofrecer ahí «vuelve a leerlos del archivo» es ofrecer tirar lo
    // que la persona acaba de escribir.
    expect(pinta({ edit: true })).not.toContain("Corregir recibo");
  });

  it("NO sale si todavía no hay original: eso es adjuntar", () => {
    expect(pinta({ original: false })).not.toContain("Corregir recibo");
  });

  it("NO sale a quien no puede editar", () => {
    expect(pinta({ puedo: (a) => a !== "editar" })).not.toContain("Corregir recibo");
  });

  it("y mientras lee, lo dice en la pantalla", () => {
    const html = pinta({ corrigiendo: true });
    expect(html).toContain("Leyendo el archivo…");
    expect(html).not.toContain("Corregir recibo");
  });

  it("y el importe sale separado también aquí", () => {
    expect(pinta()).toContain("$35,000.00");
  });
});

// ══════════════════════════════════════════════════════════════
// 4. EL SERVIDOR: LA PUERTA Y EL RASTRO
// ══════════════════════════════════════════════════════════════
describe("corregirOriginal en el servidor", () => {
  it("pide permiso de editar, como todo lo que cambia el documento", () => {
    expect(callable("corregirOriginal")).toMatch(/exigir\(actual, uid, email, "editar"\)/);
  });

  it("y comprueba que la ruta sea de esta persona y este documento", () => {
    expect(callable("corregirOriginal")).toMatch(/rutaValida\(ruta, uid, opId\)/);
  });

  it("se niega si NO hay original: eso es adjuntar, no corregir", () => {
    const f = callable("corregirOriginal");
    expect(f).toMatch(/const viejo = \(actual\.imagenes \|\| \[\]\)\.find\(\(x\) => x\.esOriginal\)/);
    expect(f).toMatch(/if\(!viejo\)/);
    expect(f).toMatch(/todavía no tiene archivo original/);
  });

  it("y se niega si es el MISMO archivo", () => {
    // Un viaje de ida y vuelta ensuciaría la cadena con un cambio
    // que no cambia nada.
    const f = callable("corregirOriginal");
    expect(f).toMatch(/if\(hash === viejo\.hash\)/);
    // Y la subida que se acaba de hacer no se queda tirada.
    expect(f).toMatch(/bucket\(\)\.file\(ruta\)\.delete\(\)/);
  });

  it("sólo acepta el XML, un PDF o una foto, igual que al adjuntarlo", () => {
    expect(callable("corregirOriginal")).toMatch(/TIPOS_ORIGINAL\.some\(\(t\) => tipo\.startsWith\(t\)\)/);
  });

  // ── EL RASTRO, QUE ES TODO EL PERMISO QUE ESTO TIENE ──
  it("la huella del archivo viejo queda en la cadena", () => {
    const f = callable("corregirOriginal");
    expect(f).toMatch(/antes: \{ archivo: viejo\.nombre \|\| null, huella: viejo\.hash \|\| null \}/);
    expect(f).toMatch(/ahora: \{ archivo: imagen\.nombre, huella: hash/);
    expect(f).toMatch(/tipo: "original-corregido"/);
  });

  it("y la frase la escribe el servidor con las DOS huellas dentro", () => {
    // No la manda el navegador: el navegador no puede ser quien
    // cuente qué archivo había antes.
    const f = callable("corregirOriginal");
    expect(f).toMatch(/Archivo original corregido/);
    expect(f).toMatch(/viejo\.hash \|\| ""\)\.slice\(0, 16\)/);
    expect(f).toMatch(/hash\.slice\(0, 16\)/);
  });

  it("y QUÉ cambió lo compara el servidor, no se lo cree", () => {
    const f = callable("corregirOriginal");
    expect(f).toMatch(/const antes = actual\.fields \|\| \{\}/);
    expect(f).toMatch(/String\(antes\[k\] \?\? ""\) !== String\(ahora\[k\] \?\? ""\)/);
  });

  it("las etiquetas del navegador sólo tocan la frase, nunca los datos", () => {
    const f = callable("corregirOriginal");
    // `rotulo` se usa al redactar; `meta.campos` sale de `cambiados`,
    // que se calcula aquí.
    expect(f).toMatch(/campos: cambiados/);
    expect(f).toMatch(/rotulo\(c\.k\)/);
    // Y una etiqueta venida de fuera no entra sin mirarla.
    expect(f).toMatch(/typeof e === "string" && e\.length < 60/);
  });

  it("el comprobante NUNCA se queda sin original: entra el nuevo en el mismo cambio", () => {
    // Si esto se partiera en dos pasos, entre uno y otro existiría un
    // comprobante firmado sin nada que lo respalde.
    expect(callable("corregirOriginal"))
      .toMatch(/imagenes: \[\.\.\.\(actual\.imagenes \|\| \[\]\)\.filter\(\(x\) => !x\.esOriginal\), imagen\]/);
  });

  it("y el archivo viejo se borra DESPUÉS de asentar, no antes", () => {
    // Si se borrara antes y fallara la escritura, el comprobante se
    // quedaría sin original y sin constancia de por qué.
    const f = callable("corregirOriginal");
    const iAsentar = f.indexOf("await asentar(");
    const iBorrar = f.indexOf("rutaVieja");
    expect(iAsentar).toBeGreaterThan(-1);
    expect(iBorrar).toBeGreaterThan(iAsentar);
  });

  it("gana el archivo nuevo en todos los campos", () => {
    // Decisión de Ricardo: si el documento estaba equivocado, las
    // correcciones a mano que le hicieron encima también.
    const f = callable("corregirOriginal");
    expect(f).toMatch(/fields: ahora/);
    expect(f).toMatch(/origenCampos: origen/);
  });
});

// ══════════════════════════════════════════════════════════════
// 5. LA REGLA DE AL LADO SIGUE EN PIE
// ══════════════════════════════════════════════════════════════
describe("quitar el original sigue prohibido", () => {
  it("quitarImagen se sigue negando", () => {
    const f = callable("quitarImagen");
    expect(f).toMatch(/if\(img\.esOriginal\)/);
    expect(f).toMatch(/El archivo original no se puede quitar/);
  });

  it("y sin servidor, la misma puerta", () => {
    expect(codigo("src/App.jsx")).toMatch(/El archivo original no se puede quitar/);
  });

  it("corregir no es una forma de quedarse sin original", () => {
    // La diferencia entera entre lo uno y lo otro: aquí siempre entra
    // uno nuevo. Si este `filter` quedara solo, «corregir» sería
    // «quitar» con otro nombre.
    const f = callable("corregirOriginal");
    expect(f).not.toMatch(/imagenes: \(actual\.imagenes \|\| \[\]\)\.filter\(\(x\) => !x\.esOriginal\)\s*,/);
  });
});

// ══════════════════════════════════════════════════════════════
// 6. EL NAVEGADOR HACE EL MISMO RECORRIDO QUE AL CREARLO
// ══════════════════════════════════════════════════════════════
describe("el lado del navegador", () => {
  // SÓLO el cuerpo de esta función, no el archivo entero.
  //
  // Esta prueba ya falló una vez por no hacerlo: buscaba
  // «descartarSubida» en todo App.jsx y lo encontraba en
  // `adjuntarOriginal`, que hace lo mismo tres funciones más arriba.
  // El mutante que quitaba esa línea de AQUÍ pasaba en verde.
  const fn = (nombre) => {
    const t = codigo("src/App.jsx");
    const i = t.indexOf(`const ${nombre} = async(`);
    expect(i, nombre).toBeGreaterThan(-1);
    const j = t.indexOf("\n  const ", i + 10);
    return t.slice(i, j === -1 ? undefined : j);
  };
  const app = () => codigo("src/App.jsx");

  it("lee el archivo y saca los datos de él, no a mano", () => {
    const f = fn("corregirOriginal");
    expect(f).toMatch(/const res = await \(esImagen \? ocrImage : extractFromFile\)\(file/);
    expect(f).toMatch(/extraerCampos\(\{ tplId:d\.tplId, texto:res\.text \}\)/);
  });

  it("y si no sacó NI UN dato, no cambia nada", () => {
    // Cambiar el original por algo ilegible deja el comprobante peor
    // que antes.
    const f = fn("corregirOriginal");
    expect(f).toMatch(/if\(!Object\.keys\(campos\)\.length\)/);
    expect(f).toMatch(/No se pudo leer ningún dato de ese archivo/);
  });

  it("si algo falla, la subida no se queda tirada en el almacén", () => {
    expect(fn("corregirOriginal")).toMatch(/if\(ruta\) await descartarSubida\(ruta\)/);
  });

  it("y el modo sin servidor repite las dos negativas", () => {
    const a = app();
    expect(a).toMatch(/corregirOriginalLocal/);
    expect(a).toMatch(/if\(!viejo\) throw new Error\("Este comprobante todavía no tiene archivo original/);
    expect(a).toMatch(/if\(hash === viejo\.hash\) throw new Error\("Ese es el mismo archivo/);
  });
});

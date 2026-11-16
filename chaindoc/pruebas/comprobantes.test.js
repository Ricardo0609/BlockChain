// Las reglas de un recibo o una factura.
//
// El orden es llenar -> firmar -> compartir, y cada paso cierra el
// anterior. Si alguno se puede saltar, lo que acaba en el expediente
// de alguien es un papel en blanco con la autoridad de una prueba.
import { describe, it, expect } from "vitest";
import {
  esComprobante, faltanDatos, estaFirmado, sePuedeFirmar, puedeSalir,
  soloSuDueno, porQueNoSale, faltaRespaldo, REQUERIDOS,
  originalDe, sinOriginalViejo, soloConCuenta,
} from "../src/nucleo/comprobantes";

// ← ACTUALIZADO (10 nov): todos los comprobantes de estas pruebas
// nacen CON respaldo. No es decoracion: desde hoy un comprobante sin
// el documento original detras no se firma, asi que uno sin respaldo
// no serviria para probar ninguna de las otras reglas —fallaria
// siempre, y por el motivo equivocado—. Lo que vigila esa regla tiene
// su propio bloque mas abajo.
// ← CAMBIADO (16 nov): el respaldo lleva `esOriginal`.
//
// Antes bastaba con que la lista de imagenes no estuviera vacia. Pero
// una foto cualquiera no es el documento del que salieron los datos:
// es una foto mas. Ahora UNO de los adjuntos es el original -el que
// se subio al crearlo, el que no se puede quitar- y es ese el que
// cuenta como respaldo.
const RESPALDO = [{ path: "u/U1/r1/foto.jpg", nombre: "foto.jpg", esOriginal: true }];
/** Una foto cualquiera, de las que se añaden despues. */
const SOLO_FOTOS = [{ path: "u/U1/r1/extra.jpg", nombre: "extra.jpg" }];

const recibo = (fields = {}, extra = {}) => ({
  id: "r1", tplId: "recibo", ownerUid: "U1", chain: [], fields,
  imagenes: RESPALDO, ...extra,
});
const LLENO = {
  fecha: "2026-11-03", recibiDe: "Constructora Solis", cantidad: "5000",
  concepto: "Compra de cemento", recibidoPor: "Pedro Ramirez",
};
const factura = (fields = {}, extra = {}) => ({
  id: "f1", tplId: "factura", ownerUid: "U1", chain: [], fields,
  imagenes: RESPALDO, ...extra,
});
const FACTURA_LLENA = {
  fecha: "2026-11-03", emisor: "Materiales del Bajio SA de CV",
  rfcEmisor: "MBA010101AA0", receptor: "Constructora Solis",
  rfcReceptor: "SOL960214GT0", concepto: "Cemento gris", total: "5800",
};
const firma = { action: "FIRMA", index: 1 };

describe("que es un comprobante", () => {
  it("recibos y facturas si; lo demas no", () => {
    expect(esComprobante(recibo())).toBe(true);
    expect(esComprobante(factura())).toBe(true);
    expect(esComprobante({ kind: "expediente" })).toBe(false);
    expect(esComprobante({ tplId: null })).toBe(false);
    expect(esComprobante(null)).toBe(false);
  });
});

describe("que le falta para poder firmarse", () => {
  it("vacio: falta todo lo obligatorio", () => {
    const f = faltanDatos(recibo());
    expect(f).toHaveLength(REQUERIDOS.recibo.length);
    expect(f.every((x) => x.motivo === "falta")).toBe(true);
  });

  it("lleno: no falta nada", () => {
    expect(faltanDatos(recibo(LLENO))).toEqual([]);
    expect(sePuedeFirmar(recibo(LLENO))).toBe(true);
  });

  it("a medias NO se puede firmar", () => {
    // La otra mitad de la regla: que diga «si» cuando esta lleno no
    // sirve de nada si tambien dice «si» cuando esta vacio.
    expect(sePuedeFirmar(recibo())).toBe(false);
    expect(sePuedeFirmar(recibo({ ...LLENO, cantidad: "" }))).toBe(false);
    expect(sePuedeFirmar(factura({ ...FACTURA_LLENA, rfcEmisor: "NO-ES-RFC" }))).toBe(false);
  });

  it("un campo en blancos no cuenta como lleno", () => {
    expect(faltanDatos(recibo({ ...LLENO, concepto: "   " }))
      .map((x) => x.k)).toEqual(["concepto"]);
  });

  it("devuelve la etiqueta que se ve en pantalla, no la clave", () => {
    // Quien lee esto tiene que poder ir y llenarlo.
    const f = faltanDatos(recibo({ ...LLENO, recibiDe: "" }));
    expect(f[0].etiqueta).toBe("Recibí de");
  });

  it("lo que NO es obligatorio no estorba", () => {
    // Un recibo sin folio, sin cantidad con letra y sin forma de pago
    // sigue siendo un recibo.
    expect(faltanDatos(recibo(LLENO))).toEqual([]);
    expect(REQUERIDOS.recibo).not.toContain("folio");
    expect(REQUERIDOS.recibo).not.toContain("cantidadTxt");
  });

  it("lo que no es comprobante no exige nada", () => {
    expect(faltanDatos({ kind: "documento" })).toEqual([]);
    expect(sePuedeFirmar({ kind: "documento" })).toBe(true);
  });
});

describe("los RFC de una factura", () => {
  it("llena y con RFC validos: lista", () => {
    expect(faltanDatos(factura(FACTURA_LLENA))).toEqual([]);
  });

  it("un RFC mal escrito es peor que uno vacio: parece que esta", () => {
    const f = faltanDatos(factura({ ...FACTURA_LLENA, rfcEmisor: "ESTO-NO-ES" }));
    expect(f).toHaveLength(1);
    expect(f[0].k).toBe("rfcEmisor");
    expect(f[0].motivo).toBe("invalido");
  });

  it("y uno vacio se distingue de uno invalido", () => {
    const f = faltanDatos(factura({ ...FACTURA_LLENA, rfcReceptor: "" }));
    expect(f[0].motivo).toBe("falta");
  });
});

describe("firmar y salir", () => {
  it("sin firma no sale: ni a un contrato ni compartido", () => {
    expect(puedeSalir(recibo(LLENO))).toBe(false);
  });

  it("firmado si sale", () => {
    expect(estaFirmado(recibo(LLENO, { chain: [firma] }))).toBe(true);
    expect(puedeSalir(recibo(LLENO, { chain: [firma] }))).toBe(true);
  });

  it("lo que no es comprobante sale siempre", () => {
    // Un documento de texto se comparte sin firmar; esta regla es de
    // los papeles que se usan como prueba.
    expect(puedeSalir({ kind: "documento", chain: [] })).toBe(true);
  });

  it("otros bloques no cuentan como firma", () => {
    const c = recibo(LLENO, { chain: [{ action: "EDICIÓN" }, { action: "EVIDENCIA" }] });
    expect(estaFirmado(c)).toBe(false);
    expect(puedeSalir(c)).toBe(false);
  });
});

describe("quien puede editarlo", () => {
  it("su dueno si", () => {
    expect(soloSuDueno(recibo(LLENO), "U1")).toBe(true);
  });

  it("nadie mas, por mucho acceso que tenga", () => {
    // Este es el caso real: alguien entra al contrato, abre el recibo
    // que le adjuntaron y puede cambiarle el monto. La firma de abajo
    // ampararia algo que su firmante no escribio.
    expect(soloSuDueno(recibo(LLENO), "U2")).toBe(false);
    expect(soloSuDueno(recibo(LLENO), null)).toBe(false);
  });

  it("un documento de texto se sigue editando entre varios", () => {
    expect(soloSuDueno({ kind: "documento", ownerUid: "U1" }, "U2")).toBe(true);
  });

  it("sin ownerUid vale el correo: los primeros recibos no lo traen", () => {
    // Si no, su propio dueño se quedaria sin poder editarlos.
    const viejo = { tplId: "recibo", ownerEmail: "Rg@X.mx", chain: [], fields: LLENO };
    expect(soloSuDueno(viejo, null, "rg@x.mx")).toBe(true);
    expect(soloSuDueno(viejo, "U9", "otro@x.mx")).toBe(false);
  });

  it("dos huecos no son la misma persona", () => {
    // undefined === undefined seria «si» y abriria el documento a
    // cualquiera que todavia no haya terminado de identificarse.
    expect(soloSuDueno({ tplId: "recibo", chain: [], fields: LLENO }, undefined)).toBe(false);
    expect(soloSuDueno({ tplId: "recibo", chain: [], fields: LLENO }, null, null)).toBe(false);
    expect(soloSuDueno({ tplId: "recibo", ownerUid: "", chain: [] }, "")).toBe(false);
  });
});

describe("lo que se le dice al usuario", () => {
  it("si falta llenarlo, dice QUE falta", () => {
    const m = porQueNoSale(recibo({ ...LLENO, cantidad: "", recibidoPor: "" }));
    expect(m).toMatch(/no está firmado/);
    expect(m).toMatch(/cantidad/);
    expect(m).toMatch(/recibido por/);
  });

  it("si solo falta firmar, lo dice y ya", () => {
    const m = porQueNoSale(recibo(LLENO));
    expect(m).toMatch(/Fírmalo/);
    expect(m).not.toMatch(/llenar/);
  });

  it("una factura se llama factura", () => {
    expect(porQueNoSale(factura(FACTURA_LLENA))).toMatch(/^La factura/);
    expect(porQueNoSale(recibo(LLENO))).toMatch(/^El recibo/);
  });

  it("si ya se puede, no hay nada que explicar", () => {
    expect(porQueNoSale(recibo(LLENO, { chain: [firma] }))).toBe(null);
    expect(porQueNoSale({ kind: "documento" })).toBe(null);
  });
});

// ── EL RESPALDO (10 nov) ────────────────────────────────────────
//
// El agujero que tapa esto, dicho por Ricardo: «es muy facil crear un
// recibo, llenarlo y adjuntarlo, pero realmente como se comprueba que
// ese recibo es real».
//
// Tenia razon. Un recibo hecho aqui lo escribe quien lo firma, sobre
// si mismo. La cadena prueba CUANDO se escribio y que nadie lo toco
// despues; no prueba que el pago ocurriera. El respaldo es lo que ata
// el papel al mundo.
describe("el documento original que respalda el papel", () => {
  it("sin respaldo NO se firma, aunque este todo lleno", () => {
    // La prueba que importa. Si esta pasa en falso, el producto vuelve
    // a aceptar recibos que no prueban nada.
    const sinNada = recibo(LLENO, { imagenes: [] });
    expect(faltanDatos(sinNada)).toEqual([]);   // el papel esta completo
    expect(faltaRespaldo(sinNada)).toBe(true);  // y aun asi
    expect(sePuedeFirmar(sinNada)).toBe(false);
  });

  it("el archivo original basta", () => {
    expect(faltaRespaldo(recibo(LLENO))).toBe(false);
    expect(sePuedeFirmar(recibo(LLENO))).toBe(true);
  });

  it("`originalDe` devuelve EL original, no el primero de la lista", () => {
    // El original no tiene por que haberse subido primero: a un
    // comprobante de los de antes se le adjunta despues de las fotos
    // que ya tuviera. Si esto devolviera `imagenes[0]`, en ese caso
    // señalaria a una foto cualquiera como el documento de origen.
    const doc = { tplId: "recibo", imagenes: [
      { path: "a", nombre: "extra.jpg" },
      { path: "b", nombre: "ticket.jpg", esOriginal: true },
    ] };
    expect(originalDe(doc).path).toBe("b");
    expect(originalDe({ tplId: "recibo", imagenes: [] })).toBe(null);
    expect(originalDe({ tplId: "recibo" })).toBe(null);
  });

  it("pero una foto cualquiera NO: tiene que ser EL original", () => {
    // ← NUEVO (16 nov). Antes valia cualquier adjunto, asi que subir
    // una foto del perro despues de firmar daba por respaldado el
    // recibo. El respaldo no es «hay algo adjunto»: es «esta el
    // documento del que salieron estos datos».
    const conFotos = recibo(LLENO, { imagenes: SOLO_FOTOS });
    expect(faltaRespaldo(conFotos)).toBe(true);
    expect(sePuedeFirmar(conFotos)).toBe(false);
  });

  it("y `sourceFile` NO vale: nunca fue un archivo", () => {
    // ← CORREGIDO (16 nov), y esta prueba es la leccion.
    //
    // La version del 10 de noviembre aceptaba `sourceFile` como
    // respaldo, y esta prueba lo confirmaba con una ruta de pinta
    // creible -«u/U1/f1/cfdi.xml»- y un comentario que decia «el
    // original ya esta guardado».
    //
    // No lo estaba. `sourceFile` se escribe como `impMeta?.name`: el
    // NOMBRE del archivo que subiste, una cadena de texto, y el
    // archivo se tiraba. La prueba no comprobaba la regla, repetia lo
    // que yo creia de ella, y el dato inventado hizo verdadera esa
    // creencia durante seis dias.
    const soloElNombre = factura(FACTURA_LLENA, { imagenes: [], sourceFile: "cfdi.xml" });
    expect(faltaRespaldo(soloElNombre)).toBe(true);
    expect(sePuedeFirmar(soloElNombre)).toBe(false);
    // Y se reconoce como uno de los de antes, para poder decirselo.
    expect(sinOriginalViejo(soloElNombre)).toBe(true);
    // Uno nuevo sin nada no es «de los de antes»: es uno a medio hacer.
    expect(sinOriginalViejo(factura(FACTURA_LLENA, { imagenes: [] }))).toBe(false);
  });

  it("un comprobante viejo ya firmado tampoco sale de aqui", () => {
    // El caso que decidio Ricardo: «marcarlos sin original y pedirlo
    // para volver a usarlos». Parece terminado -datos y firma- y es
    // justo el que mas falta hace frenar, porque es el que se iria a
    // un expediente sin que nadie mirara.
    const viejo = factura(FACTURA_LLENA, {
      imagenes: [], sourceFile: "factura.pdf", chain: [firma],
    });
    expect(estaFirmado(viejo)).toBe(true);
    expect(puedeSalir(viejo)).toBe(false);
    expect(porQueNoSale(viejo)).toMatch(/sólo quedó el nombre/);
    // Y en cuanto trae el archivo, sale.
    const arreglado = { ...viejo, imagenes: RESPALDO };
    expect(puedeSalir(arreglado)).toBe(true);
    expect(porQueNoSale(arreglado)).toBe(null);
  });

  it("un comprobante nunca se reparte por enlace", () => {
    // «No tiene sentido compartirselo a alguien que no tiene cuenta
    // porque no estas emitiendo una factura o recibo que quieras
    // mandar, solamente estas respaldando la informacion».
    expect(soloConCuenta(recibo(LLENO))).toBe(true);
    expect(soloConCuenta(factura(FACTURA_LLENA))).toBe(true);
    expect(soloConCuenta({ kind: "documento" })).toBe(false);
    expect(soloConCuenta({ kind: "expediente" })).toBe(false);
  });

  it("vale para los dos: recibo y factura", () => {
    expect(faltaRespaldo(recibo(LLENO, { imagenes: [] }))).toBe(true);
    expect(faltaRespaldo(factura(FACTURA_LLENA, { imagenes: [] }))).toBe(true);
  });

  it("y no le pide respaldo a lo que no es un comprobante", () => {
    // Un contrato o un documento de texto no se respaldan con una
    // foto. Sin este corte, firmar cualquier cosa dejaria de funcionar.
    expect(faltaRespaldo({ kind: "documento" })).toBe(false);
    expect(faltaRespaldo({ kind: "expediente", imagenes: [] })).toBe(false);
    expect(faltaRespaldo(null)).toBe(false);
  });

  it("un `imagenes` que no es una lista no cuela", () => {
    // Si llegara cualquier otra cosa, `.length` podria dar un numero
    // —una cadena de texto lo da— y colarse como respaldo.
    expect(faltaRespaldo(recibo(LLENO, { imagenes: "foto.jpg" }))).toBe(true);
    expect(faltaRespaldo(recibo(LLENO, { imagenes: null }))).toBe(true);
    expect(faltaRespaldo(recibo(LLENO, { imagenes: undefined }))).toBe(true);
  });

  it("lo dice en voz alta y manda a buscar lo correcto", () => {
    const r = porQueNoSale(recibo(LLENO, { imagenes: [] }));
    expect(r).toMatch(/original/i);
    expect(r).toMatch(/transferencia|recibo/i);

    const f = porQueNoSale(factura(FACTURA_LLENA, { imagenes: [] }));
    expect(f).toMatch(/XML|CFDI/);

    // Con el papel a medias, el mensaje sigue siendo el de los datos:
    // mandar a alguien a por una foto cuando aun no puede usarla es
    // mandarlo a dar una vuelta en balde.
    const medias = porQueNoSale(recibo({ ...LLENO, concepto: "" }, { imagenes: [] }));
    expect(medias).toMatch(/llenar/);
    expect(medias).not.toMatch(/original/i);
  });
});

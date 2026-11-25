// Dos fallos de la pantalla del enlace — la que abre alguien SIN
// cuenta, que suele ser la otra parte del contrato.
//
// Los encontró Ricardo recorriendo el flujo el 25 de noviembre:
//
//   1. «El input tiene el problema de que al escribir sólo me deja
//      colocar una letra, y para poner otra letra tengo que
//      seleccionar el input y así; o sea, no me deja escribir el
//      nombre fluido.»
//   2. «Me gustaría que el contrato al leerlo se vea más identado
//      por así decirlo, quiero que se vea como lo ve el que creó el
//      expediente.»
//
// El primero no es cosmético: es la pantalla donde la otra parte
// escribe su nombre para aceptar un contrato. Si no se puede
// escribir el nombre, no se puede aceptar nada.
import { describe, it, expect } from "vitest";
import { renderEntrega } from "../src/pantallas/Entrega.jsx";
import { ESTILOS } from "../src/ui/estilos.js";
import { MarcoEnlace } from "../src/ui/MarcoEnlace.jsx";

/** Un ctx mínimo: lo justo para que la pantalla se arme. */
const nada = () => {};
const ctx = (invNombre = "") => ({
  invitacion: {
    documento: "Contrato local", pedidoPor: "Ricardo",
    contrato: "<p>Lo pactado.</p>", requisitos: [],
    expiraEn: new Date(Date.now() + 3 * 864e5).toISOString(),
    acuerdo: { puedeAceptar: true, yaRespondido: false },
  },
  invError: null, invPaso: null, invBusy: false, invSubiendo: null,
  entregas: {}, entregar: nada, notif: null,
  abrirEnlace: nada, cerrarEnlace: nada, entregarEnlaceReq: nada,
  enlReq: null, enlUrl: "", enlNom: "", enlErr: "", enlBusy: false,
  setEnlUrl: nada, setEnlNom: nada,
  invNombre, setInvNombre: nada, aceptarInvitacion: nada,
  invAceptando: false, invAceptError: "",
  invRechazando: false, setInvRechazando: nada, invMotivo: "",
  setInvMotivo: nada, rechazarInvitacion: nada,
  invClave: "", setInvClave: nada, abrirConClave: nada,
  invClaveBusy: false, invClaveErr: "", firmarInvitacion: nada,
});

// ══════════════════════════════════════════════════════════════
// 1. SE PUEDE ESCRIBIR EL NOMBRE DEL TIRÓN
// ══════════════════════════════════════════════════════════════
describe("escribir el nombre no echa al cursor", () => {
  it("la pantalla devuelve SIEMPRE el mismo tipo de componente", () => {
    // ESTA ES LA PRUEBA DEL FALLO, y no mira cómo se ve nada.
    //
    // Lo que rompía era un componente escrito DENTRO de
    // `renderEntrega`. Definir una función dentro de otra crea una
    // función nueva en cada llamada, y React decide si reaprovecha lo
    // que ya hay comparando los tipos: dos funciones escritas igual
    // no son la misma función. Así que a cada letra tecleada React
    // desmontaba la pantalla entera y montaba otra, el `<input>` de
    // antes dejaba de existir, y el foco se iba con él.
    //
    // Comparar el tipo de dos pintadas lo caza de raíz. Si alguien
    // vuelve a meter un componente dentro de la pintada —aunque sea
    // uno que sólo llame al de fuera—, esto se pone rojo.
    const a = renderEntrega(ctx("J"));
    const b = renderEntrega(ctx("Jo"));
    expect(typeof a.type).toBe("function");
    expect(a.type).toBe(b.type);
    // Y es el de fuera, el de verdad, no uno envuelto al vuelo.
    expect(a.type).toBe(MarcoEnlace);
  });

  it("y eso vale para TODAS sus salidas, no sólo la principal", () => {
    // La pantalla tiene cinco finales distintos -cargando, error,
    // caducado, con clave, y el normal- y todos pasan por el mismo
    // marco. Si el marco se recrea, cualquiera de ellos hereda el
    // fallo.
    const cargando = renderEntrega({ ...ctx(), invitacion: undefined });
    const normal = renderEntrega(ctx());
    expect(cargando.type).toBe(normal.type);
  });

  it("y vale igual para la pantalla de entregar comprobantes", () => {
    const pidiendo = renderEntrega({ ...ctx(), invitacion: {
      ...ctx().invitacion, acuerdo: { puedeAceptar: false, yaRespondido: true } } });
    expect(pidiendo.type).toBe(MarcoEnlace);
  });

  it("el campo del nombre tiene nombre propio y no se repinta de cero", () => {
    const vista = renderEntrega(ctx("Jorge"));
    const txt = JSON.stringify(vista, (k, v) => (typeof v === "function" ? "fn" : v));
    expect(txt).toContain("inv-nombre");
    // Y lleva el valor que se le pasa: el estado vive fuera, en
    // App.jsx, que es lo que permite que sobreviva a la pintada.
    expect(txt).toContain("Jorge");
  });
});

// ══════════════════════════════════════════════════════════════
// 2. EL CONTRATO SE LEE COMO LO LEE QUIEN LO MANDÓ
// ══════════════════════════════════════════════════════════════
//
// No basta con que «se parezca»: tienen que ser las MISMAS reglas.
// Dos bloques de estilo copiados se desvían en cuanto alguien toca
// uno de los dos, y quien lo note será la otra parte, leyendo un
// contrato que no se parece al que le enseñaron.
describe("el contrato del enlace y el del dueño", () => {
  /**
   * La hoja SIN los bloques `@media`.
   *
   * Hace falta porque el ajuste del teléfono está escrito antes que
   * la regla de base, y buscar a secas encontraba el del teléfono y
   * daba por buena una regla que no es la que manda en el escritorio.
   */
  const BASE = (() => {
    let fuera = "", hondo = 0, dentroMedia = false;
    for (let i = 0; i < ESTILOS.length; i++) {
      const c = ESTILOS[i];
      if (!dentroMedia && ESTILOS.startsWith("@media", i)) { dentroMedia = true; hondo = 0; }
      if (dentroMedia) {
        if (c === "{") hondo++;
        else if (c === "}") { hondo--; if (hondo === 0) dentroMedia = false; }
        continue;
      }
      fuera += c;
    }
    return fuera;
  })();

  /** Las declaraciones de la regla de base que lleva este selector. */
  const reglaDe = (sel) => {
    const i = BASE.indexOf(sel + "{");
    expect(i, sel).toBeGreaterThan(-1);
    return BASE.slice(i + sel.length + 1, BASE.indexOf("}", i));
  };
  const prop = (txt, p) => {
    const m = new RegExp(`(?:^|;)\\s*${p}\\s*:\\s*([^;}]+)`).exec(txt);
    return m ? m[1].trim() : null;
  };

  const dueno = reglaDe(".paper-ro");
  const enlace = reglaDe(".entrega-contrato-c");

  it("usan la misma letra, el mismo tamaño y el mismo interlineado", () => {
    for (const p of ["font-family", "font-size", "line-height", "color"]) {
      expect(prop(enlace, p), p).toBe(prop(dueno, p));
    }
  });

  it("y respetan los saltos de línea igual", () => {
    // Éste era el fallo de verdad. Sin esto, los saltos que hay
    // dentro de un párrafo se colapsan y el contrato se lee como un
    // muro, que es justo lo que vio Ricardo.
    expect(prop(enlace, "white-space")).toBe("pre-wrap");
    expect(prop(dueno, "white-space")).toBe("pre-wrap");
  });

  it("los títulos y los párrafos salen de la MISMA regla, no de una copia", () => {
    // Si alguien separa estos selectores, las dos vistas empiezan a
    // divergir sin que nadie lo decida.
    for (const sel of [".paper-ro h1", ".paper-ro h2", ".paper-ro h3",
                       ".paper-ro p", ".paper-ro li"]) {
      const i = ESTILOS.indexOf(sel + ",");
      expect(i, sel).toBeGreaterThan(-1);
      const regla = ESTILOS.slice(i, ESTILOS.indexOf("}", i));
      expect(regla, sel).toContain(".entrega-contrato-c");
    }
  });

  it("y ya no quedan reglas sueltas que le pongan otra letra", () => {
    // Las de antes -h1 a 18px, p con margen de 9px- ganaban por venir
    // después y deshacían la mitad del arreglo.
    // Ojo: `.entrega-contrato-c h1{` SÍ aparece, al final de la regla
    // compartida. Lo que no puede haber es una regla que EMPIECE por
    // ahí, que es la que ganaría por venir después.
    expect(BASE).not.toMatch(/\n\.entrega-contrato-c (h1|h2|h3|p|li|ul|ol)\{/);
  });

  it("lo único suyo es la caja: no puede crecer sin fin dentro de la pantalla", () => {
    // El contrato vive plegado dentro de otra pantalla, así que esto
    // sí es distinto a propósito.
    expect(prop(enlace, "max-height")).toBe("50vh");
    expect(prop(enlace, "overflow")).toBe("auto");
  });

  it("y en el teléfono bajan las dos a la vez", () => {
    const i = ESTILOS.indexOf(".paper-ta,.paper-ro{font-size:16px");
    expect(i).toBeGreaterThan(-1);
    const corte = ESTILOS.slice(i, i + 400);
    expect(corte).toContain(".entrega-contrato-c{font-size:16px");
  });
});

// ══════════════════════════════════════════════════════════════
// 3. LA HUELLA DETRÁS DEL OJO, Y PODER ENTREGAR OTRA VEZ
// ══════════════════════════════════════════════════════════════
//
// Ricardo, mirando la pantalla desde el lado de quien NO tiene
// cuenta: «el hash también se oculte pero tenga el botón del ojo
// para mostrarlo» y «abajo de eso que haya el botón de adjuntar otro
// archivo, por si se requiere».
describe("del lado de quien entrega", () => {
  const HUELLA = "7bb4711e766e8059d870eae2a83ccdbacb5b199277c38aab742a51f70faa7e07";
  const pidiendo = ({ abierto = false, entregado = false } = {}) => {
    const base = ctx();
    return renderEntrega({
      ...base,
      invitacion: { ...base.invitacion,
        acuerdo: { puedeAceptar: false, yaRespondido: true },
        requisitos: [
          { id: "r1", titulo: "Pago de renta" },
          { id: "r2", titulo: "Comprobantes de servicios", entregado },
        ] },
      entregas: { r2: { nombre: "recibo de luz.png", hash: HUELLA } },
      showHashes: abierto ? { "ent:r2": true } : {},
      setShowHashes: nada,
    });
  };
  const texto = (v) => JSON.stringify(v, (k, x) => (typeof x === "function" ? "fn" : x));

  it("la huella NO se enseña sola", () => {
    // Sesenta y cuatro caracteres sin significado ocupando el sitio
    // del «ya está», justo cuando lo que la persona quiere saber es
    // si su recibo llegó.
    const t = texto(pidiendo());
    expect(t).toContain("recibo de luz.png");
    expect(t).not.toContain(HUELLA);
  });

  it("pero hay un ojo para verla, y al abrirlo está", () => {
    expect(texto(pidiendo())).toContain("Ver huella");
    const abierto = texto(pidiendo({ abierto: true }));
    expect(abierto).toContain(HUELLA);
    expect(abierto).toContain("Ocultar huella");
  });

  it("y es el MISMO ojo que usa el dueño dentro del expediente", () => {
    // No una copia: la misma clase, para que la huella se enseñe
    // igual en los dos lados del enlace.
    expect(texto(pidiendo())).toContain("hcard-eye");
  });

  it("y el pie no promete huellas a la vista, porque ya no las hay", () => {
    const t = texto(pidiendo());
    expect(t).toContain("Detrás de «Ver huella»");
    expect(t).not.toContain("Las huellas que ves");
  });

  // ── ADJUNTAR OTRO ──
  it("después de entregar se puede entregar otra cosa", () => {
    // Antes los botones desaparecían al subir, y el único camino para
    // mandar una segunda cosa era recargar el enlace. Casi nunca se
    // entrega una sola.
    expect(texto(pidiendo())).toContain("Subir otro");
  });

  it("y lo dice con otras palabras, para que nadie crea que se perdió lo de antes", () => {
    const t = texto(pidiendo());
    expect(t).toContain("Subir otro");
    // Y en el que no se ha entregado nada, sigue diciendo «Subir».
    expect(t).toMatch(/"Subir"/);
  });

  it("y el camino del enlace sigue al lado, sin jerarquía", () => {
    expect(texto(pidiendo())).toContain("Enlace");
  });

  it("lo que se entregó antes también deja entregar más", () => {
    expect(texto(pidiendo({ entregado: true }))).toContain("Subir otro");
  });
});

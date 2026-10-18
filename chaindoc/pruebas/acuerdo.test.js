// Los estados de un contrato con doble firma.
//
// Esto es la pieza que decide si alguien puede editar un contrato que
// la otra parte ya aceptó. Si se equivoca, la firma deja de significar
// nada — que es exactamente lo que esta funcion viene a arreglar — y
// nadie se entera hasta que hay un pleito. Por eso la tabla entera
// esta cubierta, estado por estado.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  ACCIONES_POR_ESTADO, ESTADOS, ETIQUETA, FUERZAS, GOBERNADAS, PLAZOS, TONO,
  TRANSICIONES, diasEntre, esperaRespuesta, estadoAcuerdo, firmaDe,
  bloquea, esDestinatario, esperaFirmaDe, estadoBloquea, firmaronLasDos, firmasDe, motivoBloqueo, permiteEstado, plazosDe,
  puedeAhora, tieneAcuerdo, transicionValida,
} from "../src/nucleo/acuerdo";

const HOY = new Date("2026-10-18T12:00:00Z");
const dias = (n) => new Date(HOY.getTime() - n * 86400000).toISOString();

const firma = (parte, momento, extra = {}) => ({
  parte, momento, nombre: "Quien sea", fuerza: "enlace",
  fecha: dias(1), ...extra,
});

/** Un contrato puesto en firme: lo firmo el emisor y se mando. */
function enFirma(extra = {}) {
  return {
    id: "c1", kind: "expediente", title: "Barda",
    acuerdo: {
      pedidoEn: dias(2),
      paraEmail: "ana@correo.com",
      paraNombre: "Ana Solis",
      requiereConformidad: false,
      firmas: [firma("emisor", "aceptacion", { fecha: dias(2) })],
      ...extra,
    },
  };
}

const aceptado = (extra = {}) => {
  const c = enFirma(extra);
  c.acuerdo.firmas = [...c.acuerdo.firmas, firma("receptor", "aceptacion")];
  return c;
};

describe("un expediente de los de antes", () => {
  it("sin acuerdo, es borrador y se sabe por que", () => {
    const e = estadoAcuerdo({ id: "viejo", requisitos: [] }, { hoy: HOY });
    expect(e.estado).toBe("borrador");
    expect(e.sinAcuerdo).toBe(true);
  });

  it("no se rompe con nada", () => {
    expect(estadoAcuerdo(null, { hoy: HOY }).estado).toBe("borrador");
    expect(estadoAcuerdo(undefined, { hoy: HOY }).estado).toBe("borrador");
    expect(estadoAcuerdo({}, { hoy: HOY }).estado).toBe("borrador");
  });
});

describe("el camino normal", () => {
  it("firmado por el emisor y mandado: espera firma", () => {
    const e = estadoAcuerdo(enFirma(), { hoy: HOY });
    expect(e.estado).toBe("en_firma");
    expect(e.aceptoEmisor).toBe(true);
    expect(e.aceptoReceptor).toBe(false);
    expect(e.paraEmail).toBe("ana@correo.com");
  });

  it("sin la firma del emisor sigue siendo borrador, aunque se haya mandado", () => {
    const c = enFirma();
    c.acuerdo.firmas = [];
    expect(estadoAcuerdo(c, { hoy: HOY }).estado).toBe("borrador");
  });

  it("aceptado por las dos partes: vigente", () => {
    expect(estadoAcuerdo(aceptado(), { hoy: HOY }).estado).toBe("vigente");
  });

  it("entregarlo todo no cierra nada por si solo", () => {
    // Lo intentamos al reves y cerraba la puerta por dentro: en cuanto
    // la lista de requisitos cuadraba ya no se podia adjuntar nada
    // mas, ni la segunda factura del mismo requisito ni la correccion
    // de la primera.
    expect(estadoAcuerdo(aceptado(), { hoy: HOY }).estado).toBe("vigente");
  });

  it("cierra quien lo mando, cuando lo da por terminado", () => {
    const c = aceptado({ cerradoEn: dias(0) });
    expect(estadoAcuerdo(c, { hoy: HOY }).estado).toBe("cerrado");
  });

  it("pedida la conformidad, queda entregado", () => {
    const c = aceptado({ requiereConformidad: true, conformidadPedidaEn: dias(2) });
    const e = estadoAcuerdo(c, { hoy: HOY });
    expect(e.estado).toBe("entregado");
    expect(e.diasEsperando).toBe(2);
  });

  it("firmada por las dos: cerrado", () => {
    const c = aceptado({ requiereConformidad: true, conformidadPedidaEn: dias(3) });
    c.acuerdo.firmas = [...c.acuerdo.firmas,
      firma("emisor", "conformidad"), firma("receptor", "conformidad")];
    expect(estadoAcuerdo(c, { hoy: HOY }).estado).toBe("cerrado");
    expect(firmaronLasDos(c, "conformidad")).toBe(true);
  });

  it("una sola conformidad no cierra nada", () => {
    const c = aceptado({ requiereConformidad: true, conformidadPedidaEn: dias(3) });
    c.acuerdo.firmas = [...c.acuerdo.firmas, firma("receptor", "conformidad")];
    expect(estadoAcuerdo(c, { hoy: HOY }).estado).toBe("entregado");
  });
});

describe("cuando no sale bien", () => {
  it("rechazado manda sobre todo lo demas", () => {
    const c = enFirma({ rechazo: { motivo: "monto", fecha: dias(1) } });
    const e = estadoAcuerdo(c, { hoy: HOY });
    expect(e.estado).toBe("rechazado");
    expect(e.rechazo.motivo).toBe("monto");
  });

  it("volver a pedirlo despues del rechazo lo saca de ahi", () => {
    // el dueno corrigio y lo mando otra vez: el rechazo es de antes
    const c = enFirma({ rechazo: { motivo: "monto", fecha: dias(5) } });
    c.acuerdo.pedidoEn = dias(1);
    c.acuerdo.firmas = [firma("emisor", "aceptacion", { fecha: dias(1) })];
    expect(estadoAcuerdo(c, { hoy: HOY }).estado).toBe("en_firma");
  });

  it("paso la fecha limite sin firmar: nunca llego a existir", () => {
    const c = enFirma();
    c.fechaLimite = "2026-10-01";
    expect(estadoAcuerdo(c, { hoy: HOY }).estado).toBe("sin_firmar");
  });

  it("sin fecha limite, el silencio lo vence igual", () => {
    const c = enFirma();
    c.acuerdo.pedidoEn = dias(20);
    expect(estadoAcuerdo(c, { hoy: HOY }).estado).toBe("sin_firmar");
  });

  it("un dia antes del plazo todavia espera", () => {
    const c = enFirma();
    c.acuerdo.pedidoEn = dias(14);
    expect(estadoAcuerdo(c, { hoy: HOY }).estado).toBe("en_firma");
  });

  it("callado el plazo entero tras pedir la conformidad: sin respuesta", () => {
    const c = aceptado({ requiereConformidad: true, conformidadPedidaEn: dias(14) });
    const e = estadoAcuerdo(c, { hoy: HOY });
    expect(e.estado).toBe("sin_respuesta");
    expect(e.diasEsperando).toBe(14);
  });

  it("un dia antes, no", () => {
    const c = aceptado({ requiereConformidad: true, conformidadPedidaEn: dias(13) });
    expect(estadoAcuerdo(c, { hoy: HOY }).estado).toBe("entregado");
  });
});

describe("los plazos", () => {
  it("los de arranque cuando el contrato no trae los suyos", () => {
    expect(plazosDe({})).toEqual(PLAZOS);
  });

  it("un contrato puede traer los suyos", () => {
    const p = plazosDe({ acuerdo: { plazos: { recordatorios: [10, 30], silencio: 60 } } });
    expect(p).toEqual({ recordatorios: [10, 30], silencio: 60 });
  });

  it("los ordena, para que el proximo recordatorio sea el proximo", () => {
    expect(plazosDe({ acuerdo: { plazos: { recordatorios: [30, 10] } } }).recordatorios)
      .toEqual([10, 30]);
  });

  it("un plazo absurdo no se respeta", () => {
    // un recordatorio a los 0 dias se mandaria antes de pedir nada,
    // y un silencio de 0 venceria el mismo dia que se pide
    const p = plazosDe({ acuerdo: { plazos: { recordatorios: [0, -3, 5], silencio: 0 } } });
    expect(p.recordatorios).toEqual([5]);
    expect(p.silencio).toBe(PLAZOS.silencio);
  });

  it("dice cuando toca insistir", () => {
    const c = enFirma();
    c.acuerdo.pedidoEn = dias(1);
    expect(estadoAcuerdo(c, { hoy: HOY }).proximoRecordatorio).toBe(3);
    c.acuerdo.pedidoEn = dias(4);
    expect(estadoAcuerdo(c, { hoy: HOY }).proximoRecordatorio).toBe(7);
    c.acuerdo.pedidoEn = dias(9);
    expect(estadoAcuerdo(c, { hoy: HOY }).proximoRecordatorio).toBe(null);
  });

  it("no hay recordatorios donde no se espera a nadie", () => {
    expect(estadoAcuerdo(aceptado(), { hoy: HOY }).proximoRecordatorio).toBe(null);
    expect(esperaRespuesta("vigente")).toBe(false);
    expect(esperaRespuesta("en_firma")).toBe(true);
    expect(esperaRespuesta("entregado")).toBe(true);
  });
});

describe("lo que deja hacer cada estado", () => {
  it("un contrato en firma no lo edita nadie, ni el dueno", () => {
    // es el corazon del asunto: si el dueno pudiera cambiar lo que ya
    // mando a firmar, la firma no diria nada
    expect(permiteEstado("en_firma", "editar")).toBe(false);
    expect(puedeAhora("en_firma", "editar", () => true)).toBe(false);
  });

  it("un contrato vigente tampoco se edita", () => {
    expect(puedeAhora("vigente", "editar", () => true)).toBe(false);
    expect(motivoBloqueo("vigente", "editar")).toMatch(/version nueva|versión nueva/i);
  });

  it("en borrador se edita y no se suben comprobantes", () => {
    expect(permiteEstado("borrador", "editar")).toBe(true);
    expect(permiteEstado("borrador", "subir")).toBe(false);
    expect(motivoBloqueo("borrador", "subir")).toMatch(/todavia|todavía/i);
  });

  it("los comprobantes se suben cuando ya hay acuerdo", () => {
    expect(permiteEstado("vigente", "subir")).toBe(true);
    expect(permiteEstado("entregado", "subir")).toBe(true);
  });

  it("un contrato cerrado no se toca", () => {
    for (const a of ["editar", "subir", "retirar", "aceptar", "borrar"]) {
      expect(permiteEstado("cerrado", a)).toBe(false);
    }
  });

  it("ver y exportar, siempre", () => {
    for (const e of ESTADOS) {
      expect(permiteEstado(e, "ver")).toBe(true);
      expect(permiteEstado(e, "exportar")).toBe(true);
    }
  });

  it("el estado manda, pero el rol tambien", () => {
    // el estado lo permite y el rol no
    expect(puedeAhora("borrador", "editar", () => false)).toBe(false);
    // los dos
    expect(puedeAhora("borrador", "editar", () => true)).toBe(true);
  });

  it("una accion que no existe no se cuela", () => {
    expect(puedeAhora("borrador", "lo-que-sea", () => true)).toBe(false);
  });

  it("tras un rechazo se vuelve a editar", () => {
    expect(permiteEstado("rechazado", "editar")).toBe(true);
    expect(permiteEstado("rechazado", "poner-en-firme")).toBe(true);
  });

  it("al que calla se le puede volver a pedir", () => {
    expect(permiteEstado("sin_respuesta", "pedir-conformidad")).toBe(true);
    expect(permiteEstado("sin_respuesta", "dar-conformidad")).toBe(true);
  });

  it("cada estado tiene su tabla, su etiqueta y su tono", () => {
    for (const e of ESTADOS) {
      expect(ACCIONES_POR_ESTADO[e]).toBeDefined();
      expect(ETIQUETA[e]).toBeTruthy();
      expect(TONO[e]).toBeTruthy();
      expect(TRANSICIONES[e]).toBeDefined();
    }
  });

  it("ninguna etiqueta habla de bloques ni de cadenas", () => {
    for (const t of Object.values(ETIQUETA)) {
      expect(t.toLowerCase()).not.toMatch(/bloque|cadena/);
    }
  });
});

describe("los pasos de un estado a otro", () => {
  it("el camino normal vale", () => {
    expect(transicionValida("borrador", "en_firma")).toBe(true);
    expect(transicionValida("en_firma", "vigente")).toBe(true);
    expect(transicionValida("vigente", "entregado")).toBe(true);
    expect(transicionValida("entregado", "cerrado")).toBe(true);
  });

  it("saltarse la firma, no", () => {
    expect(transicionValida("borrador", "vigente")).toBe(false);
    expect(transicionValida("borrador", "cerrado")).toBe(false);
    expect(transicionValida("en_firma", "cerrado")).toBe(false);
  });

  it("de cerrado no se sale", () => {
    for (const e of ESTADOS) expect(transicionValida("cerrado", e)).toBe(false);
  });

  it("un rechazo devuelve a borrador", () => {
    expect(transicionValida("rechazado", "borrador")).toBe(true);
  });

  it("un estado inventado no vale como origen ni como destino", () => {
    expect(transicionValida("inventado", "vigente")).toBe(false);
    expect(transicionValida("vigente", "inventado")).toBe(false);
  });
});

describe("las firmas", () => {
  it("se leen las buenas y se tiran las malformadas", () => {
    const c = enFirma();
    c.acuerdo.firmas = [
      firma("emisor", "aceptacion"),
      { parte: "nadie", momento: "aceptacion" },
      { parte: "emisor", momento: "cualquiera" },
      null,
    ];
    expect(firmasDe(c)).toHaveLength(1);
    expect(firmaDe(c, "emisor", "aceptacion")).toBeTruthy();
    expect(firmaDe(c, "receptor", "aceptacion")).toBe(null);
  });

  it("las fuerzas van de menos a mas, y el enlace es la menor", () => {
    expect(FUERZAS[0]).toBe("enlace");
    expect(FUERZAS[FUERZAS.length - 1]).toBe("efirma");
    expect(FUERZAS.indexOf("cuenta")).toBeGreaterThan(FUERZAS.indexOf("enlace"));
  });
});

describe("dias entre fechas", () => {
  it("cuenta dias completos", () => {
    expect(diasEntre("2026-10-01T00:00:00Z", "2026-10-04T00:00:00Z")).toBe(3);
    expect(diasEntre("2026-10-01T00:00:00Z", "2026-10-01T23:00:00Z")).toBe(0);
  });

  it("una fecha invalida no inventa un numero", () => {
    expect(diasEntre("no es fecha", HOY)).toBe(null);
    expect(diasEntre(HOY, undefined)).toBe(null);
  });
});

describe("el cliente y el servidor dicen lo mismo", () => {
  it("el cuerpo es identico", () => {
    const corte = (ruta, marca) => {
      const t = readFileSync(new URL(ruta, import.meta.url), "utf8");
      return t.slice(t.indexOf(marca));
    };
    const marca = "/** Los estados por los que pasa un acuerdo.";
    expect(corte("../functions/lib/acuerdo.js", marca))
      .toBe(corte("../src/nucleo/acuerdo.js", marca));
  });
});

// Lo que el estado gobierna dentro de `exigir`, en el servidor.
//
// Esta lista es la que evita que meter el estado en la puerta del
// servidor rompa todo lo demas: firmar, compartir, pedir y proteger
// no estan en la tabla de estados, asi que sin esto quedarian
// prohibidos en todos los estados a la vez.
describe("que acciones gobierna el estado", () => {
  it("manda sobre editar, subir y retirar", () => {
    expect(GOBERNADAS).toEqual(["editar", "subir", "retirar"]);
  });

  it("no se mete con lo que decide solo el rol", () => {
    for (const a of ["firmar", "compartir", "pedir", "proteger", "vincular", "aprobar"]) {
      for (const e of ESTADOS) expect(estadoBloquea(e, a)).toBe(false);
    }
  });

  it("bloquea editar en firma y vigente, no en borrador", () => {
    expect(estadoBloquea("en_firma", "editar")).toBe(true);
    expect(estadoBloquea("vigente", "editar")).toBe(true);
    expect(estadoBloquea("borrador", "editar")).toBe(false);
  });

  it("bloquea subir antes de que haya acuerdo", () => {
    expect(estadoBloquea("borrador", "subir")).toBe(true);
    expect(estadoBloquea("en_firma", "subir")).toBe(true);
    expect(estadoBloquea("vigente", "subir")).toBe(false);
  });

  it("borrar queda fuera, a proposito y de momento", () => {
    // sin un archivar que lo sustituya, prohibirlo deja sin salida
    for (const e of ESTADOS) expect(estadoBloquea(e, "borrar")).toBe(false);
  });

  it("ver y exportar nunca se bloquean", () => {
    for (const e of ESTADOS) {
      expect(estadoBloquea(e, "ver")).toBe(false);
      expect(estadoBloquea(e, "exportar")).toBe(false);
    }
  });
});

// La puerta que separa un contrato con doble firma de todo lo demas.
//
// Sin esto, un recibo o una factura —que no tienen acuerdo ninguno—
// salen de `estadoAcuerdo` como "borrador", y en borrador no se puede
// subir nada: adjuntarle una foto a un recibo habria dejado de
// funcionar en el momento de desplegar. Y ninguna prueba del contrato
// lo habria notado, porque el contrato si funcionaba.
describe("el candado solo aprieta donde hay acuerdo", () => {
  const recibo = { id: "r1", kind: "documento", tplId: "recibo" };

  it("un documento normal no tiene acuerdo", () => {
    expect(tieneAcuerdo(recibo)).toBe(false);
    expect(tieneAcuerdo(null)).toBe(false);
    expect(tieneAcuerdo({ acuerdo: {} })).toBe(false);
    expect(tieneAcuerdo(enFirma())).toBe(true);
  });

  it("a un documento normal no le bloquea nada", () => {
    for (const a of ["editar", "subir", "retirar", "firmar", "compartir"]) {
      expect(bloquea(recibo, a)).toBe(false);
      expect(bloquea(null, a)).toBe(false);
      expect(bloquea({}, a)).toBe(false);
    }
  });

  it("un expediente de los de antes tampoco se queda bloqueado", () => {
    // los que ya existen no tienen `acuerdo`: tienen que seguir
    // funcionando igual que ayer
    const viejo = { id: "e1", kind: "expediente", requisitos: [{ id: "r1" }] };
    expect(bloquea(viejo, "editar")).toBe(false);
    expect(bloquea(viejo, "subir")).toBe(false);
  });

  it("a un contrato en firma si le bloquea editar", () => {
    expect(bloquea(enFirma(), "editar", HOY)).toBe(true);
    expect(bloquea(enFirma(), "subir", HOY)).toBe(true);
  });

  it("a uno vigente le deja subir y no editar", () => {
    expect(bloquea(aceptado(), "subir", HOY)).toBe(false);
    expect(bloquea(aceptado(), "editar", HOY)).toBe(true);
  });
});

// Quien puede aceptar o rechazar un contrato.
//
// El error que esto cierra, y que costo un 403 en produccion: aceptar
// pedia ADEMAS el permiso de rol "aprobar", que un editor no tiene. A
// quien ya colaboraba en el contrato como editor, la pantalla le
// ofrecia el boton —porque la pantalla mira el correo, que es lo
// correcto— y el servidor se lo negaba. Dos puertas para lo mismo, y
// la segunda estorbaba.
//
// Ahora la regla vive en un solo sitio y la usan las dos mitades.
describe("quien puede aceptar o rechazar", () => {
  it("el destinatario, sea cual sea su rol", () => {
    const c = enFirma();
    expect(esDestinatario(c, "ana@correo.com")).toBe(true);
    expect(esperaFirmaDe(c, "ana@correo.com", HOY)).toBe(true);
  });

  it("no le importan las mayusculas ni los espacios", () => {
    const c = enFirma();
    expect(esDestinatario(c, "  ANA@Correo.com ")).toBe(true);
  });

  it("nadie mas, aunque tenga acceso de sobra", () => {
    const c = enFirma();
    expect(esDestinatario(c, "otro@correo.com")).toBe(false);
    expect(esperaFirmaDe(c, "otro@correo.com", HOY)).toBe(false);
  });

  it("sin correo no se es destinatario de nada", () => {
    const c = enFirma();
    expect(esDestinatario(c, "")).toBe(false);
    expect(esDestinatario(c, null)).toBe(false);
    expect(esDestinatario(c, undefined)).toBe(false);
  });

  it("un documento sin acuerdo no espera la firma de nadie", () => {
    expect(esDestinatario({ id: "r1" }, "ana@correo.com")).toBe(false);
    expect(esDestinatario(null, "ana@correo.com")).toBe(false);
    // y el vacio contra el vacio tampoco cuenta como coincidencia
    expect(esDestinatario({ acuerdo: { paraEmail: "" } }, "")).toBe(false);
  });

  it("si ya lo acepto, deja de esperar su firma", () => {
    expect(esperaFirmaDe(aceptado(), "ana@correo.com", HOY)).toBe(false);
  });

  it("si lo rechazo, tampoco", () => {
    const c = enFirma({ rechazo: { motivo: "monto", fecha: dias(1) } });
    expect(esperaFirmaDe(c, "ana@correo.com", HOY)).toBe(false);
    // pero sigue siendo el destinatario, para poder decirle de que va
    expect(esDestinatario(c, "ana@correo.com")).toBe(true);
  });

  it("en borrador no espera la firma de nadie", () => {
    expect(esperaFirmaDe({ id: "b", requisitos: [] }, "ana@correo.com", HOY)).toBe(false);
  });
});

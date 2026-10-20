// Roles por documento: quién puede qué, y de dónde sale ese permiso.
//
// El servidor y el navegador tienen cada uno su copia de esta tabla:
// el navegador para no ofrecer botones que van a fallar, el servidor
// para decidir de verdad. Aquí se comprueba que digan lo mismo.
import { describe, it, expect } from "vitest";
import {
  ROLES, PERMISOS, rolDe, puede, permisoDeEvento, puedeSubirA,
  revisarCambioDeAcceso, CAMPOS_EDITABLES, sanearRoles, ROLES_OFRECIDOS,
} from "../functions/lib/permisos.js";
import * as cliente from "../src/nucleo/accesos.js";

const op = {
  id: "op1", ownerUid: "U1", ownerEmail: "ana@x.com",
  sharedWith: ["luis@x.com", "vieja@x.com"],
  roles: { "luis@x.com": "aportador", "eva@x.com": "auditor" },
  requisitos: [{ id: "r1", titulo: "Factura" }, { id: "r2", titulo: "Acta" }],
  solicitudes: [
    { sid: "s1", reqId: "r1", paraEmail: "luis@x.com", estado: "pendiente" },
    { sid: "s2", reqId: "r2", paraEmail: "luis@x.com", estado: "cumplida" },
  ],
};

describe("de qué depende el rol", () => {
  it("el dueño lo es por su uid, no por su correo", () => {
    expect(rolDe(op, "U1")).toBe("propietario");
    expect(rolDe(op, "U1", "otro@x.com")).toBe("propietario");
  });

  it("el mapa de roles manda sobre la lista vieja", () => {
    expect(rolDe(op, "U9", "luis@x.com")).toBe("aportador");
    expect(rolDe(op, "U9", "eva@x.com")).toBe("auditor");
  });

  it("lo compartido antes de los roles sigue entrando como editor", () => {
    expect(rolDe(op, "U9", "vieja@x.com")).toBe("editor");
  });

  it("quien no está, no entra", () => {
    expect(rolDe(op, "U9", "nadie@x.com")).toBeNull();
    expect(rolDe(op, "U9", "")).toBeNull();
    expect(rolDe(null, "U1")).toBeNull();
  });

  it("no distingue mayúsculas en el correo", () => {
    expect(rolDe(op, "U9", "LUIS@X.COM")).toBe("aportador");
  });

  it("un rol inventado no sirve de nada", () => {
    expect(rolDe({ ...op, roles: { "x@x.com": "administrador" } }, "U9", "x@x.com")).toBeNull();
  });
});

describe("qué puede cada rol", () => {
  it("sólo el dueño borra", () => {
    expect(puede("propietario", "borrar")).toBe(true);
    for(const r of ROLES.filter((x) => x !== "propietario")) expect(puede(r, "borrar")).toBe(false);
  });

  it("sólo el dueño reparte accesos", () => {
    for(const r of ROLES.filter((x) => x !== "propietario")) expect(puede(r, "compartir")).toBe(false);
  });

  it("el aportador entrega, no edita ni retira", () => {
    expect(puede("aportador", "subir")).toBe(true);
    expect(puede("aportador", "editar")).toBe(false);
    expect(puede("aportador", "retirar")).toBe(false);
    expect(puede("aportador", "exportar")).toBe(false);
  });

  it("el aprobador firma pero no cambia el contenido", () => {
    expect(puede("aprobador", "firmar")).toBe(true);
    expect(puede("aprobador", "editar")).toBe(false);
  });

  it("el lector y el auditor no escriben nada", () => {
    for(const a of ["editar", "subir", "retirar", "firmar"]){
      expect(puede("lector", a)).toBe(false);
      expect(puede("auditor", a)).toBe(false);
    }
    expect(puede("auditor", "exportar")).toBe(true);
    expect(puede("lector", "exportar")).toBe(false);
  });

  it("sin rol no se puede nada", () => {
    expect(puede(null, "ver")).toBe(false);
    expect(puede(undefined, "ver")).toBe(false);
  });

  it("todos pueden ver: si no, no tendrían por qué estar", () => {
    for(const r of ROLES) expect(puede(r, "ver")).toBe(true);
  });
});

describe("el permiso sale del evento que se quiere asentar", () => {
  const casos = [
    [{ accion: "EDICIÓN" }, "editar"],
    [{ accion: "CONVERSIÓN" }, "editar"],
    [{ accion: "FIRMA" }, "firmar"],
    [{ accion: "COMPARTIDO" }, "compartir"],
    [{ accion: "SOLICITUD" }, "pedir"],
    [{ accion: "EXPORTACIÓN" }, "exportar"],
    [{ accion: "VINCULADO" }, "vincular"],
    [{ accion: "CONSULTA" }, "ver"],
    [{ accion: "EVIDENCIA", meta: { tipo: "alta" } }, "subir"],
    [{ accion: "EVIDENCIA", meta: { tipo: "imagen" } }, "subir"],
    [{ accion: "EVIDENCIA", meta: { tipo: "baja" } }, "retirar"],
    [{ accion: "EVIDENCIA", meta: { tipo: "imagen-baja" } }, "retirar"],
    [{ accion: "EVIDENCIA", meta: { tipo: "vinculo" } }, "vincular"],
  ];
  for(const [evento, esperado] of casos){
    it(`${evento.accion}${evento.meta ? ` (${evento.meta.tipo})` : ""} → ${esperado}`, () => {
      expect(permisoDeEvento(evento)).toBe(esperado);
    });
  }

  it("un aportador no puede colar una edición dentro de su entrega", () => {
    expect(puede("aportador", permisoDeEvento({ accion: "EDICIÓN" }))).toBe(false);
    expect(puede("aportador", permisoDeEvento({ accion: "EVIDENCIA", meta: { tipo: "alta" } }))).toBe(true);
  });
});

describe("el aportador sube sólo donde le pidieron", () => {
  it("puede en el requisito de su solicitud pendiente", () => {
    expect(puedeSubirA(op, "aportador", "luis@x.com", "r1")).toBe(true);
  });

  it("no puede en uno que no le pidieron", () => {
    expect(puedeSubirA(op, "aportador", "luis@x.com", "r3")).toBe(false);
  });

  it("una solicitud ya cumplida no le sigue abriendo la puerta", () => {
    expect(puedeSubirA(op, "aportador", "luis@x.com", "r2")).toBe(false);
  });

  it("la solicitud de otra persona no le sirve", () => {
    expect(puedeSubirA(op, "aportador", "otro@x.com", "r1")).toBe(false);
  });

  it("al editor y al dueño no les hace falta solicitud", () => {
    expect(puedeSubirA(op, "editor", "vieja@x.com", "r3")).toBe(true);
    expect(puedeSubirA(op, "propietario", "ana@x.com", "r3")).toBe(true);
  });

  it("quien no puede subir, no sube ni con solicitud", () => {
    expect(puedeSubirA(op, "lector", "luis@x.com", "r1")).toBe(false);
  });
});

describe("los accesos no se cambian editando el documento", () => {
  it("ni sharedWith ni roles pasan por los campos editables", () => {
    expect(CAMPOS_EDITABLES.has("sharedWith")).toBe(false);
    expect(CAMPOS_EDITABLES.has("roles")).toBe(false);
    expect(CAMPOS_EDITABLES.has("password")).toBe(false);
  });

  it("y si llegan igual, se rechaza la operación completa", () => {
    expect(() => revisarCambioDeAcceso(op, { roles: {} })).toThrow(/Compartir/);
  });
});

describe("servidor y navegador dicen lo mismo", () => {
  it("la tabla de permisos es idéntica", () => {
    expect(cliente.PERMISOS).toEqual(PERMISOS);
    expect(cliente.ROLES).toEqual(ROLES);
  });

  it("y calculan el mismo rol para la misma persona", () => {
    for(const correo of ["luis@x.com", "eva@x.com", "vieja@x.com", "nadie@x.com"]){
      expect(cliente.rolDe(op, "U9", correo)).toBe(rolDe(op, "U9", correo));
    }
    expect(cliente.rolDe(op, "U1", "ana@x.com")).toBe("propietario");
  });

  it("y el mismo alcance para el aportador", () => {
    for(const req of ["r1", "r2", "r3"]){
      expect(cliente.puedeSubirA(op, "aportador", "luis@x.com", req))
        .toBe(puedeSubirA(op, "aportador", "luis@x.com", req));
    }
  });

  it("la lista de accesos pone al dueño primero y no repite a nadie", () => {
    const lista = cliente.listaDeAccesos(op);
    expect(lista[0]).toMatchObject({ correo: "ana@x.com", rol: "propietario" });
    expect(new Set(lista.map((a) => a.correo)).size).toBe(lista.length);
    expect(lista.find((a) => a.correo === "luis@x.com").rol).toBe("aportador");
    expect(lista.find((a) => a.correo === "vieja@x.com").rol).toBe("editor");
  });
});
// ── EL MAPA DE ROLES PARTIDO POR LOS PUNTOS ──────────────────────
//
// Los roles se guardaban con `{ ["roles." + correo]: rol }`, y para
// Firestore el punto del correo no es un punto: es «entra un nivel».
// Así que el rol de quien fuera acababa escondido un piso más abajo,
// bajo un correo recortado.
//
// Lo peor no era el correo partido en la lista. Era que al buscar el
// rol del correo entero no había nada y se caía al apaño de
// compatibilidad, que trata a cualquiera de `sharedWith` como EDITOR:
// mandabas a alguien como aprobador y se quedaba pudiendo editar.
describe("roles guardados mal por los puntos del correo", () => {
  const roto = {
    id: "op2", ownerUid: "U1", ownerEmail: "ana@x.com",
    sharedWith: ["betolira@gmail.com"],
    roles: { "betolira@gmail": { com: "aprobador" } },
  };

  it("junta los trozos y devuelve el correo entero", () => {
    expect(sanearRoles(roto.roles)).toEqual({ "betolira@gmail.com": "aprobador" });
  });

  it("aguanta los correos con varios puntos", () => {
    expect(sanearRoles({ ana: { x: { com: { mx: "lector" } } } }))
      .toEqual({ "ana.x.com.mx": "lector" });
  });

  it("tira lo que quedo vacio al retirar un acceso", () => {
    expect(sanearRoles({ "betolira@gmail": {} })).toEqual({});
    expect(sanearRoles({ "betolira@gmail": { com: "noexiste" } })).toEqual({});
  });

  it("no toca un mapa que ya estaba bien", () => {
    expect(sanearRoles(op.roles)).toEqual(op.roles);
    expect(sanearRoles(null)).toEqual({});
    expect(sanearRoles("hola")).toEqual({});
  });

  // El daño de verdad: el aprobador se volvia editor sin que nadie lo
  // decidiera.
  it("el rol que vale es el que se le dio, no editor", () => {
    expect(rolDe(roto, null, "betolira@gmail.com")).toBe("aprobador");
    expect(cliente.rolDe(roto, null, "betolira@gmail.com")).toBe("aprobador");
  });

  it("y el servidor y el navegador siguen diciendo lo mismo", () => {
    for(const correo of ["betolira@gmail.com", "betolira@gmail", "otro@x.com"]){
      expect(cliente.rolDe(roto, null, correo)).toBe(rolDe(roto, null, correo));
    }
  });

  it("la lista de accesos ya no enseña el correo recortado", () => {
    const lista = cliente.listaDeAccesos(roto);
    expect(lista.map((a) => a.correo)).toEqual(["ana@x.com", "betolira@gmail.com"]);
    expect(lista.find((a) => a.correo === "betolira@gmail.com").rol).toBe("aprobador");
  });

  it("quien esta en sharedWith sin rol sigue siendo editor, como antes", () => {
    expect(rolDe(op, null, "vieja@x.com")).toBe("editor");
  });
});

// ── EL ROL «INVOLUCRADO» ─────────────────────────────────────────
//
// Había seis roles y tres existían por cómo está hecho esto por
// dentro, no porque alguien los pidiera. Quien comparte un contrato no
// se pregunta «¿editor o aportador?»: se pregunta quién es esta
// persona respecto al trato.
//
// «Involucrado» es la otra parte: firma el contrato y sube lo que le
// toca entregar. Lo que NO puede es editarlo — y eso no es un detalle
// de permisos, es la garantía que firma.
describe("el rol involucrado", () => {
  it("sube lo suyo y puede quitarlo si se equivoco", () => {
    for(const accion of ["ver", "subir", "retirar", "firmar", "aprobar", "exportar"]){
      expect(puede("involucrado", accion)).toBe(true);
    }
  });

  it("pero no puede cambiar el contrato que firmo", () => {
    for(const accion of ["editar", "compartir", "borrar", "proteger"]){
      expect(puede("involucrado", accion)).toBe(false);
    }
  });

  it("reemplaza a aprobador justo en lo que le faltaba: subir", () => {
    expect(puede("aprobador", "subir")).toBe(false);
    expect(puede("involucrado", "subir")).toBe(true);
  });

  it("el servidor y el navegador dicen lo mismo de el", () => {
    expect(cliente.PERMISOS.involucrado).toEqual(PERMISOS.involucrado);
  });

  it("se ofrecen tres roles, y los viejos siguen valiendo", () => {
    expect(cliente.ROLES_OFRECIDOS).toEqual(["involucrado", "lector", "auditor"]);
    // Las dos copias de la tabla tienen que decir lo mismo. Es lo que
    // promete la cabecera de los dos archivos, y sin esta linea se
    // podia cambiar una y dejar la otra.
    expect(ROLES_OFRECIDOS).toEqual(cliente.ROLES_OFRECIDOS);
    expect(ROLES).toEqual(cliente.ROLES);
    for(const r of cliente.ROLES_OFRECIDOS) expect(ROLES).toContain(r);
    // No se borran: hay documentos que ya los usan y quitarlos dejaria
    // a esa gente sin permisos de un dia para otro.
    for(const viejo of ["editor", "aportador", "aprobador"]) expect(ROLES).toContain(viejo);
  });

  it("todo rol que se puede asignar tiene permisos y nombre", () => {
    for(const r of cliente.ROLES_ASIGNABLES){
      expect(PERMISOS[r], r).toBeDefined();
      expect(cliente.ROL_TEXTO[r], r).toBeTruthy();
      expect(cliente.ROL_AYUDA[r], r).toBeTruthy();
    }
  });
});

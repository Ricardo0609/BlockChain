// Código de firma, límite de intentos y verificación biométrica.
// La aserción biométrica se simula con un par de llaves real, igual
// que haría el enclave de un teléfono.
import { describe, it, expect } from "vitest";
import { createHash, createSign, generateKeyPairSync, randomBytes } from "node:crypto";
import {
  sellarSecreto, comprobarSecreto, estadoIntentos, trasIntento, INTENTOS,
  verificarAsercion, leerAuthData, nuevoReto, retoValido, bytesAB64u,
} from "../functions/lib/identidad.js";

const HOSTS = ["localhost", "chaindoc.onrender.com"];
const sha256 = (b) => createHash("sha256").update(b).digest();

/** Arma una aserción como la que devolvería un iPhone. */
function firmar({ reto, host = "localhost", uv = true, contador = 1, llave, manipular }) {
  const clientData = Buffer.from(JSON.stringify({
    type: "webauthn.get", challenge: reto, origin: `https://${host}`, crossOrigin: false,
  }), "utf8");

  const authData = Buffer.concat([
    sha256(Buffer.from(host, "utf8")),
    Buffer.from([uv ? 0x05 : 0x01]),          // UP siempre; UV sólo si hubo biometría
    (() => { const b = Buffer.alloc(4); b.writeUInt32BE(contador); return b; })(),
  ]);

  const firmado = Buffer.concat([authData, sha256(clientData)]);
  const s = createSign("sha256");
  s.update(manipular ? Buffer.concat([firmado, Buffer.from("x")]) : firmado);
  const signature = s.sign({ key: llave.privateKey, dsaEncoding: "der" });

  return {
    credId: "cred-1",
    signature: bytesAB64u(signature),
    authenticatorData: bytesAB64u(authData),
    clientDataJSON: bytesAB64u(clientData),
  };
}

function parDeLlaves() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return {
    privateKey,
    credencial: {
      credId: "cred-1", alg: -7, contador: 0, device: "iPhone",
      publicKey: bytesAB64u(publicKey.export({ type: "spki", format: "der" })),
    },
  };
}

describe("código de firma", () => {
  it("acepta el correcto y rechaza el incorrecto", async () => {
    const reg = await sellarSecreto("4821");
    expect((await comprobarSecreto("4821", reg)).ok).toBe(true);
    expect((await comprobarSecreto("4822", reg)).ok).toBe(false);
  });

  it("dos códigos iguales dan huellas distintas (la sal es distinta)", async () => {
    const a = await sellarSecreto("1234");
    const b = await sellarSecreto("1234");
    expect(a.hash).not.toBe(b.hash);
    expect(a.sal).not.toBe(b.sal);
  });

  it("acepta el formato viejo una vez y avisa que hay que re-sellarlo", async () => {
    const viejo = { legacySha256: createHash("sha256").update("4821").digest("hex") };
    const r = await comprobarSecreto("4821", viejo);
    expect(r).toEqual({ ok: true, viejo: true });
    expect((await comprobarSecreto("0000", viejo)).ok).toBe(false);
  });

  it("sin registro guardado, nada pasa", async () => {
    expect((await comprobarSecreto("4821", null)).ok).toBe(false);
  });
});

describe("límite de intentos", () => {
  it("bloquea al quinto fallo y no antes", () => {
    let reg = {};
    for (let i = 1; i < INTENTOS.maximo; i++) {
      reg = trasIntento(reg, false);
      expect(estadoIntentos(reg).bloqueado).toBe(false);
    }
    reg = trasIntento(reg, false);
    expect(estadoIntentos(reg).bloqueado).toBe(true);
    expect(estadoIntentos(reg).segundos).toBeGreaterThan(0);
  });

  it("un acierto limpia la cuenta", () => {
    const reg = trasIntento(trasIntento({}, false), true);
    expect(reg.intentos).toBe(0);
    expect(estadoIntentos(reg).bloqueado).toBe(false);
  });

  it("cuando vence el bloqueo, se puede volver a intentar", () => {
    const vencido = { intentos: 5, bloqueadoHasta: new Date(Date.now() - 1000).toISOString() };
    expect(estadoIntentos(vencido).bloqueado).toBe(false);
    expect(trasIntento(vencido, false).intentos).toBe(1);
  });
});

describe("firma biométrica verificada en el servidor", () => {
  const reto = bytesAB64u(randomBytes(32));

  it("acepta una firma legítima y devuelve el contador", () => {
    const llave = parDeLlaves();
    const asercion = firmar({ reto, llave, contador: 7 });
    expect(verificarAsercion({ credencial: llave.credencial, asercion, reto, hosts: HOSTS }))
      .toEqual({ ok: true, contador: 7 });
  });

  it("rechaza un reto que no emitió el servidor", () => {
    const llave = parDeLlaves();
    const asercion = firmar({ reto: bytesAB64u(randomBytes(32)), llave });
    expect(verificarAsercion({ credencial: llave.credencial, asercion, reto, hosts: HOSTS }))
      .toMatchObject({ ok: false, motivo: "reto" });
  });

  it("rechaza una firma hecha desde otro sitio", () => {
    const llave = parDeLlaves();
    const asercion = firmar({ reto, llave, host: "sitio-falso.com" });
    expect(verificarAsercion({ credencial: llave.credencial, asercion, reto, hosts: HOSTS }))
      .toMatchObject({ ok: false, motivo: "origen" });
  });

  it("rechaza si el dispositivo no verificó a la persona", () => {
    const llave = parDeLlaves();
    const asercion = firmar({ reto, llave, uv: false });
    expect(verificarAsercion({ credencial: llave.credencial, asercion, reto, hosts: HOSTS }))
      .toMatchObject({ ok: false, motivo: "sin-biometria" });
  });

  it("rechaza una firma ya usada (contador que no avanza)", () => {
    const llave = parDeLlaves();
    const asercion = firmar({ reto, llave, contador: 5 });
    const usada = { ...llave.credencial, contador: 5 };
    expect(verificarAsercion({ credencial: usada, asercion, reto, hosts: HOSTS }))
      .toMatchObject({ ok: false, motivo: "repetida" });
  });

  it("rechaza una firma que no corresponde a los datos", () => {
    const llave = parDeLlaves();
    const asercion = firmar({ reto, llave, manipular: true });
    expect(verificarAsercion({ credencial: llave.credencial, asercion, reto, hosts: HOSTS }))
      .toMatchObject({ ok: false, motivo: "firma" });
  });

  it("rechaza la firma de otra llave, aunque todo lo demás cuadre", () => {
    const buena = parDeLlaves();
    const otra = parDeLlaves();
    const asercion = firmar({ reto, llave: otra });
    expect(verificarAsercion({ credencial: buena.credencial, asercion, reto, hosts: HOSTS }))
      .toMatchObject({ ok: false, motivo: "firma" });
  });

  it("sin llave pública registrada no se puede verificar nada", () => {
    const llave = parDeLlaves();
    const asercion = firmar({ reto, llave });
    expect(verificarAsercion({ credencial: { credId: "cred-1" }, asercion, reto, hosts: HOSTS }))
      .toMatchObject({ ok: false, motivo: "sin-llave" });
  });

  it("lee las banderas del autenticador", () => {
    const authData = Buffer.concat([sha256(Buffer.from("localhost")), Buffer.from([0x05]),
                                    Buffer.from([0, 0, 0, 9])]);
    expect(leerAuthData(authData)).toMatchObject({ presente: true, verificado: true, contador: 9 });
  });
});

describe("retos", () => {
  it("sirve para lo que se pidió y caduca", () => {
    const r = nuevoReto("firma", "op1");
    expect(retoValido(r, { motivo: "firma", opId: "op1" })).toBe(true);
    expect(retoValido(r, { motivo: "desbloqueo", opId: "op1" })).toBe(false);
    expect(retoValido(r, { motivo: "firma", opId: "op2" })).toBe(false);
    expect(retoValido(r, { motivo: "firma", opId: "op1" }, Date.now() + 10 * 60000)).toBe(false);
  });

  it("dos retos nunca son iguales", () => {
    expect(nuevoReto("firma").reto).not.toBe(nuevoReto("firma").reto);
  });
});
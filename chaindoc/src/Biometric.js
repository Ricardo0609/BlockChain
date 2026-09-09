// ─────────────────────────────────────────────────────────────
// biometric.js — Face ID / Touch ID / huella con WebAuthn
//
// El navegador NUNCA ve tu rostro ni tu huella. Lo que ocurre es:
// el sistema operativo guarda una llave privada en hardware seguro
// (Secure Enclave en iPhone), la desbloquea sólo tras verificarte,
// y devuelve una firma. Nosotros guardamos la llave pública y
// verificamos esa firma.
//
// Requisitos: HTTPS (localhost cuenta como seguro para desarrollo)
// y un dispositivo con autenticador de plataforma.
// ─────────────────────────────────────────────────────────────

const RP_NAME = "chaindoc";

// ── Utilidades base64url ──────────────────────────────────────
const b64uEncode = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const b64uDecode = (str) => {
  const pad = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const concat = (a, b) => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
};

/** Convierte una cadena hex (nuestro hash de bloque) a bytes. */
export const hexToBytes = (hex) => {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
};

// ── Disponibilidad ────────────────────────────────────────────

/** ¿El dispositivo tiene Face ID, Touch ID, Windows Hello o huella? */
export async function bioAvailable() {
  try {
    if (!window.PublicKeyCredential) return false;
    if (!window.isSecureContext) return false; // exige HTTPS
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** Nombre legible del dispositivo, para que el usuario reconozca sus credenciales. */
export function deviceLabel() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  return "Este dispositivo";
}

// ── Registro ──────────────────────────────────────────────────

/**
 * Crea una credencial biométrica ligada a este dominio y dispositivo.
 * Devuelve lo que hay que guardar en el perfil del usuario.
 */
export async function bioRegister({ uid, name, email }) {
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: RP_NAME, id: window.location.hostname },
      user: {
        id: new TextEncoder().encode(uid),
        name: email || name || uid,
        displayName: name || email || "Usuario",
      },
      // ES256 primero: es lo que usan los autenticadores de Apple.
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },   // ECDSA P-256
        { type: "public-key", alg: -257 }, // RSA PKCS#1 v1.5
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform", // fuerza Face ID, no llaves USB
        userVerification: "required",        // exige la biometría, no sólo presencia
        residentKey: "preferred",
      },
      timeout: 60000,
      attestation: "none",
    },
  });

  if (!cred) throw new Error("No se pudo crear la credencial.");

  // getPublicKey() devuelve la llave en formato SPKI, listo para Web Crypto.
  let publicKey = null;
  let alg = null;
  try {
    const raw = cred.response.getPublicKey?.();
    if (raw) {
      publicKey = b64uEncode(raw);
      alg = cred.response.getPublicKeyAlgorithm?.() ?? -7;
    }
  } catch {
    // Navegador viejo sin getPublicKey: la credencial sigue sirviendo
    // como control de acceso, pero no podremos verificar la firma.
  }

  return {
    credId: b64uEncode(cred.rawId),
    publicKey,
    alg,
    device: deviceLabel(),
    createdAt: new Date().toISOString(),
  };
}

// ── Aserción (el momento de firmar) ───────────────────────────

/**
 * Pide al usuario que se verifique y firma el reto con la llave del enclave.
 * @param {string[]} credIds credenciales conocidas del usuario
 * @param {Uint8Array} challenge normalmente el hash del bloque
 */
export async function bioAssert(credIds, challenge) {
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId: window.location.hostname,
      allowCredentials: credIds.map((id) => ({
        type: "public-key",
        id: b64uDecode(id),
        transports: ["internal"],
      })),
      userVerification: "required",
      timeout: 60000,
    },
  });

  if (!assertion) throw new Error("Verificación cancelada.");

  return {
    credId: b64uEncode(assertion.rawId),
    signature: b64uEncode(assertion.response.signature),
    authenticatorData: b64uEncode(assertion.response.authenticatorData),
    clientDataJSON: b64uEncode(assertion.response.clientDataJSON),
  };
}

// ── Verificación de la firma ──────────────────────────────────

/**
 * ECDSA en WebAuthn viene en DER; Web Crypto la espera como r||s crudo.
 * Esta conversión es obligatoria o la verificación siempre falla.
 */
function derToRaw(der) {
  let i = 0;
  if (der[i++] !== 0x30) throw new Error("Firma DER inválida");
  if (der[i] & 0x80) i += 1 + (der[i] & 0x7f); else i += 1;

  const readInt = () => {
    if (der[i++] !== 0x02) throw new Error("Firma DER inválida");
    let len = der[i++];
    let val = der.slice(i, i + len);
    i += len;
    while (val.length > 32 && val[0] === 0) val = val.slice(1); // quita relleno
    const out = new Uint8Array(32);
    out.set(val, 32 - val.length);
    return out;
  };

  return concat(readInt(), readInt());
}

/**
 * Comprueba que la firma corresponde al reto y a la llave registrada.
 * Devuelve false si algo no cuadra, en vez de lanzar excepción.
 */
export async function bioVerify({ publicKey, alg }, assertion, expectedChallenge) {
  try {
    if (!publicKey) return false;

    // 1. El reto dentro de clientData debe ser el que enviamos.
    const clientData = JSON.parse(
      new TextDecoder().decode(b64uDecode(assertion.clientDataJSON))
    );
    if (clientData.type !== "webauthn.get") return false;
    if (clientData.challenge !== b64uEncode(expectedChallenge)) return false;

    // 2. El origen debe ser este sitio.
    if (new URL(clientData.origin).hostname !== window.location.hostname) return false;

    const authData = b64uDecode(assertion.authenticatorData);

    // 3. Bit UV (user verified): confirma que hubo biometría, no sólo un toque.
    const flags = authData[32];
    if (!(flags & 0x04)) return false;

    // 4. Los datos firmados son authData || SHA-256(clientDataJSON)
    const clientHash = new Uint8Array(
      await crypto.subtle.digest("SHA-256", b64uDecode(assertion.clientDataJSON))
    );
    const signed = concat(authData, clientHash);

    const isRSA = alg === -257;
    const key = await crypto.subtle.importKey(
      "spki",
      b64uDecode(publicKey),
      isRSA
        ? { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }
        : { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );

    const sigBytes = b64uDecode(assertion.signature);
    const sig = isRSA ? sigBytes : derToRaw(sigBytes);

    return await crypto.subtle.verify(
      isRSA ? { name: "RSASSA-PKCS1-v1_5" } : { name: "ECDSA", hash: "SHA-256" },
      key,
      sig,
      signed
    );
  } catch (e) {
    console.error("Verificación biométrica fallida:", e);
    return false;
  }
}

// ── Errores en español ────────────────────────────────────────

export function bioError(err) {
  const n = err?.name;
  if (n === "NotAllowedError")
    return "Verificación cancelada o agotó el tiempo.";
  if (n === "InvalidStateError")
    return "Este dispositivo ya está registrado en tu cuenta.";
  if (n === "NotSupportedError")
    return "Este dispositivo no admite verificación biométrica.";
  if (n === "SecurityError")
    return "La biometría requiere una conexión segura (HTTPS).";
  if (n === "AbortError") return "Operación cancelada.";
  return err?.message || "No se pudo completar la verificación.";
}
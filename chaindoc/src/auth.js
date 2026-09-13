// ─────────────────────────────────────────────────────────────
// auth.js — Cuentas de usuario con Firebase Authentication
//
// Firebase guarda las credenciales en su servidor: las contraseñas
// nunca tocan este código ni el navegador del usuario. La sesión
// persiste sola entre recargas y funciona en cualquier dispositivo.
// ─────────────────────────────────────────────────────────────

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

import { auth, db } from "./firebase";

// ── Sesión ────────────────────────────────────────────────────

/** Registra una cuenta nueva y guarda su perfil en Firestore. */
export async function signUp(email, password, name) {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await updateProfile(cred.user, { displayName: name.trim() });
  await setDoc(doc(db, "users", cred.user.uid), {
    uid: cred.user.uid,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    signCodeHash: null,
    createdAt: new Date().toISOString(),
  });
  await publishDirectory(cred.user.uid, email, name);   // ← NUEVO
  return cred.user;
}

/** Inicia sesión con una cuenta existente. */
export async function signIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}

export const logOut = () => signOut(auth);

/** Envía el correo de restablecimiento de contraseña. */
export const resetPassword = (email) =>
  sendPasswordResetEmail(auth, email.trim());

/**
 * Observa el estado de sesión. Se dispara al cargar la app y en cada
 * login o logout. Devuelve la función para cancelar la suscripción.
 */
export const watchAuth = (callback) => onAuthStateChanged(auth, callback);

// ── Perfil ────────────────────────────────────────────────────

export async function getProfile(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
}

/** Actualiza campos del perfil sin borrar el resto. */
export async function saveProfile(uid, data) {
  try {
    await setDoc(doc(db, "users", uid), data, { merge: true });
    if (data.name && auth.currentUser) {
      await updateProfile(auth.currentUser, { displayName: data.name });
    }
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

// ── Directorio público ────────────────────────────────────────
// Colección aparte, a propósito: /users guarda el hash del código
// de firma y las credenciales biométricas, así que no puede ser
// legible por terceros. El directorio sólo expone nombre y correo,
// que es lo mínimo para poder compartir un documento.

const dirId = (email) => email.trim().toLowerCase();

/** Publica o actualiza la entrada del usuario en el directorio. */
export async function publishDirectory(uid, email, name) {
  if (!uid || !email) return false;
  try {
    await setDoc(doc(db, "directorio", dirId(email)), {
      uid, email: dirId(email), nombre: name || "",
      actualizado: new Date().toISOString(),
    });
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

/** Busca una cuenta por correo. Devuelve null si no existe. */
export async function findUserByEmail(email) {
  if (!email?.trim()) return null;
  try {
    const snap = await getDoc(doc(db, "directorio", dirId(email)));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.error(e);
    return null;
  }
}

// ── Errores en español ────────────────────────────────────────

const MESSAGES = {
  "auth/email-already-in-use":  "Ese correo ya tiene una cuenta. Inicia sesión.",
  "auth/invalid-email":         "El correo no tiene un formato válido.",
  "auth/weak-password":         "La contraseña debe tener al menos 6 caracteres.",
  "auth/missing-password":      "Escribe tu contraseña.",
  "auth/invalid-credential":    "Correo o contraseña incorrectos.",
  "auth/user-not-found":        "No existe una cuenta con ese correo.",
  "auth/wrong-password":        "Correo o contraseña incorrectos.",
  "auth/too-many-requests":     "Demasiados intentos. Espera un momento.",
  "auth/network-request-failed": "Sin conexión. Revisa tu internet.",
  "auth/operation-not-allowed":
    "El acceso por correo no está habilitado en la consola de Firebase.",
};

export const authError = (err) =>
  MESSAGES[err?.code] || "Algo salió mal. Inténtalo de nuevo.";

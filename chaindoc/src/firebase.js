// ─────────────────────────────────────────────────────────────
// firebase.js — Inicialización única de Firebase
//
// Dos entornos:
//  · PRODUCCIÓN (Render): usa la configuración de abajo.
//  · DESARROLLO (tu computadora): si existe el archivo
//    .env.development.local con las variables VITE_FIREBASE_*,
//    se conecta al proyecto de pruebas y nunca toca datos reales.
//
// Esta configuración no es secreta: Firebase la publica en toda
// app web. Lo que protege los datos son las reglas de Firestore.
// ─────────────────────────────────────────────────────────────

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const PRODUCCION = {
  apiKey:            "AIzaSyABii1ZsNFikCmL48aVJSJnPp9NWgep8tI",
  authDomain:        "blockchain-296a8.firebaseapp.com",
  projectId:         "blockchain-296a8",
  storageBucket:     "blockchain-296a8.firebasestorage.app",
  messagingSenderId: "796845644217",
  appId:             "1:796845644217:web:5e9b352019eea09ad83e68",
};

const ENV = (typeof import.meta !== "undefined" && import.meta.env) || {};

const desdeEnv = {
  apiKey:            ENV.VITE_FIREBASE_API_KEY,
  authDomain:        ENV.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         ENV.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     ENV.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: ENV.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             ENV.VITE_FIREBASE_APP_ID,
};

// Sólo se usa el otro proyecto si vienen TODAS las variables:
// una configuración a medias mezclaría proyectos.
const completo = Object.values(desdeEnv).every(Boolean);
const firebaseConfig = completo ? desdeEnv : PRODUCCION;

/** "produccion" o "desarrollo": se muestra un distintivo en desarrollo. */
export const ENTORNO = firebaseConfig.projectId === PRODUCCION.projectId
  ? "produccion" : "desarrollo";

export const app  = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);

// ← NUEVO (10 nov): los correos que manda Firebase, en español.
//
// Confirmar el correo, recuperar la contraseña y deshacer un cambio de
// correo los manda Firebase, no nosotros. Sin esta línea salen en
// inglés: la segunda pantalla que ve alguien que acaba de registrarse
// en un producto en español es un correo en inglés.
//
// Fijo en "es" y no `useDeviceLanguage()`: el producto es en español y
// tiene una sola versión. Con el idioma del navegador, alguien con el
// sistema en inglés recibiría el correo en inglés y la aplicación en
// español, que es peor que cualquiera de las dos cosas sola.
//
// Esto elige la PLANTILLA; el nombre del remitente y el asunto se
// cambian en la consola de Firebase, que es trabajo aparte.
auth.languageCode = "es";

// ── App Check (Etapa 3) ───────────────────────────────────────
// Comprueba que quien llama al servidor sea esta aplicación y no un
// script apuntando a nuestras funciones. Se activa sólo si existe la
// llave de reCAPTCHA: sin ella, todo sigue funcionando igual.
//
// En desarrollo se usa el «token de depuración» que imprime la consola
// del navegador; hay que registrarlo una vez en la consola de Firebase.
//
// ← ACTUALIZADO (10 nov): proveedor de Fraud Defense, antes reCAPTCHA
// Enterprise, en vez del de reCAPTCHA Classic.
//
// No fue por mejorarlo: Google dejó de permitir llaves Classic nuevas
// en 2024, así que la que pedía el código ya no se podía conseguir.
//
// La diferencia práctica es que esta llave es PÚBLICA —la de sitio— y
// la Classic venía con una secreta aparte. Una llave menos que
// custodiar, y ninguna que pueda acabar en el repositorio por
// descuido: ésta está hecha para ir en el navegador a la vista.
export const APP_CHECK = Boolean(ENV.VITE_RECAPTCHA_KEY);

if(APP_CHECK){
  if(ENV.DEV || ENV.VITE_APPCHECK_DEBUG){
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = ENV.VITE_APPCHECK_DEBUG || true;
  }
  import("firebase/app-check")
    .then(({ initializeAppCheck, ReCaptchaEnterpriseProvider }) => {
      initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(ENV.VITE_RECAPTCHA_KEY),
        isTokenAutoRefreshEnabled: true,
      });
    })
    .catch((e) => console.error("App Check no se pudo iniciar:", e));
}
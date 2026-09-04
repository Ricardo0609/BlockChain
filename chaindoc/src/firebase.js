// ─────────────────────────────────────────────────────────────
// firebase.js — Inicialización única de Firebase
// Se importa desde App.jsx y auth.js para no crear dos instancias.
// ─────────────────────────────────────────────────────────────

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey:            "AIzaSyABii1ZsNFikCmL48aVJSJnPp9NWgep8tI",
  authDomain:        "blockchain-296a8.firebaseapp.com",
  projectId:         "blockchain-296a8",
  storageBucket:     "blockchain-296a8.firebasestorage.app",
  messagingSenderId: "796845644217",
  appId:             "1:796845644217:web:5e9b352019eea09ad83e68",
};

export const app  = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);
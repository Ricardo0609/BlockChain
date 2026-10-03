// ─────────────────────────────────────────────────────────────
// datos.js — Lectura y escritura de operaciones
//
// Una «operación» es lo que hasta ahora llamábamos documento o
// expediente. Su historia (la cadena) ya no vive dentro del mismo
// registro, sino en una subcolección `bloques` que sólo el servidor
// puede escribir. Así un bloque no se puede fabricar desde el
// navegador, que era el hueco más grande que quedaba.
//
// Dos modos, según la variable VITE_BACKEND:
//
//  · "servidor"  → operaciones/{id} + bloques/{n}, escritos por las
//                  Cloud Functions. Es el modo de producción.
//  · "local"     → documents/{id} con la cadena adentro, como antes.
//                  Sirve mientras no estén desplegadas las funciones.
//
// Las pantallas no notan la diferencia: en las dos recibe el mismo
// objeto, con su `chain` como arreglo.
// ─────────────────────────────────────────────────────────────

import {
  collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, setDoc, where,
} from "firebase/firestore";
import { db } from "../firebase";
import { armarBloqueV2 } from "./bloques";
import { llamar } from "./backend";

const ENV = (typeof import.meta !== "undefined" && import.meta.env) || {};
export const MODO = ENV.VITE_BACKEND === "servidor" ? "servidor" : "local";
export const enServidor = () => MODO === "servidor";

const COL = enServidor() ? "operaciones" : "documents";

// ← elimina la clave `archivo` del formato antiguo. Se quita la clave
// en vez de ponerla en undefined, que Firestore no admite.
export const quitarArchivoViejo = (r)=>{ const resto={...r}; delete resto.archivo; return resto; };

// ← Firestore rechaza `undefined` (acepta `null`). Esto lo limpia antes
// de guardar, para que un campo olvidado no tumbe el guardado entero
// con «Unsupported field value: undefined».
export function sinUndefined(v){
  if(Array.isArray(v)) return v.map(sinUndefined);
  if(v && typeof v==="object" && !(v instanceof Date)){
    const out = {};
    for(const [k,val] of Object.entries(v)){
      if(val === undefined) continue;
      out[k] = sinUndefined(val);
    }
    return out;
  }
  return v;
}

/**
 * ¿El documento pide contraseña? Desde la Etapa 3 sólo queda la marca
 * `protegido`; la contraseña vive sellada en el servidor. Se sigue
 * aceptando `password` por los documentos que aún no se han abierto
 * una vez desde entonces.
 */
export const estaProtegido = (doc) => Boolean(doc?.protegido || doc?.password);

/** Campos del documento que el cliente puede cambiar. Todo lo demás lo fija el servidor. */
export const CAMPOS_EDITABLES = [
  "title", "content", "fields", "folder", "password", "tplId",
  "kind", "requisitos", "fases", "solicitudes", "imagenes", "sharedWith", "roles",
  "fechaLimite", "montoTotal", "moneda", "partes", "resumen", "analisis",
  "convertidoDe", "source", "sourceFile",
];

const soloEditables = (cambios = {}) => {
  const out = {};
  for(const k of CAMPOS_EDITABLES) if(k in cambios) out[k] = cambios[k];
  return out;
};

/** Lee los bloques de una operación (modo servidor). */
async function leerBloques(id){
  const snap = await getDocs(query(collection(db, COL, id, "bloques"), orderBy("index")));
  return snap.docs.map((s) => s.data());
}

const conCadena = async (id, datos) =>
  enServidor() ? { ...datos, chain: await leerBloques(id) } : datos;

/**
 * ← NUEVO: un fallo con nombre y apellido.
 *
 * Antes, cualquier tropiezo dentro de `list` dejaba la lista vacía con
 * un «Missing or insufficient permissions» a secas, sin decir cuál de
 * las tres consultas rebotó. Esto lo dice, y con el dato que hace falta
 * para arreglarlo: la colección, la regla implicada y el documento.
 */
const avisar = (que, e, extra = "") => {
  const codigo = e?.code || e?.message || String(e);
  console.error(`[chaindoc] ${que}${extra ? ` (${extra})` : ""} → ${codigo}`);
  if(String(codigo).includes("permission")){
    console.error(`[chaindoc]   lo rechazaron las reglas de Firestore, no el código. Colección: «${COL}». Modo: «${MODO}».`);
  }
  return e;
};

export const store = {
  async get(id){
    try{
      const s = await getDoc(doc(db, COL, id));
      if(!s.exists()) return null;
      try{
        return await conCadena(id, s.data());
      }catch(e){
        avisar("no se pudo leer la cadena del documento", e, id);
        return { ...s.data(), chain: s.data().chain || [] };
      }
    }catch(e){ avisar("no se pudo abrir el documento", e, id); return null; }
  },

  /** Sólo lo tuyo y lo que te compartieron: las reglas rechazan pedir la colección entera. */
  async list(uid, email){
    if(!uid) return [];
    const col = collection(db, COL);
    const correo = (email || "").toLowerCase();
    const unicos = new Map();

    // Las consultas van por separado a propósito: si una falla, se sabe
    // cuál y las demás siguen sirviendo. Media lista es mejor que ninguna.
    try{
      const own = await getDocs(query(col, where("ownerUid","==",uid)));
      own.docs.forEach((s) => unicos.set(s.id, s.data()));
    }catch(e){ avisar("no se pudieron listar TUS documentos", e, `ownerUid == ${uid}`); }

    if(correo){
      try{
        const shared = await getDocs(query(col, where("sharedWith","array-contains",correo)));
        shared.docs.forEach((s) => unicos.set(s.id, s.data()));
      }catch(e){ avisar("no se pudieron listar los documentos COMPARTIDOS contigo", e, `sharedWith contiene ${correo}`); }
    }

    const lista = [...unicos.values()];
    if(!enServidor()) return lista;

    // La lista del inicio necesita la cadena para contar bloques y firmas.
    return Promise.all(lista.map(async (x) => {
      try{ return { ...x, chain: await leerBloques(x.id) }; }
      catch(e){
        avisar("no se pudo leer la CADENA", e, `${x.id} · «${x.title || "sin título"}»`);
        return { ...x, chain: x.chain || [] };
      }
    }));
  },

  /** Escritura directa. En modo servidor sólo se usa para campos, nunca para la cadena. */
  async set(id, d){
    try{ await setDoc(doc(db, COL, id), sinUndefined(d)); return true; }
    catch(e){ console.error(e); return false; }
  },

  async del(id){
    try{
      if(enServidor()){ await llamar("borrarOperacion", { opId:id }); return true; }
      await deleteDoc(doc(db, COL, id));
      return true;
    }catch(e){ console.error(e); return false; }
  },
};

// ── ESCRITURA CON BLOQUE ──────────────────────────────────────

/**
 * Crea una operación con su bloque de apertura.
 * `evento` = { accion, contenido, meta }.
 */
export async function crear(datos, evento){
  try{
    if(enServidor()){
      const r = await llamar("crearOperacion", {
        datos: sinUndefined(soloEditables(datos)),
        evento: sinUndefined(evento),
      });
      return r.doc;
    }
    const g = await armarBloqueV2({
      previo: null, action: evento.accion, content: evento.contenido,
      author: datos.owner, autorUid: datos.ownerUid, meta: evento.meta ?? null,
    });
    const nd = { ...datos, chain:[g], lastModified:g.timestamp };
    return (await store.set(nd.id, nd)) ? nd : null;
  }catch(e){ console.error(e); return null; }
}

/**
 * Agrega un bloque a la operación y, en el mismo movimiento, guarda los
 * cambios de campos que lo acompañan. O pasan las dos cosas, o ninguna.
 *
 * Devuelve la operación actualizada, o null si falló.
 */
export async function aplicar(docActual, evento, cambios = {}, opciones = {}){
  try{
    const limpios = soloEditables(cambios);

    if(enServidor()){
      const r = await llamar("agregarBloque", {
        opId: docActual.id,
        evento: sinUndefined(evento),
        cambios: sinUndefined(limpios),
        tocarFecha: opciones.tocarFecha !== false,
      });
      return r.doc;
    }

    const cadena = docActual.chain || [];
    const b = await armarBloqueV2({
      previo: cadena[cadena.length - 1],
      action: evento.accion, content: evento.contenido,
      author: opciones.autor || docActual.owner, autorUid: opciones.autorUid || null,
      meta: evento.meta ?? null,
    });
    const up = {
      ...docActual, ...limpios,
      chain: [...cadena, b],
      ...(opciones.tocarFecha === false ? {} : { lastModified: b.timestamp }),
    };
    return (await store.set(up.id, up)) ? up : null;
  }catch(e){ console.error(e); return null; }
}

/** Cambia campos sin asentar nada en la cadena (carpeta, contraseña, importe anotado). */
export async function guardarCampos(docActual, cambios){
  try{
    const limpios = soloEditables(cambios);
    if(enServidor()){
      const r = await llamar("guardarCampos", { opId: docActual.id, cambios: sinUndefined(limpios) });
      return r.doc;
    }
    const up = { ...docActual, ...limpios };
    return (await store.set(up.id, up)) ? up : null;
  }catch(e){ console.error(e); return null; }
}

/**
 * Asienta que alguien abrió un documento compartido. En modo servidor lo
 * decide el servidor (una vez por persona y día), para que no dependa
 * de lo que diga el navegador.
 */
export async function registrarConsulta(docActual){
  try{
    if(enServidor()){
      const r = await llamar("registrarConsulta", { opId: docActual.id });
      return r.doc || docActual;
    }
    return null;   // en modo local lo decide App.jsx con debeRegistrarConsulta
  }catch(e){ console.error(e); return docActual; }
}
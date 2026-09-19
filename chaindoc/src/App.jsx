import { useState, useEffect } from "react";
import {
  doc, getDoc, setDoc, collection, getDocs, deleteDoc, query, where
} from "firebase/firestore";
import {
  extractFromFile, ocrImage, stripExtension,
  ACCEPTED_DOCS, ACCEPTED_IMAGES
} from "./fileImport";
import { db } from "./firebase";                                    // ← ACTUALIZADO
import {                                                            // ← NUEVO
  signUp, signIn, logOut, resetPassword,
  watchAuth, getProfile, saveProfile, authError,
  findUserByEmail, publishDirectory                            // ← NUEVO
} from "./auth";
import {                                                            // ← NUEVO
  bioAvailable, bioRegister, bioAssert, bioVerify, bioError,
  hexToBytes, deviceLabel
} from "./biometric";
import {                                                            // ← NUEVO
  analyzeContract, aiConfigured, hashFile, expedienteStatus, listModels,
  calcularMontos, montoDeDocumento, fmtMonto,
  archivosDe, aidDe, comprobadoDe,
  estadoVinculo, resumenVinculos,
  duplicados, duplicadosDe, panelExpedientes, dondeEstaAdjunto,
  claveDup, destinoDuplicado,
  estadoFases, faseActual,                                       // ← NUEVO
  debeRegistrarConsulta, resumenConsultas,
  nuevaSolicitud, solicitudesDe, misPendientes, misEsperas,
  cerrarSolicitudes                                              // ← NUEVO
} from "./smartContract";
import {                                                            // ← ACTUALIZADO
  uploadEvidence, deleteEvidence, openEvidence, storageError,
  isPreviewable, LIMITE_KB, makeThumb                             // ← ACTUALIZADO
} from "./storage";
import { descargarPaquete } from "./paquete";                      // ← NUEVO

// ← NUEVO: elimina la clave `archivo` del formato antiguo. Se quita la
// clave en vez de ponerla en undefined, que Firestore no admite.
const quitarArchivoViejo = (r)=>{ const resto={...r}; delete resto.archivo; return resto; };

// ← NUEVO: Firestore rechaza `undefined` (acepta `null`). Esto lo
// limpia antes de guardar, para que un campo olvidado no tumbe el
// guardado entero con «Unsupported field value: undefined».
function sinUndefined(v){
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

const store = {
  async get(id){ try{const s=await getDoc(doc(db,"documents",id));return s.exists()?s.data():null;}catch{return null;} },
  async set(id,d){ try{await setDoc(doc(db,"documents",id),sinUndefined(d));return true;}catch(e){console.error(e);return false;} },
  async del(id){ try{await deleteDoc(doc(db,"documents",id));return true;}catch{return false;} },

  // ← ACTUALIZADO: antes traía TODOS los documentos de la colección.
  // Ahora sólo los que son tuyos + los que te compartieron por correo.
  async list(uid, email){
    if(!uid) return [];
    try{
      const col = collection(db,"documents");
      const [own, shared] = await Promise.all([
        getDocs(query(col, where("ownerUid","==",uid))),
        email
          ? getDocs(query(col, where("sharedWith","array-contains",email.toLowerCase())))
          : Promise.resolve({docs:[]}),
      ]);
      const byId = new Map();
      [...own.docs, ...shared.docs].forEach(s=>byId.set(s.id, s.data()));
      return [...byId.values()];
    }catch(e){ console.error(e); return []; }
  },
};

// ── Crypto ────────────────────────────────────────────────────
const genId = () => Date.now().toString(36) + Math.random().toString(36).substr(2,8);
const genNumId = () => String(Math.floor(Math.random()*90000000000)+10000000000);

async function sha256(t){
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join("");
}

// ← ACTUALIZADO: los bloques admiten `meta`, un objeto con datos
// estructurados para que la línea de tiempo no tenga que adivinar
// leyendo el texto de `content`.
//
// ⚠️ `meta` queda FUERA del hash a propósito: incluirlo cambiaría la
// fórmula y todas las cadenas existentes dejarían de verificar. Se
// integrará al hash en el refactor de Capa 0, cuando las cadenas se
// reconstruyan de todos modos.
async function mineBlock(prev, action, content, author, meta){
  const ts = new Date().toISOString();
  const idx = prev ? prev.index+1 : 0;
  const prevHash = prev ? prev.hash : "0".repeat(64);
  const hash = await sha256(`${idx}|${ts}|${action}|${content}|${author}|${prevHash}`);
  const b = { index:idx, timestamp:ts, action, content, author, previousHash:prevHash, hash };
  if(meta) b.meta = meta;
  return b;
}

async function verifyChain(chain){
  for(let i=0;i<chain.length;i++){
    const b = chain[i];
    const exp = await sha256(`${b.index}|${b.timestamp}|${b.action}|${b.content}|${b.author}|${b.previousHash}`);
    if(exp!==b.hash) return {valid:false, failedAt:i};
    if(i>0 && b.previousHash!==chain[i-1].hash) return {valid:false, failedAt:i};
  }
  return {valid:true};
}

// ── Helpers ───────────────────────────────────────────────────
const fmtFull  = iso => new Date(iso).toLocaleString("es-MX",{day:"numeric",month:"long",year:"numeric",hour:"numeric",minute:"2-digit",hour12:true});
const fmtDia   = ymd => {
  const hoy = new Date().toISOString().slice(0,10);
  const ayer = new Date(Date.now()-86400000).toISOString().slice(0,10);
  if(ymd===hoy)  return "Hoy";
  if(ymd===ayer) return "Ayer";
  return new Date(ymd+"T12:00:00").toLocaleDateString("es-MX",
    {weekday:"long",day:"numeric",month:"long",year:"numeric"});
};
// ← NUEVO: fecha corta ("23 sep"; con año si no es el actual)
const fmtFecha = ymd => {
  if(!ymd) return "—";
  const f = new Date(ymd+"T12:00:00");
  const mismoAnio = f.getFullYear()===new Date().getFullYear();
  return f.toLocaleDateString("es-MX",{day:"numeric",month:"short",...(mismoAnio?{}:{year:"numeric"})});
};
const fmtHora  = iso => new Date(iso).toLocaleTimeString("es-MX",{hour:"numeric",minute:"2-digit",hour12:true});
const fmtShort = iso => new Date(iso).toLocaleDateString("es-MX",{day:"numeric",month:"short",year:"numeric"});

const getUrlDoc = () => new URLSearchParams(window.location.search).get("doc") || null;
const setUrlDoc = id => {
  const u = new URL(window.location.href);
  if(id) u.searchParams.set("doc",id); else u.searchParams.delete("doc");
  window.history.replaceState({},"",u.toString());
};

// ── CSS ───────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

:root{
  --negro:#252223; --gris-400:#5b5456; --gris-300:#7b7b7b; --gris-200:#ada6a8;
  --bordes:#cac6c7; --gris-100:#e8e4e5; --rojo:#df2531; --rojo-soft:#fef2f2;
  --blanco:#fff; --bg-soft:#fafafa; --verde:#16a34a;
  --sh-sm:0px 0px 2px rgba(0,0,0,.04),0px 2px 4px rgba(0,0,0,.06);
  --sh:0px 0px 4px rgba(0,0,0,.04),0px 8px 16px rgba(0,0,0,.08);
  --sh-card:0px 0px 6px rgba(0,0,0,.04),0px 6px 12px rgba(0,0,0,.06);
  --f-t:'Inter',sans-serif; --f-p:'IBM Plex Sans',sans-serif;
}

html{-webkit-text-size-adjust:100%}
body{background:var(--blanco);color:var(--negro);font-family:var(--f-p);min-height:100vh;overflow-x:hidden}
input,textarea,button,select{font-size:16px}
img,svg{max-width:100%}

/* ── BOTONES ── */
.btn{font-family:var(--f-p);font-weight:500;cursor:pointer;transition:all .15s;white-space:nowrap;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;gap:8px}
.btn-primary{background:var(--negro);color:#fff;border:none;padding:13px 24px;font-size:16px;border-radius:8px;box-shadow:var(--sh-sm)}
.btn-primary:hover{opacity:.85}
.btn-secondary{background:#fff;color:var(--negro);border:2.5px solid var(--negro);padding:11px 20px;font-size:16px}
.btn-secondary:hover{background:var(--negro);color:#fff}
.btn-secondary.on{background:var(--negro);color:#fff}
.btn-warning{background:var(--rojo);color:#fff;border:none;padding:13px 24px;font-size:16px;border-radius:8px;box-shadow:var(--sh-sm)}
.btn-warning:hover{opacity:.88}
.btn-tertiary{background:none;border:none;color:var(--gris-400);font-family:var(--f-p);font-weight:500;font-size:15px;cursor:pointer;text-decoration:underline;padding:4px}
.btn-tertiary:hover{color:var(--negro)}

/* ── LOADING ── */
.loading{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:16px}
.spin{width:36px;height:36px;border:2px solid var(--bordes);border-top-color:var(--negro);border-radius:50%;animation:sp .7s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}
.loading p{font-size:14px;color:var(--gris-200)}

/* ── NOTIF ── */
.notif{position:fixed;top:20px;right:20px;z-index:9999;padding:13px 22px;border-radius:8px;font-size:14px;font-weight:600;box-shadow:var(--sh);animation:nIn .2s ease;background:#fff}
.notif.ok{border:1.5px solid var(--verde);color:var(--verde)}
.notif.err{border:1.5px solid var(--rojo);color:var(--rojo)}
@keyframes nIn{from{transform:translateY(-8px);opacity:0}to{transform:none;opacity:1}}

/* ── AUTH ── */
.auth-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.auth-card{width:583px;max-width:100%;background:#fff;border:2px solid var(--bordes);border-radius:16px;box-shadow:var(--sh);padding:24px}
.auth-title{font-family:var(--f-t);font-weight:600;font-size:32px;text-align:center;margin-bottom:8px}
.auth-sub{font-size:15px;color:var(--gris-300);text-align:center;margin-bottom:28px;line-height:1.6}
.inp{width:100%;border:2px solid var(--bordes);border-radius:12px;padding:16px 20px;font-family:var(--f-p);font-size:16px;outline:none;transition:border-color .15s;color:var(--negro);background:#fff;margin-bottom:16px}
.inp:focus{border-color:var(--negro)}
.inp::placeholder{color:var(--gris-200)}
.auth-actions{display:flex;gap:16px;align-items:center;justify-content:center;margin-top:8px;flex-wrap:wrap}
.fingerprint{width:72px;height:72px;margin:24px auto 0;border:2.5px solid var(--negro);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:32px;cursor:pointer;transition:all .15s}
.fingerprint:hover{background:var(--negro);color:#fff}
.dots{display:flex;gap:12px;justify-content:center;margin-top:24px}
.dot{width:14px;height:14px;border-radius:50%;background:var(--bordes)}
.dot.on{background:var(--negro)}

/* ── NAVBAR ── */
.nav{position:sticky;top:0;z-index:50;background:#fff;display:flex;align-items:center;justify-content:space-between;padding:24px 40px;gap:20px;border-bottom:1.5px solid var(--gris-100)}
.nav-title{font-family:var(--f-t);font-weight:600;font-size:34px;white-space:nowrap}
.nav-id{font-family:var(--f-t);font-weight:600;font-size:22px;display:flex;align-items:center;gap:10px}
.nav-id span.num{color:var(--gris-300)}
.nav-actions{display:flex;align-items:center;gap:14px;flex-wrap:wrap;justify-content:flex-end}
.icon-btn{background:none;border:none;cursor:pointer;font-size:26px;padding:6px;line-height:1;color:var(--negro);transition:opacity .15s}
.icon-btn:hover{opacity:.6}
.hamburger{width:44px;height:44px;background:none;border:none;cursor:pointer;display:flex;flex-direction:column;gap:7px;align-items:center;justify-content:center}
.hamburger span{display:block;width:30px;height:3px;background:var(--negro);border-radius:2px}

/* ── SECTIONS ── */
.page{max-width:1512px;margin:0 auto;padding:0 40px 60px}
.page-title{font-family:var(--f-t);font-weight:600;font-size:38px;margin:24px 0 20px}
.sec-h{display:flex;align-items:center;gap:8px;margin:28px 0 16px;cursor:pointer;user-select:none}
.sec-arrow{font-size:22px;color:var(--gris-200);transition:transform .2s;display:inline-block}
.sec-arrow.closed{transform:rotate(-90deg)}
.sec-t{font-family:var(--f-t);font-weight:500;font-size:28px;color:var(--gris-200)}

/* ── FOLDERS ── */
.folders{display:flex;gap:24px;flex-wrap:wrap}
.folder{display:flex;align-items:center;gap:8px;padding:14px 18px;border:2px solid var(--bordes);border-radius:16px;background:#fff;cursor:pointer;transition:all .15s;position:relative}
.folder:hover{border-color:var(--negro);box-shadow:var(--sh-sm)}
.folder-n{font-family:var(--f-p);font-weight:500;font-size:18px}
.folder.dashed{border-style:dashed;color:var(--gris-200)}
.folder.dashed:hover{color:var(--negro)}

/* ── DOC CARDS ── */
.cards{display:flex;flex-wrap:wrap;gap:24px}
.card{background:#fff;border:2px solid var(--bordes);border-radius:16px;padding:16px;width:262px;box-shadow:var(--sh-sm);cursor:pointer;transition:all .15s;display:flex;flex-direction:column;gap:14px;position:relative}
.card:hover{border-color:var(--negro);transform:translateY(-2px);box-shadow:var(--sh)}
.card-h{display:flex;justify-content:space-between;align-items:center;gap:8px}
.card-t{font-family:var(--f-t);font-weight:500;font-size:20px;color:var(--gris-300);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card-prev{height:136px;background:var(--bg-soft);border:1px solid var(--gris-100);border-radius:6px;padding:10px 12px;font-size:10px;color:var(--gris-300);line-height:1.7;overflow:hidden}
.card-meta{font-size:15px;color:var(--gris-200)}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{font-size:11px;padding:3px 10px;border-radius:20px;font-weight:600}
.chip-b{background:#f0fdf4;color:var(--verde);border:1px solid #bbf7d0}
.chip-s{background:#fffbeb;color:#d97706;border:1px solid #fde68a}
.chip-f{background:#f5f3ff;color:#7c3aed;border:1px solid #ddd6fe}
.chip-l{background:#f1f5f9;color:#475569;border:1px solid #cbd5e1}

/* dropdown */
.drop{position:absolute;top:52px;right:8px;z-index:100;background:#fff;border:2px solid var(--bordes);border-radius:12px;box-shadow:var(--sh);min-width:180px;overflow:hidden}
.drop button{display:block;width:100%;padding:13px 18px;font-family:var(--f-p);font-size:15px;font-weight:500;text-align:left;background:none;border:none;cursor:pointer;color:var(--negro);transition:background .1s}
.drop button:hover{background:var(--bg-soft)}
.drop button.danger{color:var(--rojo)}

/* ── CREATE BTN ── */
.create-zone{display:flex;justify-content:center;padding:47px 0}
.create-btn{background:#fff;border:1.5px solid var(--bordes);border-radius:12px;padding:12px 24px;box-shadow:var(--sh-sm);cursor:pointer;font-family:var(--f-p);font-size:20px;color:var(--negro);display:flex;flex-direction:column;align-items:center;gap:6px;transition:all .15s;min-width:180px}
.create-btn:hover{border-color:var(--negro);box-shadow:var(--sh);transform:translateY(-1px)}
.create-btn b{font-size:24px;line-height:1}

.empty{text-align:center;padding:50px 20px;color:var(--gris-200);font-size:16px;line-height:1.8}

/* ── DOC VIEW ── */
.doc-title-bar{display:flex;align-items:center;justify-content:center;padding:8px 0 20px}
.doc-title{font-family:var(--f-t);font-weight:600;font-size:34px;color:var(--gris-400);text-align:center;border:none;outline:none;background:transparent;font-family:var(--f-t);max-width:900px;width:100%;text-align:center}
.doc-title::placeholder{color:var(--gris-200)}
.paper{background:#fff;border:2px solid var(--bordes);border-radius:12px;box-shadow:var(--sh);min-height:600px;padding:40px 48px;margin-bottom:24px}
.paper-ta{width:100%;min-height:540px;border:none;outline:none;background:transparent;font-family:var(--f-p);font-size:19px;line-height:1.9;color:var(--negro);resize:none;caret-color:var(--negro)}
.paper-ta::placeholder{color:var(--gris-200)}
.paper-ro{font-family:var(--f-p);font-size:19px;line-height:1.9;color:var(--negro);white-space:pre-wrap;min-height:540px}
.paper-ro.empty-txt{color:var(--gris-200);font-style:italic}

/* verify */
.vban{padding:14px 20px;border-radius:12px;font-size:15px;font-weight:600;margin-bottom:20px;animation:fUp .3s ease}
.vban.ok{background:#f0fdf4;border:2px solid #86efac;color:var(--verde)}
.vban.bad{background:var(--rojo-soft);border:2px solid #fca5a5;color:var(--rojo)}
@keyframes fUp{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}

/* ── SIGN BAR ── */
.sign-bar{display:flex;gap:64px;align-items:flex-end;justify-content:center;flex-wrap:wrap;padding:20px 0 40px}
.sign-group{display:flex;gap:6px;align-items:center;padding:8px 4px}
.fp-btn{width:50px;height:50px;border:2px solid var(--negro);border-radius:50%;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:22px;transition:all .15s}
.fp-btn:hover{background:var(--negro);color:#fff}
.sign-slot{border-top:2px solid var(--bordes);padding:8px 4px;min-width:280px;text-align:center}
.sign-slot p{font-family:var(--f-p);font-weight:500;font-size:22px;color:var(--gris-300)}
.sign-done{border-top:2px solid var(--negro)}
.sign-done p{color:var(--negro)}
/* ← NUEVO: sello de firma */
.sign-slot.con-sello{border-top:none;padding-top:0}
.sello{display:block;margin:0 auto 2px;max-height:88px;max-width:230px;
  object-fit:contain;user-select:none;-webkit-user-drag:none}
@media(max-width:760px){ .sello{max-height:66px;max-width:170px} }
.sign-mark{font-family:'Inter',cursive;font-size:30px;font-style:italic;color:var(--negro);margin-bottom:4px}

/* ── MODAL ── */
.ov{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.4);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:20px;animation:fO .2s ease}
@keyframes fO{from{opacity:0}to{opacity:1}}
.modal{background:#fff;border-radius:16px;padding:24px;width:583px;max-width:100%;box-shadow:0 20px 60px rgba(0,0,0,.2);animation:sU .25s ease;max-height:90vh;overflow-y:auto}
.modal.wide{width:766px}
@keyframes sU{from{transform:translateY(12px);opacity:0}to{transform:none;opacity:1}}
.modal h2{font-family:var(--f-t);font-size:24px;font-weight:600;margin-bottom:8px}
.modal .sub{font-size:15px;color:var(--gris-300);margin-bottom:24px;line-height:1.6}
.modal-row{display:flex;gap:16px;margin-top:24px;justify-content:center;flex-wrap:wrap}

/* template grid */
.tpl-grid{display:flex;flex-wrap:wrap;gap:18px;justify-content:center;margin:8px 0}
.tpl{width:141px;height:159px;border:2px solid var(--bordes);border-radius:16px;background:#fff;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;transition:all .15s;box-shadow:var(--sh-sm)}
.tpl:hover{border-color:var(--negro);transform:translateY(-2px);box-shadow:var(--sh)}
.tpl.sel{border-color:var(--negro);background:var(--bg-soft)}
.tpl-ico{font-size:40px}
.tpl-n{font-family:var(--f-p);font-weight:500;font-size:16px;color:var(--negro)}

/* folder pills */
.pills{display:flex;flex-wrap:wrap;gap:10px;margin:8px 0 0}
.pill{padding:9px 18px;border:2px solid var(--bordes);border-radius:20px;font-family:var(--f-p);font-size:15px;cursor:pointer;transition:all .15s;background:#fff;color:var(--negro)}
.pill.sel{background:var(--negro);color:#fff;border-color:var(--negro)}
.pill:hover:not(.sel){border-color:var(--negro)}

/* contacts */
.contacts{display:flex;flex-direction:column;gap:8px;margin-top:14px}
.contact{display:flex;align-items:center;gap:12px;padding:12px 16px;border:2px solid var(--bordes);border-radius:12px;cursor:pointer;background:#fff;transition:all .15s}
.contact:hover{border-color:var(--negro)}
.contact.sel{border-color:var(--negro);background:var(--bg-soft)}
.avatar{width:32px;height:32px;border-radius:50%;background:var(--negro);color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;flex-shrink:0}
.contact-n{font-family:var(--f-p);font-size:16px;font-weight:500}
.rec-lbl{font-size:14px;color:var(--gris-300);margin:16px 0 6px}

/* ── HISTORY PANEL ── */
.hist-ov{position:fixed;inset:0;z-index:150;background:rgba(0,0,0,.4);backdrop-filter:blur(2px);display:flex;justify-content:flex-end;animation:fO .2s ease}
.hist{background:#fff;width:756px;max-width:100%;height:100%;display:flex;flex-direction:column;padding:40px 48px;overflow-y:auto;animation:slR .25s ease;gap:24px;align-items:center}
@keyframes slR{from{transform:translateX(100%)}to{transform:none}}
.hist-title{font-family:var(--f-p);font-weight:700;font-size:42px;color:var(--gris-300);text-align:center;width:100%}
.tabs{display:flex;gap:24px;align-items:center;justify-content:center}
.tab{font-family:var(--f-p);font-weight:500;font-size:26px;color:var(--gris-300);background:none;border:none;cursor:pointer;padding:0 0 8px;border-bottom:3px solid transparent;transition:all .15s}
.tab.on{color:var(--negro);border-bottom-color:var(--negro)}
.hist-list{display:flex;flex-direction:column;gap:24px;align-items:center;width:100%;flex:1}
.hcard{background:#fff;border:3px solid var(--bordes);border-radius:12px;padding:24px;width:327px;display:flex;flex-direction:column;gap:6px;box-shadow:0px 0px 2px rgba(0,0,0,.04),0px 8px 8px rgba(0,0,0,.08)}
.hcard-a{font-family:var(--f-p);font-weight:500;font-size:22px;color:var(--gris-300)}
.hcard-d{font-family:var(--f-p);font-size:20px;color:var(--gris-300)}
.hcard-box{border:1.5px solid var(--bordes);border-radius:12px;padding:12px;box-shadow:var(--sh-card);font-size:17px;color:var(--gris-300);line-height:1.4}
.hcard-eye{display:flex;align-items:center;gap:4px;background:none;border:none;cursor:pointer;padding:4px 0;font-family:var(--f-p);font-weight:500;font-size:16px;color:var(--gris-400);transition:color .15s}
.hcard-eye:hover{color:var(--negro)}
.hashes{background:var(--bg-soft);border-radius:8px;padding:10px 12px;margin-top:6px;display:flex;flex-direction:column;gap:8px}
.h-l{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--gris-200);margin-bottom:3px}
.h-v{font-family:monospace;font-size:10px;word-break:break-all;line-height:1.5}
.h-v.cur{color:var(--verde)}
.h-v.prv{color:#3b82f6}

/* ── SIDE MENU ── */
.menu-ov{position:fixed;inset:0;z-index:150;background:rgba(0,0,0,.4);backdrop-filter:blur(2px);display:flex;justify-content:flex-end;animation:fO .2s ease}
.menu{background:#fff;width:386px;max-width:100%;height:100%;padding:24px 56px;display:flex;flex-direction:column;align-items:center;gap:24px;animation:slR .25s ease}
.menu-av{width:72px;height:72px;border-radius:50%;border:2.5px solid var(--negro);display:flex;align-items:center;justify-content:center;font-size:30px;margin-top:24px}
/* ← NUEVO: base de Material Symbols. El texto del span es el
   nombre del icono; la ligadura de la fuente lo convierte en glifo. */
.msym{font-family:'Material Symbols Rounded';font-weight:normal;font-style:normal;
  line-height:1;letter-spacing:normal;text-transform:none;display:inline-flex;
  align-items:center;justify-content:center;white-space:nowrap;word-wrap:normal;
  direction:ltr;flex:0 0 auto;overflow:hidden;
  font-feature-settings:'liga';-webkit-font-smoothing:antialiased;user-select:none}

/* ← NUEVO: solicitudes de evidencia */
.pv.pend{border-color:rgba(202,138,4,.4);background:rgba(202,138,4,.04)}
.sol-row{display:flex;align-items:flex-start;gap:9px;background:rgba(202,138,4,.09);
  color:#a16207;border-radius:9px;padding:9px 11px;margin-top:8px;font-size:13px}
.sol-b{flex:1;min-width:0}
.sol-t{font-weight:600}
.sol-m{color:var(--gris-400);margin-top:2px;line-height:1.4}
.sol-d{color:var(--gris-300);font-size:12px;margin-top:2px}
.exp-acts{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}
.exp-acts .exp-up{margin-top:0}
.como-btn{font-family:var(--f-p);font-size:14px;background:none}
.tono-solicitud .tl-punto{background:rgba(202,138,4,.16);color:#a16207}

/* ← NUEVO: navegación desde avisos de duplicado */
.dup-lugares{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}
.dup-lugar{font-family:var(--f-p);font-size:12px;font-weight:600;border:1px solid rgba(194,65,12,.35);
  background:#fff;color:#c2410c;border-radius:99px;padding:5px 11px;cursor:pointer;
  text-align:left;max-width:100%;overflow-wrap:anywhere;line-height:1.3}
.dup-lugar:hover{background:rgba(194,65,12,.08)}
.dup-lugar.aqui{border-style:dashed;color:var(--gris-400);border-color:var(--bordes)}
span.dup-lugar.aqui{cursor:default}
.dup-foco-banner{border:2px solid #c2410c;background:rgba(194,65,12,.06);border-radius:14px;
  padding:14px 16px;margin-bottom:16px;color:#c2410c;animation:dupIn .35s ease}
.dup-foco-h{display:flex;align-items:center;gap:9px}
.dup-foco-h strong{flex:1;font-size:15px;line-height:1.35}
.dup-foco-banner p{color:var(--gris-400);font-size:14px;line-height:1.5;margin:8px 0 2px}
.dup-tag-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:6px 0 2px}
.dup-tag{font-size:11px;font-weight:700;background:rgba(194,65,12,.12);color:#c2410c;
  border-radius:6px;padding:3px 8px;text-transform:uppercase;letter-spacing:.3px}
.exp-file.es-dup{border-color:rgba(194,65,12,.4)}
.exp-file.dup-foco{border:2px solid #c2410c;box-shadow:0 0 0 4px rgba(194,65,12,.12);
  animation:dupPulso 1.6s ease 2}
@keyframes dupIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
@keyframes dupPulso{0%,100%{box-shadow:0 0 0 4px rgba(194,65,12,.12)}50%{box-shadow:0 0 0 9px rgba(194,65,12,.05)}}
.pv-ir{font-size:12px;font-weight:600;color:#9333ea;margin-top:4px}
.adjunto-en{max-width:860px;margin:0 auto 18px;border:1px solid var(--bordes);border-radius:14px;
  padding:13px 16px;text-align:left}
.adjunto-en.grave{border-color:rgba(194,65,12,.45);background:rgba(194,65,12,.05)}
.adjunto-en-h{display:flex;align-items:center;gap:8px;color:var(--gris-400)}
.adjunto-en.grave .adjunto-en-h{color:#c2410c}
.adjunto-en p{font-size:13px;color:var(--gris-400);margin:5px 0 0}

/* ← NUEVO: fases del contrato */
.fases{border:1px solid var(--bordes);border-radius:14px;padding:14px 16px;margin-bottom:16px;text-align:left}
.fases-h{display:flex;align-items:center;gap:9px;margin-bottom:12px}
.fases-t{font-weight:600;font-size:15px;color:var(--negro);flex:1}
.fases-lista{display:flex;gap:10px;overflow-x:auto;padding-bottom:4px}
.fase{flex:1 1 0;min-width:150px;display:flex;gap:10px;align-items:flex-start;text-align:left;
  font-family:var(--f-p);background:#fff;border:1px solid var(--bordes);border-radius:12px;
  padding:11px 12px;cursor:pointer;position:relative;transition:border-color .15s,box-shadow .15s}
.fase:hover{border-color:var(--gris-300)}
.fase.actual{border:2px solid var(--negro);padding:10px 11px}
.fase.sel{box-shadow:0 0 0 3px rgba(99,102,241,.25);border-color:#4f46e5}
.fase.cumplida{background:rgba(20,130,90,.05);border-color:rgba(20,130,90,.35)}
.fase.vencida{background:rgba(194,65,12,.05);border-color:rgba(194,65,12,.45)}
.fase-num{flex:0 0 24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  font-size:12px;font-weight:700;background:var(--gris-100,#f3f3f5);color:var(--gris-400)}
.fase.actual .fase-num{background:var(--negro);color:#fff}
.fase.cumplida .fase-num{background:#14825a;color:#fff}
.fase.vencida .fase-num{background:#c2410c;color:#fff}
.fase-b{display:flex;flex-direction:column;gap:2px;min-width:0}
.fase-t{font-weight:600;font-size:14px;color:var(--negro);line-height:1.3;overflow-wrap:anywhere}
.fase-m{font-size:12px;color:var(--gris-300)}
.fase-cont{font-size:12px;font-weight:600;margin-top:3px;color:var(--gris-400)}
.fase-cont.cumplida{color:#14825a}
.fase-cont.vencida{color:#c2410c}
.fase.actual .fase-cont.pendiente{color:var(--negro)}
.fase-aviso{font-size:11px;color:#a16207;margin-top:2px}
.fases-filtro{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;
  margin-top:10px;font-size:13px;color:#4f46e5;background:rgba(99,102,241,.07);
  border-radius:9px;padding:6px 6px 6px 11px}
.exp-hito{font-weight:600;color:var(--negro)}
.exp-hito.mal{color:#c2410c}
.tag.t-fase{background:rgba(99,102,241,.1);color:#4f46e5}
.tag.t-fase.mal{background:rgba(194,65,12,.12);color:#c2410c}
.pv-fase{font-size:12px;font-weight:600;color:#4f46e5;margin-top:3px}
.rev-fases{display:flex;flex-direction:column;gap:6px;margin-bottom:16px}
.rev-fase{display:flex;align-items:center;gap:10px;border:1px solid var(--bordes);border-radius:10px;padding:8px 10px}
.rev-fase-b{flex:1;min-width:0}
.rev-fase-t{font-weight:600;font-size:14px;color:var(--negro)}
.rev-fase-m{font-size:12px;color:var(--gris-300)}
@media(max-width:768px){
  /* En teléfono, las fases se apilan: una fila horizontal obligaría a deslizar */
  .fases{padding:12px}
  .fases-lista{flex-direction:column;overflow:visible}
  .fase{min-width:0;width:100%}
}

/* ← NUEVO: bloqueo de comprobante ya adjunto */
.bloqueo{border:2px solid #c2410c;background:rgba(194,65,12,.06);border-radius:13px;
  padding:13px 15px;margin-bottom:16px;text-align:left}
.bloqueo-h{display:flex;align-items:center;gap:9px;color:#c2410c}
.bloqueo-h strong{font-size:15px;line-height:1.35}
.bloqueo p{font-size:14px;color:var(--gris-400);line-height:1.5;margin:7px 0 2px}
.link-row.bloqueado{opacity:.45;cursor:not-allowed}
.link-row.bloqueado:hover{border-color:var(--bordes);background:none}
.chip-bloq{background:rgba(0,0,0,.06);color:var(--gris-400);font-weight:600;white-space:nowrap}

/* ← NUEVO: oferta de convertir a contrato inteligente */
.convertir{max-width:860px;margin:0 auto 18px;display:flex;align-items:center;gap:16px;
  justify-content:space-between;border:1px solid rgba(99,102,241,.35);
  background:rgba(99,102,241,.06);border-radius:14px;padding:14px 16px;text-align:left}
.convertir-b{display:flex;gap:11px;align-items:flex-start;color:#4f46e5;min-width:0}
.convertir-b strong{display:block;color:var(--negro);font-size:15px}
.convertir-b span{display:block;font-size:13px;color:var(--gris-400);line-height:1.45;margin-top:2px}
.convertir .btn{flex:0 0 auto;white-space:nowrap}
@media(max-width:768px){
  .convertir{flex-direction:column;align-items:stretch;margin:0 0 14px}
  .convertir .btn{width:100%;white-space:normal}
}

/* ← NUEVO: fila final de acciones del documento */
.acc-final{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;padding-bottom:40px}

/* ← NUEVO: ajustes móviles */
html{overflow-x:clip}                 /* red de seguridad: sin arrastre lateral */
@media(max-width:768px){
  /* El menú ☰ quedaba al final de la fila deslizable, fuera de pantalla.
     Ahora se fija arriba a la derecha, junto al título. */
  .nav{padding-right:62px}
  .nav .hamburger{position:absolute;top:12px;right:14px}
  .acc-final{display:grid;grid-template-columns:1fr 1fr;padding:0 16px 32px}
  .acc-final .btn{width:100%;justify-content:center;display:inline-flex;align-items:center;gap:6px}
  .acc-final .btn-primary{grid-column:1 / -1}
  .galeria{margin:18px 0 0}
  .adjunto-en{margin:0 0 14px}
  .dup-foco-banner{padding:12px 13px}
  .modal{padding:20px 16px}
  .modal-row{flex-wrap:wrap}
  .link-list{max-height:55vh}
}

/* ← NUEVO: panel de vencimientos */
.pv{border:1px solid var(--bordes);border-radius:16px;padding:16px 18px;margin-bottom:26px;text-align:left}
.pv-h{display:flex;align-items:center;gap:9px;margin-bottom:12px;color:var(--negro)}
.pv-titulo{font-family:var(--f-t);font-weight:600;font-size:19px;flex:1}
.pv-row{display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:10px;
  cursor:pointer;transition:background .15s;border:1px solid transparent}
.pv-row:hover{background:rgba(0,0,0,.03);border-color:var(--bordes)}
.pv-row.dup{cursor:default}
.pv-row.dup:hover{background:none;border-color:transparent}
.pv-b{flex:1;min-width:0}
.pv-t{font-weight:600;font-size:15px;color:var(--negro);white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis}
.pv-m{font-size:12px;color:var(--gris-300);margin-top:2px}
.pv-chip{font-size:12px;font-weight:600;padding:4px 10px;border-radius:99px;
  white-space:nowrap;flex:0 0 auto;background:var(--gris-100,#f3f3f5);color:var(--gris-400)}
.pv-chip.vencido{background:rgba(194,65,12,.12);color:#c2410c}
.pv-chip.urgente{background:rgba(202,138,4,.14);color:#a16207}
.pv-chip.quieto{background:rgba(0,0,0,.05);color:var(--gris-400)}
.pv-chip.dup{background:rgba(147,51,234,.12);color:#9333ea}
.pv-pie{font-size:12px;color:var(--gris-300);margin-top:10px;padding-top:9px;
  border-top:1px solid var(--bordes)}
.dup-linea{font-size:13px;color:var(--gris-400);font-weight:400;margin-top:5px;line-height:1.45}
.dup-grave{color:#c2410c;font-weight:600}

/* ← NUEVO: bitácora de consultas */
.cons{padding:12px 0 4px}
.cons-row{display:flex;align-items:center;gap:11px;padding:9px 0;border-bottom:1px solid var(--bordes)}
.cons-row:last-of-type{border-bottom:none}
.cons-b{flex:1;min-width:0}
.cons-n{font-weight:600;font-size:15px;color:var(--negro)}
.cons-m{font-size:12px;color:var(--gris-300);overflow-wrap:anywhere}
.cons-d{font-size:12px;color:var(--gris-300);text-align:right;flex:0 0 auto}
.cons-v{color:var(--gris-400);margin-top:1px}
.cons-nota{font-size:12px;color:var(--gris-300);font-style:italic;margin-top:10px}
.tono-consulta .tl-punto{background:rgba(120,113,108,.14);color:#78716c}
@media(max-width:760px){
  .pv{padding:14px;margin-bottom:20px}
  .pv-row{gap:8px;padding:9px 8px}
  .pv-chip{font-size:11px;padding:3px 8px}
  .cons-d{font-size:11px}
}

/* ← NUEVO: integridad de los documentos vinculados */
.vin{display:flex;align-items:flex-start;gap:7px;font-size:13px;line-height:1.4;
  border-radius:8px;padding:7px 10px;margin:8px 0 2px}
.vin-vigente{background:rgba(20,130,90,.09);color:#14825a}
.vin-ampliado{background:rgba(14,116,144,.1);color:#0e7490}
.vin-alterado{background:rgba(194,65,12,.12);color:#c2410c;font-weight:500}
.vin-faltante,.vin-sinHuella{background:rgba(0,0,0,.05);color:var(--gris-400)}
.vin-cargando{background:rgba(0,0,0,.03);color:var(--gris-300);align-items:center}
.exp-file.vin-malo{border-color:rgba(194,65,12,.5);background:rgba(194,65,12,.03)}
.vin-alerta{display:flex;align-items:flex-start;gap:11px;border:1px solid rgba(194,65,12,.45);
  background:rgba(194,65,12,.07);color:#c2410c;border-radius:12px;padding:13px 15px;
  margin-bottom:16px;font-size:14px;line-height:1.45}
.vin-alerta-s{color:var(--gris-400);font-weight:400;margin-top:3px}
.vin-nota{display:flex;align-items:center;gap:9px;background:rgba(14,116,144,.08);
  color:#0e7490;border-radius:10px;padding:10px 13px;margin-bottom:16px;
  font-size:13px;line-height:1.45}

/* ← NUEVO: contador de montos del expediente */
.mnt{border:1px solid var(--bordes);border-radius:14px;padding:16px 18px;margin-bottom:18px}
.mnt.excedido{border-color:rgba(194,65,12,.45);background:rgba(194,65,12,.04)}
.mnt-fila{display:flex;gap:22px;flex-wrap:wrap;margin-bottom:12px}
.mnt-dato{display:flex;flex-direction:column;gap:2px;min-width:130px}
.mnt-lbl{font-size:12px;color:var(--gris-300);text-transform:uppercase;letter-spacing:.4px}
.mnt-val{font-size:19px;font-weight:600;color:var(--negro);font-variant-numeric:tabular-nums}
.mnt-val.fuerte{color:#14825a}
.mnt-val.malo{color:#c2410c}
.mnt-bar{height:8px;border-radius:99px;background:var(--gris-100,#ececed);overflow:hidden}
.mnt-fill{height:100%;background:#14825a;border-radius:99px;transition:width .35s}
.mnt.excedido .mnt-fill{background:#c2410c}
.mnt-pie{font-size:13px;color:var(--gris-300);margin-top:7px}
.mnt-aviso{font-size:13px;color:var(--gris-400);background:rgba(0,0,0,.03);
  border-radius:8px;padding:8px 11px;margin-top:9px;line-height:1.45}
.mnt-aviso.malo{background:rgba(194,65,12,.1);color:#c2410c;font-weight:500}
.exp-monto{display:flex;align-items:center;gap:8px;margin:8px 0;flex-wrap:wrap}
.exp-monto-in{width:120px;border:1px solid var(--bordes);border-radius:8px;padding:6px 10px;
  font-family:var(--f-p);font-size:14px;color:var(--negro);outline:none;
  font-variant-numeric:tabular-nums;background:#fff}
.exp-monto-in:focus{border-color:var(--negro)}
@media(max-width:760px){
  .mnt-fila{gap:14px}
  .mnt-dato{min-width:104px}
  .mnt-val{font-size:17px}
}

.req-avance{display:inline-block;font-size:13px;font-weight:500;color:var(--gris-400);
  background:rgba(0,0,0,.04);border-radius:8px;padding:5px 10px;margin:8px 0 2px;
  font-variant-numeric:tabular-nums}
.req-avance.listo{background:rgba(20,130,90,.12);color:#14825a}
.req-avance.sobre{background:rgba(194,65,12,.12);color:#c2410c}

/* ← NUEVO: línea de tiempo de la operación */
.tl-wrap summary{font-weight:600;color:var(--negro)}
.tl{padding:16px 0 4px}
.tl-vacio{font-size:14px;color:var(--gris-300);font-style:italic;padding:12px 0}
.tl-dia{margin-bottom:6px}
.tl-fecha{font-size:12px;font-weight:600;color:var(--gris-300);text-transform:uppercase;
  letter-spacing:.5px;margin:14px 0 8px;padding-left:38px}
.tl-item{display:flex;gap:14px;align-items:stretch}
.tl-linea{position:relative;width:26px;flex:0 0 26px;display:flex;justify-content:center}
.tl-linea::before{content:"";position:absolute;top:0;bottom:0;width:2px;background:var(--bordes)}
.tl-item:last-child .tl-linea::before{bottom:auto;height:26px}
.tl-punto{position:relative;z-index:1;width:26px;height:26px;border-radius:50%;
  display:flex;align-items:center;justify-content:center;background:var(--gris-100,#f3f3f5);
  color:var(--gris-400);flex:0 0 auto}
.tl-cuerpo{flex:1;min-width:0;padding:0 0 18px}
.tl-titulo{font-weight:600;font-size:15px;color:var(--negro);line-height:1.3}
.tl-detalle{font-size:14px;color:var(--gris-400);margin-top:2px;line-height:1.45;word-break:break-word}
.tl-pie{font-size:12px;color:var(--gris-300);margin-top:4px}
.tono-inicio    .tl-punto{background:rgba(99,102,241,.14);color:#4f46e5}
.tono-firma     .tl-punto{background:rgba(20,130,90,.14);color:#14825a}
.tono-evidencia .tl-punto{background:rgba(234,88,12,.14);color:#c2410c}
.tono-comparte  .tl-punto{background:rgba(14,116,144,.14);color:#0e7490}
.tono-vinculo   .tl-punto{background:rgba(147,51,234,.14);color:#9333ea}
@media(max-width:760px){
  .tl-fecha{padding-left:30px}
  .tl-item{gap:11px}
  .tl-titulo{font-size:14px}
  .tl-detalle{font-size:13px}
}

/* ← NUEVO: galería de evidencia visual */
.galeria{max-width:860px;margin:26px auto 0;padding:20px;border:1px solid var(--bordes);
  border-radius:16px;text-align:left}
.gal-sub{font-size:14px;color:var(--gris-300);line-height:1.5;margin:0 0 16px}
.gal-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px;margin-bottom:16px}
.gal-item{border:1px solid var(--bordes);border-radius:11px;overflow:hidden;background:#fff}
.gal-thumb{display:block;width:100%;aspect-ratio:4/3;border:none;padding:0;cursor:pointer;
  background:var(--gris-100,#f3f3f5);overflow:hidden}
.gal-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.gal-thumb:hover img{opacity:.88}
.gal-noimg{font-size:12px;color:var(--gris-300);display:flex;align-items:center;
  justify-content:center;height:100%}
.gal-n{font-size:13px;font-weight:600;color:var(--negro);padding:8px 10px 0;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gal-m{font-size:11px;color:var(--gris-300);padding:2px 10px 0}
.gal-acts{display:flex;align-items:center;justify-content:space-between;padding:4px 6px 6px}
@media(max-width:760px){
  .galeria{margin:18px 12px 0;padding:16px}
  .gal-grid{grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px}
}

/* ← NUEVO: selector de expediente al adjuntar */
.link-list{display:flex;flex-direction:column;gap:8px;max-height:330px;overflow-y:auto;
  margin-bottom:14px;text-align:left}
.link-row{display:flex;align-items:flex-start;gap:11px;padding:13px;border:1px solid var(--bordes);
  border-radius:11px;cursor:pointer;transition:border-color .15s,background .15s}
.link-row:hover{border-color:var(--negro);background:rgba(0,0,0,.02)}
.link-row.ocupado{opacity:.62}
.link-row-b{flex:1;min-width:0}
.link-row-t{font-weight:600;font-size:16px;color:var(--negro)}
.link-row-m{font-size:13px;color:var(--gris-300);margin:2px 0 5px;line-height:1.4}

/* ← NUEVO: compartir con verificación de correo */
.share-err{background:rgba(194,65,12,.09);color:#c2410c;border-radius:9px;
  padding:10px 12px;font-size:14px;margin-bottom:12px;text-align:left;line-height:1.4}
.share-ok{display:flex;align-items:center;gap:11px;background:rgba(20,130,90,.08);
  border-radius:9px;padding:10px 12px;margin-bottom:12px;text-align:left}
.share-ok-n{font-weight:600;color:var(--negro);font-size:15px}
.share-ok-m{font-size:13px;color:var(--gris-300)}
.share-list{display:flex;flex-direction:column;gap:6px;margin-bottom:6px}
.share-row{display:flex;align-items:center;gap:10px;padding:8px 10px;
  border:1px solid var(--bordes);border-radius:9px}
.share-row-m{flex:1;text-align:left;font-size:14px;color:var(--gris-400);overflow-wrap:anywhere}
.avatar.sm{width:30px;height:30px;font-size:11px;flex:0 0 auto}

/* ← NUEVO: sección de documentos adjuntos */
.adj{margin-top:22px;border-top:1px solid var(--bordes);padding-top:16px}
.adj-h{display:flex;align-items:center;gap:9px;margin-bottom:12px}
.adj-t{font-weight:600;font-size:16px;color:var(--negro)}
.adj-n{font-size:12px;padding:2px 9px;border-radius:99px;background:var(--gris-100,#f3f3f5);color:var(--gris-400)}
.adj-empty{font-size:14px;color:var(--gris-300);font-style:italic}
.adj-lock{border:1px dashed var(--bordes);border-radius:12px;padding:18px;text-align:center}
.adj-lock p{font-size:14px;color:var(--gris-300);margin:0 0 12px;line-height:1.5}
.adj-row{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;
  padding:12px;border:1px solid var(--bordes);border-radius:10px;margin-bottom:8px;flex-wrap:wrap}
.adj-row-b{flex:1;min-width:180px}
.adj-row-t{font-weight:600;font-size:15px;color:var(--negro);overflow-wrap:anywhere}
.adj-row-m{font-size:12px;color:var(--gris-300);margin-top:2px}
.adj-acts{display:flex;gap:6px;align-items:center;flex:0 0 auto}

/* ← NUEVO: distintivo de expediente en la tarjeta del inicio */
.chip-exp{background:var(--gris-100,#f3f3f5);color:var(--gris-400);font-weight:600}
.chip-exp.completo{background:rgba(20,130,90,.12);color:#14825a}
.chip-exp.vencido{background:rgba(194,65,12,.12);color:#c2410c}

/* ← NUEVO: asistente de contrato inteligente */
.smart-ta{min-height:200px;resize:vertical;line-height:1.5;font-family:var(--f-p);width:100%;box-sizing:border-box}
.smart-meta{display:flex;justify-content:space-between;font-size:12px;color:var(--gris-300);margin:-8px 0 14px}
.smart-warn{color:#c2410c}
.imp-fill.indet{width:40%;animation:slide 1.1s ease-in-out infinite}
@keyframes slide{0%{margin-left:0}50%{margin-left:60%}100%{margin-left:0}}
.smart-res{text-align:left;border:1px solid var(--bordes);border-radius:14px;padding:18px;margin-top:6px}
.smart-res-h{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px}
.smart-res-t{font-family:var(--f-t);font-weight:600;font-size:19px;color:var(--negro)}
.smart-res-s{font-size:14px;color:var(--gris-300);margin-top:3px}
.smart-chips,.exp-chips{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:16px}
.chip{font-size:12px;padding:4px 10px;border-radius:99px;background:var(--gris-100,#f3f3f5);color:var(--gris-400)}
.smart-list-t{font-size:13px;font-weight:600;color:var(--gris-400);margin-bottom:10px;text-transform:uppercase;letter-spacing:.4px}
.smart-item{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-top:1px solid var(--bordes)}
.smart-num,.exp-check{flex:0 0 26px;height:26px;border-radius:50%;background:var(--gris-100,#f3f3f5);
  display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;color:var(--gris-400)}
.smart-item-b,.exp-item-b{flex:1;min-width:0}
.smart-item-t,.exp-item-t{font-weight:600;color:var(--negro);font-size:16px}
.smart-item-d,.exp-item-d{font-size:14px;color:var(--gris-300);margin:2px 0 6px;line-height:1.4}
.smart-tags{display:flex;flex-wrap:wrap;gap:6px}
.tag{font-size:11px;padding:3px 8px;border-radius:6px;background:var(--gris-100,#f3f3f5);color:var(--gris-400)}
.tag.t-entregable{background:rgba(99,102,241,.12);color:#4f46e5}
.tag.t-comprobante{background:rgba(234,88,12,.12);color:#c2410c}
.tag.t-documento{background:rgba(20,130,90,.12);color:#14825a}
.smart-x{background:none;border:none;font-size:22px;line-height:1;color:var(--gris-300);cursor:pointer;padding:0 4px}
.smart-x:hover{color:#c2410c}

/* ← NUEVO: vista del expediente */
.exp{text-align:left}
.exp-head{border:1px solid var(--bordes);border-radius:14px;padding:16px 18px;margin-bottom:16px}
.exp-head.completo{border-color:rgba(20,130,90,.45);background:rgba(20,130,90,.05)}
.exp-head.vencido{border-color:rgba(194,65,12,.45);background:rgba(194,65,12,.05)}
.exp-bar-wrap{display:flex;align-items:center;gap:12px}
.exp-bar{flex:1;height:8px;border-radius:99px;background:var(--gris-100,#ececed);overflow:hidden}
.exp-fill{height:100%;background:var(--negro);border-radius:99px;transition:width .35s}
.exp-head.completo .exp-fill{background:#14825a}
.exp-count{font-size:13px;color:var(--gris-400);font-weight:600;white-space:nowrap}
.exp-state{font-size:14px;color:var(--gris-300);margin-top:8px}
.exp-head.vencido .exp-state{color:#c2410c;font-weight:600}
.exp-head.completo .exp-state{color:#14825a;font-weight:600}
.exp-sum{font-size:15px;color:var(--gris-400);margin-bottom:14px;line-height:1.5}
.exp-item{display:flex;gap:12px;align-items:flex-start;padding:16px 0;border-top:1px solid var(--bordes)}
.exp-item.cumplido .exp-check{background:#14825a;color:#fff}
.exp-up{display:inline-block;margin-top:10px;border:1px dashed var(--bordes);border-radius:9px;
  padding:9px 14px;font-size:14px;color:var(--gris-400);cursor:pointer;transition:border-color .15s,color .15s}
.exp-up:hover{border-color:var(--negro);color:var(--negro)}
.exp-file{margin-top:10px;border:1px solid var(--bordes);border-radius:10px;padding:12px;background:rgba(20,130,90,.04)}
.exp-file-n{font-weight:600;font-size:15px;color:var(--negro);overflow-wrap:anywhere}
.exp-file-m{font-size:12px;color:var(--gris-300);margin-top:2px}
.exp-file-h{font-family:var(--f-m,ui-monospace,monospace);font-size:11px;color:var(--gris-300);
  word-break:break-all;margin:6px 0 8px}
.exp-src{margin-top:22px;border-top:1px solid var(--bordes);padding-top:14px}
.exp-src summary{cursor:pointer;font-size:14px;color:var(--gris-400);font-weight:500}
.exp-foot{font-size:12px;color:var(--gris-300);margin-top:16px;font-style:italic}

/* ← NUEVO: distintivo de firma biométrica en el historial */
.bio-badge{display:flex;align-items:center;gap:7px;margin-top:8px;font-size:13px;
  color:var(--gris-300);padding:6px 10px;border-radius:8px;background:rgba(0,0,0,.03)}
.bio-badge.ok{color:#1a7f4b;background:rgba(26,127,75,.08)}

/* ← NUEVO: separador "o usa tu código" en el modal de firma */
.sign-or{display:flex;align-items:center;gap:12px;margin:18px 0 14px;color:var(--gris-300);font-size:13px}
.sign-or::before,.sign-or::after{content:"";flex:1;height:1px;background:var(--bordes)}

.menu-name{font-family:var(--f-t);font-weight:600;font-size:20px;text-align:center}

/* ← NUEVO: plantilla visual (formulario) */
.fd{text-align:left;font-family:var(--f-p)}
.fd-head{display:flex;align-items:center;gap:24px;flex-wrap:wrap;margin-bottom:22px}
.fd-heading{font-family:var(--f-t);font-weight:600;font-size:26px;color:var(--gris-400,#6b7280);margin:0;flex:1;min-width:180px}
.fd-head .fd-field{flex:0 0 auto;margin:0}
.fd-head .fd-input{width:130px}
.fd-body{border:1px solid var(--bordes);border-radius:14px;padding:24px 22px;display:flex;flex-direction:column;gap:18px;background:#fff}
.fd-row{display:flex;gap:26px;align-items:flex-start;flex-wrap:wrap}
.fd-field{display:flex;align-items:center;gap:10px;flex:1;min-width:240px}
.fd-field.wide{flex-basis:100%}
.fd-field:has(.area){align-items:flex-start}
.fd-label{font-weight:600;color:var(--negro);white-space:nowrap;font-size:16px}
.fd-input{flex:1;min-width:0;border:1px solid var(--bordes);border-radius:9px;padding:9px 12px;
  font-family:var(--f-p);font-size:15px;color:var(--negro);background:#fff;outline:none;transition:border-color .15s}
.fd-input:focus{border-color:var(--negro)}
.fd-input::placeholder{color:#b6b6bd}
.fd-input.area{min-height:76px;resize:vertical;line-height:1.45}
.fd-input.mono,.fd-value.mono{font-family:var(--f-m,ui-monospace,monospace);font-size:13px;letter-spacing:.2px}
.fd-value{flex:1;color:var(--gris-300,#9096a1);font-size:15px;padding:9px 0;word-break:break-word}
.fd-value.empty{color:#c4c4cb;font-style:italic}
.fd-radio-wrap{display:flex;align-items:flex-start;gap:12px;flex:1;min-width:240px}
.fd-radios{display:flex;flex-direction:column;gap:7px}
.fd-radio{display:flex;align-items:center;gap:8px;font-size:15px;color:var(--negro);cursor:pointer}
.fd-radio input{width:16px;height:16px;accent-color:var(--negro);cursor:pointer}
.fd-toggle{display:inline-flex;align-items:center;gap:10px;border:1px solid var(--bordes);border-radius:9px;
  padding:7px 12px;font-size:13px;font-weight:500;color:var(--negro);cursor:pointer;background:#fff}
.fd-toggle input{display:none}
.fd-switch{width:30px;height:16px;border-radius:99px;background:#d6d6dc;position:relative;transition:background .18s;flex:0 0 auto}
.fd-switch::after{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff;transition:transform .18s}
.fd-toggle.on .fd-switch{background:var(--negro)}
.fd-toggle.on .fd-switch::after{transform:translateX(14px)}
@media(max-width:760px){
  .fd-row{flex-direction:column;gap:14px}
  .fd-field,.fd-radio-wrap{min-width:0;width:100%}
  .fd-field{flex-direction:column;align-items:flex-start;gap:6px}
  .fd-input{width:100%}
  .fd-head{gap:14px}
  .fd-head .fd-input{width:100%}
  .fd-heading{font-size:21px;flex-basis:100%}
}
.menu-mail{font-size:13px;color:var(--gris-300);text-align:center;margin-top:2px;margin-bottom:8px;word-break:break-all}
.btn:disabled{opacity:.55;cursor:not-allowed}
.menu-item{display:flex;align-items:center;gap:10px;background:none;border:none;cursor:pointer;font-family:var(--f-p);font-weight:500;font-size:17px;color:var(--gris-400);padding:8px;transition:color .15s}
.menu-item:hover{color:var(--negro)}
.menu-x{background:none;border:none;font-size:26px;cursor:pointer;color:var(--negro);margin-top:auto;margin-bottom:40px}

/* ── TOGGLE ── */
.toggle-wrap{display:flex;align-items:center;gap:10px;padding:9px;cursor:pointer}
.toggle-lbl{font-family:var(--f-p);font-size:15px;color:var(--negro)}
.toggle{width:44px;height:24px;border-radius:20px;background:var(--bordes);position:relative;transition:background .2s;flex-shrink:0}
.toggle.on{background:var(--negro)}
.toggle::after{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform .2s}
.toggle.on::after{transform:translateX(20px)}

/* ── LOCK SCREEN ── */
.lock-wrap{min-height:60vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;text-align:center;padding:40px}
.lock-ico{font-size:64px}
.lock-t{font-family:var(--f-t);font-weight:600;font-size:26px}
.lock-s{font-size:16px;color:var(--gris-300)}


/* ── IMPORTAR / ESCANEAR ── */
.drop-zone{border:2.5px dashed var(--bordes);border-radius:16px;padding:32px 24px;text-align:center;cursor:pointer;transition:all .18s;background:var(--bg-soft);margin-top:20px}
.drop-zone:hover,.drop-zone.over{border-color:var(--negro);background:#fff}
.drop-zone.over{transform:scale(1.01)}
.dz-ico{font-size:44px;margin-bottom:10px;display:block}
.dz-t{font-family:var(--f-p);font-weight:600;font-size:18px;color:var(--negro);margin-bottom:6px}
.dz-s{font-size:14px;color:var(--gris-300);line-height:1.6}
.dz-formats{font-size:12px;color:var(--gris-200);margin-top:10px}

.imp-progress{margin-top:20px;padding:20px;border:2px solid var(--bordes);border-radius:16px;background:var(--bg-soft)}
.imp-msg{font-family:var(--f-p);font-size:15px;color:var(--negro);margin-bottom:12px;display:flex;align-items:center;gap:10px}
.imp-bar{height:8px;background:var(--gris-100);border-radius:20px;overflow:hidden}
.imp-fill{height:100%;background:var(--negro);border-radius:20px;transition:width .3s ease}
.imp-hint{font-size:13px;color:var(--gris-200);margin-top:10px;line-height:1.5}
.mini-spin{width:16px;height:16px;border:2px solid var(--bordes);border-top-color:var(--negro);border-radius:50%;animation:sp .7s linear infinite;flex-shrink:0}

.imp-done{margin-top:20px;border:2px solid var(--verde);border-radius:16px;overflow:hidden}
.imp-done-h{background:#f0fdf4;padding:14px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.imp-done-t{font-family:var(--f-p);font-weight:600;font-size:15px;color:var(--verde)}
.imp-done-m{font-size:13px;color:var(--gris-300)}
.imp-preview{max-height:220px;overflow-y:auto;padding:16px 18px;font-family:var(--f-p);font-size:14px;line-height:1.8;color:var(--negro);white-space:pre-wrap;background:#fff}
.imp-preview::-webkit-scrollbar{width:5px}
.imp-preview::-webkit-scrollbar-thumb{background:var(--bordes);border-radius:3px}

.imp-error{margin-top:20px;padding:16px 18px;border:2px solid #fca5a5;background:var(--rojo-soft);border-radius:16px;font-size:14px;color:var(--rojo);line-height:1.6}

.cam-row{display:flex;gap:14px;margin-top:20px;flex-wrap:wrap}
.cam-opt{flex:1;min-width:180px;border:2px solid var(--bordes);border-radius:16px;padding:22px 16px;text-align:center;cursor:pointer;background:#fff;transition:all .15s}
.cam-opt:hover{border-color:var(--negro);box-shadow:var(--sh-sm)}
.cam-opt-ico{font-size:34px;display:block;margin-bottom:8px}
.cam-opt-t{font-family:var(--f-p);font-weight:600;font-size:15px}
.cam-opt-s{font-size:12px;color:var(--gris-300);margin-top:4px}

/* ═══════════════ RESPONSIVE ═══════════════ */

/* ── TABLET (≤1024px) ── */
@media (max-width:1024px){
  .nav{padding:18px 24px}
  .nav-title{font-size:28px}
  .page{padding:0 24px 40px}
  .page-title{font-size:32px}
  .btn-secondary{padding:9px 16px;font-size:15px}
  .btn-primary,.btn-warning{padding:11px 20px;font-size:15px}
  .paper{padding:32px 28px}
  .hist{width:100%;max-width:600px}
}

/* ── MÓVIL (≤768px) ── */
@media (max-width:768px){

  /* nav: título arriba, botones en fila deslizable */
  .nav{padding:14px 16px;flex-direction:column;align-items:stretch;gap:12px;position:sticky}
  .nav-title{font-size:24px;text-align:left}
  .nav-id{font-size:17px;gap:6px;min-width:0}
  .nav-id .num{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .nav-id svg{width:24px;height:24px}

  .nav-actions{
    display:flex;flex-wrap:nowrap;overflow-x:auto;gap:10px;
    justify-content:flex-start;padding-bottom:4px;
    -webkit-overflow-scrolling:touch;scrollbar-width:none;
  }
  .nav-actions::-webkit-scrollbar{display:none}
  .nav-actions .btn{flex-shrink:0}
  .btn-secondary{padding:8px 14px;font-size:14px;border-width:2px;border-radius:10px}
  .btn-primary,.btn-warning{padding:10px 18px;font-size:14px}
  .hamburger{width:38px;height:38px;flex-shrink:0;gap:5px}
  .hamburger span{width:24px;height:2.5px}

  /* páginas */
  .page{padding:0 16px 32px}
  .page-title{font-size:26px;margin:18px 0 14px}
  .sec-h{margin:22px 0 12px;gap:6px}
  .sec-t{font-size:21px}
  .sec-arrow{font-size:18px}

  /* carpetas: 2 columnas */
  .folders{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
  .folder{padding:12px 14px;border-radius:12px;gap:6px;min-width:0}
  .folder-n{font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .folder svg{width:22px;height:22px;flex-shrink:0}

  /* tarjetas a ancho completo */
  .cards{display:grid;grid-template-columns:1fr;gap:14px}
  .card{width:100%;padding:14px;border-radius:14px;gap:12px}
  .card-t{font-size:18px}
  .card-prev{height:110px;font-size:11px}
  .card-meta{font-size:13px}
  .chip{font-size:10px;padding:3px 8px}

  .drop{right:4px;top:46px;min-width:170px;border-radius:10px}
  .drop button{padding:14px 16px;font-size:15px}

  /* crear */
  .create-zone{padding:32px 0}
  .create-btn{width:100%;max-width:320px;font-size:18px;padding:14px 20px}

  .empty{padding:36px 16px;font-size:15px}

  /* documento */
  .doc-title-bar{padding:4px 0 14px}
  .doc-title{font-size:24px}
  .paper{padding:20px 16px;min-height:400px;border-radius:10px;margin-bottom:18px}
  .paper-ta,.paper-ro{font-size:16px;line-height:1.75;min-height:340px}
  .vban{padding:12px 14px;font-size:14px;border-radius:10px}

  /* firmas apiladas */
  .sign-bar{flex-direction:column;gap:22px;align-items:stretch;padding:12px 0 28px}
  .sign-group{justify-content:center}
  .sign-slot{min-width:0;width:100%}
  .sign-slot p{font-size:18px}
  .sign-mark{font-size:24px}
  .fp-btn{width:46px;height:46px;flex-shrink:0}

  /* candado dentro del nav */
  .toggle-wrap{padding:6px;flex-shrink:0}
  .toggle-lbl{font-size:13px;white-space:nowrap}

  /* modales a pantalla completa */
  .ov{padding:0;align-items:flex-end}
  .modal,.modal.wide{
    width:100%;max-width:100%;border-radius:20px 20px 0 0;
    padding:20px 18px 32px;max-height:92vh;
  }
  .modal h2{font-size:21px}
  .modal .sub{font-size:14px;margin-bottom:18px}
  .modal-row{flex-direction:column-reverse;gap:10px;margin-top:20px}
  .modal-row .btn{width:100%}

  /* inputs: 16px evita el zoom automático de iOS */
  .inp{padding:14px 16px;font-size:16px;border-radius:10px;margin-bottom:14px}

  /* plantillas: 3 por fila */
  .tpl-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
  .tpl{width:100%;height:104px;border-radius:12px;gap:6px;padding:8px}
  .tpl-ico{font-size:26px}
  .tpl-ico svg{width:26px;height:26px}
  .tpl-n{font-size:12px;text-align:center;line-height:1.2}

  .pills{gap:8px}
  .pill{padding:8px 14px;font-size:14px}

  /* importar */
  .drop-zone{padding:24px 16px;border-radius:12px;margin-top:16px}
  .dz-ico{font-size:36px}
  .dz-t{font-size:16px}
  .dz-s{font-size:13px}
  .cam-row{flex-direction:column;gap:10px}
  .cam-opt{min-width:0;padding:18px 14px;border-radius:12px}
  .imp-progress,.imp-done,.imp-error{border-radius:12px}
  .imp-preview{max-height:160px;font-size:13px;padding:14px}
  .imp-done-h{padding:12px 14px}

  /* contactos */
  .contact{padding:11px 14px;border-radius:10px}
  .contact-n{font-size:15px}
  .avatar{width:30px;height:30px;font-size:13px}

  /* historial a pantalla completa */
  .hist-ov{justify-content:stretch}
  .hist{width:100%;max-width:100%;padding:20px 16px 32px;gap:18px}
  .hist-title{font-size:30px}
  .tabs{gap:14px;width:100%;justify-content:space-around}
  .tab{font-size:17px;padding:0 0 6px;border-bottom-width:2.5px}
  .hist-list{gap:16px}
  .hcard{width:100%;padding:18px;border-width:2px;border-radius:10px}
  .hcard-a{font-size:18px}
  .hcard-d{font-size:15px}
  .hcard-box{font-size:14px;padding:10px;border-radius:10px}
  .hcard-eye{font-size:14px}
  .h-v{font-size:9px}

  /* menú lateral */
  .menu{width:100%;max-width:300px;padding:20px 24px}
  .menu-av{width:60px;height:60px;font-size:26px;margin-top:12px}
  .menu-name{font-size:18px}

  /* auth */
  .auth-wrap{padding:16px;align-items:flex-start;padding-top:40px}
  .auth-card{padding:20px 18px;border-radius:14px}
  .auth-title{font-size:26px}
  .auth-sub{font-size:14px;margin-bottom:22px}
  .auth-actions{flex-direction:column-reverse;gap:10px}
  .auth-actions .btn{width:100%}
  .fingerprint{width:64px;height:64px;margin-top:20px}

  /* bloqueo */
  .lock-wrap{padding:28px 20px;min-height:50vh}
  .lock-ico{font-size:52px}
  .lock-t{font-size:21px}
  .lock-s{font-size:15px}

  .notif{top:12px;right:12px;left:12px;font-size:13px;padding:12px 16px}
}

/* ── MÓVIL CHICO (≤400px) ── */
@media (max-width:400px){
  .nav-title{font-size:21px}
  .page-title{font-size:23px}
  .folders{grid-template-columns:1fr}
  .tpl-grid{grid-template-columns:repeat(2,1fr)}
  .doc-title{font-size:21px}
  .hist-title{font-size:26px}
  .tab{font-size:15px}
  .btn-secondary{padding:8px 12px;font-size:13px}
}

/* ── Ajustes táctiles generales ── */
@media (hover:none){
  .card:hover{transform:none;box-shadow:var(--sh-sm);border-color:var(--bordes)}
  .card:active{border-color:var(--negro);transform:scale(.99)}
  .folder:hover{border-color:var(--bordes);box-shadow:none}
  .folder:active{border-color:var(--negro)}
  .tpl:hover{transform:none;box-shadow:var(--sh-sm);border-color:var(--bordes)}
  .tpl.sel{border-color:var(--negro)}
  .btn-secondary:hover{background:#fff;color:var(--negro)}
  .btn-secondary.on{background:var(--negro);color:#fff}
  .create-btn:hover{transform:none}
}
`;

// ── Iconos SVG inline ─────────────────────────────────────────
// ── ICONOS ────────────────────────────────────────────────────
// ← ACTUALIZADO: antes eran SVG dibujados a mano. Ahora usan
// Material Symbols (el set de Google). Los nombres de componente
// se conservan para no tocar las decenas de sitios que los usan.
const Icon = ({ n, size=24, fill=false, weight=300 }) => (
  <span className="msym" aria-hidden="true"
    style={{ fontSize:size, width:size, height:size,
             fontVariationSettings:`'FILL' ${fill?1:0}, 'wght' ${weight}, 'GRAD' 0, 'opsz' ${size}` }}>
    {n}
  </span>
);

const IcoFolder = () => <Icon n="folder"      size={26} />;
const IcoDots   = () => <Icon n="more_vert"   size={22} weight={400} />;
const IcoEye    = () => <Icon n="visibility"  size={18} />;
const IcoFinger = () => <Icon n="fingerprint" size={24} />;
const IcoBack   = () => <Icon n="arrow_back"  size={32} />;
const IcoGear   = () => <Icon n="settings"    size={22} />;
const IcoLink   = () => <Icon n="link"        size={20} />;

// ← ACTUALIZADO: ahora sólo son los TIPOS de documento (paso 1).
// "carpeta", "subir", "escanear" y "en blanco" salieron de aquí:
// el método de creación es el paso 2 y las carpetas tienen su propio modal.
const TEMPLATES = [
  { id:"contrato", ico:"contract", name:"Contrato", body:"CONTRATO DE ARRENDAMIENTO\n\nEntre las partes:\n\nARRENDADOR: [Nombre completo]\nARRENDATARIO: [Nombre completo]\n\nOBJETO DEL CONTRATO:\n[Descripción del inmueble]\n\nPLAZO:\nEl presente contrato tendrá una vigencia de [X] meses, contados a partir del [fecha].\n\nRENTA MENSUAL:\n$[cantidad] MXN, pagaderos los primeros [X] días de cada mes.\n\nDEPÓSITO EN GARANTÍA:\n$[cantidad] MXN.\n\nOBLIGACIONES DEL ARRENDATARIO:\n1. Pagar puntualmente la renta.\n2. Conservar el inmueble en buen estado.\n3. No subarrendar sin autorización escrita.\n\nOBLIGACIONES DEL ARRENDADOR:\n1. Entregar el inmueble en condiciones habitables.\n2. Realizar reparaciones estructurales." },
  { id:"factura",  ico:"receipt_long", name:"Factura",  form:"factura", body:"" },
  { id:"recibo",   ico:"receipt", name:"Recibo",   form:"recibo",  body:"" },
  // ← NUEVO: no crea un documento, crea un expediente con lista de comprobantes
  { id:"inteligente", ico:"rule", name:"Contrato inteligente", smart:true, body:"" },
];

// ← NUEVO: paso 2 del flujo de creación.
const METHODS = [
  { id:"escanear", ico:"photo_camera", name:"Escanear con foto", desc:"Usa la cámara y extraemos el texto" },
  { id:"subir",    ico:"upload_file",  name:"Subir archivo",     desc:"PDF, DOCX o TXT desde tu dispositivo" },
  { id:"cero",     ico:"draft", name:"Crear desde cero",  desc:"Empieza con la plantilla en blanco" },
];

// ── PLANTILLAS VISUALES ───────────────────────────────────────
// ← NUEVO: en vez de texto con corchetes, un esquema de campos que
// se dibuja como formulario. Cada fila es un arreglo de campos.
// ── SELLOS DE FIRMA ───────────────────────────────────────────
// ← NUEVO: cada cuenta recibe un sello fijo la primera vez y no
// vuelve a cambiar, aunque después agregues más imágenes al catálogo.
// Las imágenes van en: public/sellos/LG1.png, LG2.png, …
const SELLOS = ["LG1","LG2","LG3","LG4","LG5","LG6","LG7","LG8"];

const selloUrl = (id) => `/sellos/${id}.png`;

/** Deriva un sello desde el uid: estable, sin necesidad de azar. */
function selloDesdeUid(uid=""){
  let h = 0;
  for(let i=0;i<uid.length;i++) h = (h*31 + uid.charCodeAt(i)) >>> 0;
  return SELLOS[h % SELLOS.length];
}

// ── LÍNEA DE TIEMPO ───────────────────────────────────────────
// ← NUEVO: registro de tipos de evento. Para soportar una acción
// nueva (CONSULTA, SOLICITUD, ALERTA…) basta agregar una entrada
// aquí; el componente de la línea de tiempo no se toca.
//
// `titulo` recibe el bloque completo, así que puede diferenciar
// subtipos leyendo b.meta.tipo sin romper los bloques antiguos.
const EVENTOS = {
  "CREACIÓN": {
    ico:"add_circle", tono:"inicio",
    titulo:(b)=> b.meta?.tipo==="expediente" ? "Expediente abierto" : "Documento creado",
  },
  "EDICIÓN": {
    ico:"edit", tono:"neutro",
    titulo:()=> "Contenido editado",
  },
  "FIRMA": {
    ico:"draw", tono:"firma",
    titulo:(b)=> b.signature?.method==="webauthn" ? "Firma biométrica" : "Firma registrada",
  },
  "COMPARTIDO": {
    ico:"group_add", tono:"comparte",
    titulo:(b)=> b.meta?.tipo==="revocado" ? "Acceso retirado"
               : /retirado/i.test(b.content||"") ? "Acceso retirado" : "Compartido",
  },
  "EVIDENCIA": {
    ico:"attach_file", tono:"evidencia",
    titulo:(b)=>{
      const t = b.meta?.tipo;
      if(t==="alta")     return "Comprobante adjuntado";
      if(t==="baja")     return "Comprobante retirado";
      if(t==="imagen")   return "Imagen adjuntada";
      if(t==="imagen-baja") return "Imagen retirada";
      if(t==="vinculo")  return "Documento vinculado";
      // Bloques anteriores a `meta`: se deduce del texto.
      if(/retirad|retiro/i.test(b.content||"")) return "Comprobante retirado";
      if(/^imagen/i.test(b.content||""))        return "Imagen adjuntada";
      return "Comprobante adjuntado";
    },
  },
  "VINCULADO": {
    ico:"link", tono:"vinculo",
    titulo:()=> "Adjuntado a un expediente",
  },
  // ← NUEVO: basta una entrada aquí para que la línea de tiempo lo dibuje
  "CONSULTA": {
    ico:"visibility", tono:"consulta",
    titulo:()=> "Documento consultado",
  },
  "SOLICITUD": {
    ico:"forward_to_inbox", tono:"solicitud",
    titulo:(b)=> b.meta?.tipo==="cancelada" ? "Solicitud cancelada"
               : b.meta?.tipo==="cumplida"  ? "Solicitud atendida"
               : "Evidencia solicitada",
  },
  // ← NUEVO: un documento normal que pasó a ser contrato inteligente
  "CONVERSIÓN": {
    ico:"rule", tono:"inicio",
    titulo:()=> "Convertido en contrato inteligente",
  },
  "EXPORTACIÓN": {
    ico:"download", tono:"neutro",
    titulo:()=> "Paquete de evidencia generado",
  },
};

const EVENTO_DEFAULT = { ico:"history", tono:"neutro", titulo:(b)=>b.action };

const eventoDe = (b) => EVENTOS[b.action] || EVENTO_DEFAULT;

/** Agrupa los bloques por día, en orden cronológico. */
function agruparPorDia(bloques){
  const dias = [];
  for(const b of [...bloques].sort((x,y)=>new Date(x.timestamp)-new Date(y.timestamp))){
    const clave = (b.timestamp||"").slice(0,10);
    const ultimo = dias[dias.length-1];
    if(ultimo && ultimo.clave===clave) ultimo.bloques.push(b);
    else dias.push({ clave, bloques:[b] });
  }
  return dias;
}

const FORMS = {
  factura: {
    heading: "Factura",
    header: [
      { k:"fecha", label:"Fecha",  type:"date" },
      { k:"folio", label:"No",     type:"text", placeholder:"000" },
    ],
    rows: [
      [{ k:"emisor",      label:"Emisor",        type:"text",  placeholder:"Razón social", w:2 }],
      [{ k:"rfcEmisor",   label:"RFC emisor",    type:"text",  placeholder:"XAXX010101000" },
       { k:"rfcReceptor", label:"RFC receptor",  type:"text",  placeholder:"XAXX010101000" }],
      [{ k:"receptor",    label:"Receptor",      type:"text",  placeholder:"Razón social", w:2 }],
      [{ k:"concepto",    label:"Concepto",      type:"area",  placeholder:"Descripción de bienes o servicios", w:2 }],
      [{ k:"subtotal",    label:"Subtotal",      type:"money" },
       { k:"iva",         label:"IVA (16%)",     type:"money" }],
      [{ k:"total",       label:"Total",         type:"money" },
       { k:"formaPago",   label:"Forma de pago", type:"radio", options:["Depósito","Cheque","Efectivo"] }],
      [{ k:"uuid",        label:"Folio fiscal",  type:"text",  placeholder:"UUID del CFDI", w:2, mono:true }],
      [{ k:"periodico",   label:"Enviar periódicamente", type:"toggle" }],
    ],
  },

  recibo: {
    heading: "Recibo de nómina",
    header: [
      { k:"fecha", label:"Fecha", type:"date" },
      { k:"folio", label:"No",    type:"text", placeholder:"000" },
    ],
    rows: [
      [{ k:"recibiDe",    label:"Recibí de",     type:"text",  placeholder:"Empresa" },
       { k:"cantidad",    label:"Cantidad",      type:"money" }],
      [{ k:"cantidadTxt", label:"Cantidad con letra", type:"text", placeholder:"veinte mil pesos", w:2 }],
      [{ k:"concepto",    label:"Concepto",      type:"area",  placeholder:"Descripción del pago", w:2 }],
      [{ k:"recibidoPor", label:"Recibido por",  type:"text",  placeholder:"Nombre" },
       { k:"formaPago",   label:"Forma de pago", type:"radio", options:["Depósito","Cheque","Efectivo"] }],
      [{ k:"periodico",   label:"Enviar periódicamente", type:"toggle" }],
    ],
  },
};

const allFields = (s)=>[...(s.header||[]), ...s.rows.flat()];

// ← NUEVO: convierte los campos a texto para que la cadena siga
// hasheando contenido legible y el historial no se rompa.
function serializeForm(formKey, fields){
  const s = FORMS[formKey]; if(!s) return "";
  const lines = [s.heading.toUpperCase(), ""];
  for(const f of allFields(s)){
    const v = fields[f.k];
    if(v===undefined || v===null || v==="" || v===false) continue;
    lines.push(`${f.label}: ${f.type==="toggle" ? "Sí" : f.type==="money" ? `$${v}` : v}`);
  }
  return lines.join("\n");
}

// ── EXTRACCIÓN DE DATOS DESDE OCR / PDF ───────────────────────
// ← NUEVO: lee el texto crudo del escaneo y rellena los campos.
const num = (m)=> m ? m[1].replace(/,/g,"") : "";

function parseFactura(text){
  const t = text.replace(/\s+/g," ");
  const rfcs = [...t.matchAll(/\b([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b/g)].map(m=>m[1]);
  const f = {};

  const uuid = t.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i);
  if(uuid) f.uuid = uuid[0].toUpperCase();

  if(rfcs[0]) f.rfcEmisor   = rfcs[0];
  if(rfcs[1]) f.rfcReceptor = rfcs[1];

  const folio = t.match(/folio\s*(?:interno)?[:\s]*([A-Z0-9][A-Z0-9-]{0,15})/i);
  if(folio && !/fiscal/i.test(folio[0])) f.folio = folio[1];

  const iso = t.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const dmy = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if(iso) f.fecha = iso[1];
  else if(dmy) f.fecha = `${dmy[3]}-${dmy[2].padStart(2,"0")}-${dmy[1].padStart(2,"0")}`;

  // Se permite texto intermedio sin '$' para tolerar etiquetas como "IVA (16%)"
  const total    = t.match(/\btotal\b[^$\n]{0,20}\$?\s*([\d,]+\.\d{2})/i);
  const subtotal = t.match(/\bsub\s?total\b[^$\n]{0,20}\$?\s*([\d,]+\.\d{2})/i);
  const iva      = t.match(/\biva\b[^$\n]{0,20}\$?\s*([\d,]+\.\d{2})/i);
  if(total)    f.total    = num(total);
  if(subtotal) f.subtotal = num(subtotal);
  if(iva)      f.iva      = num(iva);

  const emisor = text.match(/emisor[:\s]*\n?\s*([^\n]{3,60})/i);
  if(emisor) f.emisor = emisor[1].trim();
  const receptor = text.match(/receptor[:\s]*\n?\s*([^\n]{3,60})/i);
  if(receptor) f.receptor = receptor[1].trim();

  const concepto = text.match(/(?:concepto|descripci[oó]n)[:\s]*\n?\s*([^\n]{3,120})/i);
  if(concepto) f.concepto = concepto[1].trim();

  return f;
}

// ── PLANTILLA VISUAL ──────────────────────────────────────────
// ← NUEVO: dibuja el esquema de FORMS como formulario.
// En modo lectura muestra los valores; vacíos aparecen atenuados.
function FormDoc({ formKey, fields, onChange, editable }){
  const s = FORMS[formKey];
  if(!s) return null;
  const set = (k,v)=>onChange({ ...fields, [k]:v });
  const val = (k)=>fields?.[k] ?? "";

  // ← ACTUALIZADO: esto era un componente declarado dentro del render.
  // React lo trataba como un tipo distinto en cada tecleo, remontaba el
  // input y se perdía el foco. Como función que devuelve JSX, no ocurre.
  const field = (f)=>{
    const v = val(f.k);

    if(f.type==="toggle") return (
      <label key={f.k} className={`fd-toggle ${v?"on":""}`}>
        <span>{f.label}</span>
        <input type="checkbox" checked={!!v} disabled={!editable}
          onChange={e=>set(f.k, e.target.checked)} />
        <span className="fd-switch"/>
      </label>
    );

    if(f.type==="radio") return (
      <div key={f.k} className="fd-radio-wrap">
        <span className="fd-label">{f.label}:</span>
        <div className="fd-radios">
          {f.options.map(o=>(
            <label key={o} className="fd-radio">
              <input type="radio" name={`${formKey}-${f.k}`} checked={v===o} disabled={!editable}
                onChange={()=>set(f.k,o)} />
              <span>{o}</span>
            </label>
          ))}
        </div>
      </div>
    );

    return (
      <div key={f.k} className={`fd-field ${f.w===2?"wide":""}`}>
        <span className="fd-label">{f.label}:</span>
        {editable ? (
          f.type==="area"
            ? <textarea className="fd-input area" value={v} placeholder={f.placeholder||""}
                onChange={e=>set(f.k,e.target.value)} />
            : <input className={`fd-input ${f.mono?"mono":""}`}
                type={f.type==="date"?"date":"text"}
                inputMode={f.type==="money"?"decimal":undefined}
                placeholder={f.type==="money"?"$0.00":(f.placeholder||"")}
                value={v} onChange={e=>set(f.k,e.target.value)} />
        ) : (
          <span className={`fd-value ${!v?"empty":""} ${f.mono?"mono":""}`}>
            {v ? (f.type==="money" ? `$${v}` : v) : (f.placeholder || "—")}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="fd">
      <div className="fd-head">
        <h2 className="fd-heading">{s.heading}</h2>
        {(s.header||[]).map(field)}
      </div>
      <div className="fd-body">
        {s.rows.map((row,i)=>(
          <div key={i} className="fd-row">
            {row.map(field)}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── APP ───────────────────────────────────────────────────────
// ← NUEVO: la historia de la operación en orden, no una lista de bloques.
// Es la pantalla que hace visible la tesis: se valida la operación
// completa, no cada documento por separado.
function Timeline({ chain }){
  const dias = agruparPorDia(chain||[]);
  if(!dias.length) return <p className="tl-vacio">Todavía no hay actividad registrada.</p>;

  return (
    <div className="tl">
      {dias.map(dia=>(
        <div key={dia.clave} className="tl-dia">
          <div className="tl-fecha">{fmtDia(dia.clave)}</div>
          {dia.bloques.map(b=>{
            const ev = eventoDe(b);
            return (
              <div key={b.hash} className={`tl-item tono-${ev.tono}`}>
                <div className="tl-linea"><span className="tl-punto"><Icon n={ev.ico} size={17}/></span></div>
                <div className="tl-cuerpo">
                  <div className="tl-titulo">{ev.titulo(b)}</div>
                  {b.content && b.action!=="EDICIÓN" && (
                    <div className="tl-detalle">{b.content}</div>
                  )}
                  <div className="tl-pie">
                    {b.author} · {fmtHora(b.timestamp)} · bloque #{b.index}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function ChainDoc(){
  const [screen,setScreen]   = useState("loading");
  const [authStep,setAuthStep] = useState(0);
  const [authMode,setAuthMode] = useState("signup");   // ← NUEVO: "signup" | "login"
  const [authBusy,setAuthBusy] = useState(false);      // ← NUEVO: bloquea el botón mientras responde Firebase
  const [docs,setDocs]       = useState([]);
  const [folders,setFolders] = useState(()=>{ try{return JSON.parse(localStorage.getItem("cd_folders"))||["Contratos","Facturas","Recibos"];}catch{return ["Contratos","Facturas","Recibos"];} });
  const [view,setView]       = useState("inicio");
  const [d,setD]             = useState(null);
  const [editMode,setEdit]   = useState(false);
  const [uid,setUid]         = useState(null);         // ← NUEVO: id real de la cuenta
  const [user,setUser]       = useState("");           // ← ACTUALIZADO: viene del perfil, no de localStorage
  const [acctEmail,setAcctEmail] = useState("");       // ← NUEVO: correo de la sesión activa
  const [email,setEmail]     = useState("");           // campo del formulario
  const [pass,setPass]       = useState("");
  const [signCodeHash,setSignCodeHash] = useState(null); // ← ACTUALIZADO: hash, ya no texto plano
  const [bioCreds,setBioCreds] = useState([]);   // ← NUEVO: credenciales WebAuthn del perfil
  const [selloId,setSelloId]   = useState(null); // ← NUEVO: sello de firma asignado
  const [bioOk,setBioOk]       = useState(false); // ← NUEVO: el dispositivo soporta biometría
  const [bioBusy,setBioBusy]   = useState(false); // ← NUEVO: esperando a Face ID
  const [title,setTitle]     = useState("");
  const [content,setContent] = useState("");
  const [dirty,setDirty]     = useState(false);
  const [saving,setSaving]   = useState(false);
  const [histOpen,setHist]   = useState(false);
  const [histTab,setHistTab] = useState("Línea de tiempo");  // ← ACTUALIZADO
  const [showHashes,setShowHashes] = useState({});
  const [menuOpen,setMenu]   = useState(false);
  const [verifyRes,setVerify]= useState(null);
  const [notif,setNotif]     = useState(null);
  const [drop,setDrop]       = useState(null);
  const [modal,setModal]     = useState(null);
  const [mIn,setMIn]         = useState("");
  const [mIn2,setMIn2]       = useState("");
  const [tpl,setTpl]         = useState("contrato");  // ← ACTUALIZADO: tipo de documento
  const [method,setMethod]   = useState(null);        // ← NUEVO: escanear | subir | cero
  const [createStep,setCreateStep] = useState(0);     // ← NUEVO: 0 = tipo, 1 = método
  const [smartText,setSmartText]   = useState("");    // ← NUEVO: texto del contrato base
  const [smartRes,setSmartRes]     = useState(null);  // ← NUEVO: análisis de la IA
  const [smartBusy,setSmartBusy]   = useState(false);
  const [smartErr,setSmartErr]     = useState("");
  const [smartMsg,setSmartMsg]     = useState("");    // ← NUEVO: estado de reintentos de la IA
  const [filesOpen,setFilesOpen]   = useState(false); // ← NUEVO: adjuntos desbloqueados
  const [vinculos,setVinculos]     = useState({});    // ← NUEVO: aid → estado del vínculo
  const [focoDup,setFocoDup]       = useState(null);  // ← NUEVO: duplicado al que se llegó desde un aviso
  const [faseSel,setFaseSel]       = useState(null);  // ← NUEVO: fase elegida para filtrar requisitos
  const [verifVin,setVerifVin]     = useState(false); // ← NUEVO: verificación en curso
  const [shareErr,setShareErr]     = useState("");    // ← NUEVO
  const [shareFound,setShareFound] = useState(null);  // ← NUEVO: cuenta encontrada
  const [shareBusy,setShareBusy]   = useState(false); // ← NUEVO
  const [exps,setExps]             = useState(null);  // ← NUEVO: expedientes disponibles
  const [linkExp,setLinkExp]       = useState(null);  // ← NUEVO: expediente elegido
  const [linkErr,setLinkErr]       = useState("");    // ← NUEVO
  const [linkBusy,setLinkBusy]     = useState(false); // ← NUEVO
  const [linkSitios,setLinkSitios] = useState([]);    // ← NUEVO: dónde está ya adjunto este documento
  const [solReq,setSolReq]         = useState(null);  // ← NUEVO: requisito a solicitar
  const [solMsg,setSolMsg]         = useState("");    // ← NUEVO
  const [solErr,setSolErr]         = useState("");    // ← NUEVO
  const [solBusy,setSolBusy]       = useState(false); // ← NUEVO
  const [fields,setFields]   = useState({});   // valores de la plantilla visual
  const [filterF,setFilterF] = useState(null);
  const [openSec,setOpenSec] = useState({carp:true,docs:true,comp:true});
  const [imp,setImp]         = useState(null);   // {stage,message,percent}
  const [impText,setImpText] = useState("");
  const [impMeta,setImpMeta] = useState(null);   // {name,pages,confidence,kind}
  const [impErr,setImpErr]   = useState("");
  const [dragOver,setDragOver] = useState(false);
  const [unlocked,setUnlocked] = useState(false);
  const [lockInput,setLockInput] = useState("");

  const notify = (m,t="ok")=>{ setNotif({m,t}); setTimeout(()=>setNotif(null),3200); };

  useEffect(()=>{ const h=()=>setDrop(null); document.addEventListener("click",h); return ()=>document.removeEventListener("click",h); },[]);
  useEffect(()=>{ localStorage.setItem("cd_folders",JSON.stringify(folders)); },[folders]);

  // ← NUEVO: se pregunta una vez si el dispositivo tiene Face ID / huella
  useEffect(()=>{ bioAvailable().then(setBioOk); },[]);

  // ← NUEVO: al llegar desde un aviso de duplicado, lleva la vista al
  // comprobante señalado. Espera un momento a que termine de dibujarse.
  useEffect(()=>{
    if(!focoDup) return;
    const t = setTimeout(()=>{
      document.getElementById("foco-dup")
        ?.scrollIntoView({ behavior:"smooth", block:"center" });
    }, 350);
    return ()=>clearTimeout(t);
  },[focoDup, d?.id]);

  const refresh = async(id=uid, mail=acctEmail)=>{             // ← ACTUALIZADO
    const l = await store.list(id, mail);
    l.sort((a,b)=>new Date(b.lastModified)-new Date(a.lastModified));
    setDocs(l);
  };

  // ── INTEGRIDAD DE LOS VÍNCULOS ──
  // ← NUEVO: al adjuntar un documento guardamos el hash de su último
  // bloque. Aquí se compara contra su estado actual para detectar si
  // cambió —o si le reescribieron la cadena— desde entonces.
  //
  // Es estado DERIVADO: se recalcula al abrir, nunca se guarda. Así no
  // puede quedar una advertencia obsoleta contradiciendo a los datos.
  const verificarVinculos = async(exp)=>{
    if(exp?.kind!=="expediente"){ setVinculos({}); return; }

    const internos = (exp.requisitos||[])
      .flatMap(r=>archivosDe(r))
      .filter(a=>a.origen==="interno" && a.docId);
    if(!internos.length){ setVinculos({}); return; }

    setVerifVin(true);
    try{
      // Un solo fetch por documento aunque esté adjunto en varios requisitos.
      const ids = [...new Set(internos.map(a=>a.docId))];
      const docs = await Promise.all(ids.map(id=>store.get(id)));
      const porId = Object.fromEntries(ids.map((id,i)=>[id, docs[i]]));

      const mapa = {};
      for(const a of internos) mapa[aidDe(a)] = estadoVinculo(a, porId[a.docId]);
      setVinculos(mapa);
    }catch(e){ console.error(e); setVinculos({}); }
    finally{ setVerifVin(false); }
  };

  // ← ACTUALIZADO: la sesión ya no se deduce de localStorage.
  // Firebase avisa por sí solo si hay alguien conectado, al cargar y en cada login/logout.
  useEffect(()=>{
    const stop = watchAuth(async(account)=>{
      if(!account){
        setUid(null); setUser(""); setAcctEmail(""); setSignCodeHash(null);
        setBioCreds([]);                                       // ← NUEVO
        setSelloId(null);                                      // ← NUEVO
        setDocs([]); setD(null); setScreen("auth");
        return;
      }

      const profile = await getProfile(account.uid);
      setUid(account.uid);
      setUser(profile?.name || account.displayName || "");
      setAcctEmail(account.email || "");
      setSignCodeHash(profile?.signCodeHash || null);
      setBioCreds(profile?.bioCreds || []);                    // ← NUEVO

      // ← NUEVO: el sello se asigna una sola vez y se guarda en el perfil.
      // Guardarlo (en vez de derivarlo siempre) evita que cambie si más
      // adelante agregas o quitas imágenes del catálogo.
      let sello = profile?.selloId;
      if(!sello){
        sello = selloDesdeUid(account.uid);
        saveProfile(account.uid, { selloId: sello });
      }
      setSelloId(sello);

      // ← NUEVO: las cuentas creadas antes del directorio se registran solas
      if(account.email){
        publishDirectory(account.uid, account.email,
                         profile?.name || account.displayName || "");
      }

      // Sin código de firma la cuenta está incompleta: mándalo a crearlo.
      // (Se evalúa el perfil, no el estado local, porque este callback
      //  se registra una sola vez y no vería los valores actualizados.)
      if(!profile?.signCodeHash){
        setAuthMode("signup"); setAuthStep(1); setScreen("auth"); return;
      }

      const id = getUrlDoc();
      if(id){
        const dd = await store.get(id);
        if(dd){
          setD(dd); setTitle(dd.title); setContent(dd.content||"");
          setFields(dd.fields||{});
          setUnlocked(!dd.password); setScreen("doc");
          verificarVinculos(dd);                                 // ← NUEVO
          // ← NUEVO: al entrar por enlace directo la lista queda vacía y
          // la detección de duplicados no tendría con qué comparar.
          refresh(account.uid, account.email);
          return;
        }
      }
      await refresh(account.uid, account.email);
      setScreen("home");
    });
    return stop;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // ── AUTH ──
  // ← ACTUALIZADO: antes sólo guardaba el nombre y tiraba la contraseña.
  // Ahora crea una cuenta real en Firebase Authentication.
  const doSignup = async()=>{
    if(!mIn.trim()){ notify("Escribe tu nombre","err"); return; }
    if(!email.trim()){ notify("Escribe tu correo","err"); return; }
    if(pass.length<6){ notify("La contraseña necesita al menos 6 caracteres","err"); return; }
    setAuthBusy(true);
    try{
      await signUp(email, pass, mIn);
      setPass(""); setAuthStep(1);
      notify("Cuenta creada ✓");
    }catch(err){
      notify(authError(err),"err");
    }finally{ setAuthBusy(false); }
  };

  // ← NUEVO: esto es lo que le faltaba al botón "Inicia sesión".
  const doLogin = async()=>{
    if(!email.trim()){ notify("Escribe tu correo","err"); return; }
    if(!pass){ notify("Escribe tu contraseña","err"); return; }
    setAuthBusy(true);
    try{
      await signIn(email, pass);
      setPass(""); setEmail("");
      // watchAuth se encarga de cargar el perfil y entrar a la app.
    }catch(err){
      notify(authError(err),"err");
    }finally{ setAuthBusy(false); }
  };

  // ← NUEVO
  const doReset = async()=>{
    if(!email.trim()){ notify("Escribe tu correo para enviarte el enlace","err"); return; }
    try{
      await resetPassword(email);
      notify("Te enviamos un correo para restablecerla ✓");
    }catch(err){ notify(authError(err),"err"); }
  };

  // ← NUEVO
  const doLogout = async()=>{
    setMenu(false);
    setUrlDoc(null);
    await logOut();
    setAuthMode("login"); setAuthStep(0); setEmail(""); setPass("");
  };

  // ← ACTUALIZADO: el código de firma se guarda hasheado en el perfil, no en texto plano.
  const doSignCode = async()=>{
    if(pass.trim().length<4){ notify("El código necesita al menos 4 caracteres","err"); return; }
    const hash = await sha256(pass.trim());
    const ok = await saveProfile(uid,{ signCodeHash:hash });
    if(!ok){ notify("No se pudo guardar el código","err"); return; }
    setSignCodeHash(hash); setPass(""); setAuthStep(2);
  };

  const finishAuth = async()=>{
    await refresh(); setScreen("home");
  };

  // ← NUEVO: guarda los cambios de configuración en el perfil de Firestore
  const saveSettings = async()=>{
    const patch = {};
    if(mIn.trim() && mIn.trim()!==user) patch.name = mIn.trim();
    if(pass.trim()){
      if(pass.trim().length<4){ notify("El código necesita al menos 4 caracteres","err"); return; }
      patch.signCodeHash = await sha256(pass.trim());
    }
    if(!Object.keys(patch).length){ setModal(null); setPass(""); return; }

    const ok = await saveProfile(uid, patch);
    if(!ok){ notify("No se pudo guardar","err"); return; }
    if(patch.name) setUser(patch.name);
    if(patch.signCodeHash) setSignCodeHash(patch.signCodeHash);
    setPass(""); setModal(null); notify("Configuración guardada ✓");
  };

  // ← NUEVO: cambia entre el asistente de registro y la pantalla de acceso.
  const switchAuth = (mode)=>{
    setAuthMode(mode); setAuthStep(0);
    setEmail(""); setPass(""); setMIn("");
  };

  // ── IMPORTAR ARCHIVOS ──
  const resetImport = ()=>{ setImp(null); setImpText(""); setImpMeta(null); setImpErr(""); };

  const handleFile = async(file, forceOcr=false)=>{
    if(!file) return;
    resetImport();
    setImp({stage:"start",message:"Abriendo archivo…",percent:0});
    try{
      const fn = forceOcr ? ocrImage : extractFromFile;
      const res = await fn(file, p=>setImp(p));
      setImpText(res.text);
      // ← NUEVO: el contrato inteligente edita ese texto antes de analizarlo
      if(tpl==="inteligente") setSmartText(res.text);
      setImpMeta({
        name: file.name,
        pages: res.pages,
        confidence: res.confidence,
        kind: forceOcr || file.type.startsWith("image/") ? "ocr" : "doc",
        chars: res.text.length,
      });
      if(!mIn.trim()) setMIn(stripExtension(file.name).slice(0,80));
      setImp(null);
    }catch(err){
      setImp(null);
      setImpErr(err.message || "No se pudo procesar el archivo.");
    }
  };

  const onDrop = (e)=>{
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if(f) handleFile(f);
  };

  // ── DOCS ──
  const createDoc = async()=>{
    const t = TEMPLATES.find(x=>x.id===tpl);
    // ← ACTUALIZADO: la importación ya no depende del tipo sino del método elegido.
    const isImport = (method==="subir"||method==="escanear");
    if(isImport && !impText.trim()){
      notify(method==="escanear"?"Primero escanea una imagen":"Primero selecciona un archivo","err");
      return;
    }
    const name = mIn.trim() || t.name;

    // ← ACTUALIZADO: el tipo ya lo eligió el usuario en el paso 1.
    // El escaneo ya no decide qué es, sólo intenta llenar la plantilla.
    const formKey = t?.form || null;
    const initial = (isImport && formKey==="factura") ? parseFactura(impText) : {};
    const filled  = Object.keys(initial).length;

    const body = formKey
      ? serializeForm(formKey, initial)
      : (isImport ? impText : (t?.body||""));

    const origin = isImport
      ? (filled
          ? `Creación desde ${method==="escanear"?"escaneo":"archivo"} con extracción automática: ${name}`
          : method==="escanear"
            ? `Creación por escaneo (OCR): ${name}`
            : `Creación por importación de archivo «${impMeta?.name||name}»: ${name}`)
      : `Creación de documento: ${name}`;

    const id = genId();
    const numId = genNumId();
    const g = await mineBlock(null,"CREACIÓN",origin,user);
    const nd = { id, numId, title:name, content:body, folder:mIn2||null,
                 owner:user, ownerUid:uid, ownerEmail:acctEmail,
                 tplId: formKey, fields: formKey ? initial : null,
                 source: isImport ? (method==="escanear"?"escaneo":"importado") : "nuevo",
                 sourceFile: isImport ? (impMeta?.name||null) : null,
                 password:null, sharedWith:[], chain:[g], lastModified:g.timestamp };
    const ok = await store.set(id,nd);
    if(!ok){ notify("Error al crear","err"); return; }

    if(isImport && formKey){
      notify(filled
        ? `${filled} campo${filled===1?"":"s"} llenado${filled===1?"":"s"} automáticamente ✓`
        : "No se reconocieron campos. Llénalos a mano.", filled?"ok":"err");
    }

    closeCreate();
    setD(nd); setTitle(name); setContent(nd.content); setFields(nd.fields||{});
    setUnlocked(true); setEdit(true); setUrlDoc(id); setScreen("doc");
  };

  // ← NUEVO: abre y cierra el asistente de creación en un solo lugar
  const openCreate = ()=>{
    setMIn(""); setMIn2(""); setTpl("contrato");
    setMethod(null); setCreateStep(0); resetImport();
    setSmartText(""); setSmartRes(null); setSmartErr("");   // ← NUEVO
    setModal({t:"create"});
  };
  const closeCreate = ()=>{
    setModal(null); setMIn(""); setMIn2("");
    setMethod(null); setCreateStep(0); resetImport();
    setSmartText(""); setSmartRes(null); setSmartErr("");   // ← NUEVO
  };

  const save = async()=>{
    setSaving(true);
    // ← ACTUALIZADO: si el documento usa plantilla visual, los campos
    // se serializan a texto para que la cadena siga hasheando contenido legible.
    const body = d.tplId ? serializeForm(d.tplId, fields) : content;
    const last = d.chain[d.chain.length-1];
    const b = await mineBlock(last,"EDICIÓN",body.slice(0,200),user);
    const up = {...d,title,content:body,fields:d.tplId?fields:null,
                chain:[...d.chain,b],lastModified:b.timestamp};
    const ok = await store.set(up.id,up);
    if(ok){ setD(up); setContent(body); setDirty(false); setEdit(false); notify("Bloque registrado en la cadena ✓"); }
    else notify("Error al guardar","err");
    setSaving(false);
  };

  const sign = async()=>{
    const last = d.chain[d.chain.length-1];
    const b = await mineBlock(last,"FIRMA","Firma",user);
    b.sello = selloId;                       // ← NUEVO: queda en el bloque
    const up = {...d,chain:[...d.chain,b],lastModified:b.timestamp};
    const ok = await store.set(up.id,up);
    if(ok){ setD(up); setModal(null); setPass(""); notify(`✦ Firma de ${user} registrada`); }
    else notify("Error al firmar","err");
  };

  // ← NUEVO: valida el código contra el hash guardado antes de firmar
  const trySign = async()=>{
    if(!signCodeHash){ notify("No tienes código de firma configurado","err"); return; }
    const h = await sha256(pass.trim());
    if(h!==signCodeHash){ notify("Código incorrecto","err"); return; }
    await sign();
  };

  // ── BIOMETRÍA ──
  // ← NUEVO: registra Face ID / Touch ID / huella para esta cuenta y dispositivo.
  const enrollBio = async()=>{
    if(!bioOk){
      notify(window.isSecureContext
        ? "Este dispositivo no tiene verificación biométrica"
        : "La biometría requiere HTTPS", "err");
      return false;
    }
    setBioBusy(true);
    try{
      const cred = await bioRegister({ uid, name:user, email:acctEmail });
      const next = [...bioCreds.filter(c=>c.credId!==cred.credId), cred];
      const ok = await saveProfile(uid,{ bioCreds:next });
      if(!ok){ notify("No se pudo guardar la credencial","err"); return false; }
      setBioCreds(next);
      notify(`Biometría activada en ${cred.device} ✓`);
      return true;
    }catch(err){
      notify(bioError(err),"err");
      return false;
    }finally{ setBioBusy(false); }
  };

  // ← NUEVO: firma el documento validando la identidad con el enclave seguro.
  // El reto que firma el dispositivo es el hash del bloque, así que la
  // firma queda atada a ese bloque y no se puede reutilizar en otro.
  const signWithBio = async()=>{
    if(!bioCreds.length){ notify("No tienes biometría activada","err"); return; }
    setBioBusy(true);
    try{
      const last = d.chain[d.chain.length-1];
      const b = await mineBlock(last,"FIRMA",`Firma biométrica desde ${deviceLabel()}`,user);

      const challenge = hexToBytes(b.hash);
      const assertion = await bioAssert(bioCreds.map(c=>c.credId), challenge);

      const cred = bioCreds.find(c=>c.credId===assertion.credId);
      if(!cred){ notify("Credencial desconocida","err"); return; }

      // Si la llave pública está disponible, se exige que la firma sea válida.
      if(cred.publicKey){
        const valid = await bioVerify(cred, assertion, challenge);
        if(!valid){ notify("La firma biométrica no pudo verificarse","err"); return; }
      }

      b.sello = selloId;                     // ← NUEVO
      b.signature = {
        method:"webauthn",
        credId: assertion.credId,
        device: cred.device || null,
        alg: cred.alg ?? null,
        verified: !!cred.publicKey,
        signature: assertion.signature,
        authenticatorData: assertion.authenticatorData,
        clientDataJSON: assertion.clientDataJSON,
      };

      const up = {...d, chain:[...d.chain,b], lastModified:b.timestamp};
      const ok = await store.set(up.id,up);
      if(ok){ setD(up); setModal(null); setPass(""); notify(`✦ Firma biométrica de ${user} registrada`); }
      else notify("Error al firmar","err");
    }catch(err){
      notify(bioError(err),"err");
    }finally{ setBioBusy(false); }
  };

  // ── CONTRATO INTELIGENTE ──
  // ← NUEVO: la IA sólo convierte el contrato en una lista de requisitos.
  // Todo lo que valida después (fechas, faltantes) son reglas deterministas.
  const runAnalysis = async()=>{
    setSmartErr(""); setSmartBusy(true); setSmartRes(null);
    try{
      setSmartMsg("");
      const res = await analyzeContract(smartText, setSmartMsg);   // ← ACTUALIZADO: avisa si reintenta
      setSmartRes(res);
      if(!mIn.trim()) setMIn(res.titulo);
    }catch(err){
      setSmartErr(err.message);
    }finally{ setSmartBusy(false); setSmartMsg(""); }
  };

  // ── CONVERTIR UN DOCUMENTO EN CONTRATO INTELIGENTE ──
  // ← NUEVO: sólo documentos de texto. Facturas y recibos tienen plantilla
  // y no son contratos; los expedientes ya lo son.
  const puedeConvertir = (doc)=>
    Boolean(doc) && doc.kind!=="expediente" && !(doc.tplId && FORMS[doc.tplId]);

  const iniciarConversion = async()=>{
    // Un documento que funciona como comprobante de otro contrato no
    // debería volverse contrato él mismo: el vínculo quedaría sin sentido.
    const sitios = dondeEstaAdjunto(d.id, docs);
    if(sitios.length){
      notify(`Está adjunto como comprobante en «${sitios[0].expTitulo}». Retíralo de ahí antes de convertirlo.`,"err");
      return;
    }
    setSmartRes(null); setSmartErr(""); setModal({t:"convertir"});
    setSmartBusy(true);
    try{
      setSmartMsg("");
      const res = await analyzeContract(content, setSmartMsg);   // el texto tal como está en el editor
      setSmartRes(res);
    }catch(err){ setSmartErr(err.message); }
    finally{ setSmartBusy(false); setSmartMsg(""); }
  };

  // Se convierte EN SU LUGAR: mismo ID, misma cadena, mismas firmas.
  // No se crea un expediente nuevo, así el historial no se parte en dos.
  const confirmarConversion = async()=>{
    if(!smartRes?.requisitos?.length) return;
    setSaving(true);
    try{
      let chain = d.chain;
      let last  = chain[chain.length-1];
      const texto = content;

      // Si había cambios sin guardar en el editor, primero se sellan.
      if(texto !== (d.content||"")){
        const be = await mineBlock(last,"EDICIÓN",texto.slice(0,200),user);
        chain = [...chain, be]; last = be;
      }

      const b = await mineBlock(last,"CONVERSIÓN",
        `Convertido en contrato inteligente con ${smartRes.requisitos.length} requisitos`,user,
        { tipo:"expediente", requisitos:smartRes.requisitos.length, fases:(smartRes.fases||[]).length, modelo:smartRes.modelo });

      const up = {...d,
        title: title.trim() || d.title,
        content: texto,
        kind: "expediente", tplId: null, fields: null,
        requisitos: smartRes.requisitos,
        fases: smartRes.fases || [],   // ← NUEVO
        fechaLimite: smartRes.fechaLimite,
        montoTotal: smartRes.montoTotal,
        moneda: smartRes.moneda,
        partes: smartRes.partes,
        resumen: smartRes.resumen,
        analisis: { modelo:smartRes.modelo, fecha:smartRes.analizadoEn },
        convertidoDe: d.source || "documento",
        chain: [...chain, b], lastModified: b.timestamp,
      };

      if(await store.set(up.id,up)){
        setD(up); setTitle(up.title); setContent(texto);
        setEdit(false); setDirty(false); setModal(null); setSmartRes(null);
        refresh();
        notify(`Contrato inteligente con ${up.requisitos.length} requisitos ✓`);
      } else notify("No se pudo convertir","err");
    }catch(e){ console.error(e); notify("No se pudo convertir","err"); }
    finally{ setSaving(false); }
  };

  // ← NUEVO: quitar un requisito que la IA sacó de más, antes de confirmar
  // ← NUEVO: quitar una fase que la IA sacó de más; sus requisitos quedan sin fase
  const dropFase = (id)=>
    setSmartRes(r=>({ ...r,
      fases:(r.fases||[]).filter(f=>f.id!==id),
      requisitos:r.requisitos.map(q=> q.fase===id ? {...q, fase:null} : q) }));

  const dropReq = (id)=>
    setSmartRes(r=>({ ...r, requisitos:r.requisitos.filter(x=>x.id!==id) }));

  // ← NUEVO
  const createExpediente = async()=>{
    if(!smartRes) return;
    const name = mIn.trim() || smartRes.titulo;
    const id = genId();
    const numId = genNumId();
    const g = await mineBlock(null,"CREACIÓN",
      `Apertura de expediente «${name}» con ${smartRes.requisitos.length} requisitos`,user,
      { tipo:"expediente", requisitos:smartRes.requisitos.length, fases:(smartRes.fases||[]).length });

    const nd = {
      id, numId, title:name, content:smartText, folder:mIn2||null,
      owner:user, ownerUid:uid, ownerEmail:acctEmail,
      kind:"expediente",                       // ← lo distingue de un documento normal
      tplId:null, fields:null,
      requisitos: smartRes.requisitos,
        fases: smartRes.fases || [],   // ← NUEVO
      fechaLimite: smartRes.fechaLimite,
      montoTotal: smartRes.montoTotal,
      moneda: smartRes.moneda,
      partes: smartRes.partes,
      resumen: smartRes.resumen,
      // Queda registrado qué modelo produjo la lista, para poder auditarlo después.
      analisis: { modelo:smartRes.modelo, fecha:smartRes.analizadoEn },
      source:"inteligente", sourceFile:null,
      password:null, sharedWith:[], chain:[g], lastModified:g.timestamp,
    };

    const ok = await store.set(id,nd);
    if(!ok){ notify("Error al crear el expediente","err"); return; }
    closeCreate();
    setD(nd); setTitle(name); setContent(smartText); setFields({});
    setUnlocked(true); setEdit(false); setUrlDoc(id); setScreen("doc");
    notify(`Expediente abierto con ${smartRes.requisitos.length} requisitos ✓`);
  };

  // ← ACTUALIZADO: el archivo se guarda en Firestore (colección «evidencias»).
  // Las imágenes grandes se comprimen solas antes de guardarse.
  const attachEvidence = async(reqId, file)=>{
    if(!file || !d) return;
    setSaving(true);
    try{
      const hash = await hashFile(file);   // huella del archivo ORIGINAL
      const req  = d.requisitos.find(r=>r.id===reqId);

      const guardado = await uploadEvidence({ uid, docId:d.id, reqId, file });

      const last = d.chain[d.chain.length-1];
      const b = await mineBlock(last,"EVIDENCIA",
        `${req?.titulo||reqId}: «${file.name}» (${hash.slice(0,16)}…)`,user,
        { tipo:"alta", requisito:reqId, archivo:file.name });

      // ← ACTUALIZADO: se AGREGA a la lista, ya no reemplaza al anterior
      const nuevo = { aid:genId(), nombre:file.name, tipo:guardado.tipo,
                      tam:guardado.tam, tamOriginal:file.size,
                      comprimida:guardado.comprimida, hash, path:guardado.path,
                      subidoEn:b.timestamp, subidoPor:user };
      const requisitos = d.requisitos.map(r=> r.id!==reqId ? r : {
        ...quitarArchivoViejo(r), estado:"cumplido",
        archivos:[...archivosDe(r), nuevo],
      });

      // ← NUEVO: si alguien había pedido este comprobante, queda atendido
      const { solicitudes, cerradas } = cerrarSolicitudes(d, reqId, user);

      const up = {...d, requisitos, solicitudes,
                  chain:[...d.chain,b], lastModified:b.timestamp};
      const ok = await store.set(up.id,up);
      if(ok){
        setD(up);
        notify(cerradas
          ? `Evidencia registrada ✓ ${cerradas} solicitud${cerradas===1?"":"es"} atendida${cerradas===1?"":"s"}`
          : guardado.comprimida
            ? "Evidencia registrada ✓ (imagen comprimida para caber)"
            : "Evidencia registrada en la cadena ✓");
      }
      else notify("Error al registrar","err");
    }catch(e){ console.error(e); notify(storageError(e),"err"); }
    finally{ setSaving(false); }
  };

  // ← ACTUALIZADO: además de asentarlo, borra el archivo de Storage
  // ← ACTUALIZADO: retira UN comprobante, no vacía el requisito entero.
  // Un documento enlazado sólo se desvincula; el original no se toca.
  const removeEvidence = async(reqId, aid)=>{
    const req   = d.requisitos.find(r=>r.id===reqId);
    const lista = archivosDe(req);
    const arch  = lista.find(a=>aidDe(a)===aid);
    if(!arch) return;

    if(arch.origen!=="interno" && arch.path) await deleteEvidence(arch.path);

    const last = d.chain[d.chain.length-1];
    const b = await mineBlock(last,"EVIDENCIA",
      `Retiro de «${arch.nombre}» en «${req?.titulo||reqId}»`,user,
      { tipo:"baja", requisito:reqId, archivo:arch.nombre });

    const restantes = lista.filter(a=>aidDe(a)!==aid);
    const requisitos = d.requisitos.map(r=> r.id!==reqId ? r : {
      ...quitarArchivoViejo(r), archivos:restantes,
      estado: restantes.length ? "cumplido" : "pendiente",
    });
    const up = {...d, requisitos, chain:[...d.chain,b], lastModified:b.timestamp};
    if(await store.set(up.id,up)){ setD(up); notify("Comprobante retirado"); }
  };

  // ← NUEVO: verificación biométrica genérica, reutilizable por cualquier
  // acción que necesite confirmar identidad. Devuelve true o false.
  const verifyBio = async(motivo)=>{
    if(!bioOk || !bioCreds.length) return false;
    setBioBusy(true);
    try{
      const reto = crypto.getRandomValues(new Uint8Array(32));
      const assertion = await bioAssert(bioCreds.map(c=>c.credId), reto);
      const cred = bioCreds.find(c=>c.credId===assertion.credId);
      if(!cred){ notify("Credencial desconocida","err"); return false; }
      if(cred.publicKey){
        const valido = await bioVerify(cred, assertion, reto);
        if(!valido){ notify("La verificación biométrica falló","err"); return false; }
      }
      if(motivo) notify(motivo);
      return true;
    }catch(err){
      notify(bioError(err),"err");
      return false;
    }finally{ setBioBusy(false); }
  };

  // ← NUEVO: los adjuntos sólo se abren tras validar el código de firma
  const unlockFiles = async()=>{
    if(!signCodeHash){ notify("No tienes código de firma configurado","err"); return; }
    const h = await sha256(pass.trim());
    if(h!==signCodeHash){ notify("Código incorrecto","err"); return; }
    setFilesOpen(true); setPass(""); setModal(null);
    notify("Documentos desbloqueados ✓");
  };

  // ← NUEVO: misma puerta, abierta con biometría
  const unlockFilesBio = async()=>{
    if(await verifyBio("Documentos desbloqueados ✓")){
      setFilesOpen(true); setPass(""); setModal(null);
    }
  };

  // ← NUEVO: abre un documento protegido con biometría.
  // Sólo para el dueño: la contraseña existe para restringir a terceros
  // con el enlace, y la biometría de un tercero no prueba ser el dueño.
  const unlockDocBio = async()=>{
    if(d.ownerUid !== uid){
      notify("Sólo el dueño puede abrirlo con biometría","err");
      return;
    }
    if(await verifyBio("Documento desbloqueado ✓")){
      setUnlocked(true); setLockInput("");
    }
  };

  // ← NUEVO
  const getFile = async(archivo, forzarDescarga)=>{
    try{
      await openEvidence(archivo?.path, archivo?.nombre, forzarDescarga);
    }catch(e){ notify(storageError(e),"err"); }
  };

  // ← ACTUALIZADO: antes aceptaba cualquier texto. Ahora comprueba que
  // el correo corresponda a una cuenta real antes de compartir.
  const doShare = async()=>{
    const correo = mIn.trim().toLowerCase();
    setShareErr(""); setShareFound(null);

    if(!correo){ setShareErr("Escribe un correo electrónico."); return; }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)){
      setShareErr("Ese correo no tiene un formato válido."); return;
    }
    if(correo===acctEmail.toLowerCase()){
      setShareErr("Ese es tu propio correo."); return;
    }
    if((d.sharedWith||[]).includes(correo)){
      setShareErr("Ya compartiste este documento con esa persona."); return;
    }

    setShareBusy(true);
    try{
      const cuenta = await findUserByEmail(correo);
      if(!cuenta){
        setShareErr(`No se encontró ninguna cuenta con «${correo}». Verifica que esté registrada en chaindoc.`);
        return;
      }

      const last = d.chain[d.chain.length-1];
      const b = await mineBlock(last,"COMPARTIDO",
        `Compartido con ${cuenta.nombre||correo} (${correo})`,user,
        { tipo:"alta", correo });

      const up = {...d,
        sharedWith:[...(d.sharedWith||[]), correo],
        chain:[...d.chain,b], lastModified:b.timestamp};

      const ok = await store.set(up.id,up);
      if(ok){
        setD(up); setMIn(""); setShareFound(cuenta);
        notify(`Compartido con ${cuenta.nombre||correo} ✓`);
      } else setShareErr("No se pudo guardar. Inténtalo de nuevo.");
    }catch(e){ console.error(e); setShareErr("Error al compartir."); }
    finally{ setShareBusy(false); }
  };

  // ── EVIDENCIA VISUAL DEL DOCUMENTO ──
  // ← NUEVO: fotos que respaldan una factura o recibo (el ticket físico,
  // el producto recibido, la pantalla de la transferencia…).
  // La imagen completa va a Firestore; en el documento sólo queda una
  // miniatura ligera para que la galería cargue de inmediato.
  const MAX_IMGS = 12;

  const addImage = async(file)=>{
    if(!file || !d) return;
    if(!(file.type||"").startsWith("image/")){
      notify("Sólo se admiten imágenes aquí","err"); return;
    }
    if((d.imagenes||[]).length >= MAX_IMGS){
      notify(`Máximo ${MAX_IMGS} imágenes por documento`,"err"); return;
    }
    setSaving(true);
    try{
      const hash  = await hashFile(file);          // huella del original
      const thumb = await makeThumb(file);
      const g     = await uploadEvidence({ uid, docId:d.id, reqId:"img", file });

      const last = d.chain[d.chain.length-1];
      const b = await mineBlock(last,"EVIDENCIA",
        `Imagen adjunta «${file.name}» (${hash.slice(0,16)}…)`,user,
        { tipo:"imagen", archivo:file.name });

      const imagenes = [...(d.imagenes||[]), {
        path:g.path, nombre:file.name, tipo:g.tipo, tam:g.tam,
        comprimida:g.comprimida, hash, thumb,
        subidoEn:b.timestamp, subidoPor:user,
      }];

      const up = {...d, imagenes, chain:[...d.chain,b], lastModified:b.timestamp};
      if(await store.set(up.id,up)){
        setD(up);
        notify(g.comprimida ? "Imagen adjunta ✓ (comprimida)" : "Imagen adjunta ✓");
      } else notify("Error al adjuntar","err");
    }catch(e){ console.error(e); notify(storageError(e),"err"); }
    finally{ setSaving(false); }
  };

  // ← NUEVO: quitar una imagen también se asienta en la cadena
  const removeImage = async(path)=>{
    const img = (d.imagenes||[]).find(x=>x.path===path);
    await deleteEvidence(path);
    const last = d.chain[d.chain.length-1];
    const b = await mineBlock(last,"EVIDENCIA",
      `Imagen retirada «${img?.nombre||path}»`,user,
      { tipo:"imagen-baja", archivo:img?.nombre || null });
    const up = {...d, imagenes:(d.imagenes||[]).filter(x=>x.path!==path),
                chain:[...d.chain,b], lastModified:b.timestamp};
    if(await store.set(up.id,up)){ setD(up); notify("Imagen retirada"); }
  };

  // ← NUEVO: permite anotar a mano el importe de un comprobante subido.
  // Los documentos internos lo traen solos; un PDF escaneado no.
  // ← ACTUALIZADO: el importe se anota por comprobante, no por requisito
  const setMontoReq = async(reqId, aid, texto)=>{
    const n = parseFloat(String(texto).replace(/[^0-9.-]/g,""));
    const monto = Number.isFinite(n) ? n : null;
    const requisitos = d.requisitos.map(r=> r.id!==reqId ? r : {
      ...quitarArchivoViejo(r),
      archivos: archivosDe(r).map(a=> aidDe(a)!==aid ? a : {...a, monto}),
    });
    const up = {...d, requisitos};
    if(await store.set(up.id,up)) setD(up);
  };

  // ── SOLICITAR EVIDENCIA ──
  // ← NUEVO: pedirle un comprobante a otra persona. Pedir implica
  // compartir: quien recibe la petición necesita ver el expediente
  // para poder atenderla, así que ambas cosas ocurren juntas.
  const pedirEvidencia = async()=>{
    const correo = mIn.trim().toLowerCase();
    setSolErr("");

    if(!correo){ setSolErr("Escribe el correo de la persona."); return; }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)){
      setSolErr("Ese correo no tiene un formato válido."); return; }
    if(correo===acctEmail.toLowerCase()){
      setSolErr("Ese es tu propio correo."); return; }

    const yaPedido = (d.solicitudes||[]).some(
      x=>x.reqId===solReq.id && x.paraEmail===correo && x.estado==="pendiente");
    if(yaPedido){ setSolErr("Ya le pediste este comprobante a esa persona."); return; }

    setSolBusy(true);
    try{
      const cuenta = await findUserByEmail(correo);
      if(!cuenta){
        setSolErr(`No se encontró ninguna cuenta con «${correo}». Debe registrarse en chaindoc para poder responder.`);
        return;
      }

      const sol = nuevaSolicitud({
        reqId: solReq.id, reqTitulo: solReq.titulo,
        paraUid: cuenta.uid, paraEmail: correo, paraNombre: cuenta.nombre,
        deUid: uid, deNombre: user, mensaje: solMsg,
      });

      const last = d.chain[d.chain.length-1];
      const b = await mineBlock(last,"SOLICITUD",
        `Se pidió «${solReq.titulo}» a ${cuenta.nombre||correo}`,user,
        { tipo:"alta", sid:sol.sid, requisito:solReq.id, correo });

      // Pedir implica compartir: sin acceso no podría responder.
      const compartidos = (d.sharedWith||[]).includes(correo)
        ? d.sharedWith : [...(d.sharedWith||[]), correo];

      const up = {...d,
        solicitudes:[...(d.solicitudes||[]), sol],
        sharedWith: compartidos,
        chain:[...d.chain,b], lastModified:b.timestamp};

      if(await store.set(up.id,up)){
        setD(up); setModal(null); setMIn(""); setSolMsg(""); setSolReq(null);
        notify(`Se le pidió a ${cuenta.nombre||correo} ✓`);
      } else setSolErr("No se pudo guardar. Inténtalo de nuevo.");
    }catch(e){ console.error(e); setSolErr("Error al enviar la solicitud."); }
    finally{ setSolBusy(false); }
  };

  // ← NUEVO: retirar una solicitud que ya no aplica
  const cancelarSolicitud = async(sid)=>{
    const sol = (d.solicitudes||[]).find(x=>x.sid===sid);
    if(!sol) return;
    const last = d.chain[d.chain.length-1];
    const b = await mineBlock(last,"SOLICITUD",
      `Se canceló la petición de «${sol.reqTitulo}» a ${sol.paraNombre||sol.paraEmail}`,user,
      { tipo:"cancelada", sid, requisito:sol.reqId });
    const up = {...d,
      solicitudes:(d.solicitudes||[]).map(x=> x.sid!==sid ? x
        : {...x, estado:"cancelada", resueltaEn:b.timestamp}),
      chain:[...d.chain,b], lastModified:b.timestamp};
    if(await store.set(up.id,up)){ setD(up); notify("Solicitud cancelada"); }
  };

  // ── PAQUETE DE EVIDENCIA ──
  // ← NUEVO: exporta el expediente como HTML autocontenido que un
  // tercero verifica sin cuenta, sin internet y sin confiar en nosotros.
  const exportarPaquete = async()=>{
    try{
      const nombre = descargarPaquete(d);
      const last = d.chain[d.chain.length-1];
      const b = await mineBlock(last,"EXPORTACIÓN",
        `Se generó el paquete de evidencia «${nombre}»`,user,
        { tipo:"paquete", archivo:nombre, bloques:d.chain.length });
      const up = {...d, chain:[...d.chain,b]};   // no toca lastModified
      if(await store.set(up.id,up)) setD(up);
      notify("Paquete de evidencia descargado ✓");
    }catch(e){ console.error(e); notify("No se pudo generar el paquete","err"); }
  };

  // ── ADJUNTAR A UN EXPEDIENTE ──
  // ← NUEVO: trae los expedientes propios y los que me compartieron.
  const openExpedientes = async()=>{
    setExps(null); setLinkSitios([]);
    const lista = await store.list(uid, acctEmail);
    // ← NUEVO: se revisa con la lista recién leída, no con la del inicio,
    // para que un vínculo hecho hace un momento también cuente.
    setLinkSitios(dondeEstaAdjunto(d.id, lista));
    setExps(lista
      .filter(x=>x.kind==="expediente")
      .sort((a,b)=>new Date(b.lastModified)-new Date(a.lastModified)));
  };

  // ← NUEVO: enlaza ESTE documento como comprobante de un requisito.
  // No se copia nada: el expediente guarda una referencia y la huella
  // del último bloque, así se puede detectar si el documento cambió.
  const linkToExpediente = async(exp, reqId)=>{
    setLinkErr("");
    // ← NUEVO: regla dura. Un comprobante justifica UN solo contrato.
    // Se valida aquí además de en la interfaz, para que no dependa de
    // que el botón esté deshabilitado.
    const enOtro = dondeEstaAdjunto(d.id, exps||[]).filter(x=>x.expId!==exp.id);
    if(enOtro.length){
      setLinkErr(`Ya está adjuntado a «${enOtro[0].expTitulo}». Retíralo de ahí antes de adjuntarlo a otro contrato.`);
      return;
    }
    setLinkBusy(true);
    try{
      const req = exp.requisitos.find(r=>r.id===reqId);
      const cabeza = d.chain[d.chain.length-1];

      const last = exp.chain[exp.chain.length-1];
      const b = await mineBlock(last,"EVIDENCIA",
        `${req?.titulo||reqId}: documento «${d.title}» (${d.numId})`,user,
        { tipo:"vinculo", requisito:reqId, docId:d.id, numId:d.numId });

      // ← ACTUALIZADO: se AGREGA a la lista del requisito
      const nuevo = { aid:genId(), origen:"interno",
                      docId:d.id, numId:d.numId, nombre:d.title,
                      tipo:d.kind==="expediente"?"expediente":(d.tplId||"documento"),
                      hash:cabeza.hash, bloques:d.chain.length,
                      monto: montoDeDocumento(d),   // leído de su plantilla
                      subidoEn:b.timestamp, subidoPor:user };
      const requisitos = exp.requisitos.map(r=> r.id!==reqId ? r : {
        ...quitarArchivoViejo(r), estado:"cumplido",
        archivos:[...archivosDe(r), nuevo],
      });

      // ← NUEVO: cierra las solicitudes que este documento atiende
      const { solicitudes } = cerrarSolicitudes(exp, reqId, user);

      const up = {...exp, requisitos, solicitudes,
                  chain:[...exp.chain,b], lastModified:b.timestamp};
      const ok = await store.set(up.id,up);
      if(!ok){ setLinkErr("No se pudo adjuntar. Inténtalo de nuevo."); return; }

      // El documento fuente también asienta que quedó vinculado.
      const b2 = await mineBlock(cabeza,"VINCULADO",
        `Adjuntado al expediente «${exp.title}» como ${req?.titulo||reqId}`,user);
      const src = {...d, chain:[...d.chain,b2], lastModified:b2.timestamp};
      if(await store.set(src.id,src)) setD(src);

      setModal(null); setLinkExp(null);
      refresh();   // ← NUEVO: así el aviso de duplicado aparece de inmediato
      notify(`Adjuntado a «${exp.title}» ✓`);
    }catch(e){ console.error(e); setLinkErr("Error al adjuntar."); }
    finally{ setLinkBusy(false); }
  };

  // ← NUEVO: retirar el acceso también queda asentado en la cadena
  const revokeShare = async(correo)=>{
    const last = d.chain[d.chain.length-1];
    const b = await mineBlock(last,"COMPARTIDO",`Acceso retirado a ${correo}`,user,
      { tipo:"revocado", correo });
    const up = {...d,
      sharedWith:(d.sharedWith||[]).filter(x=>x!==correo),
      chain:[...d.chain,b], lastModified:b.timestamp};
    if(await store.set(up.id,up)){ setD(up); notify(`Acceso retirado a ${correo}`); }
  };

  const setLock = async(pw)=>{
    const up = {...d,password:pw||null};
    await store.set(up.id,up);
    setD(up); setModal(null); setPass("");
    notify(pw?"Documento protegido 🔒":"Protección removida");
  };

  const delDoc = async(id)=>{
    const ok = await store.del(id);
    if(ok){ await refresh(); notify("Documento eliminado"); } else notify("Error","err");
    setModal(null);
  };

  const moveTo = async(id,f)=>{
    const dd = await store.get(id); if(!dd) return;
    await store.set(id,{...dd,folder:f});
    await refresh(); setModal(null); notify(`Movido a "${f||"Sin carpeta"}"`);
  };

  // ← NUEVO: asienta que alguien abrió un documento compartido.
  // Una vez por persona y día: ver `debeRegistrarConsulta`.
  const registrarConsulta = async(doc)=>{
    if(!debeRegistrarConsulta(doc, uid, acctEmail)) return doc;
    try{
      const last = doc.chain[doc.chain.length-1];
      const b = await mineBlock(last,"CONSULTA",
        `${user} consultó el documento`,user,
        { uid, email:acctEmail || null });
      const up = {...doc, chain:[...doc.chain,b]};   // no toca lastModified
      if(await store.set(up.id,up)){ setD(up); return up; }
    }catch(e){ console.error(e); }   // nunca debe impedir abrir el documento
    return doc;
  };

  // ← ACTUALIZADO: `foco` marca el comprobante duplicado que hay que resaltar
  const openDoc = async(id, foco=null)=>{
    const dd = await store.get(id); if(!dd){ notify("No encontrado","err"); return; }
    setFocoDup(foco);
    setD(dd); setTitle(dd.title); setContent(dd.content||"");
    setFields(dd.fields||{});                                   // ← NUEVO
    setFilesOpen(false);                                        // ← NUEVO: se re-bloquea al abrir otro
    setVinculos({});                                            // ← NUEVO: limpia el anterior
    setFaseSel(null);                                           // ← NUEVO
    setUnlocked(!dd.password); setEdit(false); setDirty(false);
    setUrlDoc(id); setScreen("doc");
    verificarVinculos(dd);                                      // ← NUEVO: sin await, no bloquea
    registrarConsulta(dd);                                      // ← NUEVO: en segundo plano
  };

  // ← NUEVO: desde un aviso de duplicado, ir al lugar donde se adjuntó
  // más recientemente (el que probablemente sobra) y resaltarlo ahí.
  const irADuplicado = (grupo, ubicacion=null)=>{
    const dest = ubicacion || destinoDuplicado(grupo);
    if(!dest){ notify("No se encontró el documento","err"); return; }
    setModal(null);
    window.scrollTo({ top:0 });
    openDoc(dest.docId, grupo.clave);
  };

  const goHome = async()=>{
    setFocoDup(null);
    setUrlDoc(null); setD(null); setHist(false); setVerify(null); setEdit(false);
    setScreen("loading"); await refresh(); setScreen("home");
  };

  const doVerify = async()=>{
    const r = await verifyChain(d.chain);
    setVerify(r); setTimeout(()=>setVerify(null),7000);
  };

  const copyLink = (id)=>{
    navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?doc=${id||d.id}`);
    notify("Enlace copiado ✓");
  };

  // ── RENDER: LOADING ──
  if(screen==="loading") return (<><style>{CSS}</style>
    <div className="loading"><div className="spin"/><p>Conectando con la cadena…</p></div></>);

  // ── RENDER: AUTH ──
  if(screen==="auth"){
    return (<><style>{CSS}</style>
      {notif && <div className={`notif ${notif.t}`}>{notif.m}</div>}
      <div className="auth-wrap"><div className="auth-card">
        {/* ← NUEVO: pantalla de inicio de sesión */}
        {authMode==="login" && (<>
          <h1 className="auth-title">Iniciar sesión</h1>
          <p className="auth-sub">Entra con la cuenta que ya creaste.</p>
          <input className="inp" type="email" autoComplete="email" placeholder="Correo electrónico"
            value={email} onChange={e=>setEmail(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&doLogin()} />
          <input className="inp" type="password" autoComplete="current-password" placeholder="Contraseña"
            value={pass} onChange={e=>setPass(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&doLogin()} />
          <div className="auth-actions">
            <button className="btn btn-tertiary" onClick={()=>switchAuth("signup")}>
              ¿No tienes cuenta? Créala
            </button>
            <button className="btn btn-primary" onClick={doLogin} disabled={authBusy}>
              {authBusy ? "Entrando…" : "Entrar"}
            </button>
          </div>
          <button className="btn btn-tertiary" style={{marginTop:4}} onClick={doReset}>
            ¿Olvidaste tu contraseña?
          </button>
        </>)}

        {authMode==="signup" && authStep===0 && (<>
          <h1 className="auth-title">Crear cuenta</h1>
          <p className="auth-sub">Documentos con registro inalterable en cadena criptográfica.</p>
          <input className="inp" placeholder="Nombre completo" value={mIn} onChange={e=>setMIn(e.target.value)} />
          <input className="inp" type="email" autoComplete="email" placeholder="Correo electrónico"
            value={email} onChange={e=>setEmail(e.target.value)} />
          <input className="inp" type="password" autoComplete="new-password"
            placeholder="Contraseña (mínimo 6 caracteres)" value={pass} onChange={e=>setPass(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&doSignup()} />
          <div className="auth-actions">
            {/* ← ACTUALIZADO: este botón no tenía onClick, por eso no hacía nada */}
            <button className="btn btn-tertiary" onClick={()=>switchAuth("login")}>
              ¿Ya tienes cuenta? Inicia sesión
            </button>
            <button className="btn btn-primary" onClick={doSignup} disabled={authBusy}>
              {authBusy ? "Creando…" : "Continuar"}
            </button>
          </div>
          <div className="dots"><span className="dot on"/><span className="dot"/></div>
        </>)}

        {authMode==="signup" && authStep===1 && (<>
          <h1 className="auth-title">Código de firma</h1>
          <p className="auth-sub" style={{marginBottom:24,textAlign:"left"}}>
            Crea un código para firmar tus documentos. Este código es independiente a tu contraseña de la cuenta;
            lo podrás cambiar las veces que quieras en configuración.
          </p>
          <input className="inp" type="password" placeholder="Código de firma" value={pass}
            onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doSignCode()} />
          <div className="auth-actions">
            {/* ← ACTUALIZADO: ya no hay "Atrás". La cuenta ya existe en este punto;
                regresar al formulario intentaría crearla otra vez. */}
            <button className="btn btn-primary" onClick={doSignCode}>Continuar</button>
          </div>
          <div className="dots"><span className="dot"/><span className="dot on"/></div>
        </>)}

        {authMode==="signup" && authStep===2 && (<>
          {/* ← ACTUALIZADO: antes sólo mostraba una notificación sin hacer nada. */}
          <p className="auth-sub" style={{fontSize:20,color:"var(--negro)",marginBottom:12}}>
            {bioOk
              ? "¿Deseas activar el desbloqueo biométrico para firmar tus documentos?"
              : "Este dispositivo no tiene verificación biométrica disponible."}
          </p>
          <p className="auth-sub" style={{fontSize:14,marginBottom:24}}>
            {bioOk
              ? `Se registrará en ${deviceLabel()}. Tu código de firma seguirá funcionando como respaldo.`
              : window.isSecureContext
                ? "Podrás activarla más tarde desde Configuración."
                : "La biometría requiere una conexión segura (HTTPS)."}
          </p>
          <div className="auth-actions">
            <button className="btn btn-secondary" onClick={finishAuth} disabled={bioBusy}>
              {bioOk ? "Ahora no" : "Continuar"}
            </button>
            {bioOk && (
              <button className="btn btn-primary" disabled={bioBusy}
                onClick={async()=>{ await enrollBio(); finishAuth(); }}>
                {bioBusy ? "Esperando…" : "Activar"}
              </button>
            )}
          </div>
          {bioOk && (
            <div className="fingerprint" onClick={async()=>{ if(!bioBusy){ await enrollBio(); finishAuth(); } }}>
              <IcoFinger/>
            </div>
          )}
        </>)}
      </div></div>
    </>);
  }

  // ── RENDER: HOME ──
  if(screen==="home"){
    const recientes = docs.slice(0,3);
    // ← ACTUALIZADO: se compara por uid, no por nombre (dos personas pueden llamarse igual)
    const mine      = docs.filter(x=>x.ownerUid===uid);
    const shared    = docs.filter(x=>x.ownerUid!==uid);
    const shown     = filterF ? docs.filter(x=>x.folder===filterF) : (view==="documentos"?mine:docs);

    const Card = (x)=>{
      const sg = x.chain.filter(b=>b.action==="FIRMA").length;
      // ← NUEVO: estado del expediente para el distintivo de la tarjeta
      const ex = x.kind==="expediente" ? expedienteStatus(x) : null;
      return (
        <div key={x.id} className="card" onClick={()=>openDoc(x.id)}>
          <div className="card-h">
            <span className="card-t">{x.title}</span>
            <button className="icon-btn" style={{color:"var(--gris-200)"}}
              onClick={e=>{e.stopPropagation();setDrop(drop===x.id?null:x.id);}}><IcoDots/></button>
          </div>
          <div className="card-prev">{x.content||"Sin contenido aún…"}</div>
          <div className="card-meta">Última edición: {fmtShort(x.lastModified)}</div>
          <div className="chips">
            {/* ← NUEVO: los expedientes muestran su avance */}
            {ex && (
              <span className={`chip chip-exp ${ex.estado}`}>
                {ex.completo ? "✓ Expediente completo"
                 : ex.vencido ? `⚠ Vencido · ${ex.cumplidos}/${ex.total}`
                 : `${ex.cumplidos}/${ex.total} comprobantes`}
              </span>
            )}
            <span className="chip chip-b">{x.chain.length} bloques</span>
            {sg>0 && <span className="chip chip-s">✦ {sg} firma{sg!==1?"s":""}</span>}
            {x.folder && <span className="chip chip-f">📁 {x.folder}</span>}
            {x.password && <span className="chip chip-l">🔒 Protegido</span>}
            {x.source==="importado" && <span className="chip chip-l">📄 Importado</span>}
            {x.source==="escaneo" && <span className="chip chip-l">📷 Escaneado</span>}
          </div>
          {drop===x.id && (
            <div className="drop" onClick={e=>e.stopPropagation()}>
              <button onClick={()=>{openDoc(x.id);setDrop(null);}}>Abrir</button>
              <button onClick={()=>{setMIn2(x.folder||"");setModal({t:"move",id:x.id});setDrop(null);}}>Mover a carpeta</button>
              <button onClick={()=>{copyLink(x.id);setDrop(null);}}>Copiar enlace</button>
              <button className="danger" onClick={()=>{setModal({t:"del",id:x.id,name:x.title});setDrop(null);}}>Eliminar</button>
            </div>
          )}
        </div>
      );
    };

    return (<><style>{CSS}</style>
      {notif && <div className={`notif ${notif.t}`}>{notif.m}</div>}

      <nav className="nav">
        <span className="nav-title">Hola {user.split(" ")[0]}</span>
        <div className="nav-actions">
          <button className={`btn btn-secondary ${view==="inicio"?"on":""}`} onClick={()=>{setView("inicio");setFilterF(null);}}>Inicio</button>
          <button className={`btn btn-secondary ${view==="carpetas"?"on":""}`} onClick={()=>{setView("carpetas");setFilterF(null);}}>Mis carpetas</button>
          <button className={`btn btn-secondary ${view==="documentos"?"on":""}`} onClick={()=>{setView("documentos");setFilterF(null);}}>Mis documentos</button>
          <button className={`btn btn-secondary ${view==="compartidos"?"on":""}`} onClick={()=>{setView("compartidos");setFilterF(null);}}>Compartidos conmigo</button>
          <button className="hamburger" onClick={()=>setMenu(true)}><span/><span/><span/></button>
        </div>
      </nav>

      <div className="page">
        {view==="inicio" && (<>
          {/* ← NUEVO: lo que otras personas te pidieron. Va primero
              porque es trabajo de alguien más esperando por ti. */}
          {(()=>{
            const pend = misPendientes(docs, uid, acctEmail);
            const esperas = misEsperas(docs, uid);
            if(!pend.length && !esperas.length) return null;
            return (
              <div className="pv pend">
                {pend.length>0 && (<>
                  <div className="pv-h">
                    <Icon n="assignment_late" size={20}/>
                    <span className="pv-titulo">Te pidieron</span>
                    <span className="adj-n">{pend.length}</span>
                  </div>
                  {pend.map(({sol,doc,req,dias,vencido})=>(
                    <div key={sol.sid} className="pv-row" onClick={()=>openDoc(doc.id)}>
                      <div className="pv-b">
                        <div className="pv-t">{sol.reqTitulo}</div>
                        <div className="pv-m">
                          {doc.title} · lo pidió {sol.deNombre}
                          {req?.monto!=null && ` · ${fmtMonto(req.monto, doc.moneda||"MXN")}`}
                          {sol.mensaje && ` — «${sol.mensaje}»`}
                        </div>
                      </div>
                      <span className={`pv-chip ${vencido?"vencido":dias!=null&&dias<=7?"urgente":""}`}>
                        {vencido ? "vencido" : dias!=null ? (dias===0?"hoy":`en ${dias} d`) : "sin fecha"}
                      </span>
                    </div>
                  ))}
                </>)}

                {esperas.length>0 && (<>
                  <div className="pv-h" style={{marginTop:pend.length?16:0}}>
                    <Icon n="hourglass_empty" size={20}/>
                    <span className="pv-titulo">Esperas respuesta</span>
                    <span className="adj-n">{esperas.length}</span>
                  </div>
                  {esperas.map(({sol,doc})=>(
                    <div key={sol.sid} className="pv-row" onClick={()=>openDoc(doc.id)}>
                      <div className="pv-b">
                        <div className="pv-t">{sol.reqTitulo}</div>
                        <div className="pv-m">
                          {doc.title} · se lo pediste a {sol.paraNombre||sol.paraEmail}
                        </div>
                      </div>
                      <span className="pv-chip">{fmtShort(sol.creadaEn)}</span>
                    </div>
                  ))}
                </>)}
              </div>
            );
          })()}

          {/* ← NUEVO: panel de vencimientos. Lo que exige atención hoy,
              cruzando todos los expedientes. Sólo aparece si hay algo. */}
          {(()=>{
            const pl = panelExpedientes(docs);
            if(!pl.total) return null;
            const urgentes = [...pl.vencidos, ...pl.porVencer];
            const dupGraves = pl.duplicados.filter(g=>g.alcance==="entre-expedientes");
            if(!urgentes.length && !pl.detenidos.length && !dupGraves.length) return null;

            const Fila = (f, tono)=>(
              <div key={f.doc.id} className={`pv-row ${tono}`} onClick={()=>openDoc(f.doc.id)}>
                <div className="pv-b">
                  <div className="pv-t">{f.doc.title}</div>
                  <div className="pv-m">
                    {f.st.cumplidos}/{f.st.total} comprobantes
                    {f.mt.base!=null && ` · ${fmtMonto(f.mt.comprobado ?? 0, f.mt.moneda)} de ${fmtMonto(f.mt.base, f.mt.moneda)}`}
                  </div>
                  {/* ← NUEVO: cuando lo que apremia es una fase intermedia, se dice cuál */}
                  {f.hito && tono!=="quieto" && (
                    <div className="pv-fase">Fase {f.hito.n}: {f.hito.titulo}</div>
                  )}
                </div>
                <span className={`pv-chip ${tono}`}>
                  {/* ← ACTUALIZADO: usa los días de la fase más apremiante si la hay */}
                  {tono==="vencido"  ? `venció hace ${Math.abs(f.dias)} d`
                 : tono==="urgente"  ? (f.dias===0 ? "vence hoy" : `en ${f.dias} d`)
                 : `${f.inactivo} d sin actividad`}
                </span>
              </div>
            );

            return (
              <div className="pv">
                <div className="pv-h">
                  <Icon n="notifications" size={20}/>
                  <span className="pv-titulo">Requiere atención</span>
                  <span className="adj-n">{pl.alertas}</span>
                </div>

                {pl.vencidos.map(f=>Fila(f,"vencido"))}
                {pl.porVencer.map(f=>Fila(f,"urgente"))}
                {pl.detenidos.map(f=>Fila(f,"quieto"))}

                {/* ← ACTUALIZADO: ahora lleva al último lugar donde se adjuntó */}
                {dupGraves.map(g=>{
                  const dest = destinoDuplicado(g);
                  return (
                  <div key={g.clave} className="pv-row dup" onClick={()=>irADuplicado(g)}>
                    <div className="pv-b">
                      <div className="pv-t">«{g.nombre}» en {g.veces} expedientes</div>
                      <div className="pv-m">
                        {g.ubicaciones.map(u=>u.docTitulo).join(" · ")}
                        {g.monto!=null && ` — ${fmtMonto(g.monto,"MXN")} c/u`}
                      </div>
                      {dest && <div className="pv-ir">Ver en «{dest.docTitulo}» →</div>}
                    </div>
                    <span className="pv-chip dup">huella repetida</span>
                  </div>
                  );
                })}

                <div className="pv-pie">
                  {pl.enCurso.length} en curso · {pl.completos.length} completo{pl.completos.length===1?"":"s"}
                </div>
              </div>
            );
          })()}

          <h2 className="page-title">Recientes</h2>

          <div className="sec-h" onClick={()=>setOpenSec({...openSec,carp:!openSec.carp})}>
            <span className={`sec-arrow ${openSec.carp?"":"closed"}`}>⌄</span>
            <span className="sec-t">Carpetas</span>
          </div>
          {openSec.carp && (
            <div className="folders">
              {folders.map(f=>(
                <div key={f} className="folder" onClick={()=>{setFilterF(f);setView("documentos");}}>
                  <IcoFolder/><span className="folder-n">{f}</span>
                  <button className="icon-btn" style={{color:"var(--gris-200)",fontSize:20}}
                    onClick={e=>{e.stopPropagation();setDrop(drop===`f-${f}`?null:`f-${f}`);}}><IcoDots/></button>
                  {drop===`f-${f}` && (
                    <div className="drop" style={{top:"100%",marginTop:4}} onClick={e=>e.stopPropagation()}>
                      <button onClick={()=>{setFilterF(f);setView("documentos");setDrop(null);}}>Ver documentos</button>
                      <button className="danger" onClick={()=>{setFolders(folders.filter(y=>y!==f));setDrop(null);}}>Eliminar carpeta</button>
                    </div>
                  )}
                </div>
              ))}
              <div className="folder dashed" onClick={()=>{setMIn("");setModal({t:"newFolder"});}}>
                <IcoFolder/><span className="folder-n">Nueva carpeta</span>
              </div>
            </div>
          )}

          <div className="sec-h" onClick={()=>setOpenSec({...openSec,docs:!openSec.docs})}>
            <span className={`sec-arrow ${openSec.docs?"":"closed"}`}>⌄</span>
            <span className="sec-t">Documentos</span>
          </div>
          {openSec.docs && (recientes.length
            ? <div className="cards">{recientes.map(Card)}</div>
            : <div className="empty">No hay documentos aún.<br/>Crea el primero con el botón de abajo.</div>)}

          <div className="sec-h" onClick={()=>setOpenSec({...openSec,comp:!openSec.comp})}>
            <span className={`sec-arrow ${openSec.comp?"":"closed"}`}>⌄</span>
            <span className="sec-t">Compartidos conmigo</span>
          </div>
          {openSec.comp && (shared.length
            ? <div className="cards">{shared.slice(0,3).map(Card)}</div>
            : <div className="empty">Aún no te han compartido documentos.</div>)}
        </>)}

        {view==="carpetas" && (<>
          <h2 className="page-title">Mis carpetas</h2>
          <div className="folders">
            {folders.map(f=>(
              <div key={f} className="folder" onClick={()=>{setFilterF(f);setView("documentos");}}>
                <IcoFolder/><span className="folder-n">{f}</span>
                <button className="icon-btn" style={{color:"var(--gris-200)"}}
                  onClick={e=>{e.stopPropagation();setDrop(drop===`f2-${f}`?null:`f2-${f}`);}}><IcoDots/></button>
                {drop===`f2-${f}` && (
                  <div className="drop" style={{top:"100%",marginTop:4}} onClick={e=>e.stopPropagation()}>
                    <button onClick={()=>{setFilterF(f);setView("documentos");setDrop(null);}}>Ver documentos</button>
                    <button className="danger" onClick={()=>{setFolders(folders.filter(y=>y!==f));setDrop(null);}}>Eliminar carpeta</button>
                  </div>
                )}
              </div>
            ))}
            <div className="folder dashed" onClick={()=>{setMIn("");setModal({t:"newFolder"});}}>
              <IcoFolder/><span className="folder-n">Nueva carpeta</span>
            </div>
          </div>
        </>)}

        {view==="documentos" && (<>
          <h2 className="page-title">{filterF?`Carpeta: ${filterF}`:"Documentos"}
            {filterF && <button className="btn btn-tertiary" style={{marginLeft:16,fontSize:15}} onClick={()=>setFilterF(null)}>✕ Quitar filtro</button>}
          </h2>
          {shown.length ? <div className="cards">{shown.map(Card)}</div>
                        : <div className="empty">No hay documentos aquí.</div>}
        </>)}

        {view==="compartidos" && (<>
          <h2 className="page-title">Compartidos conmigo</h2>
          {shared.length ? <div className="cards">{shared.map(Card)}</div>
                         : <div className="empty">Aún no te han compartido documentos.</div>}
        </>)}

        <div className="create-zone">
          <button className="create-btn" onClick={openCreate}>
            <span>Crear documento</span><b>+</b>
          </button>
        </div>
      </div>

      {menuOpen && SideMenu()}
      {modal && Modals()}
    </>);
  }

  // ── RENDER: DOC ──
  const sigs = d.chain.filter(b=>b.action==="FIRMA");
  const eds  = d.chain.filter(b=>b.action==="EDICIÓN"||b.action==="CREACIÓN");
  // ← ACTUALIZADO: los vínculos a expedientes también salen en esta pestaña
  const shs  = d.chain.filter(b=>b.action==="COMPARTIDO"||b.action==="VINCULADO");
  const iSigned = sigs.some(b=>b.author===user);

  if(d.password && !unlocked){
    const puedeBio = bioOk && bioCreds.length>0 && d.ownerUid===uid;   // ← NUEVO
    return (<><style>{CSS}</style>
      {notif && <div className={`notif ${notif.t}`}>{notif.m}</div>}
      <nav className="nav">
        <div className="nav-id"><button className="icon-btn" onClick={goHome}><IcoBack/></button>Documento protegido</div>
      </nav>
      <div className="lock-wrap">
        <div className="lock-ico">🔒</div>
        <div className="lock-t">Este documento está protegido</div>
        <div className="lock-s">
          {puedeBio ? "Usa tu biometría o ingresa la contraseña." : "Ingresa la contraseña para verlo."}
        </div>

        {/* ← NUEVO: atajo biométrico, sólo visible para el dueño */}
        {puedeBio && (<>
          <button className="btn btn-primary" style={{maxWidth:360,width:"100%"}}
            disabled={bioBusy} onClick={unlockDocBio}>
            {bioBusy ? "Esperando verificación…"
              : `Desbloquear con ${deviceLabel()==="iPhone"||deviceLabel()==="iPad"?"Face ID":"tu biometría"}`}
          </button>
          <div className="fingerprint" onClick={()=>{ if(!bioBusy) unlockDocBio(); }}><IcoFinger/></div>
          <div className="sign-or" style={{maxWidth:360,width:"100%"}}><span>o usa la contraseña</span></div>
        </>)}

        <input className="inp" style={{maxWidth:360}} type="password" placeholder="Contraseña"
          value={lockInput} onChange={e=>setLockInput(e.target.value)}
          onKeyDown={e=>{ if(e.key==="Enter"){ if(lockInput===d.password){setUnlocked(true);setLockInput("");} else notify("Contraseña incorrecta","err"); }}} />
        <button className="btn btn-primary" onClick={()=>{ if(lockInput===d.password){setUnlocked(true);setLockInput("");} else notify("Contraseña incorrecta","err"); }}>Desbloquear</button>
      </div>
    </>);
  }

  return (<><style>{CSS}</style>
    {notif && <div className={`notif ${notif.t}`}>{notif.m}</div>}

    <nav className="nav">
      <div className="nav-id">
        <button className="icon-btn" onClick={goHome}><IcoBack/></button>
        ID:<span className="num">{d.numId||d.id}</span>
      </div>
      <div className="nav-actions">
        {editMode && (
          <div className="toggle-wrap" onClick={()=>{ if(d.password) setLock(null); else {setPass("");setModal({t:"lock"});} }}>
            <span className="toggle-lbl">candado de seguridad</span>
            <div className={`toggle ${d.password?"on":""}`}/>
          </div>
        )}
        {!editMode && <button className="btn btn-secondary" onClick={()=>setEdit(true)}>Editar</button>}
        {editMode && <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?"Guardando…":"Guardar"}</button>}
        {/* ← NUEVO: vincula este documento a un expediente como comprobante.
            No aparece en los expedientes: uno no se adjunta a sí mismo. */}
        {d.kind!=="expediente" && (
          <button className="btn btn-secondary"
            onClick={()=>{setLinkExp(null);setLinkErr("");setModal({t:"linkTo"});openExpedientes();}}>
            Adjuntar a
          </button>
        )}
        <button className="btn btn-secondary" onClick={()=>{setMIn("");setModal({t:"share"});}}>Compartir</button>
        <button className="btn btn-secondary" onClick={()=>setHist(true)}>Ver historial</button>
        <button className="hamburger" onClick={()=>setMenu(true)}><span/><span/><span/></button>
      </div>
    </nav>

    <div className="page">
      <div className="doc-title-bar">
        {editMode
          ? <input className="doc-title" value={title} placeholder="Título del documento"
              onChange={e=>{setTitle(e.target.value);setDirty(true);}} />
          : <h1 className="doc-title">{d.title}</h1>}
      </div>

      {/* ← NUEVO: en edición, un documento de texto puede volverse contrato inteligente */}
      {editMode && puedeConvertir(d) && (
        <div className="convertir">
          <div className="convertir-b">
            <Icon n="rule" size={22}/>
            <div>
              <strong>¿Es un contrato?</strong>
              <span>
                Conviértelo en contrato inteligente: la IA extrae los comprobantes que habrá que
                reunir y el documento conserva su historial, firmas e ID.
              </span>
            </div>
          </div>
          <button className="btn btn-primary" onClick={iniciarConversion}
            disabled={smartBusy || saving || !aiConfigured()}>
            Convertir a contrato inteligente
          </button>
        </div>
      )}

      {verifyRes && (
        <div className={`vban ${verifyRes.valid?"ok":"bad"}`}>
          {verifyRes.valid
            ? "✓ Cadena íntegra — todos los bloques son criptográficamente válidos"
            : `✗ Cadena comprometida — fallo detectado en el bloque #${verifyRes.failedAt}`}
        </div>
      )}

      <div className="paper">
        {/* ← NUEVO: los expedientes se ven como lista de comprobantes, no como papel */}
        {d.kind==="expediente" ? (()=>{
          const st = expedienteStatus(d);
          const mt = calcularMontos(d);   // ← NUEVO: derivado, no almacenado
          const rv = resumenVinculos(vinculos);   // ← NUEVO
          // ← ACTUALIZADO: se usa la versión viva del expediente abierto, no la
          // copia de la lista, para que un vínculo recién hecho ya cuente.
          const docsVivos = docs.some(x=>x.id===d.id) ? docs.map(x=>x.id===d.id?d:x) : [...docs, d];
          const dups = duplicadosDe(duplicados(docsVivos), d.id);
          const dupPorClave = Object.fromEntries(dups.map(g=>[g.clave, g]));
          const focoGrupo = focoDup ? dupPorClave[focoDup] : null;
          const fases = estadoFases(d);          // ← NUEVO
          const fActual = faseActual(d);         // ← NUEVO
          const faseSelOk = faseSel && fases.some(f=>f.id===faseSel) ? faseSel : null;
          return (<div className="exp">
            <div className={`exp-head ${st.estado}`}>
              <div className="exp-bar-wrap">
                <div className="exp-bar"><div className="exp-fill" style={{width:`${st.porcentaje}%`}}/></div>
                <span className="exp-count">{st.cumplidos} de {st.total}</span>
              </div>
              <div className="exp-state">
                {st.completo ? "Expediente completo"
                 : st.vencido ? "Fecha límite vencida"
                 : st.dias!=null ? `Faltan ${st.dias} día${st.dias===1?"":"s"}`
                 : "En curso"}
                {/* ← NUEVO: el siguiente hito, si vence antes que el contrato */}
                {!st.completo && fActual && fActual.dias!=null && (
                  <span className={`exp-hito ${fActual.vencida?"mal":""}`}>
                    {" · "}Fase {fActual.n} «{fActual.titulo}»{" "}
                    {fActual.vencida ? `venció hace ${Math.abs(fActual.dias)} d`
                      : fActual.dias===0 ? "vence hoy" : `en ${fActual.dias} d`}
                  </span>
                )}
              </div>
            </div>

            {/* ← NUEVO: alerta de integridad. Sólo aparece cuando hay algo
                que reportar; el caso normal no dice nada. */}
            {(rv.alterados>0 || rv.faltantes>0) && (
              <div className="vin-alerta">
                <Icon n="warning" size={20}/>
                <div>
                  <strong>
                    {rv.alterados>0 && `${rv.alterados} comprobante${rv.alterados===1?"":"s"} con la cadena reescrita`}
                    {rv.alterados>0 && rv.faltantes>0 && " · "}
                    {rv.faltantes>0 && `${rv.faltantes} sin acceso`}
                  </strong>
                  <div className="vin-alerta-s">
                    La huella que se registró al adjuntarlos ya no corresponde con su historia actual.
                  </div>
                </div>
              </div>
            )}
            {/* ← NUEVO: el mismo archivo comprobando dos gastos distintos */}
            {/* ← NUEVO: fases del contrato, cada una con su propio contador.
                Tocar una fase filtra los requisitos que le corresponden. */}
            {fases.length>0 && (
              <div className="fases">
                <div className="fases-h">
                  <span className="fases-t">Fases del contrato</span>
                  <span className="adj-n">{fases.filter(f=>f.completa).length}/{fases.length}</span>
                </div>
                <div className="fases-lista">
                  {fases.map(f=>{
                    const actual = fActual && fActual.id===f.id;
                    return (
                      <button key={f.id}
                        className={`fase ${f.estado} ${actual?"actual":""} ${faseSelOk===f.id?"sel":""}`}
                        onClick={()=>setFaseSel(faseSelOk===f.id ? null : f.id)}>
                        <span className="fase-num">{f.completa ? "✓" : f.n}</span>
                        <span className="fase-b">
                          <span className="fase-t">{f.titulo}</span>
                          <span className="fase-m">
                            {f.fechaLimite ? fmtFecha(f.fechaLimite) : "Sin fecha"}
                            {!f.sinRequisitos && ` · ${f.hechos}/${f.total}`}
                          </span>
                          <span className={`fase-cont ${f.estado}`}>
                            {f.completa
                              ? (f.retraso ? `Cumplida con ${f.retraso} d de retraso` : "Cumplida a tiempo")
                              : f.vencida ? `Venció hace ${Math.abs(f.dias)} día${Math.abs(f.dias)===1?"":"s"}`
                              : f.dias==null ? "Sin fecha límite"
                              : f.dias===0 ? "Vence hoy"
                              : `Faltan ${f.dias} día${f.dias===1?"":"s"}`}
                          </span>
                          {f.sinRequisitos && <span className="fase-aviso">Sin comprobantes asignados</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {faseSelOk && (
                  <div className="fases-filtro">
                    Mostrando sólo los comprobantes de la fase {fases.find(f=>f.id===faseSelOk)?.n}.
                    <button className="btn btn-tertiary" onClick={()=>setFaseSel(null)}>Ver todos</button>
                  </div>
                )}
              </div>
            )}

            {/* ← NUEVO: anuncio cuando se llega desde un aviso de duplicado */}
            {focoGrupo && (
              <div className="dup-foco-banner">
                <div className="dup-foco-h">
                  <Icon n="content_copy" size={20}/>
                  <strong>
                    «{focoGrupo.nombre}» está adjuntado {focoGrupo.veces} veces
                  </strong>
                  <button className="smart-x" title="Cerrar" onClick={()=>setFocoDup(null)}>×</button>
                </div>
                <p>
                  {focoGrupo.alcance==="entre-expedientes"
                    ? "El mismo comprobante está justificando gastos en expedientes distintos. Revisa cuál de los dos le corresponde y retíralo del otro."
                    : "Está adjunto en dos requisitos de este mismo expediente, así que su importe se cuenta dos veces en el presupuesto."}
                  {focoGrupo.monto!=null && ` Importe: ${fmtMonto(focoGrupo.monto, d.moneda||"MXN")} cada vez.`}
                </p>
                <div className="dup-lugares">
                  {focoGrupo.ubicaciones.map((u,i)=>(
                    u.docId===d.id
                      ? <span key={i} className="dup-lugar aqui">Aquí · {u.reqTitulo||u.tipo}</span>
                      : <button key={i} className="dup-lugar" onClick={()=>irADuplicado(focoGrupo, u)}>
                          {u.docTitulo}{u.reqTitulo ? ` → ${u.reqTitulo}` : ""} ↗
                        </button>
                  ))}
                </div>
              </div>
            )}

            {/* ← ACTUALIZADO: cada lugar del aviso es un enlace */}
            {dups.length>0 && !focoGrupo && (
              <div className="vin-alerta">
                <Icon n="content_copy" size={20}/>
                <div style={{minWidth:0,flex:1}}>
                  <strong>
                    {dups.length} comprobante{dups.length===1?"":"s"} con huella repetida
                  </strong>
                  {dups.map(g=>(
                    <div key={g.clave} className="dup-linea">
                      «{g.nombre}»{g.numId && ` (${g.numId})`} aparece {g.veces} veces
                      {g.monto!=null && ` (${fmtMonto(g.monto, d.moneda||"MXN")} c/u)`}
                      {g.alcance==="entre-expedientes" &&
                        <span className="dup-grave"> en expedientes distintos</span>}
                      <div className="dup-lugares">
                        {g.ubicaciones.map((u,i)=>(
                          u.docId===d.id
                            ? <button key={i} className="dup-lugar aqui" onClick={()=>setFocoDup(g.clave)}>
                                Aquí · {u.reqTitulo||u.tipo}
                              </button>
                            : <button key={i} className="dup-lugar" onClick={()=>irADuplicado(g, u)}>
                                {u.docTitulo}{u.reqTitulo ? ` → ${u.reqTitulo}` : ""} ↗
                              </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {rv.ampliados>0 && rv.alterados===0 && rv.faltantes===0 && (
              <div className="vin-nota">
                <Icon n="update" size={18}/>
                {rv.ampliados} documento{rv.ampliados===1?"":"s"} {rv.ampliados===1?"tuvo":"tuvieron"} actividad
                nueva desde que se {rv.ampliados===1?"adjuntó":"adjuntaron"}. Su historia sigue intacta.
              </div>
            )}

            {d.resumen && <p className="exp-sum">{d.resumen}</p>}

            {/* ← NUEVO: aritmética del expediente. Se recalcula al abrir,
                nunca se guarda: así no puede quedar desactualizada. */}
            {mt.base!=null && (
              <div className={`mnt ${mt.excedido?"excedido":""}`}>
                <div className="mnt-fila">
                  <div className="mnt-dato">
                    <span className="mnt-lbl">{mt.contrato!=null?"Contrato":"Presupuesto de requisitos"}</span>
                    <span className="mnt-val">{fmtMonto(mt.base, mt.moneda)}</span>
                  </div>
                  <div className="mnt-dato">
                    <span className="mnt-lbl">Comprobado</span>
                    <span className="mnt-val fuerte">{fmtMonto(mt.comprobado ?? 0, mt.moneda)}</span>
                  </div>
                  <div className="mnt-dato">
                    <span className="mnt-lbl">{mt.excedido?"Excedente":"Restante"}</span>
                    <span className={`mnt-val ${mt.excedido?"malo":""}`}>
                      {fmtMonto(Math.abs(mt.restante ?? mt.base), mt.moneda)}
                    </span>
                  </div>
                </div>

                <div className="mnt-bar">
                  <div className="mnt-fill" style={{width:`${Math.min(100, mt.porcentaje||0)}%`}}/>
                </div>
                <div className="mnt-pie">
                  {mt.porcentaje!=null && `${mt.porcentaje}% comprobado`}
                  {mt.sinImporte>0 && ` · ${mt.sinImporte} comprobante${mt.sinImporte===1?"":"s"} sin importe anotado`}
                </div>

                {mt.excedido && (
                  <div className="mnt-aviso malo">
                    Lo comprobado supera el monto del contrato en {fmtMonto(Math.abs(mt.restante), mt.moneda)}.
                  </div>
                )}
                {mt.descuadre!=null && (
                  <div className="mnt-aviso">
                    Los requisitos suman {fmtMonto(mt.esperado, mt.moneda)}, pero el contrato dice {fmtMonto(mt.contrato, mt.moneda)}.
                    Diferencia de {fmtMonto(Math.abs(mt.descuadre), mt.moneda)}.
                  </div>
                )}
                {mt.desviaciones.map(dv=>(
                  <div key={dv.id} className="mnt-aviso">
                    «{dv.titulo}»: se pactó {fmtMonto(dv.esperado, mt.moneda)} y se comprobó {fmtMonto(dv.real, mt.moneda)}
                    {dv.piezas>1 && ` en ${dv.piezas} comprobantes`}
                    {" "}({dv.dif>0?"+":"−"}{fmtMonto(Math.abs(dv.dif), mt.moneda)}).
                  </div>
                ))}
              </div>
            )}

            <div className="exp-chips">
              {d.fechaLimite && <span className="chip">Límite: {d.fechaLimite}</span>}
              {d.montoTotal!=null && <span className="chip">{d.moneda||"MXN"} ${d.montoTotal.toLocaleString("es-MX")}</span>}
              {(d.partes||[]).map((p,i)=><span key={i} className="chip">{p.rol}: {p.nombre}</span>)}
            </div>

            {/* ← ACTUALIZADO: cada requisito admite varios comprobantes */}
            {(d.requisitos||[]).map((r,i)=>{
              if(faseSelOk && r.fase!==faseSelOk) return null;   // ← NUEVO: filtro por fase
              const lista = archivosDe(r);
              const suma  = comprobadoDe(r);
              const listo = lista.length>0;
              const faseR = fases.find(f=>f.id===r.fase);          // ← NUEVO
              return (
              <div key={r.id} className={`exp-item ${listo?"cumplido":"pendiente"}`}>
                <div className="exp-check">{listo ? "✓" : i+1}</div>
                <div className="exp-item-b">
                  <div className="exp-item-t">{r.titulo}</div>
                  <div className="exp-item-d">{r.descripcion}</div>
                  <div className="smart-tags">
                    <span className={`tag t-${r.tipo}`}>{r.tipo}</span>
                    {r.monto!=null && <span className="tag">${r.monto.toLocaleString("es-MX")}</span>}
                    {r.fechaLimite && <span className="tag">{r.fechaLimite}</span>}
                    {!r.obligatorio && <span className="tag">opcional</span>}
                    {lista.length>1 && <span className="tag">{lista.length} comprobantes</span>}
                    {/* ← NUEVO */}
                    {faseR && <span className={`tag t-fase ${faseR.vencida && !listo ? "mal":""}`}>
                      Fase {faseR.n} · {faseR.titulo}</span>}
                  </div>

                  {/* ← NUEVO: avance del requisito cuando el contrato fija un monto */}
                  {r.monto!=null && suma!=null && (
                    <div className={`req-avance ${suma>r.monto+1?"sobre":suma>=r.monto-1?"listo":""}`}>
                      {fmtMonto(suma, d.moneda||"MXN")} de {fmtMonto(r.monto, d.moneda||"MXN")}
                      {suma < r.monto-1 && ` · faltan ${fmtMonto(r.monto-suma, d.moneda||"MXN")}`}
                      {suma > r.monto+1 && ` · ${fmtMonto(suma-r.monto, d.moneda||"MXN")} por encima`}
                    </div>
                  )}

                  {lista.map(a=>{
                    const aid = aidDe(a);
                    return (
                    <div key={aid}
                      id={focoDup && claveDup(a)===focoDup ? "foco-dup" : undefined}
                      className={`exp-file ${vinculos[aid]?.estado==="alterado"?"vin-malo":""}
                        ${dupPorClave[claveDup(a)]?"es-dup":""} ${focoDup && claveDup(a)===focoDup?"dup-foco":""}`}>
                      <div className="exp-file-n">
                        {a.origen==="interno" && <span className="tag" style={{marginRight:6}}>chaindoc</span>}
                        {a.nombre}
                      </div>
                      {/* ← NUEVO: marca el comprobante repetido y lleva a su otra aparición */}
                      {dupPorClave[claveDup(a)] && (()=>{
                        const g = dupPorClave[claveDup(a)];
                        const otro = destinoDuplicado(g, d.id);
                        return (
                          <div className="dup-tag-row">
                            <span className="dup-tag">Adjuntado {g.veces} veces</span>
                            {otro && (
                              <button className="dup-lugar" onClick={()=>irADuplicado(g, otro)}>
                                Ver en «{otro.docTitulo}» ↗
                              </button>
                            )}
                          </div>
                        );
                      })()}
                      <div className="exp-file-m">
                        {a.origen==="interno"
                          ? `${a.numId} · ${a.bloques} bloques al adjuntar · ${fmtFull(a.subidoEn)} · ${a.subidoPor}`
                          : `${(a.tam/1024).toFixed(0)} KB · ${fmtFull(a.subidoEn)} · ${a.subidoPor}`}
                      </div>
                      <div className="exp-file-h">SHA-256 {a.hash}</div>

                      {/* ← NUEVO: qué pasó con este documento desde que se adjuntó */}
                      {vinculos[aid] && (
                        <div className={`vin vin-${vinculos[aid].estado}`}>
                          <Icon n={
                            vinculos[aid].estado==="vigente"  ? "verified" :
                            vinculos[aid].estado==="ampliado" ? "update"   :
                            vinculos[aid].estado==="alterado" ? "warning"  : "help"
                          } size={16}/>
                          <span>{vinculos[aid].texto}</span>
                        </div>
                      )}
                      {verifVin && a.origen==="interno" && !vinculos[aid] && (
                        <div className="vin vin-cargando">
                          <span className="mini-spin"/> Verificando integridad…
                        </div>
                      )}

                      <div className="exp-monto">
                        <span className="mnt-lbl">Importe:</span>
                        <input className="exp-monto-in" inputMode="decimal" placeholder="0.00"
                          defaultValue={a.monto ?? ""}
                          onBlur={e=>setMontoReq(r.id, aid, e.target.value)}
                          onKeyDown={e=>e.key==="Enter"&&e.currentTarget.blur()} />
                        {a.origen==="interno" && a.monto!=null &&
                          <span className="tag">leído del documento</span>}
                      </div>

                      {a.origen==="interno" && (
                        <button className="btn btn-tertiary" style={{marginRight:8}}
                          onClick={()=>openDoc(a.docId)}>Abrir documento</button>
                      )}
                      <button className="btn btn-tertiary"
                        onClick={()=>removeEvidence(r.id, aid)}>Retirar</button>
                    </div>
                    );
                  })}

                  {/* ← NUEVO: a quién se le pidió este comprobante */}
                  {solicitudesDe(d, r.id).map(sl=>(
                    <div key={sl.sid} className="sol-row">
                      <Icon n="forward_to_inbox" size={16}/>
                      <div className="sol-b">
                        <span className="sol-t">Pedido a {sl.paraNombre||sl.paraEmail}</span>
                        {sl.mensaje && <div className="sol-m">«{sl.mensaje}»</div>}
                        <div className="sol-d">{fmtShort(sl.creadaEn)}</div>
                      </div>
                      {sl.deUid===uid &&
                        <button className="smart-x" title="Cancelar"
                          onClick={()=>cancelarSolicitud(sl.sid)}>×</button>}
                    </div>
                  ))}

                  <div className="exp-acts">
                    {/* ← ACTUALIZADO: siempre disponible. El límite lo marca
                        el presupuesto, no el número de archivos. */}
                    <label className="exp-up">
                      <span>{listo ? "Agregar otro comprobante" : "Adjuntar comprobante"}</span>
                      <input type="file" style={{display:"none"}} disabled={saving}
                        onChange={e=>{ attachEvidence(r.id, e.target.files?.[0]); e.target.value=""; }} />
                    </label>
                    {/* ← NUEVO */}
                    <button className="exp-up como-btn"
                      onClick={()=>{ setSolReq(r); setMIn(""); setSolMsg(""); setSolErr("");
                                     setModal({t:"pedir"}); }}>
                      Pedir a alguien
                    </button>
                  </div>
                </div>
              </div>
              );
            })}

            {/* ← NUEVO: la historia de la operación, abierta por defecto.
                Es lo que distingue un expediente de una carpeta de archivos. */}
            <details className="exp-src tl-wrap" open>
              <summary>Línea de tiempo de la operación</summary>
              <Timeline chain={d.chain}/>
            </details>

            {/* ← NUEVO: quién ha consultado este expediente */}
            {(()=>{
              const cs = resumenConsultas(d.chain);
              if(!cs.length) return null;
              return (
                <details className="exp-src">
                  <summary>Quién lo ha consultado ({cs.length})</summary>
                  <div className="cons">
                    {cs.map(c=>(
                      <div key={c.email||c.quien} className="cons-row">
                        <div className="avatar sm">{(c.quien||"?").slice(0,2).toUpperCase()}</div>
                        <div className="cons-b">
                          <div className="cons-n">{c.quien}</div>
                          {c.email && <div className="cons-m">{c.email}</div>}
                        </div>
                        <div className="cons-d">
                          {fmtFull(c.ultima)}
                          {c.veces>1 && <div className="cons-v">{c.veces} días distintos</div>}
                        </div>
                      </div>
                    ))}
                    <p className="cons-nota">
                      Se registra una consulta por persona y día, sólo en documentos compartidos.
                    </p>
                  </div>
                </details>
              );
            })()}

            <details className="exp-src">
              <summary>Ver contrato base</summary>
              <div className="paper-ro">{d.content}</div>
            </details>

            {/* ← NUEVO: documentos adjuntos, protegidos por el código de firma */}
            {(()=>{
              // ← ACTUALIZADO: se aplanan todos los comprobantes de todos los requisitos
              const conArchivo = (d.requisitos||[]).flatMap(r=>
                archivosDe(r).map(a=>({ ...a, reqId:r.id, reqTitulo:r.titulo })));
              return (
                <div className="adj">
                  <div className="adj-h">
                    <span className="adj-t">Documentos adjuntos</span>
                    <span className="adj-n">{conArchivo.length}</span>
                  </div>

                  {conArchivo.length===0 ? (
                    <p className="adj-empty">
                      Aún no se ha adjuntado ningún comprobante. Límite actual: {LIMITE_KB} KB por archivo
                      (las imágenes se comprimen solas).
                    </p>
                  ) : !filesOpen ? (
                    <div className="adj-lock">
                      <p>
                        Los comprobantes están protegidos. Verifica tu identidad
                        {bioOk && bioCreds.length>0 ? " con tu biometría o tu código de firma" : " con tu código de firma"} para
                        consultarlos y descargarlos.
                      </p>
                      <button className="btn btn-secondary"
                        onClick={()=>{setPass("");setModal({t:"files"});}}>
                        Desbloquear documentos
                      </button>
                    </div>
                  ) : (
                    <>
                      {conArchivo.map(a=>(
                        <div key={aidDe(a)} className="adj-row">
                          <div className="adj-row-b">
                            <div className="adj-row-t">{a.nombre}</div>
                            <div className="adj-row-m">
                              {a.reqTitulo} · {a.origen==="interno"
                                ? `documento ${a.numId}`
                                : `${(a.tam/1024).toFixed(0)} KB${a.comprimida?" (comprimida)":""}`}
                              {a.monto!=null && ` · ${fmtMonto(a.monto, d.moneda||"MXN")}`}
                              {" · "}{fmtFull(a.subidoEn)}
                            </div>
                            <div className="exp-file-h">SHA-256 {a.hash}</div>
                          </div>
                          <div className="adj-acts">
                            {a.origen==="interno" ? (
                              <button className="btn btn-tertiary" onClick={()=>openDoc(a.docId)}>Abrir</button>
                            ) : (<>
                              {isPreviewable(a.tipo) && (
                                <button className="btn btn-tertiary" onClick={()=>getFile(a,false)}>Ver</button>
                              )}
                              <button className="btn btn-tertiary" onClick={()=>getFile(a,true)}>Descargar</button>
                            </>)}
                          </div>
                        </div>
                      ))}
                      <button className="btn btn-tertiary" style={{marginTop:10}}
                        onClick={()=>setFilesOpen(false)}>Volver a bloquear</button>
                    </>
                  )}
                </div>
              );
            })()}
            {d.analisis && (
              <p className="exp-foot">
                Requisitos extraídos por {d.analisis.modelo} el {fmtFull(d.analisis.fecha)}.
                Revisados y aceptados por {d.owner}.
              </p>
            )}
          </div>);
        })() : d.tplId && FORMS[d.tplId] ? (
          <FormDoc formKey={d.tplId} fields={fields} editable={editMode}
            onChange={f=>{setFields(f);setDirty(true);}} />
        ) : editMode
          ? <textarea className="paper-ta" value={content} placeholder="Comienza a escribir…"
              onChange={e=>{setContent(e.target.value);setDirty(true);}} />
          : <div className={`paper-ro ${!d.content?"empty-txt":""}`}>{d.content||"Este documento aún no tiene contenido. Presiona «Editar» para comenzar."}</div>}
      </div>

      {/* ← NUEVO: dónde está adjunto este documento. Si comprueba gastos
          en más de un expediente, se avisa y se puede ir a cada uno. */}
      {d.kind!=="expediente" && (()=>{
        const sitios = dondeEstaAdjunto(d.id, docs);
        if(!sitios.length) return null;
        const exps = new Set(sitios.map(x=>x.expId));
        const grave = exps.size>1 || sitios.length>1;
        return (
          <div className={`adjunto-en ${grave?"grave":""}`}>
            <div className="adjunto-en-h">
              <Icon n={grave?"content_copy":"link"} size={18}/>
              <strong>
                {grave
                  ? `Este documento está adjuntado ${sitios.length} veces`
                  : "Adjuntado como comprobante"}
              </strong>
            </div>
            {grave
              ? <p>El mismo comprobante está justificando más de un gasto.</p>
              : <p>Mientras esté aquí no puede adjuntarse a otro contrato. Para moverlo, retíralo primero de ese expediente.</p>}
            <div className="dup-lugares">
              {sitios.map((x,i)=>(
                <button key={i} className="dup-lugar"
                  onClick={()=>openDoc(x.expId, grave ? `doc:${d.id}` : null)}>
                  {x.expTitulo} → {x.reqTitulo} ↗
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ← NUEVO: evidencia visual del documento (no aplica a expedientes,
          que ya tienen su propia lista de comprobantes por requisito) */}
      {d.kind!=="expediente" && (()=>{
        const imgs = d.imagenes||[];
        return (
          <div className="galeria">
            <div className="adj-h">
              <span className="adj-t">Evidencia visual</span>
              <span className="adj-n">{imgs.length}</span>
            </div>
            <p className="gal-sub">
              Fotos que respaldan este documento: el ticket físico, el producto recibido,
              el comprobante de la transferencia. Cada una queda registrada en la cadena con su huella.
            </p>

            {imgs.length>0 && (
              <div className="gal-grid">
                {imgs.map(img=>(
                  <div key={img.path} className="gal-item">
                    <button className="gal-thumb" onClick={()=>getFile(img,false)}
                      title={`Ver ${img.nombre}`}>
                      {img.thumb
                        ? <img src={img.thumb} alt={img.nombre}/>
                        : <span className="gal-noimg">Sin vista previa</span>}
                    </button>
                    <div className="gal-n" title={img.nombre}>{img.nombre}</div>
                    <div className="gal-m">
                      {(img.tam/1024).toFixed(0)} KB · {fmtShort(img.subidoEn)}
                    </div>
                    <div className="gal-acts">
                      <button className="btn btn-tertiary" onClick={()=>getFile(img,true)}>Descargar</button>
                      <button className="smart-x" title="Retirar"
                        onClick={()=>removeImage(img.path)}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {imgs.length<MAX_IMGS && (
              <label className="exp-up">
                <span>{saving ? "Procesando…" : "Adjuntar imagen"}</span>
                <input type="file" accept="image/*" style={{display:"none"}} disabled={saving}
                  onChange={e=>{ addImage(e.target.files?.[0]); e.target.value=""; }} />
              </label>
            )}
          </div>
        );
      })()}

      <div className="sign-bar">
        {!iSigned && (
          <div className="sign-group">
            <button className="btn btn-primary" onClick={()=>{setPass("");setModal({t:"sign"});}}>Firmar documento</button>
            <button className="fp-btn" onClick={()=>{setPass("");setModal({t:"sign"});}}><IcoFinger/></button>
          </div>
        )}
        {/* ← ACTUALIZADO: sello de imagen en vez de la línea con el nombre.
            Las firmas antiguas no traen sello, así que conservan el estilo viejo. */}
        {sigs.map((b,i)=>(
          <div key={i} className={`sign-slot sign-done ${b.sello?"con-sello":""}`}>
            {b.sello ? (
              <img className="sello" src={selloUrl(b.sello)} alt={`Sello de ${b.author}`}
                onError={e=>{e.currentTarget.style.display="none";}} />
            ) : (
              <div className="sign-mark">{b.author}</div>
            )}
            <p>Firmado por: {b.author}</p>
          </div>
        ))}
        {sigs.length===0 && <div className="sign-slot"><p>Firma pendiente</p></div>}
      </div>

      {/* ← ACTUALIZADO: antes no podía saltar de línea y ensanchaba toda la página en móvil */}
      <div className="acc-final">
        <button className="btn btn-secondary" onClick={doVerify}>⬡ Verificar integridad</button>
        {/* ← NUEVO: revisa de nuevo los documentos adjuntos */}
        {d.kind==="expediente" && (
          <button className="btn btn-secondary" disabled={verifVin}
            onClick={()=>verificarVinculos(d)}>
            {verifVin ? "Revisando…" : "Revisar adjuntos"}
          </button>
        )}
        {/* ← NUEVO: el paquete que un tercero verifica por su cuenta */}
        {d.kind==="expediente" && (
          <button className="btn btn-primary" onClick={exportarPaquete}>
            <Icon n="download" size={18}/> Exportar evidencia
          </button>
        )}
      </div>
    </div>

    {histOpen && (
      <div className="hist-ov" onClick={()=>setHist(false)}>
        <div className="hist" onClick={e=>e.stopPropagation()}>
          <h2 className="hist-title">Historial</h2>
          <div className="tabs">
            {["Línea de tiempo","Ediciones","Firmas","Compartidos"].map(t=>(
              <button key={t} className={`tab ${histTab===t?"on":""}`} onClick={()=>setHistTab(t)}>{t}</button>
            ))}
          </div>
          <div className="hist-list">
            {/* ← NUEVO: vista cronológica completa, en vez de listas por tipo */}
            {histTab==="Línea de tiempo" && <Timeline chain={d.chain}/>}
            {histTab!=="Línea de tiempo" &&
             (histTab==="Ediciones"?eds:histTab==="Firmas"?sigs:shs).slice().reverse().map(b=>(
              <div key={b.index} className="hcard">
                <div className="hcard-a">{b.author}</div>
                <div className="hcard-d">{fmtFull(b.timestamp)}</div>
                <div className="hcard-box">
                  {b.action==="EDICIÓN" ? (b.content?b.content.slice(0,90)+(b.content.length>90?"…":""):"Edición del documento")
                   : b.action==="FIRMA" ? "Firma"
                   : b.content}
                </div>
                {/* ← NUEVO: distingue una firma biométrica de una con código */}
                {b.signature?.method==="webauthn" && (
                  <div className={`bio-badge ${b.signature.verified?"ok":""}`}>
                    <IcoFinger/>
                    {b.signature.verified
                      ? `Verificada biométricamente en ${b.signature.device||"dispositivo"}`
                      : `Firmada con biometría en ${b.signature.device||"dispositivo"}`}
                  </div>
                )}
                <button className="hcard-eye" onClick={()=>setShowHashes({...showHashes,[b.index]:!showHashes[b.index]})}>
                  <IcoEye/> Ver hashes
                </button>
                {showHashes[b.index] && (
                  <div className="hashes">
                    <div><div className="h-l">Hash de este bloque</div><div className="h-v cur">{b.hash}</div></div>
                    <div><div className="h-l">Hash anterior</div><div className="h-v prv">{b.previousHash}</div></div>
                    <div><div className="h-l">Bloque</div><div className="h-v" style={{color:"var(--gris-300)"}}>#{b.index}</div></div>
                  </div>
                )}
              </div>
            ))}
            {histTab!=="Línea de tiempo" &&
             (histTab==="Ediciones"?eds:histTab==="Firmas"?sigs:shs).length===0 &&
              <div className="empty">Sin registros en esta categoría.</div>}
          </div>
          <button className="btn btn-warning" onClick={()=>setHist(false)}>Cerrar</button>
        </div>
      </div>
    )}

    {menuOpen && SideMenu()}
    {modal && Modals()}
  </>);

  // ── SUBCOMPONENTES ──
  function SideMenu(){
    return (
      <div className="menu-ov" onClick={()=>setMenu(false)}>
        <div className="menu" onClick={e=>e.stopPropagation()}>
          <div className="menu-av"><Icon n="account_circle" size={38}/></div>
          <div className="menu-name">{user}</div>
          <div className="menu-mail">{acctEmail}</div>{/* ← NUEVO */}
          <button className="menu-item" onClick={()=>{setMenu(false);setPass("");setMIn(user);setModal({t:"settings"});}}>
            <IcoGear/> Configuración
          </button>
          <button className="menu-item" onClick={()=>{setMenu(false);goHome();}}><Icon n="home" size={22}/> Inicio</button>
          {/* ← NUEVO: sin esto no había forma de cambiar de cuenta */}
          <button className="menu-item" onClick={doLogout}><Icon n="logout" size={22}/> Cerrar sesión</button>
          <button className="create-btn" style={{marginTop:8}}
            onClick={()=>{setMenu(false);openCreate();}}>
            <span>Crear documento</span><b>+</b>
          </button>
          <button className="menu-x" onClick={()=>setMenu(false)}>✕</button>
        </div>
      </div>
    );
  }

  function Modals(){
    if(modal.t==="create"){
      const isSmart = tpl==="inteligente";   // ← NUEVO
      return (
      <div className="ov" onClick={()=>{if(!imp&&!smartBusy)closeCreate();}}><div className="modal wide" onClick={e=>e.stopPropagation()}>

        {/* ── PASO 1: TIPO DE DOCUMENTO ── */}
        {/* ← NUEVO */}
        {createStep===0 && (<>
          <h2>¿Qué vas a crear?</h2>
          <p className="sub">Elige el tipo de documento.</p>
          <div className="tpl-grid">
            {TEMPLATES.map(t=>(
              <div key={t.id} className={`tpl ${tpl===t.id?"sel":""}`}
                onClick={()=>{ setTpl(t.id); setMethod(null); resetImport(); setCreateStep(1); }}>
                <span className="tpl-ico"><Icon n={t.ico} size={40}/></span>
                <span className="tpl-n">{t.name}</span>
              </div>
            ))}
          </div>
          <div className="modal-row">
            <button className="btn btn-secondary" onClick={closeCreate}>Cancelar</button>
          </div>
        </>)}

        {/* ── PASO 2: MÉTODO ── */}
        {/* ← NUEVO */}
        {createStep===1 && (<>
          <h2>{TEMPLATES.find(x=>x.id===tpl)?.name}</h2>
          <p className="sub">¿Cómo quieres empezar?</p>
          <div className="tpl-grid">
            {METHODS.map(m=>(
              <div key={m.id} className={`tpl ${method===m.id?"sel":""}`}
                onClick={()=>{ setMethod(m.id); resetImport(); }}>
                <span className="tpl-ico"><Icon n={m.ico} size={40}/></span>
                <span className="tpl-n">{m.name}</span>
              </div>
            ))}
          </div>
          {method && <p className="imp-hint" style={{textAlign:"center",marginTop:-4}}>
            {METHODS.find(m=>m.id===method)?.desc}
          </p>}

        {/* ── CONTRATO INTELIGENTE ── */}
        {/* ← NUEVO: el contrato se escribe o importa, y de ahí sale el expediente */}
        {isSmart && method && (method==="cero" || impText) && (<>
          {!smartRes && (<>
            <textarea className="inp smart-ta"
              placeholder={"Pega o escribe aquí el contrato.\n\nEjemplo: «Se contrata el diseño de un póster para la campaña X, con fecha límite del 14 de septiembre de 2026, por $12,000 MXN. El diseñador contratará a un fotógrafo por $4,000 MXN y deberá comprobar ese gasto.»"}
              value={smartText} onChange={e=>{setSmartText(e.target.value);setSmartErr("");}} />
            <div className="smart-meta">
              <span>{smartText.trim().length} caracteres</span>
              {!aiConfigured() && <span className="smart-warn">Falta configurar la llave de Gemini</span>}
            </div>
            {smartErr && (
              <div className="imp-error">
                {smartErr}
                {/* ← NUEVO: muestra qué modelos acepta realmente la llave */}
                <div style={{marginTop:10}}>
                  <button className="btn btn-secondary" style={{padding:"8px 16px",fontSize:14}}
                    onClick={async()=>{
                      try{
                        const ms = await listModels();
                        setSmartErr(`Modelos disponibles para tu llave (${ms.length}): ${ms.slice(0,8).join(", ")}`);
                      }catch(e){ setSmartErr(e.message); }
                    }}>
                    Ver modelos disponibles
                  </button>
                </div>
              </div>
            )}
            <button className="btn btn-primary" style={{width:"100%"}}
              disabled={smartBusy || smartText.trim().length<80}
              onClick={runAnalysis}>
              {smartBusy ? (smartMsg || "Leyendo el contrato…") : "Analizar contrato"}
            </button>
            {smartBusy && <div className="imp-bar" style={{marginTop:12}}><div className="imp-fill indet"/></div>}
          </>)}

          {/* ── REVISIÓN DEL ANÁLISIS ── */}
          {smartRes && (<>
            <div className="smart-res">
              <div className="smart-res-h">
                <div>
                  <div className="smart-res-t">{smartRes.titulo}</div>
                  <div className="smart-res-s">{smartRes.resumen}</div>
                </div>
                <button className="btn btn-tertiary" onClick={()=>setSmartRes(null)}>Reanalizar</button>
              </div>

              <div className="smart-chips">
                {smartRes.fechaLimite && <span className="chip">Límite: {smartRes.fechaLimite}</span>}
                {smartRes.montoTotal!=null && <span className="chip">{smartRes.moneda} ${smartRes.montoTotal.toLocaleString("es-MX")}</span>}
                {smartRes.partes.map((p,i)=><span key={i} className="chip">{p.rol}: {p.nombre}</span>)}
              </div>

              {/* ← NUEVO: fases detectadas en el contrato */}
              {(smartRes.fases||[]).length>0 && (<>
                <div className="smart-list-t">Fases del contrato ({smartRes.fases.length})</div>
                <div className="rev-fases">
                  {smartRes.fases.map((f,i)=>(
                    <div key={f.id} className="rev-fase">
                      <span className="fase-num">{i+1}</span>
                      <div className="rev-fase-b">
                        <div className="rev-fase-t">{f.titulo}</div>
                        <div className="rev-fase-m">
                          {f.fechaLimite ? `Límite ${fmtFecha(f.fechaLimite)}` : "Sin fecha en el contrato"}
                          {` · ${smartRes.requisitos.filter(r=>r.fase===f.id).length} comprobante(s)`}
                        </div>
                      </div>
                      <button className="smart-x" onClick={()=>dropFase(f.id)} title="Quitar fase">×</button>
                    </div>
                  ))}
                </div>
              </>)}
              <div className="smart-list-t">Comprobantes que se pedirán ({smartRes.requisitos.length})</div>
              {smartRes.requisitos.map((r,i)=>(
                <div key={r.id} className="smart-item">
                  <span className="smart-num">{i+1}</span>
                  <div className="smart-item-b">
                    <div className="smart-item-t">{r.titulo}</div>
                    <div className="smart-item-d">{r.descripcion}</div>
                    <div className="smart-tags">
                      <span className={`tag t-${r.tipo}`}>{r.tipo}</span>
                      {r.monto!=null && <span className="tag">${r.monto.toLocaleString("es-MX")}</span>}
                      {r.fechaLimite && <span className="tag">{r.fechaLimite}</span>}
                      {!r.obligatorio && <span className="tag">opcional</span>}
                      {r.fase && (smartRes.fases||[]).some(f=>f.id===r.fase) &&
                        <span className="tag t-fase">Fase {(smartRes.fases||[]).findIndex(f=>f.id===r.fase)+1}</span>}
                    </div>
                  </div>
                  <button className="smart-x" onClick={()=>dropReq(r.id)} title="Quitar">×</button>
                </div>
              ))}

              <p className="imp-hint" style={{marginTop:14}}>
                Revisa la lista antes de continuar. La IA puede malinterpretar el contrato,
                y estos requisitos son los que regirán el expediente.
              </p>
            </div>

            <input className="inp" style={{marginTop:18}} placeholder="Nombre del expediente"
              value={mIn} onChange={e=>setMIn(e.target.value)} />
            <p style={{fontSize:14,color:"var(--gris-300)",marginBottom:6}}>Guardar en carpeta (opcional):</p>
            <div className="pills">
              <button className={`pill ${mIn2===""?"sel":""}`} onClick={()=>setMIn2("")}>Sin carpeta</button>
              {folders.map(f=><button key={f} className={`pill ${mIn2===f?"sel":""}`} onClick={()=>setMIn2(f)}>{f}</button>)}
            </div>
          </>)}
        </>)}

        {/* ── SUBIR ARCHIVO ── */}
        {method==="subir" && !impText && !imp && (
          <>
            <label
              className={`drop-zone ${dragOver?"over":""}`}
              style={{display:"block"}}
              onDragOver={e=>{e.preventDefault();setDragOver(true);}}
              onDragLeave={()=>setDragOver(false)}
              onDrop={onDrop}
            >
              <span className="dz-ico"><Icon n="description" size={44}/></span>
              <div className="dz-t">Arrastra tu archivo aquí o haz clic para elegirlo</div>
              <div className="dz-s">Extraemos el texto y lo dejamos listo para editar.</div>
              <div className="dz-formats">PDF · DOCX · TXT · MD — hasta 20 MB</div>
              <input type="file" accept={ACCEPTED_DOCS} style={{display:"none"}}
                onChange={e=>handleFile(e.target.files?.[0])} />
            </label>
            <p className="imp-hint" style={{textAlign:"center"}}>
              ¿Tu PDF es un escaneo sin texto seleccionable? Usa <strong>Escanear con foto</strong>.
            </p>
          </>
        )}

        {/* ── ESCANEAR ── */}
        {method==="escanear" && !impText && !imp && (
          <>
            <div className="cam-row">
              <label className="cam-opt">
                <span className="cam-opt-ico"><Icon n="photo_camera" size={34}/></span>
                <div className="cam-opt-t">Tomar foto</div>
                <div className="cam-opt-s">Abre la cámara del dispositivo</div>
                <input type="file" accept={ACCEPTED_IMAGES} capture="environment" style={{display:"none"}}
                  onChange={e=>handleFile(e.target.files?.[0], true)} />
              </label>
              <label className="cam-opt">
                <span className="cam-opt-ico"><Icon n="image" size={34}/></span>
                <div className="cam-opt-t">Elegir imagen</div>
                <div className="cam-opt-s">Desde tu galería o carpeta</div>
                <input type="file" accept={ACCEPTED_IMAGES} style={{display:"none"}}
                  onChange={e=>handleFile(e.target.files?.[0], true)} />
              </label>
            </div>
            <p className="imp-hint">
              Consejos para un mejor reconocimiento: buena iluminación, documento plano y sin sombras,
              y que ocupe la mayor parte del encuadre. La primera vez se descarga el modelo de idioma
              (unos segundos); después queda en caché.
            </p>
          </>
        )}

        {/* ── PROGRESO ── */}
        {imp && (
          <div className="imp-progress">
            <div className="imp-msg"><span className="mini-spin"/>{imp.message}</div>
            <div className="imp-bar"><div className="imp-fill" style={{width:`${imp.percent||0}%`}}/></div>
            {imp.stage==="ocr" && <div className="imp-hint">El reconocimiento óptico puede tardar entre 10 y 40 segundos según el tamaño de la imagen.</div>}
          </div>
        )}

        {/* ── ERROR ── */}
        {impErr && (
          <div className="imp-error">
            <strong>No se pudo procesar.</strong><br/>{impErr}
            <div style={{marginTop:12}}>
              <button className="btn btn-secondary" style={{padding:"8px 16px",fontSize:14}}
                onClick={resetImport}>Intentar con otro archivo</button>
            </div>
          </div>
        )}

        {/* ── RESULTADO ── */}
        {impText && (
          <div className="imp-done">
            <div className="imp-done-h">
              <div>
                <div className="imp-done-t">✓ Texto extraído correctamente</div>
                <div className="imp-done-m">
                  {impMeta?.name}
                  {impMeta?.pages ? ` · ${impMeta.pages} página${impMeta.pages!==1?"s":""}` : ""}
                  {impMeta?.confidence ? ` · precisión ${impMeta.confidence}%` : ""}
                  {` · ${impMeta?.chars.toLocaleString("es-MX")} caracteres`}
                </div>
              </div>
              <button className="btn btn-tertiary" onClick={resetImport}>Cambiar archivo</button>
            </div>
            <div className="imp-preview">{impText}</div>
          </div>
        )}

        {/* ← ACTUALIZADO: el expediente tiene sus propios campos más abajo */}
        {method && !isSmart && (<>
          <input className="inp" style={{marginTop:20}} placeholder="Nombre del documento"
            value={mIn} onChange={e=>setMIn(e.target.value)} onKeyDown={e=>e.key==="Enter"&&createDoc()} />
          <p style={{fontSize:14,color:"var(--gris-300)",marginBottom:6}}>Guardar en carpeta (opcional):</p>
          <div className="pills">
            <button className={`pill ${mIn2===""?"sel":""}`} onClick={()=>setMIn2("")}>Sin carpeta</button>
            {folders.map(f=><button key={f} className={`pill ${mIn2===f?"sel":""}`} onClick={()=>setMIn2(f)}>{f}</button>)}
          </div>
        </>)}

        <div className="modal-row">
          <button className="btn btn-secondary" disabled={!!imp||smartBusy}
            onClick={()=>{ setCreateStep(0); setMethod(null); resetImport();
                           setSmartText(""); setSmartRes(null); setSmartErr(""); }}>Atrás</button>
          {/* ← ACTUALIZADO: el expediente se crea con su propia función */}
          {isSmart ? (
            <button className="btn btn-primary" onClick={createExpediente}
              disabled={!smartRes || smartBusy || !smartRes.requisitos.length}>
              Abrir expediente
            </button>
          ) : (
            <button className="btn btn-primary" onClick={createDoc} disabled={!!imp||!method}>
              {method==="subir" ? "Importar documento"
               : method==="escanear" ? "Guardar escaneo"
               : "Crear documento"}
            </button>
          )}
        </div>
        </>)}
      </div></div>
      );
    }

    if(modal.t==="newFolder") return (
      <div className="ov" onClick={()=>setModal(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <h2>Nueva carpeta</h2>
        <p className="sub">Organiza tus documentos por categorías.</p>
        <input className="inp" placeholder="Nombre de la carpeta" value={mIn}
          onChange={e=>setMIn(e.target.value)} autoFocus
          onKeyDown={e=>{if(e.key==="Enter"&&mIn.trim()){setFolders([...folders,mIn.trim()]);setModal(null);notify("Carpeta creada ✓");}}} />
        <div className="modal-row">
          <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
          <button className="btn btn-primary" onClick={()=>{if(mIn.trim()){setFolders([...folders,mIn.trim()]);setModal(null);notify("Carpeta creada ✓");}}}>Crear</button>
        </div>
      </div></div>
    );

    if(modal.t==="move") return (
      <div className="ov" onClick={()=>setModal(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <h2>Mover a carpeta</h2>
        <p className="sub">Selecciona la carpeta destino.</p>
        <div className="pills">
          <button className={`pill ${mIn2===""?"sel":""}`} onClick={()=>setMIn2("")}>Sin carpeta</button>
          {folders.map(f=><button key={f} className={`pill ${mIn2===f?"sel":""}`} onClick={()=>setMIn2(f)}>{f}</button>)}
        </div>
        <div className="modal-row">
          <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
          <button className="btn btn-primary" onClick={()=>moveTo(modal.id,mIn2||null)}>Mover</button>
        </div>
      </div></div>
    );

    if(modal.t==="del") return (
      <div className="ov" onClick={()=>setModal(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <h2>Eliminar documento</h2>
        <p className="sub">¿Seguro que quieres eliminar <strong>«{modal.name}»</strong>? Esta acción no se puede deshacer.</p>
        <div className="modal-row">
          <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
          <button className="btn btn-warning" onClick={()=>delDoc(modal.id)}>Eliminar</button>
        </div>
      </div></div>
    );

    if(modal.t==="sign"){
      const canBio = bioOk && bioCreds.length>0;   // ← NUEVO
      return (
      <div className="ov" onClick={()=>{if(!bioBusy)setModal(null);}}><div className="modal" onClick={e=>e.stopPropagation()}>
        <h2>Firmar documento</h2>
        <p className="sub">
          La firma quedará registrada permanentemente en la cadena a nombre de <strong>{user}</strong>.
        </p>

        {/* ← NUEVO: la huella ahora sí dispara la verificación real */}
        {canBio && (<>
          <button className="btn btn-primary" style={{width:"100%"}} disabled={bioBusy}
            onClick={signWithBio}>
            {bioBusy ? "Esperando verificación…" : `Firmar con ${deviceLabel()==="iPhone"||deviceLabel()==="iPad"?"Face ID":"tu biometría"}`}
          </button>
          <div className="fingerprint" onClick={()=>{ if(!bioBusy) signWithBio(); }}><IcoFinger/></div>
          <div className="sign-or"><span>o usa tu código</span></div>
        </>)}

        <input className="inp" type="password" placeholder="Código de firma" value={pass}
          onChange={e=>setPass(e.target.value)} autoFocus={!canBio}
          onKeyDown={e=>{if(e.key==="Enter"){ trySign(); }}} />
        <div className="modal-row">
          <button className="btn btn-secondary" onClick={()=>setModal(null)} disabled={bioBusy}>Cancelar</button>
          <button className="btn btn-primary" onClick={()=>{ trySign(); }} disabled={bioBusy}>Firmar</button>
        </div>
        {!canBio && <div className="fingerprint" onClick={()=>{ trySign(); }}><IcoFinger/></div>}
      </div></div>
      );
    }

    // ← ACTUALIZADO: ahora también se puede abrir con biometría
    if(modal.t==="files"){
      const canBio = bioOk && bioCreds.length>0;
      return (
      <div className="ov" onClick={()=>{if(!bioBusy)setModal(null);}}><div className="modal" onClick={e=>e.stopPropagation()}>
        <h2>Documentos adjuntos</h2>
        <p className="sub">
          Verifica tu identidad para consultar y descargar los comprobantes de este expediente.
        </p>

        {canBio && (<>
          <button className="btn btn-primary" style={{width:"100%"}} disabled={bioBusy}
            onClick={unlockFilesBio}>
            {bioBusy ? "Esperando verificación…"
              : `Desbloquear con ${deviceLabel()==="iPhone"||deviceLabel()==="iPad"?"Face ID":"tu biometría"}`}
          </button>
          <div className="fingerprint" onClick={()=>{ if(!bioBusy) unlockFilesBio(); }}><IcoFinger/></div>
          <div className="sign-or"><span>o usa tu código</span></div>
        </>)}

        <input className="inp" type="password" placeholder="Código de firma" value={pass}
          onChange={e=>setPass(e.target.value)} autoFocus={!canBio}
          onKeyDown={e=>e.key==="Enter"&&unlockFiles()} />
        <div className="modal-row">
          <button className="btn btn-secondary" disabled={bioBusy}
            onClick={()=>{setPass("");setModal(null);}}>Cancelar</button>
          <button className="btn btn-primary" onClick={unlockFiles} disabled={bioBusy}>Desbloquear</button>
        </div>
      </div></div>
      );
    }

    if(modal.t==="lock") return (
      <div className="ov" onClick={()=>setModal(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <h2>Proteger documento</h2>
        <p className="sub">Establece una contraseña para este documento. Quien tenga el enlace deberá ingresarla para verlo.</p>
        <input className="inp" type="password" placeholder="Contraseña del documento" value={pass}
          onChange={e=>setPass(e.target.value)} autoFocus
          onKeyDown={e=>e.key==="Enter"&&pass.trim()&&setLock(pass.trim())} />
        <div className="modal-row">
          <button className="btn btn-warning" onClick={()=>setModal(null)}>Cancelar</button>
          <button className="btn btn-primary" onClick={()=>pass.trim()&&setLock(pass.trim())}>Proteger</button>
        </div>
      </div></div>
    );

    // ← NUEVO: elegir expediente y después el requisito que cumple
    // ← NUEVO: pedirle un comprobante a otra persona
    if(modal.t==="pedir") return (
      <div className="ov" onClick={()=>{if(!solBusy)setModal(null);}}><div className="modal" onClick={e=>e.stopPropagation()}>
        <h2>Pedir un comprobante</h2>
        <p className="sub">
          <strong>{solReq?.titulo}</strong>
          {solReq?.monto!=null && ` · ${fmtMonto(solReq.monto, d.moneda||"MXN")}`}
          <br/>
          La persona recibirá acceso a este expediente para poder adjuntarlo.
        </p>

        <input className="inp" type="email" placeholder="correo@ejemplo.com"
          value={mIn} autoFocus disabled={solBusy}
          onChange={e=>{setMIn(e.target.value);setSolErr("");}}
          onKeyDown={e=>e.key==="Enter"&&pedirEvidencia()} />

        <textarea className="inp" style={{minHeight:74,resize:"vertical"}}
          placeholder="Mensaje (opcional): qué necesitas exactamente"
          value={solMsg} disabled={solBusy}
          onChange={e=>setSolMsg(e.target.value)} />

        {solErr && <div className="share-err">{solErr}</div>}

        <div className="modal-row">
          <button className="btn btn-secondary" disabled={solBusy}
            onClick={()=>{setModal(null);setMIn("");setSolMsg("");setSolReq(null);}}>Cancelar</button>
          <button className="btn btn-primary" onClick={pedirEvidencia}
            disabled={solBusy||!mIn.trim()}>
            {solBusy ? "Enviando…" : "Pedir comprobante"}
          </button>
        </div>
      </div></div>
    );

    // ← NUEVO: revisar lo que propone la IA antes de convertir el documento
    if(modal.t==="convertir") return (
      <div className="ov" onClick={()=>{if(!smartBusy&&!saving)setModal(null);}}><div className="modal wide" onClick={e=>e.stopPropagation()}>
        <h2>Convertir a contrato inteligente</h2>
        <p className="sub">
          La IA lee <strong>{title||d.title}</strong> y propone los comprobantes que habrá que
          reunir. Revísalos antes de confirmar: estos requisitos regirán el expediente.
        </p>

        {smartBusy && (<>
          <div className="imp-msg"><span className="mini-spin"/>{smartMsg || "Leyendo el contrato…"}</div>
          <div className="imp-bar" style={{marginTop:12}}><div className="imp-fill indet"/></div>
        </>)}

        {smartErr && !smartBusy && (
          <div className="imp-error">
            {smartErr}
            <div style={{marginTop:10}}>
              <button className="btn btn-secondary" style={{padding:"8px 16px",fontSize:14}}
                onClick={iniciarConversion}>Reintentar</button>
            </div>
          </div>
        )}

        {smartRes && !smartBusy && (
          <div className="smart-res">
            <div className="smart-res-h">
              <div>
                <div className="smart-res-t">{smartRes.titulo}</div>
                <div className="smart-res-s">{smartRes.resumen}</div>
              </div>
            </div>
            <div className="smart-chips">
              {smartRes.fechaLimite && <span className="chip">Límite: {smartRes.fechaLimite}</span>}
              {smartRes.montoTotal!=null && <span className="chip">{smartRes.moneda} ${smartRes.montoTotal.toLocaleString("es-MX")}</span>}
              {smartRes.partes.map((p,i)=><span key={i} className="chip">{p.rol}: {p.nombre}</span>)}
            </div>
            {/* ← NUEVO: fases detectadas en el contrato */}
              {(smartRes.fases||[]).length>0 && (<>
                <div className="smart-list-t">Fases del contrato ({smartRes.fases.length})</div>
                <div className="rev-fases">
                  {smartRes.fases.map((f,i)=>(
                    <div key={f.id} className="rev-fase">
                      <span className="fase-num">{i+1}</span>
                      <div className="rev-fase-b">
                        <div className="rev-fase-t">{f.titulo}</div>
                        <div className="rev-fase-m">
                          {f.fechaLimite ? `Límite ${fmtFecha(f.fechaLimite)}` : "Sin fecha en el contrato"}
                          {` · ${smartRes.requisitos.filter(r=>r.fase===f.id).length} comprobante(s)`}
                        </div>
                      </div>
                      <button className="smart-x" onClick={()=>dropFase(f.id)} title="Quitar fase">×</button>
                    </div>
                  ))}
                </div>
              </>)}
              <div className="smart-list-t">Comprobantes que se pedirán ({smartRes.requisitos.length})</div>
            {smartRes.requisitos.map((r,i)=>(
              <div key={r.id} className="smart-item">
                <span className="smart-num">{i+1}</span>
                <div className="smart-item-b">
                  <div className="smart-item-t">{r.titulo}</div>
                  <div className="smart-item-d">{r.descripcion}</div>
                  <div className="smart-tags">
                    <span className={`tag t-${r.tipo}`}>{r.tipo}</span>
                    {r.monto!=null && <span className="tag">${r.monto.toLocaleString("es-MX")}</span>}
                    {r.fechaLimite && <span className="tag">{r.fechaLimite}</span>}
                    {!r.obligatorio && <span className="tag">opcional</span>}
                    {r.fase && (smartRes.fases||[]).some(f=>f.id===r.fase) &&
                      <span className="tag t-fase">Fase {(smartRes.fases||[]).findIndex(f=>f.id===r.fase)+1}</span>}
                  </div>
                </div>
                <button className="smart-x" onClick={()=>dropReq(r.id)} title="Quitar">×</button>
              </div>
            ))}
            <p className="imp-hint" style={{marginTop:14}}>
              El documento no se duplica: conserva su ID, su historial y sus firmas.
              La conversión queda registrada como un bloque más de su cadena.
            </p>
          </div>
        )}

        <div className="modal-row">
          <button className="btn btn-secondary" disabled={smartBusy||saving}
            onClick={()=>{setModal(null);setSmartRes(null);setSmartErr("");}}>Cancelar</button>
          <button className="btn btn-primary" onClick={confirmarConversion}
            disabled={!smartRes || !smartRes.requisitos.length || smartBusy || saving}>
            {saving ? "Convirtiendo…" : "Convertir"}
          </button>
        </div>
      </div></div>
    );

    if(modal.t==="linkTo") return (
      <div className="ov" onClick={()=>{if(!linkBusy)setModal(null);}}><div className="modal wide" onClick={e=>e.stopPropagation()}>
        <h2>Adjuntar a un expediente</h2>

        {!linkExp ? (<>
          {/* ← NUEVO: si ya justifica un contrato, no puede justificar otro */}
          {exps!==null && linkSitios.length>0 && (()=>{
            const que = d.tplId==="recibo" ? "Este recibo" : d.tplId==="factura" ? "Esta factura" : "Este documento";
            return (
              <div className="bloqueo">
                <div className="bloqueo-h">
                  <Icon n="block" size={20}/>
                  <strong>{que} ya está adjuntado a un contrato</strong>
                </div>
                <p>
                  Un comprobante sólo puede justificar un contrato. Si lo adjuntaras a otro,
                  el mismo gasto quedaría comprobado dos veces. Para moverlo, primero
                  retíralo de donde está.
                </p>
                <div className="dup-lugares">
                  {linkSitios.map((x,i)=>(
                    <button key={i} className="dup-lugar"
                      onClick={()=>{ setModal(null); openDoc(x.expId, `doc:${d.id}`); }}>
                      {x.expTitulo} → {x.reqTitulo} ↗
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          <p className="sub">
            {linkSitios.length
              ? "Sólo puedes agregarlo a otro requisito del mismo contrato."
              : "Elige el contrato inteligente donde este documento servirá como comprobante."}
          </p>
          {exps===null ? (
            <div className="imp-msg"><span className="mini-spin"/>Buscando expedientes…</div>
          ) : exps.length===0 ? (
            <p className="adj-empty">
              Todavía no tienes contratos inteligentes. Crea uno desde «Crear documento» → «Contrato inteligente».
            </p>
          ) : (
            <div className="link-list">
              {exps.map(x=>{
                const st = expedienteStatus(x);
                const ajeno = x.ownerUid!==uid;
                // ← NUEVO: con el documento ya adjunto, sólo queda disponible su propio contrato
                const bloqueado = linkSitios.length>0 && !linkSitios.some(z=>z.expId===x.id);
                return (
                  <div key={x.id} className={`link-row ${bloqueado?"bloqueado":""}`}
                    aria-disabled={bloqueado}
                    onClick={()=>{ if(!bloqueado) setLinkExp(x); }}>
                    <div className="link-row-b">
                      <div className="link-row-t">{x.title}</div>
                      <div className="link-row-m">
                        {st.cumplidos}/{st.total} comprobantes
                        {x.fechaLimite && ` · límite ${x.fechaLimite}`}
                        {ajeno && ` · compartido por ${x.owner}`}
                      </div>
                    </div>
                    {bloqueado
                      ? <span className="chip chip-bloq">No disponible</span>
                      : <span className={`chip chip-exp ${st.estado}`}>
                          {st.completo ? "Completo" : st.vencido ? "Vencido" : `${st.porcentaje}%`}
                        </span>}
                  </div>
                );
              })}
            </div>
          )}
          <div className="modal-row">
            <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
          </div>
        </>) : (<>
          <p className="sub">
            ¿Qué requisito de <strong>{linkExp.title}</strong> cumple este documento?
          </p>
          {linkErr && <div className="share-err">{linkErr}</div>}

          {/* ← NUEVO: avisa ANTES de adjuntar si este documento ya está
              comprobando un gasto en otro expediente. */}
          {(()=>{
            const otros = dondeEstaAdjunto(d.id, docs).filter(s=>s.expId!==linkExp.id);
            if(!otros.length) return null;
            return (
              <div className="share-err" style={{marginBottom:14}}>
                <strong>Este documento ya comprueba otro gasto.</strong>
                <div style={{marginTop:4,fontWeight:400}}>
                  Si lo adjuntas aquí también, el mismo comprobante justificará dos operaciones distintas.
                </div>
                {/* ← ACTUALIZADO: cada lugar lleva a ese expediente */}
                <div className="dup-lugares">
                  {otros.map((x,i)=>(
                    <button key={i} className="dup-lugar"
                      onClick={()=>{ setModal(null); openDoc(x.expId, `doc:${d.id}`); }}>
                      {x.expTitulo} → {x.reqTitulo} ↗
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          <div className="link-list">
            {/* ← ACTUALIZADO: un requisito con comprobantes ya no se ve
                bloqueado; ahora se le pueden sumar más. */}
            {linkExp.requisitos.map((r,i)=>{
              const lista = archivosDe(r);
              const suma  = comprobadoDe(r);
              const listo = lista.length>0;
              const mio   = lista.some(a=>a.docId===d.id);
              return (
              <div key={r.id}
                className={`link-row ${mio?"ocupado":""}`}
                onClick={()=>{ if(!linkBusy && !mio) linkToExpediente(linkExp,r.id); }}>
                <span className="smart-num">{listo?"✓":i+1}</span>
                <div className="link-row-b">
                  <div className="link-row-t">{r.titulo}</div>
                  <div className="link-row-m">
                    {mio
                      ? "Este documento ya está adjuntado aquí"
                      : listo
                        ? `Ya tiene ${lista.length} comprobante${lista.length===1?"":"s"} — se agregará uno más`
                        : r.descripcion}
                  </div>
                  <div className="smart-tags">
                    <span className={`tag t-${r.tipo}`}>{r.tipo}</span>
                    {r.monto!=null && <span className="tag">${r.monto.toLocaleString("es-MX")}</span>}
                    {/* ← NUEVO: cuánto falta para cubrir el monto pactado */}
                    {r.monto!=null && suma!=null && (
                      <span className={`tag ${suma>=r.monto-1?"t-documento":""}`}>
                        {suma>=r.monto-1
                          ? "cubierto"
                          : `faltan $${(r.monto-suma).toLocaleString("es-MX")}`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              );
            })}
          </div>
          <div className="modal-row">
            <button className="btn btn-secondary" disabled={linkBusy}
              onClick={()=>{setLinkExp(null);setLinkErr("");}}>Atrás</button>
            {linkBusy && <span className="imp-msg"><span className="mini-spin"/>Adjuntando…</span>}
          </div>
        </>)}
      </div></div>
    );

    if(modal.t==="share") return (
      <div className="ov" onClick={()=>{if(!shareBusy)setModal(null);}}><div className="modal wide" onClick={e=>e.stopPropagation()}>
        <h2>Compartir documento</h2>
        {/* ← ACTUALIZADO: los contactos eran ficticios. Ahora se busca
            el correo en el directorio y sólo se comparte si existe. */}
        <p className="sub">
          Escribe el correo de la persona. Debe tener una cuenta en chaindoc
          para poder abrirlo.
        </p>

        <input className="inp" type="email" placeholder="correo@ejemplo.com" value={mIn}
          autoFocus disabled={shareBusy}
          onChange={e=>{setMIn(e.target.value);setShareErr("");setShareFound(null);}}
          onKeyDown={e=>e.key==="Enter"&&doShare()} />

        {shareErr && <div className="share-err">{shareErr}</div>}
        {shareFound && (
          <div className="share-ok">
            <div className="avatar">{(shareFound.nombre||shareFound.email).slice(0,2).toUpperCase()}</div>
            <div>
              <div className="share-ok-n">{shareFound.nombre||"Sin nombre"}</div>
              <div className="share-ok-m">{shareFound.email}</div>
            </div>
          </div>
        )}

        {/* ← NUEVO: quiénes tienen acceso, con opción de retirarlo */}
        {(d.sharedWith||[]).length>0 && (<>
          <div className="rec-lbl">Con acceso ({d.sharedWith.length}):</div>
          <div className="share-list">
            {d.sharedWith.map(correo=>(
              <div key={correo} className="share-row">
                <div className="avatar sm">{correo.slice(0,2).toUpperCase()}</div>
                <span className="share-row-m">{correo}</span>
                {d.ownerUid===uid && (
                  <button className="smart-x" title="Retirar acceso"
                    onClick={()=>revokeShare(correo)}>×</button>
                )}
              </div>
            ))}
          </div>
        </>)}

        <div className="modal-row">
          <button className="btn btn-tertiary" onClick={()=>{copyLink();}}><IcoLink/> Copiar enlace</button>
          <button className="btn btn-warning" disabled={shareBusy}
            onClick={()=>{setModal(null);setMIn("");setShareErr("");setShareFound(null);}}>Cerrar</button>
          <button className="btn btn-primary" onClick={doShare} disabled={shareBusy||!mIn.trim()}>
            {shareBusy ? "Verificando…" : "Compartir"}
          </button>
        </div>
      </div></div>
    );

    if(modal.t==="settings") return (
      <div className="ov" onClick={()=>setModal(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <h2>Configuración</h2>
        <p className="sub">Cambia tu nombre o tu código de firma.</p>
        <p style={{fontSize:14,color:"var(--gris-300)",marginBottom:6}}>Nombre:</p>
        {/* ← ACTUALIZADO: se edita en un campo temporal y se confirma al guardar */}
        <input className="inp" placeholder="Tu nombre" value={mIn} onChange={e=>setMIn(e.target.value)} />
        <p style={{fontSize:14,color:"var(--gris-300)",marginBottom:6}}>Nuevo código de firma:</p>
        <input className="inp" type="password" placeholder="Déjalo vacío para no cambiarlo"
          value={pass} onChange={e=>setPass(e.target.value)} />
        {/* ← NUEVO: activar o añadir biometría después del registro */}
        {bioOk && (<>
          <p style={{fontSize:14,color:"var(--gris-300)",marginBottom:6}}>Verificación biométrica:</p>
          {bioCreds.length>0 && (
            <p style={{fontSize:13,color:"var(--gris-300)",marginBottom:8}}>
              Activa en: {bioCreds.map(c=>c.device).join(", ")}
            </p>
          )}
          <button className="btn btn-secondary" style={{width:"100%",marginBottom:16}}
            disabled={bioBusy} onClick={enrollBio}>
            {bioBusy ? "Esperando…"
              : bioCreds.some(c=>c.device===deviceLabel())
                ? `Volver a registrar ${deviceLabel()}`
                : `Activar en ${deviceLabel()}`}
          </button>
        </>)}
        <div className="modal-row">
          <button className="btn btn-secondary" onClick={()=>{setPass("");setModal(null);}}>Cancelar</button>
          {/* ← ACTUALIZADO: ahora persiste en Firestore, antes sólo vivía en memoria */}
          <button className="btn btn-primary" onClick={saveSettings}>Guardar</button>
        </div>
      </div></div>
    );

    return null;
  }
}

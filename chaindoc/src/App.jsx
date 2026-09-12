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
  watchAuth, getProfile, saveProfile, authError
} from "./auth";
import {                                                            // ← NUEVO
  bioAvailable, bioRegister, bioAssert, bioVerify, bioError,
  hexToBytes, deviceLabel
} from "./biometric";
import {                                                            // ← NUEVO
  analyzeContract, aiConfigured, hashFile, expedienteStatus, listModels
} from "./smartContract";
import {                                                            // ← ACTUALIZADO
  uploadEvidence, deleteEvidence, openEvidence, storageError,
  isPreviewable, LIMITE_KB
} from "./storage";

const store = {
  async get(id){ try{const s=await getDoc(doc(db,"documents",id));return s.exists()?s.data():null;}catch{return null;} },
  async set(id,d){ try{await setDoc(doc(db,"documents",id),d);return true;}catch(e){console.error(e);return false;} },
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

async function mineBlock(prev, action, content, author){
  const ts = new Date().toISOString();
  const idx = prev ? prev.index+1 : 0;
  const prevHash = prev ? prev.hash : "0".repeat(64);
  const hash = await sha256(`${idx}|${ts}|${action}|${content}|${author}|${prevHash}`);
  return { index:idx, timestamp:ts, action, content, author, previousHash:prevHash, hash };
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
.adj-row-t{font-weight:600;font-size:15px;color:var(--negro);word-break:break-all}
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
.exp-file-n{font-weight:600;font-size:15px;color:var(--negro);word-break:break-all}
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

const CONTACTS = ["Felipe Jarias","Arturo Méndez","Marta Solís","Ramón Gil","Luis Alberto"];

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
  const [bioOk,setBioOk]       = useState(false); // ← NUEVO: el dispositivo soporta biometría
  const [bioBusy,setBioBusy]   = useState(false); // ← NUEVO: esperando a Face ID
  const [title,setTitle]     = useState("");
  const [content,setContent] = useState("");
  const [dirty,setDirty]     = useState(false);
  const [saving,setSaving]   = useState(false);
  const [histOpen,setHist]   = useState(false);
  const [histTab,setHistTab] = useState("Ediciones");
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
  const [filesOpen,setFilesOpen]   = useState(false); // ← NUEVO: adjuntos desbloqueados
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

  const refresh = async(id=uid, mail=acctEmail)=>{             // ← ACTUALIZADO
    const l = await store.list(id, mail);
    l.sort((a,b)=>new Date(b.lastModified)-new Date(a.lastModified));
    setDocs(l);
  };

  // ← ACTUALIZADO: la sesión ya no se deduce de localStorage.
  // Firebase avisa por sí solo si hay alguien conectado, al cargar y en cada login/logout.
  useEffect(()=>{
    const stop = watchAuth(async(account)=>{
      if(!account){
        setUid(null); setUser(""); setAcctEmail(""); setSignCodeHash(null);
        setBioCreds([]);                                       // ← NUEVO
        setDocs([]); setD(null); setScreen("auth");
        return;
      }

      const profile = await getProfile(account.uid);
      setUid(account.uid);
      setUser(profile?.name || account.displayName || "");
      setAcctEmail(account.email || "");
      setSignCodeHash(profile?.signCodeHash || null);
      setBioCreds(profile?.bioCreds || []);                    // ← NUEVO

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
          setUnlocked(!dd.password); setScreen("doc"); return;
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
      const res = await analyzeContract(smartText);
      setSmartRes(res);
      if(!mIn.trim()) setMIn(res.titulo);
    }catch(err){
      setSmartErr(err.message);
    }finally{ setSmartBusy(false); }
  };

  // ← NUEVO: quitar un requisito que la IA sacó de más, antes de confirmar
  const dropReq = (id)=>
    setSmartRes(r=>({ ...r, requisitos:r.requisitos.filter(x=>x.id!==id) }));

  // ← NUEVO
  const createExpediente = async()=>{
    if(!smartRes) return;
    const name = mIn.trim() || smartRes.titulo;
    const id = genId();
    const numId = genNumId();
    const g = await mineBlock(null,"CREACIÓN",
      `Apertura de expediente «${name}» con ${smartRes.requisitos.length} requisitos`,user);

    const nd = {
      id, numId, title:name, content:smartText, folder:mIn2||null,
      owner:user, ownerUid:uid, ownerEmail:acctEmail,
      kind:"expediente",                       // ← lo distingue de un documento normal
      tplId:null, fields:null,
      requisitos: smartRes.requisitos,
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
        `${req?.titulo||reqId}: «${file.name}» (${hash.slice(0,16)}…)`,user);

      const requisitos = d.requisitos.map(r=> r.id!==reqId ? r : {
        ...r, estado:"cumplido",
        archivo:{ nombre:file.name, tipo:guardado.tipo, tam:guardado.tam,
                  tamOriginal:file.size, comprimida:guardado.comprimida,
                  hash, path:guardado.path,
                  subidoEn:b.timestamp, subidoPor:user },
      });

      const up = {...d, requisitos, chain:[...d.chain,b], lastModified:b.timestamp};
      const ok = await store.set(up.id,up);
      if(ok){
        setD(up);
        notify(guardado.comprimida
          ? "Evidencia registrada ✓ (imagen comprimida para caber)"
          : "Evidencia registrada en la cadena ✓");
      }
      else notify("Error al registrar","err");
    }catch(e){ console.error(e); notify(storageError(e),"err"); }
    finally{ setSaving(false); }
  };

  // ← ACTUALIZADO: además de asentarlo, borra el archivo de Storage
  const removeEvidence = async(reqId)=>{
    const req = d.requisitos.find(r=>r.id===reqId);
    if(req?.archivo?.path) await deleteEvidence(req.archivo.path);
    const last = d.chain[d.chain.length-1];
    const b = await mineBlock(last,"EVIDENCIA",
      `Retiro de evidencia en «${req?.titulo||reqId}»`,user);
    const requisitos = d.requisitos.map(r=> r.id!==reqId ? r : {...r,estado:"pendiente",archivo:null});
    const up = {...d, requisitos, chain:[...d.chain,b], lastModified:b.timestamp};
    if(await store.set(up.id,up)){ setD(up); notify("Evidencia retirada"); }
  };

  // ← NUEVO: los adjuntos sólo se abren tras validar el código de firma
  const unlockFiles = async()=>{
    if(!signCodeHash){ notify("No tienes código de firma configurado","err"); return; }
    const h = await sha256(pass.trim());
    if(h!==signCodeHash){ notify("Código incorrecto","err"); return; }
    setFilesOpen(true); setPass(""); setModal(null);
    notify("Documentos desbloqueados ✓");
  };

  // ← ACTUALIZADO: recupera el archivo desde Firestore y lo abre o descarga
  const getFile = async(archivo, forzarDescarga)=>{
    try{
      await openEvidence(archivo?.path, archivo?.nombre, forzarDescarga);
    }catch(e){ notify(storageError(e),"err"); }
  };

  const doShare = async(who)=>{
    const last = d.chain[d.chain.length-1];
    const b = await mineBlock(last,"COMPARTIDO",`Compartido con: ${who}`,user);
    // ← ACTUALIZADO: en minúsculas, porque así los busca store.list()
    const up = {...d,sharedWith:[...(d.sharedWith||[]),who.toLowerCase()],chain:[...d.chain,b],lastModified:b.timestamp};
    const ok = await store.set(up.id,up);
    if(ok){ setD(up); setModal(null); setMIn(""); notify(`Compartido con ${who} ✓`); }
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

  const openDoc = async(id)=>{
    const dd = await store.get(id); if(!dd){ notify("No encontrado","err"); return; }
    setD(dd); setTitle(dd.title); setContent(dd.content||"");
    setFields(dd.fields||{});                                   // ← NUEVO
    setFilesOpen(false);                                        // ← NUEVO: se re-bloquea al abrir otro
    setUnlocked(!dd.password); setEdit(false); setDirty(false);
    setUrlDoc(id); setScreen("doc");
  };

  const goHome = async()=>{
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
  const shs  = d.chain.filter(b=>b.action==="COMPARTIDO");
  const iSigned = sigs.some(b=>b.author===user);

  if(d.password && !unlocked){
    return (<><style>{CSS}</style>
      {notif && <div className={`notif ${notif.t}`}>{notif.m}</div>}
      <nav className="nav">
        <div className="nav-id"><button className="icon-btn" onClick={goHome}><IcoBack/></button>Documento protegido</div>
      </nav>
      <div className="lock-wrap">
        <div className="lock-ico">🔒</div>
        <div className="lock-t">Este documento está protegido</div>
        <div className="lock-s">Ingresa la contraseña para verlo.</div>
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
              </div>
            </div>

            {d.resumen && <p className="exp-sum">{d.resumen}</p>}

            <div className="exp-chips">
              {d.fechaLimite && <span className="chip">Límite: {d.fechaLimite}</span>}
              {d.montoTotal!=null && <span className="chip">{d.moneda||"MXN"} ${d.montoTotal.toLocaleString("es-MX")}</span>}
              {(d.partes||[]).map((p,i)=><span key={i} className="chip">{p.rol}: {p.nombre}</span>)}
            </div>

            {(d.requisitos||[]).map((r,i)=>(
              <div key={r.id} className={`exp-item ${r.estado}`}>
                <div className="exp-check">{r.estado==="cumplido" ? "✓" : i+1}</div>
                <div className="exp-item-b">
                  <div className="exp-item-t">{r.titulo}</div>
                  <div className="exp-item-d">{r.descripcion}</div>
                  <div className="smart-tags">
                    <span className={`tag t-${r.tipo}`}>{r.tipo}</span>
                    {r.monto!=null && <span className="tag">${r.monto.toLocaleString("es-MX")}</span>}
                    {r.fechaLimite && <span className="tag">{r.fechaLimite}</span>}
                    {!r.obligatorio && <span className="tag">opcional</span>}
                  </div>

                  {r.archivo ? (
                    <div className="exp-file">
                      <div className="exp-file-n">{r.archivo.nombre}</div>
                      <div className="exp-file-m">
                        {(r.archivo.tam/1024).toFixed(0)} KB · {fmtFull(r.archivo.subidoEn)} · {r.archivo.subidoPor}
                      </div>
                      <div className="exp-file-h">SHA-256 {r.archivo.hash}</div>
                      <button className="btn btn-tertiary" onClick={()=>removeEvidence(r.id)}>Retirar</button>
                    </div>
                  ) : (
                    <label className="exp-up">
                      <span>Adjuntar comprobante</span>
                      <input type="file" style={{display:"none"}} disabled={saving}
                        onChange={e=>{ attachEvidence(r.id, e.target.files?.[0]); e.target.value=""; }} />
                    </label>
                  )}
                </div>
              </div>
            ))}

            <details className="exp-src">
              <summary>Ver contrato base</summary>
              <div className="paper-ro">{d.content}</div>
            </details>

            {/* ← NUEVO: documentos adjuntos, protegidos por el código de firma */}
            {(()=>{
              const conArchivo = (d.requisitos||[]).filter(r=>r.archivo);
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
                      <p>Los comprobantes están protegidos. Ingresa tu código de firma para consultarlos y descargarlos.</p>
                      <button className="btn btn-secondary"
                        onClick={()=>{setPass("");setModal({t:"files"});}}>
                        Desbloquear documentos
                      </button>
                    </div>
                  ) : (
                    <>
                      {conArchivo.map(r=>(
                        <div key={r.id} className="adj-row">
                          <div className="adj-row-b">
                            <div className="adj-row-t">{r.archivo.nombre}</div>
                            <div className="adj-row-m">
                              {r.titulo} · {(r.archivo.tam/1024).toFixed(0)} KB
                              {r.archivo.comprimida && " (comprimida)"} · {fmtFull(r.archivo.subidoEn)}
                            </div>
                            <div className="exp-file-h">SHA-256 {r.archivo.hash}</div>
                          </div>
                          <div className="adj-acts">
                            {isPreviewable(r.archivo.tipo) && (
                              <button className="btn btn-tertiary" onClick={()=>getFile(r.archivo,false)}>Ver</button>
                            )}
                            <button className="btn btn-tertiary" onClick={()=>getFile(r.archivo,true)}>Descargar</button>
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

      <div className="sign-bar">
        {!iSigned && (
          <div className="sign-group">
            <button className="btn btn-primary" onClick={()=>{setPass("");setModal({t:"sign"});}}>Firmar documento</button>
            <button className="fp-btn" onClick={()=>{setPass("");setModal({t:"sign"});}}><IcoFinger/></button>
          </div>
        )}
        {sigs.map((b,i)=>(
          <div key={i} className="sign-slot sign-done">
            <div className="sign-mark">{b.author}</div>
            <p>Firmado por: {b.author}</p>
          </div>
        ))}
        {sigs.length===0 && <div className="sign-slot"><p>Firma pendiente</p></div>}
      </div>

      <div style={{display:"flex",justifyContent:"center",paddingBottom:40}}>
        <button className="btn btn-secondary" onClick={doVerify}>⬡ Verificar integridad</button>
      </div>
    </div>

    {histOpen && (
      <div className="hist-ov" onClick={()=>setHist(false)}>
        <div className="hist" onClick={e=>e.stopPropagation()}>
          <h2 className="hist-title">Historial</h2>
          <div className="tabs">
            {["Ediciones","Firmas","Compartidos"].map(t=>(
              <button key={t} className={`tab ${histTab===t?"on":""}`} onClick={()=>setHistTab(t)}>{t}</button>
            ))}
          </div>
          <div className="hist-list">
            {(histTab==="Ediciones"?eds:histTab==="Firmas"?sigs:shs).slice().reverse().map(b=>(
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
            {(histTab==="Ediciones"?eds:histTab==="Firmas"?sigs:shs).length===0 &&
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
              {smartBusy ? "Leyendo el contrato…" : "Analizar contrato"}
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

    // ← NUEVO: puerta de acceso a los comprobantes
    if(modal.t==="files") return (
      <div className="ov" onClick={()=>setModal(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <h2>Documentos adjuntos</h2>
        <p className="sub">Ingresa tu código de firma para consultar y descargar los comprobantes de este expediente.</p>
        <input className="inp" type="password" placeholder="Código de firma" value={pass}
          onChange={e=>setPass(e.target.value)} autoFocus
          onKeyDown={e=>e.key==="Enter"&&unlockFiles()} />
        <div className="modal-row">
          <button className="btn btn-secondary" onClick={()=>{setPass("");setModal(null);}}>Cancelar</button>
          <button className="btn btn-primary" onClick={unlockFiles}>Desbloquear</button>
        </div>
      </div></div>
    );

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

    if(modal.t==="share") return (
      <div className="ov" onClick={()=>setModal(null)}><div className="modal wide" onClick={e=>e.stopPropagation()}>
        <h2>Compartir documento</h2>
        <p className="sub">Selecciona algún contacto o ingresa un correo electrónico.</p>
        <input className="inp" placeholder="Correo electrónico" value={mIn}
          onChange={e=>setMIn(e.target.value)} onKeyDown={e=>e.key==="Enter"&&mIn.trim()&&doShare(mIn.trim())} />
        <div className="rec-lbl">Recientes:</div>
        <div className="contacts">
          {CONTACTS.map(c=>(
            <div key={c} className={`contact ${mIn===c?"sel":""}`} onClick={()=>setMIn(c)}>
              <div className="avatar">{c.split(" ").map(w=>w[0]).join("").slice(0,2)}</div>
              <span className="contact-n">{c}</span>
            </div>
          ))}
        </div>
        {(d.sharedWith||[]).length>0 && (<>
          <div className="rec-lbl">Ya compartido con:</div>
          <div className="chips">{d.sharedWith.map((s,i)=><span key={i} className="chip chip-f">{s}</span>)}</div>
        </>)}
        <div className="modal-row">
          <button className="btn btn-tertiary" onClick={()=>{copyLink();}}><IcoLink/> Copiar enlace</button>
          <button className="btn btn-warning" onClick={()=>setModal(null)}>Cerrar</button>
          <button className="btn btn-primary" onClick={()=>mIn.trim()&&doShare(mIn.trim())}>Compartir</button>
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

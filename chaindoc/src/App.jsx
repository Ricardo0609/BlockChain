import { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore, doc, getDoc, setDoc, collection, getDocs, deleteDoc
} from "firebase/firestore";

const firebaseConfig = {
  apiKey:            "AIzaSyABii1ZsNFikCmL48aVJSJnPp9NWgep8tI",
  authDomain:        "blockchain-296a8.firebaseapp.com",
  projectId:         "blockchain-296a8",
  storageBucket:     "blockchain-296a8.firebasestorage.app",
  messagingSenderId: "796845644217",
  appId:             "1:796845644217:web:5e9b352019eea09ad83e68",
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

const store = {
  async get(id){ try{const s=await getDoc(doc(db,"documents",id));return s.exists()?s.data():null;}catch{return null;} },
  async set(id,d){ try{await setDoc(doc(db,"documents",id),d);return true;}catch(e){console.error(e);return false;} },
  async del(id){ try{await deleteDoc(doc(db,"documents",id));return true;}catch{return false;} },
  async list(){ try{const s=await getDocs(collection(db,"documents"));return s.docs.map(d=>d.data());}catch{return [];} },
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

html,body{background:var(--blanco);color:var(--negro);font-family:var(--f-p);min-height:100vh}

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
.menu-name{font-family:var(--f-t);font-weight:600;font-size:20px;text-align:center}
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

@media (max-width:900px){
  .nav{padding:16px 20px;flex-wrap:wrap}
  .page{padding:0 20px 40px}
  .paper{padding:24px 20px}
  .hist{padding:24px 20px}
  .menu{padding:24px}
}
`;

// ── Iconos SVG inline ─────────────────────────────────────────
const IcoFolder = () => <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>;
const IcoDots   = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>;
const IcoEye    = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>;
const IcoFinger = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 2a8 8 0 00-8 8v4M12 6a4 4 0 00-4 4v6M12 10v8M16 10a4 4 0 00-4-4M20 10a8 8 0 00-4-6.9"/></svg>;
const IcoBack   = () => <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>;
const IcoGear   = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>;
const IcoLink   = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>;
const IcoUpload = () => <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>;

const TEMPLATES = [
  { id:"blank",    ico:"📄", name:"En blanco", body:"" },
  { id:"carpeta",  ico:"📁", name:"Carpeta",   body:null },
  { id:"subir",    ico:"⬆",  name:"Subir",     body:null },
  { id:"contrato", ico:"📋", name:"Contrato",  body:"CONTRATO DE ARRENDAMIENTO\n\nEntre las partes:\n\nARRENDADOR: [Nombre completo]\nARRENDATARIO: [Nombre completo]\n\nOBJETO DEL CONTRATO:\n[Descripción del inmueble]\n\nPLAZO:\nEl presente contrato tendrá una vigencia de [X] meses, contados a partir del [fecha].\n\nRENTA MENSUAL:\n$[cantidad] MXN, pagaderos los primeros [X] días de cada mes.\n\nDEPÓSITO EN GARANTÍA:\n$[cantidad] MXN.\n\nOBLIGACIONES DEL ARRENDATARIO:\n1. Pagar puntualmente la renta.\n2. Conservar el inmueble en buen estado.\n3. No subarrendar sin autorización escrita.\n\nOBLIGACIONES DEL ARRENDADOR:\n1. Entregar el inmueble en condiciones habitables.\n2. Realizar reparaciones estructurales." },
  { id:"recibo",   ico:"🧾", name:"Recibo",    body:"RECIBO DE PAGO\n\nNo: [número]\nFecha: [fecha]\n\nRecibí de: [Nombre / Empresa]\n\nCantidad: $[monto] MXN\nCantidad con letra: [monto en letra]\n\nConcepto:\n[Descripción del pago]\n\nForma de pago:\n[ ] Depósito   [ ] Cheque   [ ] Efectivo\n\nRecibido por: [Nombre]" },
  { id:"factura",  ico:"💼", name:"Factura",   body:"FACTURA\n\nNo: [folio]\nFecha de emisión: [fecha]\n\nEMISOR:\n[Razón social]\nRFC: [RFC]\n\nRECEPTOR:\n[Razón social]\nRFC: [RFC]\n\nCONCEPTOS:\n1. [Descripción] — Cantidad: [X] — P. Unitario: $[X] — Importe: $[X]\n\nSubtotal: $[X]\nIVA (16%): $[X]\nTOTAL: $[X]" },
];

const CONTACTS = ["Felipe Jarias","Arturo Méndez","Marta Solís","Ramón Gil","Luis Alberto"];

// ── APP ───────────────────────────────────────────────────────
export default function ChainDoc(){
  const [screen,setScreen]   = useState("loading");
  const [authStep,setAuthStep] = useState(0);
  const [docs,setDocs]       = useState([]);
  const [folders,setFolders] = useState(()=>{ try{return JSON.parse(localStorage.getItem("cd_folders"))||["Contratos","Facturas","Recibos"];}catch{return ["Contratos","Facturas","Recibos"];} });
  const [view,setView]       = useState("inicio");
  const [d,setD]             = useState(null);
  const [editMode,setEdit]   = useState(false);
  const [user,setUser]       = useState(()=>localStorage.getItem("cd_user")||"");
  const [email,setEmail]     = useState("");
  const [pass,setPass]       = useState("");
  const [signCode,setSignCode] = useState(()=>localStorage.getItem("cd_signcode")||"");
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
  const [tpl,setTpl]         = useState("blank");
  const [filterF,setFilterF] = useState(null);
  const [openSec,setOpenSec] = useState({carp:true,docs:true,comp:true});
  const [unlocked,setUnlocked] = useState(false);
  const [lockInput,setLockInput] = useState("");

  const notify = (m,t="ok")=>{ setNotif({m,t}); setTimeout(()=>setNotif(null),3200); };

  useEffect(()=>{ const h=()=>setDrop(null); document.addEventListener("click",h); return ()=>document.removeEventListener("click",h); },[]);
  useEffect(()=>{ if(user) localStorage.setItem("cd_user",user); },[user]);
  useEffect(()=>{ localStorage.setItem("cd_folders",JSON.stringify(folders)); },[folders]);
  useEffect(()=>{ if(signCode) localStorage.setItem("cd_signcode",signCode); },[signCode]);

  useEffect(()=>{(async()=>{
    const id = getUrlDoc();
    if(id){
      const dd = await store.get(id);
      if(dd){
        if(!localStorage.getItem("cd_user")){ setScreen("auth"); return; }
        setD(dd); setTitle(dd.title); setContent(dd.content||"");
        setUnlocked(!dd.password); setScreen("doc"); return;
      }
    }
    if(!localStorage.getItem("cd_user")){ setScreen("auth"); return; }
    await refresh(); setScreen("home");
  })();},[]);

  const refresh = async()=>{
    const l = await store.list();
    l.sort((a,b)=>new Date(b.lastModified)-new Date(a.lastModified));
    setDocs(l);
  };

  // ── AUTH ──
  const doSignup = ()=>{
    if(!mIn.trim()){ notify("Escribe tu nombre","err"); return; }
    if(!email.trim()){ notify("Escribe tu correo","err"); return; }
    setUser(mIn.trim()); setAuthStep(1);
  };
  const doSignCode = ()=>{
    if(!pass.trim()){ notify("Crea un código de firma","err"); return; }
    setSignCode(pass.trim()); setPass(""); setAuthStep(2);
  };
  const finishAuth = async()=>{
    await refresh(); setScreen("home");
  };

  // ── DOCS ──
  const createDoc = async()=>{
    const t = TEMPLATES.find(x=>x.id===tpl);
    if(tpl==="carpeta"){
      if(!mIn.trim()){ notify("Escribe el nombre de la carpeta","err"); return; }
      setFolders([...folders, mIn.trim()]); setModal(null); notify("Carpeta creada ✓"); return;
    }
    const name = mIn.trim() || (t?.name==="En blanco"?"Sin título":t.name);
    const id = genId();
    const numId = genNumId();
    const g = await mineBlock(null,"CREACIÓN",`Creación de documento: ${name}`,user);
    const nd = { id, numId, title:name, content:t?.body||"", folder:mIn2||null, owner:user,
                 password:null, sharedWith:[], chain:[g], lastModified:g.timestamp };
    const ok = await store.set(id,nd);
    if(!ok){ notify("Error al crear","err"); return; }
    setModal(null); setMIn(""); setMIn2(""); setTpl("blank");
    setD(nd); setTitle(name); setContent(nd.content); setUnlocked(true);
    setEdit(true); setUrlDoc(id); setScreen("doc");
  };

  const save = async()=>{
    setSaving(true);
    const last = d.chain[d.chain.length-1];
    const b = await mineBlock(last,"EDICIÓN",content.slice(0,200),user);
    const up = {...d,title,content,chain:[...d.chain,b],lastModified:b.timestamp};
    const ok = await store.set(up.id,up);
    if(ok){ setD(up); setDirty(false); setEdit(false); notify("Bloque registrado en la cadena ✓"); }
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

  const doShare = async(who)=>{
    const last = d.chain[d.chain.length-1];
    const b = await mineBlock(last,"COMPARTIDO",`Compartido con: ${who}`,user);
    const up = {...d,sharedWith:[...(d.sharedWith||[]),who],chain:[...d.chain,b],lastModified:b.timestamp};
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
        {authStep===0 && (<>
          <h1 className="auth-title">Crear cuenta</h1>
          <p className="auth-sub">Documentos con registro inalterable en cadena criptográfica.</p>
          <input className="inp" placeholder="Nombre completo" value={mIn} onChange={e=>setMIn(e.target.value)} />
          <input className="inp" placeholder="Correo electrónico" value={email} onChange={e=>setEmail(e.target.value)} />
          <input className="inp" type="password" placeholder="Contraseña" value={pass} onChange={e=>setPass(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&doSignup()} />
          <div className="auth-actions">
            <button className="btn btn-tertiary">¿Ya tienes cuenta? Inicia sesión</button>
            <button className="btn btn-primary" onClick={doSignup}>Continuar</button>
          </div>
          <div className="dots"><span className="dot on"/><span className="dot"/></div>
        </>)}

        {authStep===1 && (<>
          <p className="auth-sub" style={{marginBottom:24,textAlign:"left"}}>
            Crea un código para firmar tus documentos. Este código es independiente a tu contraseña de la cuenta;
            lo podrás cambiar las veces que quieras en configuración.
          </p>
          <input className="inp" type="password" placeholder="Código de firma" value={pass}
            onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doSignCode()} />
          <div className="auth-actions">
            <button className="btn btn-secondary" onClick={()=>setAuthStep(0)}>Atrás</button>
            <button className="btn btn-primary" onClick={doSignCode}>Continuar</button>
          </div>
          <div className="dots"><span className="dot"/><span className="dot on"/></div>
        </>)}

        {authStep===2 && (<>
          <p className="auth-sub" style={{fontSize:20,color:"var(--negro)",marginBottom:28}}>
            ¿Deseas activar el desbloqueo biométrico para iniciar sesión y firmar tus documentos?
          </p>
          <div className="auth-actions">
            <button className="btn btn-secondary" onClick={finishAuth}>Ahora no</button>
            <button className="btn btn-primary" onClick={()=>{notify("Biometría activada ✓");finishAuth();}}>Activar</button>
          </div>
          <div className="fingerprint" onClick={()=>{notify("Biometría activada ✓");finishAuth();}}><IcoFinger/></div>
        </>)}
      </div></div>
    </>);
  }

  // ── RENDER: HOME ──
  if(screen==="home"){
    const recientes = docs.slice(0,3);
    const mine      = docs.filter(x=>x.owner===user||!x.owner);
    const shared    = docs.filter(x=>(x.sharedWith||[]).length>0 && x.owner!==user);
    const shown     = filterF ? docs.filter(x=>x.folder===filterF) : (view==="documentos"?mine:docs);

    const Card = ({x})=>{
      const sg = x.chain.filter(b=>b.action==="FIRMA").length;
      return (
        <div className="card" onClick={()=>openDoc(x.id)}>
          <div className="card-h">
            <span className="card-t">{x.title}</span>
            <button className="icon-btn" style={{color:"var(--gris-200)"}}
              onClick={e=>{e.stopPropagation();setDrop(drop===x.id?null:x.id);}}><IcoDots/></button>
          </div>
          <div className="card-prev">{x.content||"Sin contenido aún…"}</div>
          <div className="card-meta">Última edición: {fmtShort(x.lastModified)}</div>
          <div className="chips">
            <span className="chip chip-b">{x.chain.length} bloques</span>
            {sg>0 && <span className="chip chip-s">✦ {sg} firma{sg!==1?"s":""}</span>}
            {x.folder && <span className="chip chip-f">📁 {x.folder}</span>}
            {x.password && <span className="chip chip-l">🔒 Protegido</span>}
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
            ? <div className="cards">{recientes.map(x=><Card key={x.id} x={x}/>)}</div>
            : <div className="empty">No hay documentos aún.<br/>Crea el primero con el botón de abajo.</div>)}

          <div className="sec-h" onClick={()=>setOpenSec({...openSec,comp:!openSec.comp})}>
            <span className={`sec-arrow ${openSec.comp?"":"closed"}`}>⌄</span>
            <span className="sec-t">Compartidos conmigo</span>
          </div>
          {openSec.comp && (shared.length
            ? <div className="cards">{shared.slice(0,3).map(x=><Card key={x.id} x={x}/>)}</div>
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
          {shown.length ? <div className="cards">{shown.map(x=><Card key={x.id} x={x}/>)}</div>
                        : <div className="empty">No hay documentos aquí.</div>}
        </>)}

        {view==="compartidos" && (<>
          <h2 className="page-title">Compartidos conmigo</h2>
          {shared.length ? <div className="cards">{shared.map(x=><Card key={x.id} x={x}/>)}</div>
                         : <div className="empty">Aún no te han compartido documentos.</div>}
        </>)}

        <div className="create-zone">
          <button className="create-btn" onClick={()=>{setMIn("");setMIn2("");setTpl("blank");setModal({t:"create"});}}>
            <span>Crear documento</span><b>+</b>
          </button>
        </div>
      </div>

      {menuOpen && <SideMenu/>}
      {modal && <Modals/>}
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
        {editMode
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

    {menuOpen && <SideMenu/>}
    {modal && <Modals/>}
  </>);

  // ── SUBCOMPONENTES ──
  function SideMenu(){
    return (
      <div className="menu-ov" onClick={()=>setMenu(false)}>
        <div className="menu" onClick={e=>e.stopPropagation()}>
          <div className="menu-av">👤</div>
          <div className="menu-name">{user}</div>
          <button className="menu-item" onClick={()=>{setMenu(false);setPass("");setModal({t:"settings"});}}>
            <IcoGear/> Configuración
          </button>
          <button className="menu-item" onClick={()=>{setMenu(false);goHome();}}>🏠 Inicio</button>
          <button className="create-btn" style={{marginTop:8}}
            onClick={()=>{setMenu(false);setMIn("");setMIn2("");setTpl("blank");setModal({t:"create"});}}>
            <span>Crear documento</span><b>+</b>
          </button>
          <button className="menu-x" onClick={()=>setMenu(false)}>✕</button>
        </div>
      </div>
    );
  }

  function Modals(){
    if(modal.t==="create") return (
      <div className="ov" onClick={()=>setModal(null)}><div className="modal wide" onClick={e=>e.stopPropagation()}>
        <h2>Crear nuevo</h2>
        <p className="sub">Elige una plantilla o empieza en blanco.</p>
        <div className="tpl-grid">
          {TEMPLATES.map(t=>(
            <div key={t.id} className={`tpl ${tpl===t.id?"sel":""}`} onClick={()=>setTpl(t.id)}>
              <span className="tpl-ico">{t.id==="subir"?<IcoUpload/>:t.ico}</span>
              <span className="tpl-n">{t.name}</span>
            </div>
          ))}
        </div>
        <input className="inp" style={{marginTop:20}}
          placeholder={tpl==="carpeta"?"Nombre de la carpeta":"Nombre del documento"}
          value={mIn} onChange={e=>setMIn(e.target.value)} onKeyDown={e=>e.key==="Enter"&&createDoc()} autoFocus />
        {tpl!=="carpeta" && (<>
          <p style={{fontSize:14,color:"var(--gris-300)",marginBottom:6}}>Guardar en carpeta (opcional):</p>
          <div className="pills">
            <button className={`pill ${mIn2===""?"sel":""}`} onClick={()=>setMIn2("")}>Sin carpeta</button>
            {folders.map(f=><button key={f} className={`pill ${mIn2===f?"sel":""}`} onClick={()=>setMIn2(f)}>{f}</button>)}
          </div>
        </>)}
        <div className="modal-row">
          <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
          <button className="btn btn-primary" onClick={createDoc}>{tpl==="carpeta"?"Crear carpeta":"Crear documento"}</button>
        </div>
      </div></div>
    );

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

    if(modal.t==="sign") return (
      <div className="ov" onClick={()=>setModal(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <h2>Firmar documento</h2>
        <p className="sub">Ingresa tu código de firma. La firma quedará registrada permanentemente en la cadena a nombre de <strong>{user}</strong>.</p>
        <input className="inp" type="password" placeholder="Código de firma" value={pass}
          onChange={e=>setPass(e.target.value)} autoFocus
          onKeyDown={e=>{if(e.key==="Enter"){ if(!signCode||pass===signCode) sign(); else notify("Código incorrecto","err"); }}} />
        <div className="modal-row">
          <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
          <button className="btn btn-primary" onClick={()=>{ if(!signCode||pass===signCode) sign(); else notify("Código incorrecto","err"); }}>Firmar</button>
        </div>
        <div className="fingerprint" onClick={()=>{ if(!signCode||pass===signCode) sign(); else notify("Código incorrecto","err"); }}><IcoFinger/></div>
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
        <input className="inp" placeholder="Tu nombre" value={user} onChange={e=>setUser(e.target.value)} />
        <p style={{fontSize:14,color:"var(--gris-300)",marginBottom:6}}>Nuevo código de firma:</p>
        <input className="inp" type="password" placeholder="Código de firma" value={pass} onChange={e=>setPass(e.target.value)} />
        <div className="modal-row">
          <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
          <button className="btn btn-primary" onClick={()=>{ if(pass.trim())setSignCode(pass.trim()); setPass(""); setModal(null); notify("Configuración guardada ✓"); }}>Guardar</button>
        </div>
      </div></div>
    );

    return null;
  }
}

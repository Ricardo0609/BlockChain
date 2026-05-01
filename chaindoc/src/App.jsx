import { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore, doc, getDoc, setDoc, collection, getDocs
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

// ── Firebase store ────────────────────────────────────────────
const store = {
  async get(id) {
    try {
      const snap = await getDoc(doc(db, "documents", id));
      return snap.exists() ? snap.data() : null;
    } catch { return null; }
  },
  async set(id, data) {
    try {
      await setDoc(doc(db, "documents", id), data);
      return true;
    } catch (e) { console.error(e); return false; }
  },
  async list() {
    try {
      const snap = await getDocs(collection(db, "documents"));
      return snap.docs.map((d) => d.data());
    } catch { return []; }
  },
};

// ── Crypto ────────────────────────────────────────────────────
const generateId = () =>
  Date.now().toString(36) + Math.random().toString(36).substr(2, 8);

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function mineBlock(prev, action, content, author) {
  const ts       = new Date().toISOString();
  const idx      = prev ? prev.index + 1 : 0;
  const prevHash = prev ? prev.hash : "0".repeat(64);
  const hash     = await sha256(`${idx}|${ts}|${action}|${content}|${author}|${prevHash}`);
  return { index: idx, timestamp: ts, action, content, author, previousHash: prevHash, hash };
}

async function verifyChain(chain) {
  for (let i = 0; i < chain.length; i++) {
    const b = chain[i];
    const expected = await sha256(
      `${b.index}|${b.timestamp}|${b.action}|${b.content}|${b.author}|${b.previousHash}`
    );
    if (expected !== b.hash) return { valid: false, failedAt: i };
    if (i > 0 && b.previousHash !== chain[i - 1].hash) return { valid: false, failedAt: i };
  }
  return { valid: true };
}

// ── Helpers ───────────────────────────────────────────────────
const fmtDate = (iso) =>
  new Date(iso).toLocaleString("es-MX", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

const getDocId = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get("doc") || null;
};

const setDocId = (id) => {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("doc", id);
  else url.searchParams.delete("doc");
  window.history.replaceState({}, "", url.toString());
};

const ACTION_META = {
  "CREACIÓN": { color: "#3ddc84", bg: "rgba(61,220,132,0.1)",  icon: "◆", border: "rgba(61,220,132,0.25)" },
  "EDICIÓN":  { color: "#5b9cf6", bg: "rgba(91,156,246,0.1)",  icon: "✎", border: "rgba(91,156,246,0.25)" },
  "FIRMA":    { color: "#c9a227", bg: "rgba(201,162,39,0.1)",   icon: "✦", border: "rgba(201,162,39,0.25)" },
};

// ── Styles ────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,400;0,600;1,400&family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg:      #060a14; --s1: #0d1626; --s2: #121d33;
    --gold:    #c9a227; --gold-l: #e8c04a; --text: #ddd5c0;
    --dim:     #627090; --green: #3ddc84; --red: #ff5c5c;
    --blue:    #5b9cf6; --border: #1a2540; --border2: #253458;
  }
  html, body { background: var(--bg); color: var(--text); font-family: 'Syne', sans-serif; }
  .app { min-height: 100vh; }

  .loading { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; gap:18px; }
  .spin { width:38px; height:38px; border:2px solid var(--border2); border-top-color:var(--gold); border-radius:50%; animation:spin 0.75s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }
  .loading p { font-size:13px; color:var(--dim); letter-spacing:1px; }

  .notif { position:fixed; top:18px; right:18px; z-index:9999; padding:11px 20px; border-radius:3px; font-size:13px; font-weight:600; border-left:3px solid; animation:notifIn 0.25s ease; }
  .notif.ok  { background:#071812; border-color:var(--green); color:var(--green); }
  .notif.err { background:#180707; border-color:var(--red);   color:var(--red); }
  @keyframes notifIn { from { transform:translateX(16px); opacity:0; } to { transform:none; opacity:1; } }

  .home { max-width:680px; margin:0 auto; padding:64px 24px 80px; }
  .brand { display:flex; align-items:center; gap:14px; margin-bottom:10px; }
  .hex { width:34px; height:34px; background:var(--gold); clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%); }
  .brand-name { font-size:26px; font-weight:800; color:var(--gold-l); letter-spacing:-0.5px; }
  .brand-sub { font-size:14px; color:var(--dim); line-height:1.7; margin-bottom:48px; max-width:500px; }
  .brand-sub strong { color:var(--text); font-weight:600; }
  .create-box { display:flex; gap:10px; margin-bottom:52px; }
  .input-main { flex:1; background:var(--s1); border:1px solid var(--border2); color:var(--text); padding:13px 16px; font-family:'Syne',sans-serif; font-size:14px; border-radius:3px; outline:none; transition:border-color 0.2s; }
  .input-main:focus { border-color:var(--gold); }
  .input-main::placeholder { color:var(--dim); }
  .btn-new { background:var(--gold); color:#000; border:none; padding:13px 22px; font-family:'Syne',sans-serif; font-size:13px; font-weight:700; cursor:pointer; border-radius:3px; white-space:nowrap; transition:background 0.15s; }
  .btn-new:hover { background:var(--gold-l); }
  .sec-label { font-size:10px; letter-spacing:2.5px; color:var(--dim); text-transform:uppercase; margin-bottom:14px; }
  .doc-row { background:var(--s1); border:1px solid var(--border); border-radius:3px; padding:18px 22px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; transition:border-color 0.15s, background 0.15s; }
  .doc-row:hover { border-color:var(--border2); background:var(--s2); }
  .doc-row-title { font-size:15px; font-weight:700; }
  .doc-row-meta  { font-size:11px; color:var(--dim); margin-top:3px; }
  .badge { font-size:10px; color:var(--gold); background:rgba(201,162,39,0.1); border:1px solid rgba(201,162,39,0.25); padding:4px 10px; border-radius:20px; white-space:nowrap; }
  .empty { text-align:center; padding:44px; border:1px dashed var(--border2); border-radius:3px; color:var(--dim); font-size:13px; line-height:1.8; }

  .toolbar { position:fixed; top:0; left:0; right:0; z-index:50; height:54px; background:var(--s1); border-bottom:1px solid var(--border); display:flex; align-items:center; gap:10px; padding:0 20px; }
  .tb-brand { display:flex; align-items:center; gap:8px; cursor:pointer; flex-shrink:0; }
  .tb-hex { width:20px; height:20px; background:var(--gold); clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%); }
  .tb-name { font-size:13px; font-weight:800; color:var(--gold-l); }
  .sep { width:1px; height:22px; background:var(--border2); flex-shrink:0; }
  .title-inp { flex:1; background:transparent; border:none; color:var(--text); font-family:'Syne',sans-serif; font-size:14px; font-weight:700; outline:none; min-width:0; }
  .title-inp::placeholder { color:var(--dim); }
  .tb-btn { background:transparent; border:1px solid var(--border2); color:var(--dim); padding:6px 14px; font-family:'Syne',sans-serif; font-size:11px; font-weight:600; cursor:pointer; border-radius:3px; display:flex; align-items:center; gap:5px; transition:all 0.15s; white-space:nowrap; flex-shrink:0; }
  .tb-btn:hover { border-color:var(--gold); color:var(--gold); }
  .tb-btn.on { background:rgba(201,162,39,0.1); border-color:var(--gold); color:var(--gold); }
  .cnt-pill { background:rgba(201,162,39,0.15); color:var(--gold); border-radius:10px; padding:1px 7px; font-size:10px; }
  .save-btn { background:var(--gold); color:#000; border:none; padding:7px 18px; font-family:'Syne',sans-serif; font-size:12px; font-weight:700; cursor:pointer; border-radius:3px; display:flex; align-items:center; gap:6px; transition:background 0.15s; flex-shrink:0; }
  .save-btn:hover { background:var(--gold-l); }
  .dot { width:6px; height:6px; border-radius:50%; background:#000; }

  .editor-wrap { padding-top:54px; padding-bottom:54px; min-height:100vh; }
  .doc-scroll { max-width:740px; margin:0 auto; padding:48px 20px 80px; }

  .paper { background:var(--s1); border:1px solid var(--border); border-radius:2px; }
  .paper-top { padding:28px 44px 22px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:flex-start; }
  .id-label { font-size:9px; letter-spacing:2px; color:var(--dim); text-transform:uppercase; margin-bottom:4px; }
  .id-val { font-family:'DM Mono',monospace; font-size:11px; color:var(--gold); }
  .chain-status { text-align:right; }
  .chain-pill { font-size:9px; letter-spacing:1.5px; text-transform:uppercase; color:var(--green); background:rgba(61,220,132,0.07); border:1px solid rgba(61,220,132,0.2); padding:4px 10px; border-radius:2px; }
  .created-at { font-size:10px; color:var(--dim); margin-top:6px; }

  .vbanner { margin:0 44px 20px; padding:11px 16px; border-radius:3px; font-size:12px; font-weight:600; display:flex; align-items:center; gap:8px; animation:fadeUp 0.3s ease; }
  .vbanner.ok  { background:rgba(61,220,132,0.07);  border:1px solid rgba(61,220,132,0.25); color:var(--green); }
  .vbanner.bad { background:rgba(255,92,92,0.07);   border:1px solid rgba(255,92,92,0.25);  color:var(--red); }
  @keyframes fadeUp { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:none; } }

  .editor-body { padding:36px 44px; min-height:420px; }
  .content-ta { width:100%; min-height:400px; background:transparent; border:none; outline:none; color:var(--text); font-family:'Crimson Pro',Georgia,serif; font-size:17px; line-height:1.9; resize:none; caret-color:var(--gold); }
  .content-ta::placeholder { color:var(--dim); font-style:italic; }

  .sig-section { border-top:1px solid var(--border); padding:28px 44px 36px; }
  .sig-heading { font-size:9px; letter-spacing:2.5px; color:var(--dim); text-transform:uppercase; margin-bottom:20px; }
  .sig-recorded { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:20px; }
  .sig-chip { background:rgba(201,162,39,0.08); border:1px solid rgba(201,162,39,0.25); color:var(--gold); padding:5px 14px; border-radius:20px; font-size:12px; }
  .sig-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  .sig-slot { border:1px dashed var(--border2); border-radius:3px; padding:14px; }
  .sig-slot-lbl { font-size:10px; color:var(--dim); margin-bottom:8px; letter-spacing:0.5px; }
  .sig-row { display:flex; gap:8px; }
  .sig-inp { flex:1; background:var(--s2); border:1px solid var(--border); color:var(--text); padding:9px 13px; font-family:'Syne',sans-serif; font-size:13px; border-radius:3px; outline:none; transition:border-color 0.15s; }
  .sig-inp:focus { border-color:var(--gold); }
  .sig-inp::placeholder { color:var(--dim); }
  .btn-sign { background:transparent; border:1px solid var(--gold); color:var(--gold); padding:9px 15px; font-family:'Syne',sans-serif; font-size:12px; font-weight:700; cursor:pointer; border-radius:3px; white-space:nowrap; transition:all 0.15s; }
  .btn-sign:hover { background:var(--gold); color:#000; }
  .add-sig { margin-top:14px; background:none; border:none; color:var(--dim); font-family:'Syne',sans-serif; font-size:12px; cursor:pointer; padding:0; transition:color 0.15s; }
  .add-sig:hover { color:var(--gold); }

  .footer-bar { position:fixed; bottom:0; left:0; right:0; z-index:50; height:54px; background:var(--s1); border-top:1px solid var(--border); display:flex; align-items:center; gap:12px; padding:0 20px; }
  .footer-label { font-size:10px; letter-spacing:1.5px; color:var(--dim); text-transform:uppercase; flex-shrink:0; }
  .author-inp { background:var(--s2); border:1px solid var(--border); color:var(--text); padding:7px 13px; font-family:'Syne',sans-serif; font-size:13px; border-radius:3px; outline:none; transition:border-color 0.15s; width:200px; }
  .author-inp:focus { border-color:var(--gold); }
  .author-inp::placeholder { color:var(--dim); }
  .footer-note { font-size:11px; color:var(--dim); }

  .overlay { position:fixed; inset:0; z-index:100; background:rgba(6,10,20,0.65); backdrop-filter:blur(3px); animation:fadeOverlay 0.2s ease; }
  @keyframes fadeOverlay { from { opacity:0; } to { opacity:1; } }
  .history-panel { position:fixed; right:0; top:0; bottom:0; width:460px; max-width:100vw; background:var(--s1); border-left:1px solid var(--border); z-index:101; display:flex; flex-direction:column; animation:slideIn 0.28s ease; }
  @keyframes slideIn { from { transform:translateX(100%); } to { transform:none; } }
  .hp-head { padding:22px 24px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; }
  .hp-title { font-size:14px; font-weight:800; }
  .hp-sub { font-size:11px; color:var(--dim); margin-top:3px; }
  .close-btn { background:none; border:none; color:var(--dim); font-size:18px; cursor:pointer; transition:color 0.15s; line-height:1; }
  .close-btn:hover { color:var(--text); }
  .hp-body { flex:1; overflow-y:auto; padding:20px 20px 40px; }
  .hp-body::-webkit-scrollbar { width:4px; }
  .hp-body::-webkit-scrollbar-thumb { background:var(--border2); border-radius:2px; }

  .block-entry { position:relative; padding-left:34px; padding-bottom:20px; }
  .block-entry::before { content:''; position:absolute; left:12px; top:26px; bottom:0; width:1px; background:var(--border); }
  .block-entry:last-child::before { display:none; }
  .block-dot { position:absolute; left:0; top:5px; width:26px; height:26px; border-radius:50%; border:2px solid; display:flex; align-items:center; justify-content:center; font-size:10px; background:var(--s1); }
  .block-card { border:1px solid var(--border); border-radius:3px; padding:14px 16px; background:var(--s2); }
  .bc-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
  .bc-action { font-size:9px; font-weight:700; letter-spacing:2px; text-transform:uppercase; padding:3px 8px; border-radius:2px; }
  .bc-idx { font-family:'DM Mono',monospace; font-size:10px; color:var(--dim); }
  .bc-author { font-size:13px; font-weight:700; color:var(--text); margin-bottom:3px; }
  .bc-time { font-size:11px; color:var(--dim); margin-bottom:10px; }
  .bc-preview { font-size:12px; color:var(--dim); font-style:italic; margin-bottom:10px; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
  .hash-block { margin-top:8px; background:var(--s1); border-radius:2px; padding:8px 10px; }
  .h-label { font-size:8px; letter-spacing:2px; color:var(--dim); text-transform:uppercase; margin-bottom:3px; }
  .h-val { font-family:'DM Mono',monospace; font-size:9.5px; word-break:break-all; line-height:1.6; }
  .h-val.cur { color:var(--green); }
  .h-val.prv { color:var(--blue); opacity:0.8; }
`;

// ── App ───────────────────────────────────────────────────────
export default function ChainDoc() {
  const [screen, setScreen]       = useState("loading");
  const [docs, setDocs]           = useState([]);
  const [doc, setDoc]             = useState(null);
  const [author, setAuthor]       = useState("");
  const [title, setTitle]         = useState("");
  const [content, setContent]     = useState("");
  const [histOpen, setHistOpen]   = useState(false);
  const [signers, setSigners]     = useState(["", ""]);
  const [verifyRes, setVerifyRes] = useState(null);
  const [saving, setSaving]       = useState(false);
  const [notif, setNotif]         = useState(null);
  const [copied, setCopied]       = useState(false);
  const [dirty, setDirty]         = useState(false);

  const notify = (msg, type = "ok") => {
    setNotif({ msg, type });
    setTimeout(() => setNotif(null), 3500);
  };

  useEffect(() => {
    (async () => {
      const id = getDocId();
      if (id) {
        const d = await store.get(id);
        if (d) {
          setDoc(d); setTitle(d.title); setContent(d.content || "");
          setScreen("editor"); return;
        } else {
          notify("Documento no encontrado", "err");
        }
      }
      const list = await store.list();
      list.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
      setDocs(list);
      setScreen("home");
    })();
  }, []);

  const refreshList = async () => {
    const list = await store.list();
    list.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
    setDocs(list);
  };

  const createDoc = async () => {
    if (!author.trim()) { notify("Escribe tu nombre primero", "err"); return; }
    const id      = generateId();
    const genesis = await mineBlock(null, "CREACIÓN", `Documento creado por ${author.trim()}`, author.trim());
    const newDoc  = { id, title: "Sin título", content: "", chain: [genesis], lastModified: genesis.timestamp };
    const ok      = await store.set(id, newDoc);
    if (!ok) { notify("Error al crear documento", "err"); return; }
    setDoc(newDoc); setTitle("Sin título"); setContent(""); setDirty(false);
    setDocId(id);
    setScreen("editor");
  };

  const saveContent = async () => {
    if (!author.trim()) { notify("Escribe tu nombre en la barra inferior", "err"); return; }
    setSaving(true);
    const last    = doc.chain[doc.chain.length - 1];
    const block   = await mineBlock(last, "EDICIÓN", content, author.trim());
    const updated = { ...doc, title, content, chain: [...doc.chain, block], lastModified: block.timestamp };
    const ok      = await store.set(updated.id, updated);
    if (ok) { setDoc(updated); setDirty(false); notify("Bloque registrado en la cadena ✓"); }
    else notify("Error al guardar", "err");
    setSaving(false);
  };

  const signDoc = async (signerName, idx) => {
    if (!signerName.trim()) { notify("Escribe un nombre para firmar", "err"); return; }
    const last    = doc.chain[doc.chain.length - 1];
    const block   = await mineBlock(last, "FIRMA", `Firma de ${signerName.trim()}`, signerName.trim());
    const updated = { ...doc, chain: [...doc.chain, block], lastModified: block.timestamp };
    const ok      = await store.set(updated.id, updated);
    if (ok) {
      setDoc(updated);
      const ns = [...signers]; ns[idx] = ""; setSigners(ns);
      notify(`✦ Firma de ${signerName.trim()} registrada en cadena`);
    } else notify("Error al firmar", "err");
  };

  const handleVerify = async () => {
    const result = await verifyChain(doc.chain);
    setVerifyRes(result);
    setTimeout(() => setVerifyRes(null), 7000);
  };

  const shareUrl = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2500);
      notify("URL copiada al portapapeles ✓");
    });
  };

  const openDoc = async (id) => {
    const d = await store.get(id);
    if (!d) { notify("Documento no encontrado", "err"); return; }
    setDoc(d); setTitle(d.title); setContent(d.content || ""); setDirty(false);
    setDocId(id);
    setScreen("editor");
  };

  const goHome = async () => {
    setDocId(null);
    setDoc(null); setHistOpen(false); setVerifyRes(null);
    setScreen("loading");
    await refreshList();
    setScreen("home");
  };

  const signatures = doc ? doc.chain.filter((b) => b.action === "FIRMA") : [];

  if (screen === "loading") return (
    <>
      <style>{CSS}</style>
      <div className="loading">
        <div className="spin" />
        <p>Conectando con la cadena…</p>
      </div>
    </>
  );

  if (screen === "home") return (
    <>
      <style>{CSS}</style>
      <div className="app">
        {notif && <div className={`notif ${notif.type}`}>{notif.msg}</div>}
        <div className="home">
          <div className="brand">
            <div className="hex" />
            <span className="brand-name">ChainDoc</span>
          </div>
          <p className="brand-sub">
            Documentos con <strong>registro inalterable</strong>. Cada edición y firma queda sellada en una cadena criptográfica SHA-256 — cualquier modificación es detectable al instante.
          </p>
          <div className="create-box">
            <input className="input-main" placeholder="Tu nombre completo (quedará registrado como autor)"
              value={author} onChange={(e) => setAuthor(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createDoc()} />
            <button className="btn-new" onClick={createDoc}>+ Nuevo documento</button>
          </div>
          <div className="sec-label">Documentos recientes</div>
          {docs.length === 0
            ? <div className="empty">No hay documentos aún.<br />Escribe tu nombre y crea el primero.</div>
            : docs.map((d) => (
              <div key={d.id} className="doc-row" onClick={() => openDoc(d.id)}>
                <div>
                  <div className="doc-row-title">{d.title}</div>
                  <div className="doc-row-meta">{fmtDate(d.lastModified)} · ID: {d.id}</div>
                </div>
                <span className="badge">{d.chain.length} bloque{d.chain.length !== 1 ? "s" : ""}</span>
              </div>
            ))
          }
        </div>
      </div>
    </>
  );

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        {notif && <div className={`notif ${notif.type}`}>{notif.msg}</div>}

        <div className="toolbar">
          <div className="tb-brand" onClick={goHome}>
            <div className="tb-hex" /><span className="tb-name">ChainDoc</span>
          </div>
          <div className="sep" />
          <input className="title-inp" value={title} placeholder="Título del documento"
            onChange={(e) => { setTitle(e.target.value); setDirty(true); }} />
          <button className="tb-btn" onClick={handleVerify}>⬡ Verificar</button>
          <button className={`tb-btn ${histOpen ? "on" : ""}`} onClick={() => setHistOpen(!histOpen)}>
            ◈ Historial <span className="cnt-pill">{doc.chain.length}</span>
          </button>
          <button className="tb-btn" onClick={shareUrl}>{copied ? "✓ Copiado" : "↗ Compartir"}</button>
          <button className="save-btn" onClick={saveContent} disabled={saving}>
            {dirty && <span className="dot" />}
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>

        <div className="editor-wrap">
          <div className="doc-scroll">
            <div className="paper">
              <div className="paper-top">
                <div>
                  <div className="id-label">ID del documento</div>
                  <div className="id-val">{doc.id}</div>
                </div>
                <div className="chain-status">
                  <div className="chain-pill">◆ Cadena activa · {doc.chain.length} bloques</div>
                  <div className="created-at">Creado {fmtDate(doc.chain[0].timestamp)}</div>
                </div>
              </div>

              {verifyRes && (
                <div className={`vbanner ${verifyRes.valid ? "ok" : "bad"}`}>
                  {verifyRes.valid
                    ? "✓ Cadena íntegra · Todos los bloques son criptográficamente válidos"
                    : `✗ Cadena comprometida · Fallo detectado en bloque #${verifyRes.failedAt}`}
                </div>
              )}

              <div className="editor-body">
                <textarea className="content-ta" value={content}
                  onChange={(e) => { setContent(e.target.value); setDirty(true); }}
                  placeholder={"Comienza a escribir el contenido del documento…\n\nEste espacio puede ser un contrato de arrendamiento, un acuerdo de confidencialidad, carta de intención, u otro documento que requiera trazabilidad de cambios."} />
              </div>

              <div className="sig-section">
                <div className="sig-heading">✦ Firmas del documento</div>
                {signatures.length > 0 && (
                  <div className="sig-recorded">
                    {signatures.map((b, i) => (
                      <span key={i} className="sig-chip">✦ {b.author} · {fmtDate(b.timestamp)}</span>
                    ))}
                  </div>
                )}
                <div className="sig-grid">
                  {signers.map((s, i) => (
                    <div key={i} className="sig-slot">
                      <div className="sig-slot-lbl">Firmante {i + 1}</div>
                      <div className="sig-row">
                        <input className="sig-inp" placeholder="Nombre completo" value={s}
                          onChange={(e) => { const ns = [...signers]; ns[i] = e.target.value; setSigners(ns); }}
                          onKeyDown={(e) => e.key === "Enter" && signDoc(s, i)} />
                        <button className="btn-sign" onClick={() => signDoc(s, i)}>Firmar</button>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="add-sig" onClick={() => setSigners([...signers, ""])}>+ Añadir firmante</button>
              </div>
            </div>
          </div>
        </div>

        <div className="footer-bar">
          <span className="footer-label">Editando como:</span>
          <input className="author-inp" placeholder="Tu nombre" value={author}
            onChange={(e) => setAuthor(e.target.value)} />
          <span className="footer-note">→ Aparece en el registro de cada cambio</span>
        </div>

        {histOpen && (
          <>
            <div className="overlay" onClick={() => setHistOpen(false)} />
            <div className="history-panel">
              <div className="hp-head">
                <div>
                  <div className="hp-title">Historial de la cadena</div>
                  <div className="hp-sub">{doc.chain.length} bloques · registro inalterable</div>
                </div>
                <button className="close-btn" onClick={() => setHistOpen(false)}>✕</button>
              </div>
              <div className="hp-body">
                {[...doc.chain].reverse().map((b) => {
                  const meta = ACTION_META[b.action] || { color: "#888", bg: "rgba(136,136,136,0.1)", icon: "·", border: "#333" };
                  return (
                    <div key={b.index} className="block-entry">
                      <div className="block-dot" style={{ borderColor: meta.color, color: meta.color }}>{meta.icon}</div>
                      <div className="block-card" style={{ borderColor: meta.border }}>
                        <div className="bc-top">
                          <span className="bc-action" style={{ color: meta.color, background: meta.bg }}>{b.action}</span>
                          <span className="bc-idx">Bloque #{b.index}</span>
                        </div>
                        <div className="bc-author">{b.author}</div>
                        <div className="bc-time">{fmtDate(b.timestamp)}</div>
                        {b.content && b.action !== "CREACIÓN" && (
                          <div className="bc-preview">{b.content.slice(0, 120)}{b.content.length > 120 ? "…" : ""}</div>
                        )}
                        <div className="hash-block">
                          <div className="h-label">Hash de este bloque</div>
                          <div className="h-val cur">{b.hash}</div>
                        </div>
                        <div className="hash-block" style={{ marginTop: 6 }}>
                          <div className="h-label">Hash del bloque anterior</div>
                          <div className="h-val prv">{b.previousHash.slice(0, 40)}…</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

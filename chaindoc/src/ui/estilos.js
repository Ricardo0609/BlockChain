// Hoja de estilos global de la app (se inyecta con <style>).

// ── CSS ───────────────────────────────────────────────────────
export const ESTILOS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

:root{
  --negro:#252223; --gris-400:#5b5456; --gris-300:#7b7b7b; --gris-200:#ada6a8;
  --bordes:#cac6c7; --gris-100:#e8e4e5; --rojo:#df2531; --rojo-soft:#fef2f2;
  --blanco:#fff; --bg-soft:#fafafa; --verde:#16a34a;
  /* ← NUEVO: un color por tipo de documento. Se usan en el borde de la
     tarjeta y en la etiqueta de debajo del título, para que los dos
     digan lo mismo. */
  --t-texto:#2563eb; --t-factura:#16a34a; --t-recibo:#7c3aed; --t-smart:#ca8a04;
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
/* ← NUEVO: cancelar no lleva al mismo sitio que aceptar, y el negro los
   hacía parecer dos caminos iguales. */
.btn-secondary.rojo{border-color:var(--rojo);color:var(--rojo)}
.btn-secondary.rojo:hover{background:var(--rojo);color:#fff;border-color:var(--rojo)}
.btn-warning{background:var(--rojo);color:#fff;border:none;padding:13px 24px;font-size:16px;border-radius:8px;box-shadow:var(--sh-sm)}
.btn-warning:hover{opacity:.88}
.btn-tertiary{background:none;border:none;color:var(--gris-400);font-family:var(--f-p);font-weight:500;font-size:15px;cursor:pointer;text-decoration:underline;padding:4px}
.btn-tertiary:hover{color:var(--negro)}
/* ← NUEVO: la vuelta que gira dentro de cualquier botón que esté
   esperando. Se pinta con el color del propio texto, así vale igual en
   el botón negro, en el rojo y en el de borde. */
.btn.esperando::before{content:"";width:14px;height:14px;border:2px solid currentColor;
  border-top-color:transparent;border-radius:50%;animation:sp .7s linear infinite;flex:none}

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
/* ← ACTUALIZADO: era el caracter ⌄, que cada navegador dibuja a su
   manera y parecia texto sin estilo. Ahora es un icono de verdad; el
   tamano lo fija el componente y aqui solo queda el giro. */
.sec-arrow{color:var(--gris-200);transition:transform .2s;display:inline-flex;
  align-items:center;justify-content:center;line-height:1}
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
/* align-items:flex-start: sin esto, la fila estira todas las tarjetas a
   la altura de la más alta y la acostada dejaba de ser acostada. */
.cards{display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start}
/* ← ACTUALIZADO: el color del borde sale de --c-tipo, que cada tipo
   redefine. Así el :hover ya no tiene que pisarlo: sube la tarjeta y le
   da sombra, pero el color sigue diciendo qué es. */
.card{--c-tipo:var(--bordes);background:#fff;border:2px solid var(--c-tipo);border-radius:16px;
  padding:16px;width:262px;box-shadow:var(--sh-sm);cursor:pointer;transition:all .15s;
  display:flex;flex-direction:column;gap:14px;position:relative}
.card.tipo-texto{--c-tipo:var(--t-texto)}
.card.tipo-factura{--c-tipo:var(--t-factura)}
.card.tipo-recibo{--c-tipo:var(--t-recibo)}
.card.tipo-smart{--c-tipo:var(--t-smart)}
/* Los comprobantes van acostados: la forma se reconoce antes que el color. */
.card.ancha{width:323px}
.card.ancha .card-prev{height:75px}
.card:hover{border-color:var(--c-tipo);transform:translateY(-2px);box-shadow:var(--sh)}
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
/* ← NUEVO: la etiqueta del tipo, justo debajo del título y del mismo
   color que el borde. El margen negativo la acerca al título: el hueco
   de 14px de la tarjeta la dejaba flotando. */
/* .chip.chip-tipo y no .chip-tipo a secas: mas abajo hay otra regla
   .chip que fija color y fondo, y al ir despues ganaba el empate. */
.chip.chip-tipo{align-self:flex-start;margin-top:-8px;background:#fff;
  border:1.5px solid var(--c-tipo);color:var(--c-tipo);font-weight:600}

/* dropdown */
.drop{position:absolute;top:52px;right:8px;z-index:100;background:#fff;border:2px solid var(--bordes);border-radius:12px;box-shadow:var(--sh);min-width:180px;overflow:hidden}
.drop button{display:block;width:100%;padding:13px 18px;font-family:var(--f-p);font-size:15px;font-weight:500;text-align:left;background:none;border:none;cursor:pointer;color:var(--negro);transition:background .1s}
.drop button:hover{background:var(--bg-soft)}
.drop button.danger{color:var(--rojo)}

/* ── CREATE BTN ── */
.create-zone{display:flex;justify-content:center;padding:47px 0}
.create-btn{background:#fff;border:1.5px solid var(--bordes);border-radius:12px;padding:12px 24px;box-shadow:var(--sh-sm);cursor:pointer;font-family:var(--f-p);font-size:20px;color:var(--negro);display:flex;flex-direction:column;align-items:center;gap:6px;transition:all .15s;min-width:180px}
/* ← ACTUALIZADO: antes solo se oscurecia el borde, que junto a los
   demas botones parecia que este se habia quedado a medias. Ahora se
   rellena igual que btn-secondary. */
.create-btn:hover{background:var(--negro);color:#fff;border-color:var(--negro);
  box-shadow:var(--sh);transform:translateY(-1px)}
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
/* ← ACTUALIZADO: sin centrar, un nombre de dos palabras se partía y
   quedaba pegado al borde izquierdo («Contrato inteligente»). Ahora se
   centra, respira por los lados y baja de línea con holgura. */
.tpl-n{font-family:var(--f-p);font-weight:500;font-size:16px;color:var(--negro);
  text-align:center;line-height:1.3;padding:0 12px;max-width:100%;
  overflow-wrap:break-word;hyphens:auto}

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

/* ← NUEVO (Etapa 3): roles al compartir y aviso de correo sin confirmar */
.rol-lista{display:flex;flex-direction:column;gap:6px;margin-bottom:6px}
.rol-op{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;align-items:baseline;
  text-align:left;padding:9px 11px;border:1px solid var(--bordes);border-radius:9px;cursor:pointer}
.rol-op:hover{background:var(--bg-soft)}
.rol-op.on{border-color:var(--negro);background:var(--bg-soft)}
.rol-op input{grid-row:span 2;align-self:center;accent-color:var(--negro)}
.rol-n{font-weight:600;font-size:14px;color:var(--negro)}
.rol-d{grid-column:2;font-size:12px;color:var(--gris-300);line-height:1.4}
.rol-tag{font-size:11px;padding:2px 9px;border-radius:99px;
  background:var(--gris-100);color:var(--gris-400);flex:0 0 auto}
.lnk{background:none;border:0;padding:0;font:inherit;color:inherit;
  text-decoration:underline;cursor:pointer}
.lnk:disabled{opacity:.5;cursor:default}
.aviso-verif{display:flex;flex-wrap:wrap;align-items:center;gap:10px;
  background:rgba(194,65,12,.09);color:#c2410c;border-radius:10px;
  padding:10px 14px;margin:0 0 14px;font-size:14px;line-height:1.4;text-align:left}
.aviso-verif .aviso-t{flex:1;min-width:220px}
.aviso-verif button{font-size:13px;padding:5px 11px;border-radius:8px;
  border:1px solid currentColor;background:transparent;color:inherit;cursor:pointer}
.aviso-verif button:disabled{opacity:.5;cursor:default}

/* ← NUEVO (Etapa 4): el sello fiscal y el aviso del RFC */
.fd-aviso{grid-column:1/-1;font-size:12px;color:#c2410c;line-height:1.4;margin-top:3px}
.fd-input.mal{border-color:#c2410c;background:rgba(194,65,12,.04)}

.fiscal{margin-top:10px;border-radius:10px;padding:10px 12px;border:1px solid;
  display:flex;flex-direction:column;gap:6px;text-align:left}
.fiscal-verde{border-color:rgba(22,163,74,.35);background:rgba(22,163,74,.07)}
.fiscal-ambar{border-color:rgba(202,138,4,.4);background:rgba(202,138,4,.08)}
.fiscal-rojo{border-color:rgba(223,37,49,.4);background:rgba(223,37,49,.07)}
.fiscal-h{display:flex;align-items:center;gap:7px}
.fiscal-verde .fiscal-h{color:#15803d}
.fiscal-ambar .fiscal-h{color:#a16207}
.fiscal-rojo .fiscal-h{color:var(--rojo)}
.fiscal-t{font-weight:600;font-size:14px;flex:1}
.fiscal-re{font-size:12px;padding:3px 9px;border-radius:7px;border:1px solid currentColor;
  background:transparent;color:inherit;cursor:pointer;flex:0 0 auto}
.fiscal-re:disabled{opacity:.5;cursor:default}
.fiscal-sat{font-size:13px;color:var(--gris-400);line-height:1.4}
.fiscal-uuid{font-size:11px;color:var(--gris-300);font-family:ui-monospace,monospace;overflow-wrap:anywhere}
.fiscal-datos{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;color:var(--gris-400)}
.fiscal-69b{display:flex;gap:7px;align-items:flex-start;font-size:12.5px;line-height:1.45;
  color:var(--rojo);background:var(--rojo-soft);border-radius:8px;padding:7px 9px}
.fiscal-cotejo{display:flex;gap:7px;align-items:flex-start;font-size:12.5px;line-height:1.45;
  color:#a16207;background:rgba(202,138,4,.1);border-radius:8px;padding:7px 9px}
.fiscal-fecha{font-size:11px;color:var(--gris-200)}

.p69{display:flex;gap:10px;align-items:flex-start;border-radius:12px;padding:12px 14px;
  margin:18px 0 0;font-size:14px;line-height:1.5;text-align:left;border:1px solid}
.p69.bien{border-color:rgba(22,163,74,.35);background:rgba(22,163,74,.07);color:#15803d}
.p69.mal{border-color:rgba(223,37,49,.4);background:var(--rojo-soft);color:var(--rojo)}
.p69 b{display:block}
.p69-r{margin-top:6px;font-size:13px;line-height:1.45}
.p69-f{margin-top:4px;font-size:12px;color:var(--gris-300)}

/* ← NUEVO (Etapa 4 · Bloque B): avisos de la revisión diaria */
.avisos{border:1px solid var(--bordes);border-radius:14px;padding:14px 16px;margin-bottom:22px;
  display:flex;flex-direction:column;gap:7px;background:var(--blanco);box-shadow:var(--sh-sm)}
.avisos-h{display:flex;align-items:center;gap:8px;font-weight:600;font-size:15px;color:var(--negro);
  margin-bottom:3px}
.aviso{display:flex;gap:9px;align-items:flex-start;text-align:left;width:100%;cursor:pointer;
  border:0;background:var(--bg-soft);border-radius:9px;padding:9px 11px;font-size:13.5px;
  line-height:1.45;color:var(--gris-400);font-family:inherit}
.aviso:hover{background:var(--gris-100)}
.aviso.grave{background:var(--rojo-soft);color:var(--rojo)}
.avisos-mas{font-size:12px;color:var(--gris-300);padding-left:2px}

/* ← NUEVO (Etapa 4 · Bloque B): entrega por enlace */
.entrega-wrap{min-height:100vh;display:flex;align-items:flex-start;justify-content:center;
  padding:32px 16px;background:var(--bg-soft)}
.entrega{width:100%;max-width:520px;background:var(--blanco);border-radius:18px;
  box-shadow:var(--sh-card);padding:28px 24px;text-align:left}
.entrega-marca{font-family:var(--f-t);font-weight:700;font-size:15px;color:var(--gris-200);
  letter-spacing:.02em;margin-bottom:22px}
.entrega h1{font-size:23px;line-height:1.25;margin:0 0 8px}
.entrega-de{font-size:15px;color:var(--gris-400);line-height:1.5;margin:0}
.entrega-cab{margin-bottom:20px}
/* ← ACTUALIZADO (rediseño): la pantalla pública dejó de ser «un
   archivo, una zona de arrastre» y pasó a ser una lista de pendientes
   con su botón cada uno, porque un enlace ahora cubre varios
   comprobantes. */
.entrega-cuenta{font-size:13.5px;color:var(--gris-300);margin:6px 0 0}
.entrega-lista{display:flex;flex-direction:column;gap:9px}
.entrega-item{display:flex;align-items:center;gap:13px;flex-wrap:wrap;
  border:1px solid var(--bordes);border-radius:12px;padding:13px 15px}
.entrega-item.hecho{border-color:#bbf7d0;background:rgba(21,128,61,.05)}
.entrega-item-b{flex:1;min-width:190px}
.entrega-item-t{display:flex;align-items:center;gap:7px;font-weight:600;font-size:16px;
  color:var(--negro);line-height:1.35}
.entrega-item.hecho .entrega-item-t{color:#15803d}
.entrega-item-d{font-size:13.5px;color:var(--gris-300);line-height:1.5;margin-top:4px}
.entrega-item-ok{font-size:13px;color:#15803d;margin-top:5px;overflow-wrap:anywhere}
.entrega-item-h{font-size:10.5px;font-family:ui-monospace,monospace;color:var(--gris-300);
  overflow-wrap:anywhere;line-height:1.45;margin-top:3px}
.entrega-btn{display:inline-flex;align-items:center;gap:7px;cursor:pointer;flex:0 0 auto;
  border:1.5px solid var(--negro);border-radius:10px;padding:10px 16px;
  font-size:14.5px;font-weight:600;color:var(--blanco);background:var(--negro);
  transition:opacity .15s}
.entrega-btn:hover{opacity:.85}
.entrega-btn.otra{background:transparent;color:var(--negro)}
.entrega-btn.ocupado{cursor:default;opacity:.7;border-color:var(--bordes);
  background:var(--bg-soft);color:var(--gris-400);font-weight:500}
.entrega-listo{display:flex;gap:10px;align-items:flex-start;margin-top:16px;padding:12px 14px;
  border-radius:10px;background:rgba(21,128,61,.08);color:#15803d;font-size:14px;line-height:1.5}
.entrega-tip{display:flex;gap:9px;align-items:flex-start;margin-top:16px;padding:11px 13px;
  border-radius:10px;background:rgba(202,138,4,.09);color:#a16207;font-size:13px;line-height:1.5}
.entrega-pie{font-size:12.5px;color:var(--gris-300);line-height:1.6;margin-top:18px}
.entrega-mal,.entrega-ok{text-align:center;padding:14px 0}
.entrega-mal{color:var(--rojo)}
.entrega-ok{color:#15803d}
.entrega-mal h1,.entrega-ok h1{margin:12px 0 8px}
.entrega-mal p,.entrega-ok p{color:var(--gris-400);font-size:15px;line-height:1.55;margin:0 0 6px}
.entrega-huella{margin:18px 0 0;padding:12px 14px;border-radius:10px;background:var(--bg-soft);
  text-align:left;color:var(--gris-400)}
.entrega-huella span{font-size:12px;color:var(--gris-300);display:block;margin-bottom:5px}
.entrega-huella code{font-size:11px;font-family:ui-monospace,monospace;overflow-wrap:anywhere;
  color:var(--negro);display:block}

/* El modal del enlace */
.enl-caja{display:flex;flex-direction:column;gap:10px;background:var(--bg-soft);
  border-radius:12px;padding:14px;margin-bottom:14px}
.enl-url{font-size:12px;font-family:ui-monospace,monospace;overflow-wrap:anywhere;
  color:var(--negro);line-height:1.5}
.enl-aviso{display:flex;gap:9px;align-items:flex-start;font-size:13px;line-height:1.5;
  color:#a16207;background:rgba(202,138,4,.09);border-radius:10px;padding:11px 13px;text-align:left}
.enl-nota{font-size:12.5px;color:var(--gris-300);line-height:1.5;margin-top:6px;text-align:left}
.enl-plazos{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:6px}
.enl-plazo{font-size:13px;padding:7px 14px;border-radius:99px;border:1px solid var(--bordes);
  background:transparent;color:var(--gris-400);cursor:pointer}
.enl-plazo.on{border-color:var(--negro);background:var(--negro);color:var(--blanco)}
.enl-lista{margin-top:16px;display:flex;flex-direction:column;gap:6px}
.enl-fila{display:flex;align-items:center;gap:10px;padding:9px 11px;
  border:1px solid var(--bordes);border-radius:10px;text-align:left}
.enl-fila.muerto{opacity:.5}
.enl-fila-b{flex:1}
.enl-fila-t{font-size:14px;font-weight:600;color:var(--negro)}
.enl-fila-d{font-size:12px;color:var(--gris-300);margin-top:2px}

/* ← NUEVO (rediseño de Compartir): la primera pregunta —¿ve todo o
   sólo lo que le toca entregar?— pesa más que las demás, así que sus
   dos opciones son más grandes que la lista de roles que viene
   después. */
.modo-lista{display:flex;flex-direction:column;gap:8px;margin-bottom:4px}
.modo{display:grid;grid-template-columns:auto 1fr;gap:3px 11px;align-items:baseline;
  text-align:left;padding:12px 13px;border:1.5px solid var(--bordes);border-radius:11px;cursor:pointer}
.modo:hover{background:var(--bg-soft)}
.modo.on{border-color:var(--negro);background:var(--bg-soft)}
.modo input{grid-row:span 2;align-self:center;accent-color:var(--negro)}
.modo-n{font-weight:600;font-size:15px;color:var(--negro)}
.modo-d{grid-column:2;font-size:12.5px;color:var(--gris-300);line-height:1.45}
.modo-det{border-left:2px solid var(--bordes);padding-left:14px;margin:6px 0 0 6px}
.req-todo{display:flex;align-items:center;gap:10px;text-align:left;font-size:14px;
  color:var(--negro);padding:8px 11px;border:1px solid var(--bordes);
  border-radius:9px;cursor:pointer;margin-bottom:6px}
.req-todo:hover{background:var(--bg-soft)}
.req-todo.on{border-color:var(--negro);background:var(--bg-soft)}
.req-todo input{accent-color:var(--negro)}
.req-lista{display:flex;flex-direction:column;gap:4px;max-height:210px;overflow-y:auto;
  padding:2px 2px 2px 14px;margin-bottom:6px}
.req-op{display:flex;align-items:center;gap:9px;text-align:left;font-size:13.5px;
  color:var(--negro);padding:7px 10px;border:1px solid var(--bordes);
  border-radius:8px;cursor:pointer}
.req-op:hover{background:var(--bg-soft)}
.req-op.on{border-color:var(--negro);background:var(--bg-soft)}
.req-op input{accent-color:var(--negro)}
.req-ok{margin-left:auto;font-size:11px;padding:2px 8px;border-radius:99px;
  background:var(--gris-100);color:var(--gris-400);flex:0 0 auto}

/* ← NUEVO (Etapa 5): el anclaje en Bitcoin. Se distingue del resto a
   propósito: es lo único de la pantalla que no lo afirma chaindoc. */
.ancla-caja{display:flex;gap:11px;align-items:flex-start;margin:18px 0 0;
  padding:13px 15px;border-radius:12px;text-align:left;border:1px solid}
.ancla-caja.lista{background:rgba(21,128,61,.06);border-color:#bbf7d0;color:#15803d}
.ancla-caja.espera{background:var(--bg-soft);border-color:var(--bordes);color:var(--gris-400)}
.ancla-b{flex:1;min-width:0}
.ancla-caja b{font-size:14.5px;font-weight:600;display:block;line-height:1.4}
.ancla-d{font-size:13px;line-height:1.55;margin-top:4px;color:var(--gris-400)}
.ancla-caja.lista .ancla-d{color:#166534}
.ancla-d a{color:inherit;font-weight:600}
.ancla-pie{font-size:12.5px;line-height:1.55;margin-top:8px;color:var(--gris-300)}
.tl-ancla{display:inline-flex;align-items:center;gap:5px;margin-top:5px;
  font-size:11.5px;font-weight:600;color:#15803d;text-decoration:none;
  background:rgba(21,128,61,.09);padding:3px 9px;border-radius:99px}
.tl-ancla:hover{background:rgba(21,128,61,.16)}

/* ← NUEVO: aviso de privacidad y términos */
.legal-check{display:flex;align-items:flex-start;gap:10px;text-align:left;
  font-size:13.5px;line-height:1.5;color:var(--gris-400);margin:14px 0 4px;cursor:pointer}
.legal-check input{margin-top:2px;accent-color:var(--negro);flex:0 0 auto}
.legal-check .lnk{font-size:inherit;color:var(--negro);font-weight:600}
.legal-nota{font-size:12px;line-height:1.5;color:var(--gris-300);text-align:left;margin-bottom:14px}
.modal.legal{max-width:720px}
.legal-tabs{display:flex;gap:6px;margin-bottom:14px}
.legal-tab{flex:1;font-size:14px;font-weight:600;padding:10px 12px;border-radius:10px;
  border:1px solid var(--bordes);background:transparent;color:var(--gris-400);cursor:pointer}
.legal-tab.on{border-color:var(--negro);background:var(--negro);color:var(--blanco)}
.legal-piloto{font-size:12.5px;line-height:1.55;text-align:left;padding:11px 13px;
  border-radius:10px;background:rgba(202,138,4,.09);color:#a16207;margin-bottom:14px}
.legal-cuerpo{max-height:58vh;overflow-y:auto;text-align:left;padding-right:6px}
.legal-meta{font-size:12px;color:var(--gris-300);margin-bottom:12px}
.legal-intro{font-size:14px;line-height:1.65;color:var(--negro)}
.legal-sec{margin-top:20px}
.legal-sec h3{font-size:15px;font-weight:700;color:var(--negro);margin:0 0 7px}
.legal-sec p{font-size:13.5px;line-height:1.65;color:var(--gris-400);margin:0 0 9px}
.legal-lista{margin:0 0 9px;padding-left:20px}
.legal-lista li{font-size:13.5px;line-height:1.6;color:var(--gris-400);margin-bottom:7px}
.legal-cierre{font-style:italic}
.legal-doc strong{color:var(--negro);font-weight:600}
.aviso-legal{display:flex;flex-wrap:wrap;align-items:center;gap:10px;
  padding:13px 15px;border-radius:12px;margin-bottom:14px;text-align:left;
  background:rgba(202,138,4,.10);border:1px solid rgba(202,138,4,.28);color:#a16207}
.aviso-legal button{font-size:13px;padding:7px 14px;border-radius:99px;cursor:pointer;
  border:1px solid rgba(161,98,7,.4);background:transparent;color:#a16207;font-weight:600}
.aviso-legal button.principal{background:#a16207;border-color:#a16207;color:var(--blanco)}

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

/* ← NUEVO (Etapa 5): firma con la e.firma del SAT */
.efirma-badge{display:flex;align-items:center;gap:8px;margin-top:8px;font-size:13px;
  font-weight:600;color:#1a7f4b;background:rgba(26,127,75,.08);padding:6px 10px;border-radius:8px}
.eb-sat{font-size:10px;font-weight:700;letter-spacing:.6px;background:#1a7f4b;color:#fff;
  padding:2px 6px;border-radius:4px}
.efirma-abrir{width:100%}
.efirma-pie{font-size:12px;color:var(--gris-300);text-align:center;margin-top:10px;line-height:1.5}
.modal.efirma{text-align:left}
.modal.efirma h2,.modal.efirma .sub{text-align:center}
.efirma-aviso{font-size:13px;line-height:1.55;color:var(--gris-400);background:var(--bg-soft);
  border:1px solid var(--bordes);border-radius:10px;padding:12px 14px;margin:6px 0 16px}
.efirma-archivo{display:flex;align-items:center;justify-content:space-between;gap:12px;
  border:1.5px solid var(--bordes);border-radius:10px;padding:12px 14px;margin-bottom:10px;cursor:pointer}
.efirma-archivo:hover{border-color:var(--negro)}
.efirma-archivo input{display:none}
.ea-t{font-size:14px;font-weight:600}
.ea-t code{font-family:var(--f-m,ui-monospace,monospace);font-size:13px;color:var(--gris-300)}
.ea-v{font-size:13px;color:var(--gris-300);max-width:48%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ea-v.on{color:var(--verde);font-weight:600}
.efirma-paso{display:flex;align-items:center;gap:9px;font-size:13px;color:var(--gris-400);margin:12px 0 2px}
.spin-min{width:14px;height:14px;border:2px solid var(--bordes);border-top-color:var(--negro);
  border-radius:50%;animation:sp .7s linear infinite;flex:none}
.efirma-err{font-size:13px;line-height:1.5;color:var(--rojo);background:var(--rojo-soft);
  border-radius:8px;padding:10px 12px;margin:12px 0 2px}

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
/* ← NUEVO: cerrar sesion es la unica accion del menu que cuesta algo
   si se toca sin querer. El rojo lo dice antes de leerlo. */
.menu-item.peligro{color:var(--rojo)}
.menu-item.peligro:hover{color:var(--rojo)}
.menu-x{background:none;border:none;cursor:pointer;color:var(--rojo);margin-top:auto;
  margin-bottom:40px;display:flex;align-items:center;justify-content:center;padding:8px}

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
  .sec-arrow .msym{font-size:22px !important}

  /* carpetas: 2 columnas */
  .folders{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
  .folder{padding:12px 14px;border-radius:12px;gap:6px;min-width:0}
  .folder-n{font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .folder svg{width:22px;height:22px;flex-shrink:0}

  /* tarjetas a ancho completo */
  .cards{display:grid;grid-template-columns:minmax(0,1fr);gap:14px}
  .card{width:100%;min-width:0;padding:14px;border-radius:14px;gap:12px}
  .card.ancha{width:100%}
  .card.ancha .card-prev{height:70px}
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
  /* ← ACTUALIZADO: con cuatro tipos, dos columnas dan 2×2; tres
     dejaban uno solo en la segunda fila. El paso del método son tres
     opciones y sí caben en una fila, así que lleva su propia rejilla. */
  .tpl-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
  .tpl-grid.tres{grid-template-columns:repeat(3,1fr)}
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
  .card:hover{transform:none;box-shadow:var(--sh-sm);border-color:var(--c-tipo)}
  .card:active{border-color:var(--negro);transform:scale(.99)}
  .folder:hover{border-color:var(--bordes);box-shadow:none}
  .folder:active{border-color:var(--negro)}
  .tpl:hover{transform:none;box-shadow:var(--sh-sm);border-color:var(--bordes)}
  .tpl.sel{border-color:var(--negro)}
  .btn-secondary:hover{background:#fff;color:var(--negro)}
  .btn-secondary.rojo:hover{background:#fff;color:var(--rojo)}
  .btn-secondary.rojo:active{background:var(--rojo);color:#fff}
  .btn-secondary.on{background:var(--negro);color:#fff}
  .create-btn:hover{background:#fff;color:var(--negro);border-color:var(--bordes);
    box-shadow:var(--sh-sm);transform:none}
  .create-btn:active{background:var(--negro);color:#fff;border-color:var(--negro)}
}
`;
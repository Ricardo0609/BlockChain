import { useState, useEffect } from "react";
import { extractFromFile, ocrImage, stripExtension } from "./fileImport";
import {
  signUp,
  signIn,
  logOut,
  resetPassword,
  watchAuth,
  getProfile,
  saveProfile,
  authError,
  findUserByEmail,
  publishDirectory,
  enviarVerificacion,
  refrescarVerificacion,
} from "./auth";
import { bioAvailable, bioRegister, bioAssert, bioError, b64uToBytes } from "./biometric";
import {
  analyzeContract,
  montoDeDocumento,
  archivosDe,
  aidDe,
  estadoVinculo,
  dondeEstaAdjunto,
  destinoDuplicado,
  debeRegistrarConsulta,
  cerrarSolicitudes,
  hashFile,
} from "./smartContract";
import { subirArchivo, descartarSubida, abrirArchivo, storageError, makeThumb, LIMITE_MB } from "./storage";
// ← NUEVO (Etapa 5 · Bloque A): sellado de tiempo en Bitcoin.
import { anclajesDe, anclarAhora, paraElPaquete, porHash, resumenAnclaje } from "./nucleo/anclaje";
// ← NUEVO: aviso de privacidad y términos.
import { aceptoVigente, selloDeAceptacion, VERSION as LEGAL_VERSION } from "./nucleo/legal";
import { descargarPaquete } from "./paquete";
import { FORMS, serializeForm } from "./ui/formularios";
import { TEMPLATES, selloDesdeUid } from "./nucleo/catalogos";
import { getUrlDoc, setUrlDoc } from "./nucleo/formato";
import { folioTexto, genId, sha256, siguienteFolio, verifyChain } from "./nucleo/cadena";
import { normalizarEnlace, nombreDeEnlace, textoFirmado } from "./nucleo/enlaces";
import { parseFactura } from "./nucleo/extraccion";
import {
  quitarArchivoViejo,
  store,
  crear,
  aplicar,
  guardarCampos,
  registrarConsulta as consultaServidor,
  enServidor,
  estaProtegido,
} from "./nucleo/datos";
import { llamar, errorBackend } from "./nucleo/backend";
import { leerAvisos } from "./nucleo/avisos";
import {
  testigoDeUrl, verInvitacion, entregarArchivo, entregarEnlace as entregarEnlaceInvitado,
  enlaceDeEntrega,
} from "./nucleo/invitaciones";
import {
  ROLES_ASIGNABLES, ROL_TEXTO, ROL_AYUDA, rolDe, puede, puedeSubirA,
  listaDeAccesos, compartir as compartirServidor, quitarAcceso as quitarAccesoServidor,
  pedirComprobante,
} from "./nucleo/accesos";
import { renderAcceso } from "./pantallas/Acceso";
import { renderEntrega } from "./pantallas/Entrega";
import { renderDocumento } from "./pantallas/Documento";
import { renderInicio } from "./pantallas/Inicio";
import { ESTILOS } from "./ui/estilos";
export default function ChainDoc(){
  const [screen,setScreen]   = useState("loading");
  const [authStep,setAuthStep] = useState(0);
  const [authMode,setAuthMode] = useState("signup");   // ← NUEVO: "signup" | "login"
  const [authBusy,setAuthBusy] = useState(false);      // ← NUEVO: bloquea el botón mientras responde Firebase
  const [docs,setDocs]       = useState([]);
  // Una cuenta nueva empieza SIN carpetas: la tarjeta punteada
  // "Nueva carpeta" es la que invita a crear la primera. Tres carpetas
  // puestas de oficio suponen de que trata el trabajo de quien entra.
  const [folders,setFolders] = useState(()=>{ try{return JSON.parse(localStorage.getItem("cd_folders"))||[];}catch{return [];} });
  const [view,setView]       = useState("inicio");
  const [d,setD]             = useState(null);
  const [editMode,setEdit]   = useState(false);
  const [uid,setUid]         = useState(null);         // ← NUEVO: id real de la cuenta
  const [user,setUser]       = useState("");           // ← ACTUALIZADO: viene del perfil, no de localStorage
  const [acctEmail,setAcctEmail] = useState("");       // ← NUEVO: correo de la sesión activa
  const [email,setEmail]     = useState("");           // campo del formulario
  const [pass,setPass]       = useState("");
  // ← ACTUALIZADO (Etapa 3): el navegador ya no guarda ni compara secretos.
  // Sólo sabe SI hay código y QUÉ dispositivos tienen biometría; el servidor
  // es quien comprueba.
  const [tieneCodigo,setTieneCodigo] = useState(false);
  const [bioCreds,setBioCreds] = useState([]);   // [{credId, device}]
  const [,setSelloId]          = useState(null); // el sello lo pone el servidor al firmar
  const [bioOk,setBioOk]       = useState(false); // ← NUEVO: el dispositivo soporta biometría
  const [bioBusy,setBioBusy]   = useState(false); // ← NUEVO: esperando a Face ID
  const [title,setTitle]     = useState("");
  const [content,setContent] = useState("");
  const [,setDirty]     = useState(false);
  const [migrando,setMigrando] = useState(false);   // ← NUEVO (Etapa 2)
  const [migrandoArch,setMigrandoArch] = useState(false);   // ← NUEVO (archivos)
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
  const [verificandoFiscal,setVerificandoFiscal] = useState(null); // ← NUEVO (Etapa 4)
  const [revisando69B,setRevisando69B]           = useState(false);
  // ← NUEVO (Etapa 4 · Bloque B): entrega por enlace, sin cuenta.
  const [testigo]                    = useState(()=>testigoDeUrl());
  const [invitacion,setInvitacion]   = useState(undefined);
  const [invError,setInvError]       = useState("");
  const [invBusy,setInvBusy]         = useState(false);
  const [invPaso,setInvPaso]         = useState("");
  const [invSubiendo,setInvSubiendo] = useState(null);
  const [entregas,setEntregas]       = useState({});
  const [enlaces,setEnlaces]         = useState(null);
  const [enlaceNuevo,setEnlaceNuevo] = useState(null);
  const [invDias,setInvDias]         = useState(7);
  // ← NUEVO (Etapa 4 · Bloque B, rediseño): Compartir es ahora un solo
  // panel con dos preguntas encadenadas. `shareModo` es la primera
  // («completo» o «entregar»); las otras dos son el alcance de la
  // segunda, y sólo cuentan cuando el modo es «entregar».
  const [shareModo,setShareModo]     = useState("completo");
  const [shareTodo,setShareTodo]     = useState(true);
  const [shareReqs,setShareReqs]     = useState([]);
  const [avisos,setAvisos]           = useState(null);
  // ← NUEVO (Etapa 5): el anclaje del documento abierto. `null` mientras
  // no se ha consultado; se pide al abrirlo y no bloquea nada si falla.
  const [anclaje,setAnclaje]         = useState(null);
  const [anclando,setAnclando]       = useState(false);
  // ← NUEVO: lo legal. `legalOk` es la casilla del registro; `legalTab`
  // recuerda qué documento se estaba leyendo al cambiar de pestaña.
  const [legalOk,setLegalOk]         = useState(false);
  const [legalTab,setLegalTab]       = useState("aviso");
  const [legalPend,setLegalPend]     = useState(false);
  const [hallazgos69B,setHallazgos69B]           = useState(null);
  const [shareErr,setShareErr]     = useState("");    // ← NUEVO
  const [shareFound,setShareFound] = useState(null);  // ← NUEVO: cuenta encontrada
  const [shareBusy,setShareBusy]   = useState(false); // ← NUEVO
  const [shareRol,setShareRol]     = useState("lector"); // ← NUEVO (Etapa 3): rol con el que entra
  const [verificado,setVerificado] = useState(true);  // ← NUEVO: correo confirmado
  const [verifBusy,setVerifBusy]   = useState(false); // ← NUEVO
  const [exps,setExps]             = useState(null);  // ← NUEVO: expedientes disponibles
  const [linkExp,setLinkExp]       = useState(null);  // ← NUEVO: expediente elegido
  const [linkErr,setLinkErr]       = useState("");    // ← NUEVO
  const [linkBusy,setLinkBusy]     = useState(false); // ← NUEVO
  const [linkSitios,setLinkSitios] = useState([]);    // ← NUEVO: dónde está ya adjunto este documento
  // ← ACTUALIZADO (rediseño): el mensaje que acompaña a una petición
  // de comprobante. Antes vivía en su propio modal; ahora es un campo
  // más de Compartir.
  const [solMsg,setSolMsg]         = useState("");
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

  // Un error puede venir del almacén o del servidor; cada uno habla distinto.
  const errArchivo = (e) =>
    String(e?.code||"").startsWith("functions/") ? errorBackend(e) : storageError(e);

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

  // ← NUEVO (Etapa 4): si la dirección trae un enlace de entrega, esta
  // pantalla se abre ANTES de cualquier sesión. Quien llega aquí no
  // tiene cuenta y no debería ver siquiera la pantalla de acceso.
  useEffect(()=>{
    if(!testigo) return;
    (async()=>{
      try{
        setInvitacion(await verInvitacion(testigo));
      }catch(e){
        console.error(e);
        setInvitacion(null);
        setInvError(errorBackend(e));
      }
    })();
  },[testigo]);

  // ← NUEVO (Etapa 5): el anclaje del documento abierto.
  //
  // Se pide aparte y sin bloquear nada: es información adicional, no
  // un requisito para ver el documento. Si el servidor no contesta,
  // la pantalla se ve igual, sólo sin las marcas de Bitcoin.
  useEffect(()=>{
    let vigente = true;
    (async()=>{
      if(!d?.id || !enServidor()){ if(vigente) setAnclaje(null); return; }
      if(vigente) setAnclaje(null);
      try{
        const r = await anclajesDe(d.id, false);   // sin las pruebas: aquí sólo se pintan marcas
        if(vigente) setAnclaje(r);
      }catch(e){ console.warn("[chaindoc] no se pudo leer el anclaje:", e?.message || e); }
    })();
    return ()=>{ vigente = false; };
  },[d?.id, d?.bloques]);

  // ← ACTUALIZADO: la sesión ya no se deduce de localStorage.
  // Firebase avisa por sí solo si hay alguien conectado, al cargar y en cada login/logout.
  useEffect(()=>{
    if(testigo) return;   // en modo entrega no hay sesión que vigilar
    const stop = watchAuth(async(account)=>{
      if(!account){
        setUid(null); setUser(""); setAcctEmail(""); setTieneCodigo(false);
        setVerificado(true);                                   // ← NUEVO: sin sesión no hay aviso
        setBioCreds([]);                                       // ← NUEVO
        setSelloId(null);                                      // ← NUEVO
        setDocs([]); setD(null); setScreen("auth");
        return;
      }

      const profile = await getProfile(account.uid);
      setUid(account.uid);
      setUser(profile?.name || account.displayName || "");
      setAcctEmail(account.email || "");
      // ← NUEVO: quien se registro antes de que existieran estos textos,
      // o antes de la version actual, tiene que volver a aceptarlos.
      setLegalPend(!aceptoVigente(profile));
      // El estado de las credenciales lo dice el servidor, no el perfil.
      let cuenta = { tieneCodigo:false, biometria:[] };
      try{ cuenta = await llamar("estadoCuenta"); }
      catch(e){ console.error(e); }
      setTieneCodigo(cuenta.tieneCodigo);
      setBioCreds(cuenta.biometria || []);

      // ← NUEVO: el sello se asigna una sola vez y se guarda en el perfil.
      // Guardarlo (en vez de derivarlo siempre) evita que cambie si más
      // adelante agregas o quitas imágenes del catálogo.
      let sello = profile?.selloId;
      if(!sello){
        sello = selloDesdeUid(account.uid);
        saveProfile(account.uid, { selloId: sello });
      }
      setSelloId(sello);

      // ← NUEVO (Etapa 4): lo que dejó la revisión de anoche. Se lee
      // sin bloquear: si falla, la app entra igual.
      leerAvisos(account.uid).then(setAvisos).catch(()=>{});

      // ← ACTUALIZADO (Etapa 3): al directorio sólo se entra con el
      // correo confirmado. Si no, cualquiera podría publicarse con una
      // dirección ajena y aparecer en la libreta de todos.
      setVerificado(Boolean(account.emailVerified));
      if(account.email && account.emailVerified){
        publishDirectory(account.uid, account.email,
                         profile?.name || account.displayName || "");
      }

      // Sin código de firma la cuenta está incompleta: mándalo a crearlo.
      // (Se evalúa el perfil, no el estado local, porque este callback
      //  se registra una sola vez y no vería los valores actualizados.)
      if(!cuenta.tieneCodigo){
        setAuthMode("signup"); setAuthStep(1); setScreen("auth"); return;
      }

      const id = getUrlDoc();
      if(id){
        const dd = await store.get(id);
        if(dd){
          setD(dd); setTitle(dd.title); setContent(dd.content||"");
          setFields(dd.fields||{});
          setUnlocked(!estaProtegido(dd)); setScreen("doc");
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
    // La casilla no está marcada por omisión y no se puede saltar: sin
    // consentimiento no hay tratamiento de datos, y sin constancia de
    // ese consentimiento el consentimiento no sirve de nada.
    if(!legalOk){
      notify("Necesitas aceptar el aviso de privacidad y los términos","err"); return;
    }
    setAuthBusy(true);
    try{
      await signUp(email, pass, mIn, selloDeAceptacion());
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

  // ← NUEVO (Etapa 3): confirmación del correo.
  // Sin ella no se puede invitar a nadie ni aparecer en el directorio:
  // es lo que impide registrarse con una dirección que no es tuya y
  // repartir accesos desde ahí.
  const reenviarVerificacion = async()=>{
    setVerifBusy(true);
    try{
      await enviarVerificacion();
      notify("Te enviamos el enlace de confirmación ✓");
    }catch(err){ console.error(err); notify(authError(err),"err"); }
    finally{ setVerifBusy(false); }
  };

  const comprobarVerificacion = async()=>{
    setVerifBusy(true);
    try{
      const ok = await refrescarVerificacion();
      setVerificado(ok);
      notify(ok ? "Correo confirmado ✓" : "Todavía no aparece confirmado. Abre el enlace y vuelve a intentar.",
             ok ? "ok" : "err");
    }catch(err){ console.error(err); notify("No se pudo comprobar. Inténtalo de nuevo.","err"); }
    finally{ setVerifBusy(false); }
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
    try{
      await llamar("guardarCodigoFirma", { codigo: pass.trim() });
      setTieneCodigo(true); setPass(""); setAuthStep(2);
    }catch(e){ console.error(e); notify(errorBackend(e),"err"); }
  };

  const finishAuth = async()=>{
    await refresh(); setScreen("home");
  };

  // ← NUEVO: guarda los cambios de configuración en el perfil de Firestore
  // ← NUEVO (Etapa 2): traslada los documentos del formato viejo al nuevo.
  // Se puede correr varias veces: lo que ya está migrado se omite.
  const migrarDatos = async()=>{
    setMigrando(true);
    try{
      const r = await llamar("migrar");
      await refresh();
      notify(r.migrados
        ? `${r.migrados} documento${r.migrados===1?"":"s"} trasladado${r.migrados===1?"":"s"} al formato nuevo ✓`
        : "No quedaba nada por trasladar");
      if(r.errores?.length) notify(`${r.errores.length} no se pudieron trasladar`,"err");
    }catch(e){ console.error(e); notify(errorBackend(e),"err"); }
    finally{ setMigrando(false); }
  };

  // ← NUEVO: pasa los archivos que estaban en base64 dentro de Firestore
  // al almacén de verdad. También se puede correr varias veces.
  const migrarArchivosDatos = async()=>{
    setMigrandoArch(true);
    try{
      const r = await llamar("migrarArchivos");
      notify(r.migrados
        ? `${r.migrados} archivo${r.migrados===1?"":"s"} trasladado${r.migrados===1?"":"s"} al almacén ✓`
        : "No quedaba ningún archivo por trasladar");
      if(r.errores?.length) notify(`${r.errores.length} no se pudieron trasladar`,"err");
    }catch(e){ console.error(e); notify(errorBackend(e),"err"); }
    finally{ setMigrandoArch(false); }
  };

  const saveSettings = async()=>{
    const patch = {};
    if(mIn.trim() && mIn.trim()!==user) patch.name = mIn.trim();

    if(pass.trim()){
      if(pass.trim().length<4){ notify("El código necesita al menos 4 caracteres","err"); return; }
      // ← ACTUALIZADO: el código se manda al servidor, que lo guarda con sal
      // y un hash lento. Aquí no queda rastro de él.
      try{
        await llamar("guardarCodigoFirma", { codigo: pass.trim() });
        setTieneCodigo(true);
      }catch(e){ console.error(e); notify(errorBackend(e),"err"); return; }
    }

    if(Object.keys(patch).length){
      const ok = await saveProfile(uid, patch);
      if(!ok){ notify("No se pudo guardar","err"); return; }
      if(patch.name) setUser(patch.name);
    }
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
  // ← NUEVO (7 oct): contra el documento duplicado.
  //
  // Crear tarda lo que tarde el servidor, y durante ese rato el botón
  // seguía vivo: una segunda pulsación —o Enter en el nombre y después
  // clic— creaba DOS documentos. Salían dos tarjetas iguales y no había
  // forma de saber cuál era cuál.
  //
  // Mientras `creando` está encendido, el botón se apaga, el Enter no
  // dispara y la propia función se devuelve sin hacer nada. React vacía
  // los cambios de estado al terminar cada pulsación, así que la segunda
  // ya encuentra la puerta cerrada.
  const [creando, setCreando] = useState(false);

  // ← NUEVO (7 oct): las esperas que no tenían aviso.
  //
  // Borrar, mover y exportar tardan lo que tarde el servidor, y hasta
  // ahora el botón se quedaba igual: el usuario no sabía si había pasado
  // algo, le daba otra vez, y en el mejor de los casos no pasaba nada.
  //
  // `ocupado` guarda el nombre de lo que se está haciendo, y cada botón
  // lo mira para apagarse, enseñar su vuelta y decirlo con palabras.
  const [ocupado, setOcupado] = useState(null);
  const conEspera = async (nombre, fn) => {
    if(ocupado) return;
    setOcupado(nombre);
    try{ return await fn(); }
    finally{ setOcupado(null); }
  };

  // ← NUEVO (10 oct): el folio que llevará el documento nuevo.
  //
  // En modo servidor esto no se usa: el folio lo pone la función, que es
  // la única que ve el contador de la cuenta. Va aquí para el camino sin
  // servidor, donde no hay quién lo asigne, y se calcula del mayor folio
  // que ya hay en la lista.
  const folioNuevo = () => {
    const n = siguienteFolio(docs);
    return { folio: n, numId: folioTexto(n) };
  };

  // ← NUEVO (10 oct): el aviso de «¿Es un contrato?» se puede quitar.
  //
  // Aparecía en todo documento de texto en edición y no había forma de
  // callarlo: quien ya decidió que su documento NO es un contrato lo
  // tenía delante cada vez que entraba a editar.
  //
  // Se recuerda por documento y sólo en este navegador, a propósito: es
  // una preferencia de vista, no un dato del expediente, y no tiene por
  // qué viajar a la cadena ni verlo quien tenga el documento compartido.
  const [convOculto, setConvOculto] = useState(() => {
    try{
      const v = JSON.parse(localStorage.getItem("chaindoc.convOculto") || "[]");
      return Array.isArray(v) ? v : [];
    }catch{ return []; }
  });
  const ocultarConvertir = (id) => {
    if(!id) return;
    setConvOculto((v) => {
      const n = v.includes(id) ? v : [...v, id];
      // En modo privado escribir revienta; el aviso se queda quitado
      // mientras dure la sesión y vuelve al recargar. Es lo peor que
      // puede pasar y no vale la pena avisarlo.
      try{ localStorage.setItem("chaindoc.convOculto", JSON.stringify(n)); }catch{ /* sin almacén */ }
      return n;
    });
  };

  const createDoc = async()=>{
    if(creando) return;
    setCreando(true);
    try{
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

    const nd = await crear({
      id: genId(), ...folioNuevo(), title:name, content:body, folder:mIn2||null,
      owner:user, ownerUid:uid, ownerEmail:acctEmail,
      tplId: formKey, fields: formKey ? initial : null,
      source: isImport ? (method==="escanear"?"escaneo":"importado") : "nuevo",
      sourceFile: isImport ? (impMeta?.name||null) : null,
      password:null, sharedWith:[],
    }, { accion:"CREACIÓN", contenido:origin });
    if(!nd){ notify("Error al crear","err"); return; }
    const id = nd.id;

    if(isImport && formKey){
      notify(filled
        ? `${filled} campo${filled===1?"":"s"} llenado${filled===1?"":"s"} automáticamente ✓`
        : "No se reconocieron campos. Llénalos a mano.", filled?"ok":"err");
    }

    closeCreate();
    setD(nd); setTitle(name); setContent(nd.content); setFields(nd.fields||{});
    setUnlocked(true); setEdit(true); setUrlDoc(id); setScreen("doc");
    }finally{ setCreando(false); }
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
    const up = await aplicar(d,
      { accion:"EDICIÓN", contenido:body.slice(0,200) },
      { title, content:body, fields: d.tplId ? fields : null },
      { autor:user, autorUid:uid });
    if(up){ setD(up); setContent(body); setDirty(false); setEdit(false); notify("Bloque registrado en la cadena ✓"); }
    else notify("Error al guardar","err");
    setSaving(false);
  };

  // ← ACTUALIZADO (Etapa 3): el código viaja al servidor, que lo compara
  // contra un hash lento con sal y bloquea tras varios fallos. Antes se
  // comparaba aquí mismo, así que bastaba con alterar esta función.
  const trySign = async()=>{
    if(!tieneCodigo){ notify("No tienes código de firma configurado","err"); return; }
    setSaving(true);
    try{
      const r = await llamar("firmarDocumento", { opId:d.id, codigo:pass.trim() });
      setD(r.doc); setModal(null); setPass("");
      notify(`✦ Firma de ${user} registrada`);
    }catch(e){ console.error(e); notify(errorBackend(e),"err"); }
    finally{ setSaving(false); }
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
      // ← ACTUALIZADO: la llave pública la guarda el servidor, no el perfil.
      // Si estuviera en el perfil, el propio navegador podría cambiarla.
      await llamar("registrarBiometria", { credencial: cred });
      setBioCreds([...bioCreds.filter(c=>c.credId!==cred.credId),
                   { credId: cred.credId, device: cred.device }]);
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
      // ← ACTUALIZADO (Etapa 3): el reto lo emite el servidor y él mismo
      // verifica la firma contra la llave registrada. El navegador sólo
      // hace de mensajero, así que ya no puede declarar una firma válida.
      const { reto, credenciales } = await llamar("retoBiometrico", { motivo:"firma", opId:d.id });
      const asercion = await bioAssert(credenciales, b64uToBytes(reto));
      const r = await llamar("firmarConBiometria", { opId:d.id, asercion });

      setD(r.doc); setModal(null); setPass("");
      notify(`✦ Firma biométrica de ${user} registrada`);
    }catch(err){
      console.error(err);
      notify(String(err?.code||"").startsWith("functions/") ? errorBackend(err) : bioError(err), "err");
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
      const texto = content;
      let base = d;

      // Si había cambios sin guardar en el editor, primero se sellan.
      if(texto !== (d.content||"")){
        const previo = await aplicar(base,
          { accion:"EDICIÓN", contenido:texto.slice(0,200) },
          { content:texto }, { autor:user, autorUid:uid });
        if(!previo){ notify("No se pudo convertir","err"); return; }
        base = previo;
      }

      const up = await aplicar(base, {
        accion:"CONVERSIÓN",
        contenido:`Convertido en contrato inteligente con ${smartRes.requisitos.length} requisitos`,
        meta:{ tipo:"expediente", requisitos:smartRes.requisitos.length,
               fases:(smartRes.fases||[]).length, modelo:smartRes.modelo },
      }, {
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
      }, { autor:user, autorUid:uid });

      if(up){
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
    if(creando) return;                     // ← NUEVO: mismo cerrojo
    setCreando(true);
    try{
    const name = mIn.trim() || smartRes.titulo;
    const nd = await crear({
      id: genId(), ...folioNuevo(), title:name, content:smartText, folder:mIn2||null,
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
      password:null, sharedWith:[],
    }, {
      accion:"CREACIÓN",
      contenido:`Apertura de expediente «${name}» con ${smartRes.requisitos.length} requisitos`,
      meta:{ tipo:"expediente", requisitos:smartRes.requisitos.length, fases:(smartRes.fases||[]).length },
    });

    if(!nd){ notify("Error al crear el expediente","err"); return; }
    closeCreate();
    setD(nd); setTitle(name); setContent(smartText); setFields({});
    setUnlocked(true); setEdit(false); setUrlDoc(nd.id); setScreen("doc");
    notify(`Expediente abierto con ${smartRes.requisitos.length} requisitos ✓`);
    }finally{ setCreando(false); }
  };

  // ← ACTUALIZADO: el archivo se guarda en Firestore (colección «evidencias»).
  // Las imágenes grandes se comprimen solas antes de guardarse.
  // ── Camino sin servidor ──
  // Sólo se usa si VITE_BACKEND no dice "servidor" (por ejemplo, mientras
  // las funciones no estén desplegadas). Aquí la huella la calcula el
  // navegador, que es justo lo que el servidor vino a corregir.
  const registrarArchivoLocal = async({ reqId, file, ruta, thumb })=>{
    const hash = await hashFile(file);
    const req  = d.requisitos.find(r=>r.id===reqId);
    const aid  = genId();
    const nuevo = { aid, path:aid, ruta, nombre:file.name, tipo:file.type||"application/octet-stream",
                    tam:file.size, hash, thumb:thumb||null,
                    subidoEn:new Date().toISOString(), subidoPor:user };
    const requisitos = d.requisitos.map(r=> r.id!==reqId ? r : {
      ...quitarArchivoViejo(r), estado:"cumplido", archivos:[...archivosDe(r), nuevo],
    });
    const { solicitudes, cerradas } = cerrarSolicitudes(d, reqId, user);
    const doc = await aplicar(d, {
      accion:"EVIDENCIA",
      contenido:`${req?.titulo||reqId}: «${file.name}» (${hash.slice(0,16)}…)`,
      meta:{ tipo:"alta", requisito:reqId, archivo:file.name, huella:hash, tam:file.size },
    }, { requisitos, solicitudes }, { autor:user, autorUid:uid });
    if(!doc) throw new Error("No se pudo registrar el comprobante.");
    return { doc, cerradas };
  };

  const registrarEnlaceLocal = async({ reqId, url, host, nombre })=>{
    const req   = d.requisitos.find(r=>r.id===reqId);
    const aid   = genId();
    const hash  = await sha256(textoFirmado(url));
    const nuevo = { aid, origen:"enlace", url, host, nombre,
                    hash, subidoEn:new Date().toISOString(), subidoPor:user };
    const requisitos = d.requisitos.map(r=> r.id!==reqId ? r : {
      ...quitarArchivoViejo(r), estado:"cumplido", archivos:[...archivosDe(r), nuevo],
    });
    const { solicitudes, cerradas } = cerrarSolicitudes(d, reqId, user);
    const doc = await aplicar(d, {
      accion:"EVIDENCIA",
      contenido:`${req?.titulo||reqId}: enlace a ${host} («${nombre}»)`,
      meta:{ tipo:"alta", requisito:reqId, enlace:url, host, archivo:nombre, huella:hash },
    }, { requisitos, solicitudes }, { autor:user, autorUid:uid });
    if(!doc) throw new Error("No se pudo registrar el enlace.");
    return { doc, cerradas };
  };

  const quitarArchivoLocal = async(reqId, aid)=>{
    const req   = d.requisitos.find(r=>r.id===reqId);
    const lista = archivosDe(req);
    const arch  = lista.find(a=>aidDe(a)===aid);
    if(!arch) throw new Error("Ese comprobante ya no está en el requisito.");
    if(arch.origen!=="interno" && arch.ruta) await descartarSubida(arch.ruta);
    const restantes = lista.filter(a=>aidDe(a)!==aid);
    const requisitos = d.requisitos.map(r=> r.id!==reqId ? r : {
      ...quitarArchivoViejo(r), archivos:restantes,
      estado: restantes.length ? "cumplido" : "pendiente",
    });
    const doc = await aplicar(d, {
      accion:"EVIDENCIA",
      contenido:`Retiro de «${arch.nombre}» en «${req?.titulo||reqId}»`,
      meta:{ tipo:"baja", requisito:reqId, archivo:arch.nombre||null },
    }, { requisitos }, { autor:user, autorUid:uid });
    if(!doc) throw new Error("No se pudo retirar el comprobante.");
    return { doc };
  };

  const registrarImagenLocal = async({ file, ruta, thumb })=>{
    const hash = await hashFile(file);
    const path = genId();
    const imagenes = [...(d.imagenes||[]), {
      path, ruta, nombre:file.name, tipo:file.type, tam:file.size, hash, thumb,
      subidoEn:new Date().toISOString(), subidoPor:user,
    }];
    const doc = await aplicar(d, {
      accion:"EVIDENCIA",
      contenido:`Imagen adjunta «${file.name}» (${hash.slice(0,16)}…)`,
      meta:{ tipo:"imagen", archivo:file.name, huella:hash, tam:file.size },
    }, { imagenes }, { autor:user, autorUid:uid });
    if(!doc) throw new Error("No se pudo adjuntar la imagen.");
    return { doc };
  };

  const quitarImagenLocal = async(path)=>{
    const img = (d.imagenes||[]).find(x=>x.path===path);
    if(img?.ruta) await descartarSubida(img.ruta);
    const doc = await aplicar(d, {
      accion:"EVIDENCIA",
      contenido:`Imagen retirada «${img?.nombre||path}»`,
      meta:{ tipo:"imagen-baja", archivo:img?.nombre || null },
    }, { imagenes:(d.imagenes||[]).filter(x=>x.path!==path) }, { autor:user, autorUid:uid });
    if(!doc) throw new Error("No se pudo retirar la imagen.");
    return { doc };
  };

  const attachEvidence = async(reqId, file)=>{
    if(!file || !d) return;
    setSaving(true);
    let ruta = null;
    try{
      // La miniatura se hace aquí (para que la galería cargue rápido);
      // la huella la calcula el servidor al recibir el archivo.
      const thumb = await makeThumb(file);
      ({ ruta } = await subirArchivo({ uid, docId:d.id, file }));

      const r = enServidor()
        ? await llamar("registrarArchivo", { opId:d.id, reqId, ruta, nombre:file.name, thumb })
        : await registrarArchivoLocal({ reqId, file, ruta, thumb });

      setD(r.doc);
      notify(r.cerradas
        ? `Evidencia registrada ✓ ${r.cerradas} solicitud${r.cerradas===1?"":"es"} atendida${r.cerradas===1?"":"s"}`
        : "Evidencia registrada en la cadena ✓");
    }catch(e){
      console.error(e);
      if(ruta) await descartarSubida(ruta);   // no dejar basura en el almacén
      notify(errArchivo(e),"err");
    }
    finally{ setSaving(false); }
  };

  // ── EVIDENCIA POR ENLACE ──
  //
  // ← NUEVO (10 oct): el tercer camino para cumplir un requisito.
  //
  // Adjuntar un archivo y pedirlo a alguien no cubren al entregable que
  // vive en una dirección: un sitio publicado, un repositorio, un
  // tablero. Hasta ahora eso se entregaba como captura de pantalla, que
  // prueba menos que la dirección misma.
  //
  // `enlReq` guarda en qué requisito está abierto el campo. Es uno a la
  // vez a propósito: dos formularios abiertos invitan a pegar la
  // dirección en el que no era.
  const [enlReq,  setEnlReq]  = useState(null);
  const [enlUrl,  setEnlUrl]  = useState("");
  const [enlNom,  setEnlNom]  = useState("");
  const [enlErr,  setEnlErr]  = useState("");
  const [enlBusy, setEnlBusy] = useState(false);

  const abrirEnlace = (reqId)=>{
    setEnlReq(reqId); setEnlUrl(""); setEnlNom(""); setEnlErr("");
  };
  const cerrarEnlace = ()=>{
    setEnlReq(null); setEnlUrl(""); setEnlNom(""); setEnlErr("");
  };

  /**
   * Guarda el enlace en el requisito abierto.
   *
   * La dirección se revisa aquí para poder decir qué está mal mientras
   * se escribe, pero quien manda es el servidor: vuelve a revisarla por
   * su cuenta. Esta revisión es cortesía, no la cerradura.
   */
  const guardarEnlace = async()=>{
    if(enlBusy || !enlReq || !d) return;
    const revisado = normalizarEnlace(enlUrl);
    if(!revisado.ok){ setEnlErr(revisado.error); return; }

    setEnlErr(""); setEnlBusy(true);
    try{
      const nombre = nombreDeEnlace(enlNom, revisado.host);
      const r = enServidor()
        ? await llamar("registrarEnlace",
            { opId:d.id, reqId:enlReq, url:revisado.url, nombre })
        : await registrarEnlaceLocal(
            { reqId:enlReq, url:revisado.url, host:revisado.host, nombre });

      setD(r.doc);
      cerrarEnlace();
      notify(r.cerradas
        ? `Enlace registrado ✓ ${r.cerradas} solicitud${r.cerradas===1?"":"es"} atendida${r.cerradas===1?"":"s"}`
        : "Enlace registrado en la cadena ✓");
    }catch(e){
      console.error(e);
      setEnlErr(errorBackend(e) || "No se pudo registrar el enlace.");
    }
    finally{ setEnlBusy(false); }
  };

  // ← ACTUALIZADO: además de asentarlo, borra el archivo de Storage
  // ← ACTUALIZADO: retira UN comprobante, no vacía el requisito entero.
  // Un documento enlazado sólo se desvincula; el original no se toca.
  const removeEvidence = async(reqId, aid)=>{
    try{
      const r = enServidor()
        ? await llamar("quitarArchivoDeRequisito", { opId:d.id, reqId, aid })
        : await quitarArchivoLocal(reqId, aid);
      setD(r.doc);
      notify("Comprobante retirado");
    }catch(e){ console.error(e); notify(errArchivo(e),"err"); }
  };

  // ← NUEVO: verificación biométrica genérica, reutilizable por cualquier
  // acción que necesite confirmar identidad. Devuelve true o false.
  const verifyBio = async(motivo)=>{
    if(!bioOk || !bioCreds.length) return false;
    setBioBusy(true);
    try{
      const { reto, credenciales } = await llamar("retoBiometrico",
        { motivo:"desbloqueo", opId: d?.id || null });
      const asercion = await bioAssert(credenciales, b64uToBytes(reto));
      await llamar("desbloquearBiometrico", { asercion, opId: d?.id || null });
      if(motivo) notify(motivo);
      return true;
    }catch(err){
      console.error(err);
      notify(String(err?.code||"").startsWith("functions/") ? errorBackend(err) : bioError(err), "err");
      return false;
    }finally{ setBioBusy(false); }
  };

  // ← NUEVO: los adjuntos sólo se abren tras validar el código de firma
  const unlockFiles = async()=>{
    if(!tieneCodigo){ notify("No tienes código de firma configurado","err"); return; }
    try{
      await llamar("verificarCodigoFirma", { codigo: pass.trim() });
      setFilesOpen(true); setPass(""); setModal(null);
      notify("Documentos desbloqueados ✓");
    }catch(e){ console.error(e); notify(errorBackend(e),"err"); }
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
      await abrirArchivo(archivo?.path, archivo?.nombre, forzarDescarga);
    }catch(e){ notify(errArchivo(e),"err"); }
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
    const rolPrevio = rolDe(d, null, correo);
    if(rolPrevio && rolPrevio === shareRol){
      setShareErr(`Esa persona ya entra como ${ROL_TEXTO[rolPrevio]}.`); return;
    }

    setShareBusy(true);
    try{
      const cuenta = await findUserByEmail(correo);
      if(!cuenta){
        setShareErr(`No se encontró ninguna cuenta con «${correo}». Verifica que esté registrada y que haya confirmado su correo.`);
        return;
      }

      // ← ACTUALIZADO (Etapa 3): los accesos los reparte el servidor,
      // que comprueba que quien comparte tenga permiso para hacerlo.
      if(enServidor()){
        const r = await compartirServidor(d.id, correo, shareRol);
        setD(r.doc); setMIn(""); setShareFound(cuenta);
        notify(`${rolPrevio ? "Rol actualizado" : "Compartido"}: ${cuenta.nombre||correo} · ${ROL_TEXTO[shareRol]} ✓`);
        return;
      }

      const up = await aplicar(d, {
        accion:"COMPARTIDO",
        contenido:`Compartido con ${cuenta.nombre||correo} (${correo}) como ${ROL_TEXTO[shareRol]}`,
        meta:{ tipo:"alta", correo, rol:shareRol },
      }, {
        sharedWith:[...new Set([...(d.sharedWith||[]), correo])],
        roles:{ ...(d.roles||{}), [correo]: shareRol },
      }, { autor:user, autorUid:uid });

      if(up){
        setD(up); setMIn(""); setShareFound(cuenta);
        notify(`Compartido con ${cuenta.nombre||correo} ✓`);
      } else setShareErr("No se pudo guardar. Inténtalo de nuevo.");
    }catch(e){ console.error(e); setShareErr(errorBackend(e)); }
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
    let ruta = null;
    try{
      const thumb = await makeThumb(file);
      ({ ruta } = await subirArchivo({ uid, docId:d.id, file }));

      const r = enServidor()
        ? await llamar("registrarImagen", { opId:d.id, ruta, nombre:file.name, thumb })
        : await registrarImagenLocal({ file, ruta, thumb });

      setD(r.doc);
      notify("Imagen adjunta ✓");
    }catch(e){
      console.error(e);
      if(ruta) await descartarSubida(ruta);
      notify(errArchivo(e),"err");
    }
    finally{ setSaving(false); }
  };

  // ← NUEVO: quitar una imagen también se asienta en la cadena
  const removeImage = async(path)=>{
    try{
      const r = enServidor()
        ? await llamar("quitarImagen", { opId:d.id, path })
        : await quitarImagenLocal(path);
      setD(r.doc);
      notify("Imagen retirada");
    }catch(e){ console.error(e); notify(errArchivo(e),"err"); }
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
    const up = await guardarCampos(d, { requisitos });
    if(up) setD(up);
  };

  // ← NUEVO: retirar una solicitud que ya no aplica
  const cancelarSolicitud = async(sid)=>{
    const sol = (d.solicitudes||[]).find(x=>x.sid===sid);
    if(!sol) return;
    const ahora = new Date().toISOString();
    const up = await aplicar(d, {
      accion:"SOLICITUD",
      contenido:`Se canceló la petición de «${sol.reqTitulo}» a ${sol.paraNombre||sol.paraEmail}`,
      meta:{ tipo:"cancelada", sid, requisito:sol.reqId },
    }, {
      solicitudes:(d.solicitudes||[]).map(x=> x.sid!==sid ? x
        : {...x, estado:"cancelada", resueltaEn:ahora}),
    }, { autor:user, autorUid:uid });
    if(up){ setD(up); notify("Solicitud cancelada"); }
  };

  // ── PAQUETE DE EVIDENCIA ──
  // ← NUEVO: exporta el expediente como HTML autocontenido que un
  // tercero verifica sin cuenta, sin internet y sin confiar en nosotros.
  const exportarPaquete = ()=> conEspera("exportando", async()=>{
    try{
      // Las pruebas de anclaje se piden aquí y no al abrir el
      // documento: son la parte pesada y sólo el paquete las necesita.
      let pruebas = null;
      if(enServidor()){
        try{ pruebas = await anclajesDe(d.id, true); }
        catch(e){ console.warn("[chaindoc] el paquete va sin anclaje:", e?.message || e); }
      }
      const nombre = descargarPaquete(d, pruebas ? paraElPaquete(pruebas) : null);
      const up = await aplicar(d, {
        accion:"EXPORTACIÓN",
        contenido:`Se generó el paquete de evidencia «${nombre}»`,
        meta:{ tipo:"paquete", archivo:nombre, bloques:d.chain.length },
      }, {}, { autor:user, autorUid:uid, tocarFecha:false });
      if(up) setD(up);
      notify("Paquete de evidencia descargado ✓");
    }catch(e){ console.error(e); notify("No se pudo generar el paquete","err"); }
  });

  // ← NUEVO (Etapa 5): forzar el anclaje sin esperar a la madrugada.
  // Sirve para probarlo y para el día que alguien necesite el paquete
  // ya mismo.
  const anclarYa = async()=>{
    setAnclando(true);
    try{
      const r = await anclarAhora();
      setAnclaje(await anclajesDe(d.id, false));
      const n = r?.sellado?.anclados || 0;
      notify(n
        ? `${n} bloque${n===1?"":"s"} mandado${n===1?"":"s"} a Bitcoin ✓`
        : "No había bloques pendientes de anclar");
    }catch(e){ console.error(e); notify(errorBackend(e),"err"); }
    finally{ setAnclando(false); }
  };

  // ← NUEVO: aceptar el aviso y los terminos ya con sesion abierta.
  // Lo necesita quien se registro antes de que existieran, y quien ya
  // acepto una version anterior.
  const aceptarLegal = async()=>{
    const sello = selloDeAceptacion();
    const ok = await saveProfile(uid, { legal: sello });
    if(!ok){ notify("No se pudo guardar. Inténtalo de nuevo","err"); return; }
    setLegalPend(false);
    notify("Gracias ✓");
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

      // ← ACTUALIZADO: se AGREGA a la lista del requisito
      const nuevo = { aid:genId(), origen:"interno",
                      docId:d.id, numId:d.numId, nombre:d.title,
                      tipo:d.kind==="expediente"?"expediente":(d.tplId||"documento"),
                      hash:cabeza.hash, bloques:d.chain.length,
                      monto: montoDeDocumento(d),   // leído de su plantilla
                      subidoEn:new Date().toISOString(), subidoPor:user };
      const requisitos = exp.requisitos.map(r=> r.id!==reqId ? r : {
        ...quitarArchivoViejo(r), estado:"cumplido",
        archivos:[...archivosDe(r), nuevo],
      });

      // ← NUEVO: cierra las solicitudes que este documento atiende
      const { solicitudes } = cerrarSolicitudes(exp, reqId, user);

      const up = await aplicar(exp, {
        accion:"EVIDENCIA",
        contenido:`${req?.titulo||reqId}: documento «${d.title}» (${d.numId})`,
        meta:{ tipo:"vinculo", requisito:reqId, docId:d.id, numId:d.numId, hash:cabeza?.hash || null },
      }, { requisitos, solicitudes }, { autor:user, autorUid:uid });
      if(!up){ setLinkErr("No se pudo adjuntar. Inténtalo de nuevo."); return; }

      // El documento fuente también asienta que quedó vinculado.
      const src = await aplicar(d, {
        accion:"VINCULADO",
        contenido:`Adjuntado al expediente «${exp.title}» como ${req?.titulo||reqId}`,
        meta:{ expId:exp.id, requisito:reqId },
      }, {}, { autor:user, autorUid:uid });
      if(src) setD(src);

      setModal(null); setLinkExp(null);
      refresh();   // ← NUEVO: así el aviso de duplicado aparece de inmediato
      notify(`Adjuntado a «${exp.title}» ✓`);
    }catch(e){ console.error(e); setLinkErr("Error al adjuntar."); }
    finally{ setLinkBusy(false); }
  };

  // ← NUEVO: retirar el acceso también queda asentado en la cadena
  const revokeShare = async(correo)=>{
    try{
      if(enServidor()){
        const r = await quitarAccesoServidor(d.id, correo);
        setD(r.doc); notify(`Acceso retirado a ${correo}`);
        return;
      }
      const roles = { ...(d.roles||{}) };
      delete roles[correo];
      const up = await aplicar(d, {
        accion:"COMPARTIDO",
        contenido:`Acceso retirado a ${correo}`,
        meta:{ tipo:"revocado", correo },
      }, { sharedWith:(d.sharedWith||[]).filter(x=>x!==correo), roles },
         { autor:user, autorUid:uid });
      if(up){ setD(up); notify(`Acceso retirado a ${correo}`); }
    }catch(e){ console.error(e); notify(errorBackend(e),"err"); }
  };

  // ← ACTUALIZADO (Etapa 3): la contraseña ya no se guarda dentro del
  // documento en texto plano. El servidor la almacena sellada, aparte.
  const setLock = async(pw)=>{
    try{
      const r = await llamar("protegerDocumento", { opId:d.id, password: pw || "" });
      setD(r.doc); setModal(null); setPass("");
      setUnlocked(true);
      notify(pw?"Documento protegido 🔒":"Protección removida");
    }catch(e){ console.error(e); notify(errorBackend(e),"err"); }
  };

  /** Abre un documento protegido: la contraseña la comprueba el servidor. */
  const abrirProtegido = async()=>{
    try{
      await llamar("abrirDocumento", { opId:d.id, password: lockInput });
      setUnlocked(true); setLockInput("");
    }catch(e){ console.error(e); notify(errorBackend(e),"err"); }
  };

  const delDoc = (id)=> conEspera("eliminando", async()=>{
    const ok = await store.del(id);
    if(ok){ await refresh(); notify("Documento eliminado"); } else notify("Error","err");
    setModal(null);
  });

  const moveTo = (id,f)=> conEspera("moviendo", async()=>{
    const dd = await store.get(id); if(!dd) return;
    await guardarCampos(dd, { folder: f });
    await refresh(); setModal(null); notify(`Movido a "${f||"Sin carpeta"}"`);
  });

  // ← NUEVO: asienta que alguien abrió un documento compartido.
  // Una vez por persona y día: ver `debeRegistrarConsulta`.
  const registrarConsulta = async(doc)=>{
    try{
      // ← ACTUALIZADO: con el servidor activo, es él quien decide si toca
      // registrar la consulta; así nadie puede saltarse la bitácora.
      if(enServidor()){
        const up = await consultaServidor(doc);
        if(up){ setD(up); return up; }
        return doc;
      }
      if(!debeRegistrarConsulta(doc, uid, acctEmail)) return doc;
      const up = await aplicar(doc, {
        accion:"CONSULTA",
        contenido:`${user} consultó el documento`,
        meta:{ uid, email:acctEmail || null },
      }, {}, { autor:user, autorUid:uid, tocarFecha:false });
      if(up){ setD(up); return up; }
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
    setUnlocked(!estaProtegido(dd)); setEdit(false); setDirty(false);
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
    setHallazgos69B(null);
    setScreen("loading"); await refresh(); setScreen("home");
  };

  const doVerify = async()=>{
    const r = await verifyChain(d.chain);
    setVerify(r); setTimeout(()=>setVerify(null),7000);
  };

  // ← NUEVO (Etapa 4): volver a preguntarle al SAT por un comprobante.
  // Una factura vigente hoy puede estar cancelada mañana, y quien firma
  // un expediente necesita poder preguntarlo otra vez sin subir nada.
  // La respuesta queda asentada como validación, con su fecha.
  const verificarFiscal = async(aid)=>{
    if(!enServidor()){ notify("Esto necesita el servidor activo","err"); return; }
    setVerificandoFiscal(aid);
    try{
      const r = await llamar("verificarCFDI", { opId:d.id, aid });
      setD(r.doc);
      const t = { verde:"ok", ambar:"err", rojo:"err" }[r.fiscal?.semaforo] || "ok";
      notify(r.fiscal?.textoSAT || "Consulta hecha", t);
    }catch(e){ console.error(e); notify(errorBackend(e),"err"); }
    finally{ setVerificandoFiscal(null); }
  };

  // ← NUEVO (Etapa 4): cruza los RFC del expediente contra la lista
  // 69-B del SAT, la de quienes emiten facturas de operaciones
  // inexistentes. Una factura puede estar vigente y aun así no servir
  // para deducir, si quien la emitió está fichado.
  const revisarProveedores = async()=>{
    if(!enServidor()){ notify("Esto necesita el servidor activo","err"); return; }
    setRevisando69B(true);
    try{
      const r = await llamar("revisar69B", { opId:d.id });
      if(!r.listo){ notify(r.texto || "La lista del SAT aún no está disponible","err"); return; }
      setHallazgos69B({ lista:r.hallazgos, actualizadoEn:r.actualizadoEn });
      notify(r.hallazgos.length
        ? `${r.hallazgos.length} RFC en la lista 69-B`
        : "Ningún proveedor está en la lista 69-B ✓",
        r.hallazgos.length ? "err" : "ok");
    }catch(e){ console.error(e); notify(errorBackend(e),"err"); }
    finally{ setRevisando69B(false); }
  };

  // ── ENTREGA POR ENLACE ──
  // ← NUEVO (Etapa 4 · Bloque B). Del lado de quien recibe el enlace.
  const entregar = async(reqId, archivo)=>{
    if(!archivo) return;
    if(archivo.size > LIMITE_MB*1024*1024){
      notify(`El archivo pesa más de ${LIMITE_MB} MB`,"err"); return;
    }
    setInvBusy(true); setInvSubiendo(reqId);
    try{
      const r = await entregarArchivo(testigo, reqId, archivo, setInvPaso);
      setEntregas(prev=>({ ...prev, [reqId]: r }));
      notify("Entregado ✓");
    }catch(e){ console.error(e); notify(errorBackend(e),"err"); }
    finally{ setInvBusy(false); setInvSubiendo(null); setInvPaso(""); }
  };

  // ← NUEVO (10 oct): el mismo tercer camino, para quien entra por
  // invitación y no tiene cuenta. Usa el mismo formulario y las mismas
  // reglas; lo único distinto es a qué función del servidor llama.
  const entregarEnlaceReq = async()=>{
    if(enlBusy || !enlReq) return;
    const revisado = normalizarEnlace(enlUrl);
    if(!revisado.ok){ setEnlErr(revisado.error); return; }

    const reqId = enlReq;
    setEnlErr(""); setEnlBusy(true); setInvBusy(true);
    try{
      const r = await entregarEnlaceInvitado(
        testigo, reqId, revisado.url, nombreDeEnlace(enlNom, revisado.host));
      setEntregas(prev=>({ ...prev, [reqId]: r }));
      cerrarEnlace();
      notify("Entregado ✓");
    }catch(e){
      console.error(e);
      setEnlErr(errorBackend(e) || "No se pudo entregar el enlace.");
    }
    finally{ setEnlBusy(false); setInvBusy(false); }
  };

  // Del lado de quien lo crea.
  //
  // ← ACTUALIZADO (rediseño): un enlace cubre VARIOS requisitos, no
  // uno. Antes, un proveedor que debía tres facturas recibía tres
  // enlaces; ahora recibe uno con su lista. Lee el alcance del estado
  // del panel: o «todo lo que falta» —que resuelve el servidor, para
  // que incluya lo que se haya agregado entre que se creó el enlace y
  // que lo abren— o los requisitos marcados a mano.
  const crearEnlace = async()=>{
    if(!enServidor()){ notify("Esto necesita el servidor activo","err"); return; }
    const pendientes = (d.requisitos||[]).filter(r=>r.estado!=="cumplido");
    if(shareTodo && pendientes.length === 0){
      notify("No falta ningún comprobante por entregar","err"); return;
    }
    if(!shareTodo && shareReqs.length === 0){
      notify("Elige al menos un comprobante","err"); return;
    }
    setSaving(true);
    try{
      const r = await llamar("crearInvitacion", {
        opId: d.id,
        todoLoQueFalta: !!shareTodo,
        reqIds: shareTodo ? [] : shareReqs,
        correo: (mIn||"").trim() || null,
        dias: invDias || 7,
      });
      setD(r.doc);
      setEnlaceNuevo({
        url: enlaceDeEntrega(r.testigo),
        requisitos: r.requisitos || [],
        expiraEn: r.expiraEn,
      });
      setEnlaces(null);
      notify("Enlace creado ✓");
    }catch(e){ console.error(e); notify(errorBackend(e),"err"); }
    finally{ setSaving(false); }
  };

  // ← NUEVO (rediseño): el hermano con cuenta del enlace anónimo.
  // Mismo alcance —una lista de requisitos, no uno— pero la persona
  // entra identificada: queda como aportador, sólo de esos
  // requisitos, y cada entrega se asienta a su nombre. Es lo que
  // conviene cuando el proveedor es recurrente; el enlace sin cuenta
  // es para el que entrega una vez y desaparece.
  const pedirConCuenta = async()=>{
    const correo = mIn.trim().toLowerCase();
    setShareErr(""); setShareFound(null);

    if(!correo){ setShareErr("Escribe el correo de la persona."); return; }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)){
      setShareErr("Ese correo no tiene un formato válido."); return; }
    if(correo===acctEmail.toLowerCase()){
      setShareErr("Ese es tu propio correo."); return; }

    const objetivo = shareTodo
      ? (d.requisitos||[]).filter(r=>r.estado!=="cumplido")
      : (d.requisitos||[]).filter(r=>shareReqs.includes(r.id));
    if(!objetivo.length){
      setShareErr(shareTodo
        ? "No falta ningún comprobante por entregar."
        : "Elige al menos un comprobante."); return;
    }

    setShareBusy(true);
    try{
      const cuenta = await findUserByEmail(correo);
      if(!cuenta){
        setShareErr(`No se encontró ninguna cuenta con «${correo}». Si no tiene cuenta, usa «Copiar enlace sin cuenta».`);
        return;
      }
      if(!enServidor()){
        setShareErr("Esto necesita el servidor activo."); return;
      }

      // Uno por uno, a propósito: cada requisito es una solicitud
      // distinta y así se puede cancelar una sin tocar las demás. Si
      // alguna ya estaba pedida, no es un error que deba detener al
      // resto.
      let ultimo = null, nuevas = 0, repetidas = 0;
      for(const r of objetivo){
        try{
          ultimo = await pedirComprobante(d.id, r.id, correo, solMsg, cuenta);
          nuevas++;
        }catch(e){
          if(e?.code === "functions/already-exists"){ repetidas++; continue; }
          throw e;
        }
      }
      if(ultimo) setD(ultimo.doc);
      setMIn(""); setShareFound(cuenta);
      notify(nuevas
        ? `Se le pidió ${nuevas===1?"1 comprobante":`${nuevas} comprobantes`} a ${cuenta.nombre||correo}`
          + (repetidas ? ` (${repetidas} ya estaban pedidos) ✓` : " ✓")
        : "Ya le habías pedido todo eso a esa persona");
    }catch(e){ console.error(e); setShareErr(errorBackend(e)); }
    finally{ setShareBusy(false); }
  };

  const verEnlaces = async()=>{
    if(!enServidor()) return;
    try{
      const r = await llamar("invitacionesDe", { opId:d.id });
      setEnlaces(r.enlaces || []);
    }catch(e){ console.error(e); notify(errorBackend(e),"err"); }
  };

  const revocarEnlace = async(huella)=>{
    try{
      const r = await llamar("revocarInvitacion", { opId:d.id, huella });
      setD(r.doc); setEnlaces(null); verEnlaces();
      notify("Enlace retirado");
    }catch(e){ console.error(e); notify(errorBackend(e),"err"); }
  };

  const copiarEnlace = (url)=>{
    navigator.clipboard.writeText(url);
    notify("Enlace copiado ✓");
  };

  const copyLink = (id)=>{
    navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?doc=${id||d.id}`);
    notify("Enlace copiado ✓");
  };

  // Todo lo que las pantallas y modales necesitan del estado y los manejadores.
  const ctx = {
    MAX_IMGS, moveTo, migrarDatos, migrando, migrarArchivosDatos, migrandoArch, acctEmail, addImage, attachEvidence, authBusy, authMode, authStep,
    bioBusy, bioCreds, bioOk, cancelarSolicitud, closeCreate, confirmarConversion,
    content, convOculto, copyLink, creando, createDoc, createExpediente, createStep, d, delDoc, doLogin,
    abrirEnlace, cerrarEnlace, guardarEnlace, entregarEnlaceReq,
    enlReq, enlUrl, enlNom, enlErr, enlBusy, setEnlUrl, setEnlNom,
    doLogout, doReset, doShare, doSignCode, doSignup, doVerify, docs, dragOver, drop,
    dropFase, dropReq, editMode, email, enrollBio, exportarPaquete, exps, faseSel,
    fields, filesOpen, filterF, finishAuth, focoDup, folders, getFile, goHome,
    handleFile, histOpen, histTab, imp, impErr, impMeta, impText, iniciarConversion,
    irADuplicado, linkBusy, linkErr, linkExp, linkSitios, linkToExpediente, lockInput,
    mIn, mIn2, menuOpen, method, modal, notif, notify, ocultarConvertir, ocupado, onDrop, openCreate, openDoc,
    openExpedientes, openSec, pass, puedeConvertir, removeEvidence,
    removeImage, resetImport, revokeShare, runAnalysis, save, saveSettings, saving,
    setContent, setCreateStep, setD, setDirty, setDragOver, setDrop, setEdit, setEmail,
    setFaseSel, setFields, setFilesOpen, setFilterF, setFocoDup, setFolders, setHist,
    setHistTab, setLinkErr, setLinkExp, setLock, setLockInput, setMIn, setMIn2, setMenu,
    setMethod, setModal, setMontoReq, setOpenSec, setPass, setShareErr, setShareFound,
    setShowHashes, setSmartErr, setSmartRes, setSmartText, setSolMsg,
    setTitle, setTpl, setUnlocked, setView, shareBusy, shareErr, shareFound,
    showHashes, signWithBio, smartBusy, smartErr, smartMsg, smartRes, smartText,
    solMsg, switchAuth, tieneCodigo, title, tpl, trySign, uid,
    legalOk, setLegalOk, legalTab, setLegalTab, legalPend, aceptarLegal,
    LEGAL_VERSION,
    anclaje, anclando, anclarYa, anclajesPorHash: porHash(anclaje),
    resumenDeAnclaje: resumenAnclaje(anclaje),
    abrirProtegido, unlockDocBio,
    unlockFiles, unlockFilesBio, unlocked, user, verifVin, verificarVinculos, verifyRes,
    view, vinculos,

    // ← NUEVO (Etapa 3): roles y confirmación del correo.
    // `miRol` y `puedo` son lo que usa la interfaz para no ofrecer
    // botones que el servidor va a rechazar; la decisión real la toma él.
    shareRol, setShareRol, ROLES_ASIGNABLES, ROL_TEXTO, ROL_AYUDA,
    shareModo, setShareModo, shareTodo, setShareTodo, shareReqs, setShareReqs,
    pedirConCuenta,
    accesos: listaDeAccesos(d),
    miRol: rolDe(d, uid, acctEmail),
    puedo: (accion)=>puede(rolDe(d, uid, acctEmail), accion),
    puedoSubirA: (reqId)=>puedeSubirA(d, rolDe(d, uid, acctEmail), acctEmail, reqId),
    verificado, verifBusy, reenviarVerificacion, comprobarVerificacion,
    verificarFiscal, verificandoFiscal,
    revisarProveedores, revisando69B, hallazgos69B,
    invitacion, invError, invBusy, invPaso, invSubiendo, entregas, entregar,
    crearEnlace, verEnlaces, revocarEnlace, copiarEnlace, enlaces,
    enlaceNuevo, setEnlaceNuevo, invDias, setInvDias, avisos,
  };

  // ── RENDER: ENTREGA POR ENLACE ──
  // Va primero a propósito: quien llega con un enlace no tiene cuenta,
  // y no tiene por qué toparse con la pantalla de acceso.
  if(testigo) return renderEntrega(ctx);

  // ── RENDER: LOADING ──
  if(screen==="loading") return (<><style>{ESTILOS}</style>
    <div className="loading"><div className="spin"/><p>Conectando con la cadena…</p></div></>);

  // ── RENDER: AUTH ──
  if(screen==="auth") return renderAcceso(ctx);

  // ── RENDER: HOME ──
  if(screen==="home") return renderInicio(ctx);

  // ── RENDER: DOC ──
  return renderDocumento(ctx);
}
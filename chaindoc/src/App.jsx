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
  confirmarCorreo, correoDelReinicio, ponerContrasena, deshacerCambioDeCorreo,
  refrescarVerificacion,
} from "./auth";
import { bioAvailable, bioRegister, bioAssert, bioError, b64uToBytes } from "./biometric";
import { MIN_CONTRATO,
  analyzeContract,
  draftContract,
  montoDeDocumento,
  archivosDe,
  aidDe,
  estadoVinculo,
  dondeEstaAdjunto,
  destinoDuplicado,
  debeRegistrarConsulta,
  cerrarSolicitudes,
  hashFile,
  expedienteStatus,
} from "./smartContract";
import { subirArchivo, descartarSubida, abrirArchivo, traerArchivo, storageError, makeThumb, LIMITE_MB } from "./storage";
// ← NUEVO (Etapa 5 · Bloque A): sellado de tiempo en Bitcoin.
import { anclajesDe, anclarAhora, paraElPaquete, porHash, resumenAnclaje } from "./nucleo/anclaje";
// ← NUEVO: aviso de privacidad y términos.
import { aceptoVigente, selloDeAceptacion, VERSION as LEGAL_VERSION } from "./nucleo/legal";
import { descargarPaquete, recogerAdjuntos } from "./paquete";
import { FORMS, serializeForm, etiquetaDe } from "./ui/formularios";
import { TEMPLATES, esBorradorContrato } from "./nucleo/catalogos";
import { ORDEN_POR_DEFECTO } from "./nucleo/orden";
import { leerActivos } from "./ui/estiloActivo";
import { leerAccion, porQueFallo } from "./nucleo/accionCorreo";
import { renderAccion } from "./pantallas/Accion";
import { getUrlDoc, setUrlDoc } from "./nucleo/formato";
import { folioConPrefijo, genId, sha256, siguienteFolio, tipoDeFolio, verifyChain } from "./nucleo/cadena";
import { normalizarEnlace, nombreDeEnlace, textoFirmado } from "./nucleo/enlaces";
import { extraerCampos, marcarCorrecciones } from "./nucleo/extraccion";
import { esComprobante } from "./nucleo/comprobantes";
import { estadoDe } from "./nucleo/entregas";
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
import {
  claveCarpetas, leerCarpetas, tieneCarpetasPropias, carpetasEnUso,
  conCarpeta, revisarCarpeta,
} from "./nucleo/carpetas";
import { bloquea, decideAhora, esperaFirmaDe, estadoAcuerdo, firmaDe, parteDe } from "./nucleo/acuerdo";
import { limpiarSecciones, seccionesDe } from "./nucleo/secciones";
import { aTextoPlano, normalizar, estaVacio, ID_PAPEL } from "./nucleo/texto";
import { notificacionesDe } from "./nucleo/notificaciones";
import { descartar, fundir, guardarLocales, leerLocales, recuperar } from "./nucleo/descartes";
import { llamar, errorBackend } from "./nucleo/backend";
import { leerAvisos } from "./nucleo/avisos";
import {
  testigoDeUrl, verInvitacion, aceptarPorInvitacion, rechazarPorInvitacion,
  firmarPorInvitacion, abrirPorInvitacion,
  entregarArchivo, entregarEnlace as entregarEnlaceInvitado,
  enlaceDeEntrega,
} from "./nucleo/invitaciones";
import {
  ROLES_ASIGNABLES, ROL_TEXTO, ROL_AYUDA, rolDe, puede, puedeSubirA,
  listaDeAccesos, compartir as compartirServidor, quitarAcceso as quitarAccesoServidor,
  dejarDeVer as dejarDeVerServidor,
  pedirComprobante,
} from "./nucleo/accesos";
import { renderAcceso } from "./pantallas/Acceso";
import { renderEntrega } from "./pantallas/Entrega";
import { renderDocumento } from "./pantallas/Documento";
import { renderRevision } from "./pantallas/Revision";
import { renderInicio } from "./pantallas/Inicio";
import { ESTILOS } from "./ui/estilos";
// ← ACTUALIZADO (5 nov): la llave del almacén local lleva el nombre
// nuevo, pero al leer se mira también la vieja: cambiarla a secas
// habría borrado en silencio lo que cada quien tenía oculto.
const LLAVE_OCULTO = "octavin.convOculto";

export default function Octavin(){
  const [screen,setScreen]   = useState("loading");
  const [authStep,setAuthStep] = useState(0);
  const [authMode,setAuthMode] = useState("signup");   // ← NUEVO: "signup" | "login"
  const [authBusy,setAuthBusy] = useState(false);      // ← NUEVO: bloquea el botón mientras responde Firebase
  const [docs,setDocs]       = useState([]);
  // Una cuenta nueva empieza SIN carpetas: la tarjeta punteada
  // "Nueva carpeta" es la que invita a crear la primera. Tres carpetas
  // puestas de oficio suponen de que trata el trabajo de quien entra.
  //
  // ← ACTUALIZADO (16 oct): las carpetas se guardaban en una sola clave
  // del navegador, "cd_folders", igual para todas las cuentas. El
  // resultado era que una cuenta recién creada abría con las carpetas
  // de quien hubiera entrado antes en ese mismo navegador — por eso
  // seguían saliendo Contratos, Facturas y Recibos aunque el valor de
  // arranque ya fuera una lista vacía. Ahora cada cuenta tiene la suya.
  const [folders,setFolders] = useState([]);
  // ← NUEVO (25 oct): la carpeta nueva se crea sin salir de donde
  // estés. `null` es que el campo ni siquiera está abierto; "" es
  // abierto y vacío.
  const [carpNueva,setCarpNueva] = useState(null);
  const [carpErr,setCarpErr]     = useState("");
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
  // ← NUEVO (11 nov): «Ayúdame a redactar».
  const [redBusy,setRedBusy]       = useState(false);
  const [redRes,setRedRes]         = useState(null);
  const [smartErr,setSmartErr]     = useState("");
  const [smartMsg,setSmartMsg]     = useState("");    // ← NUEVO: estado de reintentos de la IA
  const [filesOpen,setFilesOpen]   = useState(false); // ← NUEVO: adjuntos desbloqueados
  const [vinculos,setVinculos]     = useState({});    // ← NUEVO: aid → estado del vínculo
  const [focoDup,setFocoDup]       = useState(null);  // ← NUEVO: duplicado al que se llegó desde un aviso
  const [faseSel,setFaseSel]       = useState(null);  // ← NUEVO: fase elegida para filtrar requisitos
  const [subiendoReq,setSubiendoReq] = useState(null); // ← NUEVO: en qué requisito se está subiendo un archivo
  // ← NUEVO (4 nov): si el que crea quiso cambiar la carpeta que se
  // daba por hecha. Vive aquí y no en el modal porque las pantallas
  // son funciones, no componentes.
  const [carpAbierta,setCarpAbierta] = useState(false);

  // ← NUEVO (10 nov): los enlaces que Firebase manda por correo.
  //
  // Se lee la dirección UNA vez, al cargar, y antes que nada: quien
  // llega por un enlace de contraseña no tiene sesión, así que esta
  // pantalla no puede depender de ella. El código se consume al
  // comprobarlo, así que el efecto corre una sola vez.
  const [accion]  = useState(() => leerAccion(window.location.href));
  const [accEstado,setAccEstado] = useState("comprobando");
  const [accCorreo,setAccCorreo] = useState(null);
  const [accError,setAccError]   = useState("");
  const [accBusy,setAccBusy]     = useState(false);
  const [accPass,setAccPass]     = useState("");
  const [accPass2,setAccPass2]   = useState("");
  // ← NUEVO (4 nov): cómo se ordena y qué se busca en una lista de
  // documentos. Vive aquí porque las pantallas son funciones.
  const [orden,setOrden]     = useState(ORDEN_POR_DEFECTO);
  const [busca,setBusca]     = useState("");
  const [verifVin,setVerifVin]     = useState(false); // ← NUEVO: verificación en curso
  const [verificandoFiscal,setVerificandoFiscal] = useState(null); // ← NUEVO (Etapa 4)
  const [revisando69B,setRevisando69B]           = useState(false);
  // ← NUEVO (Etapa 4 · Bloque B): entrega por enlace, sin cuenta.
  const [testigo]                    = useState(()=>testigoDeUrl());
  const [invitacion,setInvitacion]   = useState(undefined);
  const [invError,setInvError]       = useState("");
  const [invBusy,setInvBusy]         = useState(false);
  const [invPaso,setInvPaso]         = useState("");
  // ← NUEVO (12 nov): aceptar el contrato desde el enlace, sin cuenta.
  const [invNombre,setInvNombre]     = useState("");
  const [invAceptando,setInvAceptando] = useState(false);
  const [invAceptError,setInvAceptError] = useState("");
  const [invRechazando,setInvRechazando] = useState(false);
  const [invMotivo,setInvMotivo]     = useState("");
  // ← NUEVO (15 nov): el candado del enlace. Aparte de `invAceptando`
  // a propósito: son dos pasos distintos de la misma pantalla y el
  // error de uno no tiene por qué salir debajo del otro.
  const [invClave,setInvClave]       = useState("");
  const [invClaveBusy,setInvClaveBusy] = useState(false);
  const [invClaveErr,setInvClaveErr] = useState("");
  // ← NUEVO (17 nov): pedir un comprobante que no estaba en el contrato.
  const [reqTitulo,setReqTitulo]     = useState("");
  const [reqDesc,setReqDesc]         = useState("");
  const [reqVisto,setReqVisto]       = useState(false);  // ← NUEVO: «necesita mi visto bueno»
  const [reqBusy,setReqBusy]         = useState(false);
  const [reqErr,setReqErr]           = useState("");
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

  // ← NUEVO (18 oct): la doble firma del contrato.
  const [firmaBusy,setFirmaBusy]     = useState(false);
  const [enFirmeCorreo,setEnFirmeCorreo] = useState("");
  const [enFirmeNombre,setEnFirmeNombre] = useState("");
  const [enFirmeErr,setEnFirmeErr]       = useState("");
  const [rechMotivo,setRechMotivo]   = useState("");
  const [rechDetalle,setRechDetalle] = useState("");
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
  // ← NUEVO (21 oct): qué bloques se enseñan debajo del papel. Se edita
  // como el título o el contenido —cambia, queda sucio, y se guarda con
  // «Guardar»— para que apagar una sección sea un bloque de la cadena y
  // no un cambio invisible.
  const [secciones,setSecciones] = useState({ evidencia:true, firmas:true });
  // ← NUEVO (21 oct): qué pestaña del documento está abierta. Igual que
  // `expTab` en los expedientes, y se vuelve a la primera al abrir otro.
  const [docTab,setDocTab] = useState("documento");
  // ← NUEVO (24 oct): el papel con formato es un contentEditable, y
  // React no puede re-pintarlo mientras escribes sin tirar el cursor.
  // Así que el DOM manda ahí dentro y lo leemos al guardar.
  //
  // Se busca por id y no con un ref a propósito: un ref tendría que
  // viajar dentro de `ctx` hasta la pantalla, y leerlo desde ahí es
  // justo lo que prohíbe la regla `react-hooks/refs`. El papel es uno
  // solo en pantalla, así que buscarlo por su id es más simple y dice
  // lo mismo.
  const elEditor = ()=> document.getElementById(ID_PAPEL);

  // Lo que hay escrito ahora mismo, normalizado. Mientras editas el
  // DOM va por delante del estado, así que se lee de ahí; si el editor
  // no está en pantalla, vale lo último que se guardó.
  const cuerpoDelEditor = ()=> normalizar(elEditor()?.innerHTML ?? content);

  const aplicarEstilo = (cmd, valor=null)=>{
    const caja = elEditor();
    if(!caja) return;
    caja.focus();
    try{
      // `formatBlock` quiere la etiqueta entre ángulos en casi todos
      // los navegadores; los demás comandos no llevan valor.
      document.execCommand(cmd, false, cmd==="formatBlock" ? `<${valor}>` : valor);
    }catch(e){ console.error("[octavin] no se pudo aplicar el estilo", cmd, e); }
    setDirty(true);
    setEstiloAct(leerActivos(document));
  };

  // ← NUEVO (10 nov): comprobar el enlace del correo al llegar.
  useEffect(()=>{
    if(!accion) return;
    let vivo = true;
    (async()=>{
      try{
        if(accion.caso === "confirmar"){
          const c = await confirmarCorreo(accion.codigo);
          if(!vivo) return;
          setAccCorreo(c); setAccEstado("hecho");
        }else if(accion.caso === "recuperar"){
          const c = await deshacerCambioDeCorreo(accion.codigo);
          if(!vivo) return;
          setAccCorreo(c); setAccEstado("hecho");
        }else{
          // La contraseña no se cambia todavía: primero se comprueba
          // que el código sirva, para no enseñar un formulario que al
          // enviarlo va a fallar de todas formas.
          const c = await correoDelReinicio(accion.codigo);
          if(!vivo) return;
          setAccCorreo(c); setAccEstado("formulario");
        }
      }catch(e){
        if(!vivo) return;
        setAccEstado(porQueFallo(e?.code));
      }
    })();
    return ()=>{ vivo = false; };
  }, [accion]);

  // `assign` y no asignar a `location.href`: hace lo mismo, y no es
  // una asignación a algo de fuera, que es lo que el linter vigila.
  const irALaApp = ()=> window.location.assign(accion?.continuar || "/");

  const pedirOtroEnlace = async()=>{
    setAccBusy(true); setAccError("");
    try{
      // Sólo se puede volver a mandar el de contraseña: para el de
      // confirmación hace falta la sesión, y aquí no la hay. Por eso
      // ese caso manda a entrar, donde el aviso de arriba tiene su
      // propio «Reenviar enlace».
      if(accCorreo && accion?.caso === "contrasena"){
        await resetPassword(accCorreo);
        setAccEstado("hecho-enviado");
        notify("Te mandamos otro enlace ✓");
      }else{
        irALaApp();
      }
    }catch(e){ console.error(e); setAccError("No se pudo enviar. Inténtalo otra vez."); }
    finally{ setAccBusy(false); }
  };

  const guardarContrasena = async()=>{
    setAccError("");
    if(accPass.length < 6){ setAccError("Usa al menos 6 caracteres."); return; }
    if(accPass !== accPass2){ setAccError("Las dos no coinciden."); return; }
    setAccBusy(true);
    try{
      await ponerContrasena(accion.codigo, accPass);
      setAccPass(""); setAccPass2(""); setAccEstado("hecho");
    }catch(e){
      const q = porQueFallo(e?.code);
      if(q === "floja") setAccError("Esa contraseña es muy fácil de adivinar. Prueba con una más larga.");
      else setAccEstado(q);
    }finally{ setAccBusy(false); }
  };

  // ← NUEVO (6 nov): qué estilo tiene el texto donde está el cursor,
  // para que la barra lo ilumine.
  //
  // Se escucha `selectionchange` en el documento y no eventos del
  // editor: el cursor también se mueve con el teclado, con deshacer y
  // al arrastrar, y colgarse de click y keyup deja la barra mintiendo
  // la mitad del tiempo. Se desengancha al salir de edición, que es
  // cuando la barra deja de existir.
  const [estiloAct,setEstiloAct] = useState({ bloque:"p" });
  useEffect(()=>{
    if(!editMode) return;
    let pedido = 0;
    const mirar = ()=>{
      // Una vez por cuadro: `selectionchange` se dispara por cada
      // tecla, y leer el estado del navegador no es gratis.
      if(pedido) return;
      pedido = requestAnimationFrame(()=>{ pedido = 0; setEstiloAct(leerActivos(document)); });
    };
    document.addEventListener("selectionchange", mirar);
    mirar();
    return ()=>{
      document.removeEventListener("selectionchange", mirar);
      if(pedido) cancelAnimationFrame(pedido);
    };
  }, [editMode]);
  // ← NUEVO (22 oct): el panel de notificaciones. No guarda nada: lo
  // que enseña se deriva de los documentos ya cargados.
  const [campanaOpen,setCampana] = useState(false);
  // ← NUEVO (23 oct): lo único de la campana que NO se puede deducir
  // —«ya lo vi aquí y no pienso abrirlo»— vive en el navegador.
  const [descartes,setDescartes] = useState({});
  const [ultimaQuitada,setUltimaQuitada] = useState(null);
  const [filterF,setFilterF] = useState(null);
  const [openSec,setOpenSec] = useState({carp:true,docs:true,comp:true});
  const [imp,setImp]         = useState(null);   // {stage,message,percent}
  const [impText,setImpText] = useState("");
  const [impMeta,setImpMeta] = useState(null);   // {name,pages,confidence,kind}
  // ← NUEVO (16 nov): EL ARCHIVO, no su nombre.
  //
  // `impMeta.name` es lo unico que se guardaba del original, y con eso
  // se daba por respaldado un comprobante: ver `faltaRespaldo` en
  // `nucleo/comprobantes.js`, que aceptaba esa cadena de texto como
  // prueba. El archivo se leia, se extraia el texto y se tiraba.
  const [impFile,setImpFile] = useState(null);
  const [impErr,setImpErr]   = useState("");
  const [dragOver,setDragOver] = useState(false);
  const [unlocked,setUnlocked] = useState(false);
  const [lockInput,setLockInput] = useState("");

  // Un error puede venir del almacén o del servidor; cada uno habla distinto.
  const errArchivo = (e) =>
    String(e?.code||"").startsWith("functions/") ? errorBackend(e) : storageError(e);

  const notify = (m,t="ok")=>{ setNotif({m,t}); setTimeout(()=>setNotif(null),3200); };

  useEffect(()=>{ const h=()=>setDrop(null); document.addEventListener("click",h); return ()=>document.removeEventListener("click",h); },[]);
  // ← ACTUALIZADO (16 oct): una lista de carpetas por cuenta.
  //
  // Se carga al abrir sesión y se sana al llegar los documentos: si la
  // cuenta todavía no tiene lista propia, adopta las carpetas que de
  // verdad estén en uso y ninguna más. Así una cuenta nueva abre
  // vacía, y una que ya guardaba cosas en «Contratos» no pierde ese
  // cajón; las carpetas vacías que venían de oficio no vuelven.
  //
  // Quién está por sanar no se lleva en un ref: lo dice la propia
  // clave del navegador, que es la que manda. Un ref aquí acabaría
  // leído durante el render, dentro de refresh.
  useEffect(()=>{
    if(!uid) return;
    // Una cuenta sin lista propia y sin carpetas todavía está por
    // sanar: escribirle "[]" ahora crearía la clave y la sanación ya
    // no ocurriría nunca.
    if(folders.length === 0 && !tieneCarpetasPropias(uid)) return;
    localStorage.setItem(claveCarpetas(uid), JSON.stringify(folders));
  },[folders, uid]);

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
    // ← NUEVO (16 oct): la sanación de las carpetas, una sola vez por
    // cuenta. Si nunca guardó lista propia, adopta las carpetas en las
    // que de verdad tiene documentos — ni una más. Una cuenta nueva no
    // tiene documentos, así que abre vacía, que es lo que se busca.
    // Al escribir la clave, la cuenta deja de estar por sanar: esto no
    // vuelve a entrar aunque refresh se llame cien veces.
    if(id && !tieneCarpetasPropias(id)){
      const enUso = carpetasEnUso(l);
      localStorage.setItem(claveCarpetas(id), JSON.stringify(enUso));
      setFolders(enUso);
    }
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

  /**
   * ← NUEVO (12 nov): aceptar el contrato desde el enlace.
   *
   * Quien llega por un enlace no tiene cuenta ni clave de firma, así
   * que acepta escribiendo su nombre completo. Eso no comprueba
   * quién es —nada que se teclee lo hace— y por eso el servidor lo
   * asienta diciendo exactamente eso: que aceptó quien declara
   * llamarse así, desde el enlace enviado a tal correo.
   *
   * Después se vuelve a pedir la invitación en vez de apañar el
   * estado aquí: así lo que se ve sale del servidor, que es quien
   * sabe en qué estado quedó el acuerdo.
   */
  /**
   * ← NUEVO (15 nov): firmar un documento de texto desde el enlace.
   *
   * Hermana de `aceptarInvitacion` y deliberadamente NO la misma: lo
   * que escribe en la cadena es distinto —un bloque de FIRMA, no el
   * estado de un acuerdo— y mezclarlas haría que una de las dos
   * tuviera que preguntar qué clase de documento es antes de hacer su
   * trabajo. El servidor ya lo sabe por el propósito del enlace.
   */
  const firmarInvitacion = async()=>{
    const nombre = invNombre.trim().replace(/\s+/g, " ");
    if(nombre.length < 5 || !nombre.includes(" ")){
      setInvAceptError("Escribe tu nombre y tus apellidos.");
      return;
    }
    setInvAceptando(true); setInvAceptError("");
    try{
      await firmarPorInvitacion(testigo, nombre);
      setInvitacion(await verInvitacion(testigo));
      notify("Documento firmado ✓");
    }catch(e){ setInvAceptError(errorBackend(e)); }
    finally{ setInvAceptando(false); }
  };

  /**
   * ← NUEVO (15 nov): la clave del candado, desde el enlace.
   *
   * La respuesta del servidor ES la vista entera, con el texto
   * dentro, así que se guarda tal cual: no hace falta volver a pedir
   * `verInvitacion`, y pedirla volvería a traerla bloqueada.
   */
  const abrirConClave = async()=>{
    const clave = String(invClave || "");
    if(!clave){ setInvClaveErr("Escribe la clave."); return; }
    setInvClaveBusy(true); setInvClaveErr("");
    try{
      setInvitacion(await abrirPorInvitacion(testigo, clave));
      setInvClave("");
    }catch(e){ setInvClaveErr(errorBackend(e)); }
    finally{ setInvClaveBusy(false); }
  };

  /**
   * ← NUEVO (17 nov): abrir el modal para pedir un comprobante mas.
   *
   * Limpia los campos al abrir, no al cerrar: si se cerraran al
   * cerrar, un fallo del servidor borraria lo que la persona acababa
   * de escribir junto con el mensaje de error.
   */
  const pedirRequisito = (fase)=>{
    // Se reinicia también el visto bueno: lo que marcaste para un
    // requisito no tiene por qué valer para el siguiente, y
    // arrastrarlo es cómo se pide revisión de algo sin querer.
    setReqTitulo(""); setReqDesc(""); setReqErr(""); setReqVisto(false);
    setModal({ t:"requisito", fase: fase || null });
  };

  /**
   * ← NUEVO (17 nov): quitar una solicitud de comprobante.
   *
   * Dos pasos a proposito. El boton que lleva aqui vive en la misma
   * fila que los de entregar -adjuntar, entregar un enlace, pedirlo-,
   * asi que un dedo gordo en un telefono lo alcanza sin querer, y
   * esto no se deshace.
   */
  const quitarEsteRequisito = (r)=>{
    if(!r?.id) return;
    setReqErr("");
    setModal({ t:"quitar-requisito", reqId:r.id });
  };

  const confirmarQuitarRequisito = async()=>{
    if(!enServidor()){ notify("Esto necesita el servidor activo","err"); return; }
    const reqId = modal?.reqId;
    if(!reqId) return;
    setReqBusy(true); setReqErr("");
    try{
      const r = await llamar("quitarRequisito", { opId: d.id, reqId });
      setD(r.doc);
      setModal(null);
      notify(r.solicitudesCanceladas
        ? "Solicitud quitada \u2713 Se cancel\u00f3 lo que se le hab\u00eda pedido a alguien."
        : "Solicitud quitada \u2713");
    }catch(e){ setReqErr(errorBackend(e)); }
    finally{ setReqBusy(false); }
  };

  // ── DAR O NEGAR EL VISTO BUENO (23 nov) ────────────────────
  //
  // Dos entradas a la misma llamada, porque son dos actos distintos
  // para quien los hace: aprobar es un clic y rechazar pide explicar.
  //
  // RECHAZAR PREGUNTA, aprobar no. No por simetría: rechazar es lo
  // único de los dos que le llega a otra persona como un no, y un no
  // sin motivo obliga a esa persona a adivinar qué estaba mal. El
  // motivo es opcional -lo dijo Ricardo, «los motivos, si el dueño
  // puso un motivo»- pero se pide, que no es lo mismo que exigirlo.
  const [revisando,setRevisando]   = useState(null);   // aid que se está revisando
  const [rechMotivoAdj,setRechMotivoAdj] = useState("");

  const revisar = async(reqId, aid, ok, motivo)=>{
    if(!enServidor()){ notify("Esto necesita el servidor activo","err"); return; }
    setRevisando(aid);
    try{
      const r = await llamar("revisarEntrega", { opId:d.id, reqId, aid, ok, motivo: motivo || null });
      setD(r.doc);
      setModal(null); setRechMotivoAdj("");
      notify(ok
        ? "Visto bueno dado \u2713"
        : "Comprobante rechazado \u2713 Le avisamos a quien lo subió.");
    }catch(e){ notify(errorBackend(e),"err"); }
    finally{ setRevisando(null); }
  };

  const aprobarEntrega = (reqId, aid)=> revisar(reqId, aid, true);
  const pedirRechazo = (reqId, aid, nombre)=>{
    setRechMotivoAdj("");
    setModal({ t:"rechazar-adjunto", reqId, aid, nombre });
  };
  const confirmarRechazo = ()=>
    revisar(modal?.reqId, modal?.aid, false, rechMotivoAdj.trim() || null);

  const guardarRequisito = async()=>{
    if(!enServidor()){ notify("Esto necesita el servidor activo","err"); return; }
    const titulo = reqTitulo.trim().replace(/\s+/g," ");
    if(titulo.length < 3){ setReqErr("Ponle un título que diga qué hay que entregar."); return; }
    setReqBusy(true); setReqErr("");
    try{
      const r = await llamar("anadirRequisito", {
        opId: d.id, titulo,
        descripcion: reqDesc.trim() || null,
        fase: modal?.fase || null,
        requiereVisto: reqVisto === true,
      });
      setD(r.doc);
      setModal(null);
      // El aviso dice QUÉ va a pasar con lo que suban, no sólo que se
      // guardó: es lo que acaba de elegir y lo que va a notar después.
      notify(reqVisto
        ? "Comprobante añadido \u2713 Lo que suban esperará tu visto bueno."
        : "Comprobante añadido \u2713");
    }catch(e){ setReqErr(errorBackend(e)); }
    finally{ setReqBusy(false); }
  };

  const aceptarInvitacion = async()=>{
    const nombre = invNombre.trim().replace(/\s+/g, " ");
    if(nombre.length < 5 || !nombre.includes(" ")){
      setInvAceptError("Escribe tu nombre y tus apellidos.");
      return;
    }
    setInvAceptando(true); setInvAceptError("");
    try{
      await aceptarPorInvitacion(testigo, nombre);
      setInvitacion(await verInvitacion(testigo));
      notify("Contrato aceptado \u2713");
    }catch(e){ setInvAceptError(errorBackend(e)); }
    finally{ setInvAceptando(false); }
  };

  /**
   * ← NUEVO (12 nov): y no aceptarlo.
   *
   * No destruye nada: queda asentado que lo leyó y no lo aceptó, con
   * la fecha y el motivo. Quien lo mandó corrige y lo vuelve a
   * mandar.
   */
  const rechazarInvitacion = async()=>{
    const nombre = invNombre.trim().replace(/\s+/g, " ");
    if(nombre.length < 5 || !nombre.includes(" ")){
      setInvAceptError("Escribe tu nombre y tus apellidos.");
      return;
    }
    if(!invMotivo.trim()){
      setInvAceptError("Di por qué no lo aceptas, para que puedan corregirlo.");
      return;
    }
    setInvAceptando(true); setInvAceptError("");
    try{
      await rechazarPorInvitacion(testigo, nombre, invMotivo.trim());
      setInvitacion(await verInvitacion(testigo));
      setInvRechazando(false); setInvMotivo("");
      notify("Respuesta enviada");
    }catch(e){ setInvAceptError(errorBackend(e)); }
    finally{ setInvAceptando(false); }
  };

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
      }catch(e){ console.warn("[octavin] no se pudo leer el anclaje:", e?.message || e); }
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
        setFolders([]);                                        // ← NUEVO (16 oct)
        return;
      }

      const profile = await getProfile(account.uid);
      setUid(account.uid);
      // ← NUEVO (16 oct): las carpetas son de la cuenta, no del
      // navegador. Se cargan aquí, al saber quién entró.
      setFolders(leerCarpetas(account.uid));
      // ← NUEVO (23 oct): los avisos que esta persona ya quitó de la
      // campana. Van con la cuenta, igual que las carpetas, para que
      // dos personas en el mismo navegador no se mezclen.
      // ← CAMBIADO (6 nov): lo quitado va en la cuenta. Se pinta ya
      // con lo del navegador para que la campana no parpadee, y se
      // funde con lo del perfil en cuanto llega. Lo que hubiera aquí
      // de antes sube en esa misma fusión: no hace falta migrar nada.
      const locales = leerLocales(account.uid);
      setDescartes(locales);
      const juntos = fundir(locales, profile?.descartes);
      setDescartes(juntos);
      guardarLocales(account.uid, juntos);
      if(JSON.stringify(juntos) !== JSON.stringify(profile?.descartes || {})){
        saveProfile(account.uid, { descartes: juntos });
      }
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

      // ← ACTUALIZADO (10 oct): el sello lo asigna el servidor, no el
      // navegador.
      //
      // Antes se elegía una de ocho imágenes a partir del uid y se
      // guardaba en el perfil. Con ocho, a partir de cinco cuentas
      // había un 79% de probabilidad de que dos personas compartieran
      // sello, y a partir de ocho era seguro.
      //
      // Esta llamada le pide al servidor su número de usuario y su
      // clave. La primera vez los asigna y los congela; después sólo
      // los lee. Va sin bloquear: si falla, se firma igual y el
      // servidor lo resuelve al estampar.
      llamar("miSello").then((s)=>setSelloId(s?.clave || null)).catch(()=>{});

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
          setFields(dd.fields||{}); setSecciones(seccionesDe(dd));
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
  const resetImport = ()=>{ setImp(null); setImpText(""); setImpMeta(null); setImpErr(""); setImpFile(null); };

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
      setImpFile(file);
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
  // ← ACTUALIZADO (10 nov): el contador es por tipo, así que hay que
  // decirle de qué tipo va a ser el documento antes de crearlo.
  const folioNuevo = (parcial) => {
    const tipo = tipoDeFolio(parcial);
    const n = siguienteFolio(docs, tipo);
    return { folio: n, numId: folioConPrefijo(tipo, n), tipoFolio: tipo };
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
      const v = JSON.parse(localStorage.getItem(LLAVE_OCULTO)
                        || localStorage.getItem("chaindoc.convOculto") || "[]");
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
      try{ localStorage.setItem(LLAVE_OCULTO, JSON.stringify(n)); }catch{ /* sin almacén */ }
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
    // ── LOS DATOS SALEN DEL ARCHIVO (19 nov) ─────────────────
    //
    // Regla de Ricardo, con el porqué dentro: «para llenar la
    // información se lee el archivo y no a mano; lo que puede hacer
    // el usuario es corregir la información una vez llenada, y cómo
    // sabremos que es verdadera: porque se adjunta sí o sí el archivo
    // original y no se puede quitar».
    //
    // Antes esto decía `formKey==="factura" ? parseFactura(...) : {}`,
    // y ese `: {}` era un recibo ENTERO escrito a mano —ni una línea
    // leía su archivo—. Ahora `extraerCampos` decide qué lector toca,
    // y de paso el XML de un CFDI pasa por `leerCFDI`, que da los
    // datos EXACTOS en vez de reconocerlos en el texto.
    const lectura = isImport
      ? extraerCampos({ tplId: formKey, texto: impText })
      : { campos: {}, origen: {}, exacto: false, nada: true };
    const initial = lectura.campos;
    const filled  = Object.keys(initial).length;

    const body = formKey
      ? serializeForm(formKey, initial)
      : (isImport ? impText : (t?.body||""));

    const origin = isImport
      ? (filled
          ? `Creación desde ${method==="escanear"?"escaneo":"archivo"} con `
            + `${lectura.exacto ? "datos exactos del XML" : "extracción automática"}: ${name}`
          : method==="escanear"
            ? `Creación por escaneo (OCR): ${name}`
            : `Creación por importación de archivo «${impMeta?.name||name}»: ${name}`)
      : `Creación de documento: ${name}`;

    const nd = await crear({
      id: genId(), ...folioNuevo({ tplId: formKey }), title:name, content:body, folder:mIn2||null,
      owner:user, ownerUid:uid, ownerEmail:acctEmail,
      tplId: formKey, fields: formKey ? initial : null,
      // De dónde salió cada uno. Lo que se corrija después pasa a
      // "mano" y queda asentado; ver `corregirCampo`.
      origenCampos: formKey ? lectura.origen : null,
      source: isImport ? (method==="escanear"?"escaneo":"importado") : "nuevo",
      sourceFile: isImport ? (impMeta?.name||null) : null,
      password:null, sharedWith:[],
    }, { accion:"CREACIÓN", contenido:origin });
    if(!nd){ notify("Error al crear","err"); return; }
    const id = nd.id;

    // ── EL ORIGINAL SE GUARDA AQUÍ (16 nov) ──────────────────
    //
    // Hasta hoy el archivo se leía, se sacaba el texto y se tiraba:
    // de él sólo quedaba el nombre en `sourceFile`. Ahora sube al
    // almacén y queda pegado al comprobante como su original, con su
    // huella, y de ahí no se mueve.
    //
    // Va DESPUÉS de crear el documento porque la ruta del archivo
    // lleva su id dentro. Si esto falla, el comprobante existe sin
    // original: no se podrá firmar y la propia pantalla le pedirá el
    // archivo. Es un final feo pero honesto, y mejor que perder
    // también los datos que ya se extrajeron.
    let docFinal = nd;
    if(isImport && formKey && impFile){
      let ruta = null;
      try{
        const thumb = (impFile.type||"").startsWith("image/")
          ? await makeThumb(impFile) : null;
        ({ ruta } = await subirArchivo({ uid, docId:id, file:impFile }));
        const r = enServidor()
          ? await llamar("registrarOriginal", { opId:id, ruta, nombre:impFile.name, thumb })
          : await registrarOriginalLocal(nd, { file:impFile, ruta, thumb });
        docFinal = r.doc;
      }catch(e){
        console.error(e);
        if(ruta) await descartarSubida(ruta);
        notify("Se creó, pero no se pudo guardar el archivo original: "
          + errArchivo(e) + " Adjúntalo desde el documento.", "err");
      }
    }

    if(isImport && formKey){
      // ── EL AVISO CUANDO NO SE PUDO LEER (19 nov) ───────────
      //
      // Lo pidió Ricardo así: «mandar un aviso que salga en pantalla
      // que diga que no se puede leer el archivo por baja resolución
      // o los datos no son legibles».
      //
      // Antes decía «No se reconocieron campos», que describe lo que
      // le pasó al programa y no lo que le pasó a la persona. Ahora
      // dice QUÉ archivo falló y POR QUÉ suele fallar, que es lo
      // único que le permite hacer algo: volver a tomar la foto.
      //
      // Y no cierra la puerta: el comprobante existe, el original ya
      // está pegado y puede escribir los datos él. Quedan marcados
      // «a mano», que es el trato.
      notify(filled
        ? (lectura.exacto
            ? `${filled} campos leídos del XML, exactos ✓`
            : `${filled} campo${filled===1?"":"s"} leído${filled===1?"":"s"} del archivo ✓ Revísalos contra el original.`)
        : (impMeta?.kind === "ocr"
            ? "No se pudieron leer los datos de esta imagen: suele ser por baja resolución, "
              + "sombras o el papel torcido. Vuelve a tomar la foto, o escribe los datos tú: "
              + "quedarán marcados como escritos a mano."
            : "No se pudieron leer los datos de este archivo: no trae texto legible, "
              + "o no tiene la forma de un comprobante. Si es una factura, sube el XML del CFDI. "
              + "Si no, escribe los datos tú: quedarán marcados como escritos a mano."),
        filled?"ok":"err");
    }

    closeCreate();
    const nd2 = docFinal;
    setD(nd2); setTitle(name); setContent(nd2.content); setFields(nd2.fields||{});
    setSecciones(seccionesDe(nd2));
    setUnlocked(true); setEdit(true); setUrlDoc(id); setScreen("doc");
    }finally{ setCreando(false); }
  };

  // ← NUEVO (25 oct): un contrato desde cero se abre como borrador.
  //
  // Nace siendo un documento de texto con una nota de hacia dónde va,
  // porque eso es exactamente lo que es mientras lo escribes. Se
  // redacta con el papel entero y su barra de estilos, y pasa a ser
  // expediente al analizarse, en su sitio: mismo identificador, misma
  // cadena, mismas firmas.
  const crearBorrador = async()=>{
    if(creando) return;
    setCreando(true);
    try{
      const name = mIn.trim();
      if(!name){ notify("Ponle un nombre al contrato","err"); return; }
      const nd = await crear({
        id: genId(), ...folioNuevo({ destino:"expediente" }), title:name, content:"", folder:mIn2||null,
        owner:user, ownerUid:uid, ownerEmail:acctEmail,
        tplId:null, fields:null, destino:"expediente",
        source:"nuevo", sourceFile:null, password:null, sharedWith:[],
      }, { accion:"CREACIÓN", contenido:`Borrador de contrato: ${name}` });
      if(!nd){ notify("Error al crear","err"); return; }

      // ← NUEVO (25 oct): que no se pierda en silencio.
      //
      // `destino` es lo que marca el borrador, y el servidor filtra
      // los campos que acepta. Si las funciones desplegadas todavía no
      // conocen el campo, lo tiran sin decir nada: el documento nace
      // como texto normal, con su barra completa y su cartel de «¿es
      // un contrato?», y desde fuera parece que la función no se hizo.
      // Vale más una frase incómoda que media tarde buscando.
      if(!esBorradorContrato(nd)){
        notify("Se creó, pero el servidor no guardó la marca de borrador. Falta desplegar las funciones: firebase deploy --only functions","err");
      }

      closeCreate();
      setD(nd); setTitle(name); setContent(""); setFields({});
      setSecciones(seccionesDe(nd));
      setUnlocked(true); setEdit(true); setDirty(false);
      setUrlDoc(nd.id); setScreen("doc");
    }finally{ setCreando(false); }
  };

  // ← NUEVO: abre y cierra el asistente de creación en un solo lugar
  const openCreate = ()=>{
    // ← ACTUALIZADO (4 nov): si estás dentro de una carpeta, el
    // documento nace ahí. Entrar a la carpeta y pulsar crear ya dijo
    // dónde va; preguntarlo otra vez es hacer dos veces la misma
    // elección. El modal lo dice en una línea, con un «Cambiar».
    setMIn(""); setMIn2(filterF || ""); setCarpAbierta(false); setTpl("contrato");
    setMethod(null); setCreateStep(0); resetImport(); setTplInfo(null);
    setSmartText(""); setSmartRes(null); setSmartErr("");   // ← NUEVO
    setModal({t:"create"});
  };
  const closeCreate = ()=>{
    setModal(null); setMIn(""); setMIn2(""); setCarpAbierta(false);
    setMethod(null); setCreateStep(0); resetImport(); setTplInfo(null);
    setSmartText(""); setSmartRes(null); setSmartErr("");   // ← NUEVO
  };

  const save = async()=>{
    setSaving(true);
    // ← ACTUALIZADO: si el documento usa plantilla visual, los campos
    // se serializan a texto para que la cadena siga hasheando contenido legible.
    // ← ACTUALIZADO (24 oct): el cuerpo sale del editor, no del
    // estado, porque mientras escribes el DOM es el que va al día. Y
    // pasa por `normalizar`: lo que se sella no es lo que escribió el
    // navegador, es lo que cabe en el modelo. Ver `nucleo/texto.js`.
    const body = d.tplId
      ? serializeForm(d.tplId, fields)
      : cuerpoDelEditor();

    // ── LO QUE SE CORRIGIÓ A MANO QUEDA DICHO (19 nov) ───────
    //
    // Ricardo: los datos los llena el archivo y «lo que puede hacer
    // el usuario es corregir la información una vez llenada»; el
    // original se queda pegado para que «la otra persona pueda
    // corroborar los datos y que no fueron alterados».
    //
    // Corroborar exige saber QUÉ mirar. Un comprobante con doce
    // campos iguales a su archivo y uno cambiado se lee igual que uno
    // intacto, si nadie lo dice. Así que cada corrección mueve ese
    // campo a «mano» y entra en la cadena con lo que decía antes.
    //
    // Y va en la cadena, no sólo en el documento, porque el documento
    // se puede volver a editar y la cadena no. Si alguien corrige el
    // total, lo firma, y luego lo deja como estaba, el documento no
    // guarda rastro: el bloque sí.
    const esComp = esComprobante(d);
    const { origen: origenNuevo, corregidos } = esComp
      ? marcarCorrecciones(d.fields || {}, fields, d.origenCampos || {})
      : { origen: null, corregidos: [] };
    const aMano = corregidos.filter((c) => c.era === "archivo");
    const evento = aMano.length
      ? { accion:"EDICIÓN",
          contenido: `Corrección a mano de ${aMano.length} dato${aMano.length===1?"":"s"} `
            + `que venía${aMano.length===1?"":"n"} del archivo original: `
            + aMano.map((c) => `${etiquetaDe(d.tplId, c.k)} «${c.antes||"vacío"}» → «${c.ahora||"vacío"}»`).join("; "),
          meta: { tipo:"correccion", campos: aMano.map((c) => ({ k:c.k, antes:c.antes, ahora:c.ahora })) } }
      : { accion:"EDICIÓN", contenido:aTextoPlano(body).slice(0,200) };

    const up = await aplicar(d, evento,
      { title, content:body, fields: d.tplId ? fields : null,
        ...(esComp ? { origenCampos: origenNuevo } : {}),
        secciones: limpiarSecciones(secciones) },
      { autor:user, autorUid:uid });
    if(up){ setD(up); setContent(body); setDirty(false); setEdit(false); notify("Documento actualizado ✓"); }
    else notify("Error al guardar","err");
    setSaving(false);
  };

  // ← NUEVO (11 nov): «AYÚDAME A REDACTAR».
  //
  // El objetivo, con palabras de Ricardo: «que se pueda usar incluso
  // si no eres abogado o no sabes cómo redactarlo correctamente».
  // Escribes como te salga y esto lo devuelve en forma de contrato.
  //
  // Lo que se le manda es TEXTO PLANO, no el HTML. Al modelo no le
  // sirven los `<p>` ni los `</strong>`: son tokens pagados que sólo
  // empeoran lo que entiende. Y lo que devuelve pasa por
  // `normalizar()` antes de enseñarse, que es el mismo filtro con el
  // que se guarda todo lo demás. Dos cosas a la vez: un modelo puede
  // devolver cualquier cosa —incluido un <script>—, y además así lo
  // que se ve en el borrador es exactamente lo que se va a guardar.
  const pedirRedaccion = async()=>{
    const cuerpo = cuerpoDelEditor();
    // El aviso que pidió él. Sin esto, pulsar con el documento en
    // blanco daría un error del servidor sobre un texto demasiado
    // corto, que no dice qué hacer.
    if(estaVacio(cuerpo)){ setModal({ t:"redactar-vacio" }); return; }

    setRedBusy(true);
    try{
      const res = await draftContract(aTextoPlano(cuerpo));
      setRedRes({ ...res, html: normalizar(res.html) });
      setModal({ t:"redaccion" });
    }catch(err){ notify(err.message, "err"); }
    finally{ setRedBusy(false); }
  };

  /**
   * Poner el borrador en el editor. No guarda.
   *
   * Es a propósito, y es la vuelta atrás: mientras no le des a
   * «Guardar», lo que escribiste sigue intacto en el documento y
   * basta con salir sin guardar para recuperarlo. Guardar aquí
   * mismo dejaría el texto anterior sólo dentro de la cadena, y
   * sacarlo de ahí es mucho pedir para un «me arrepentí».
   */
  const usarRedaccion = ()=>{
    if(!redRes) return;
    const el = elEditor();
    if(el) el.innerHTML = redRes.html;
    setContent(redRes.html);
    setDirty(true);
    // El título sólo si no había uno: el suyo gana siempre.
    if(redRes.titulo && !title.trim()) setTitle(redRes.titulo);
    setModal(null);
    setRedRes(null);
    notify("Borrador puesto. Revísalo y dale a Guardar; si no te convence, sal sin guardar.");
  };

  // ← NUEVO (10 nov): renombrar un contrato inteligente.
  //
  // Un expediente no tiene «Editar» —no hay cuerpo que escribir, lo
  // que se ve son requisitos y comprobantes— y al quitar ese botón se
  // quedó también sin forma de cambiarle el título. Aquí el título se
  // edita en su sitio y se guarda al salir del campo.
  //
  // La regla de CUÁNDO se puede no está aquí. `puedo("editar")` ya la
  // trae y el servidor la vuelve a comprobar: en cuanto el contrato
  // se manda a firmar deja de poder editarse, y vuelve a poder si lo
  // rechazan. Un contrato en firma no se renombra ni por su dueño, y
  // eso es lo que hace que la firma signifique algo.
  //
  // No reusa `save`: aquel manda también el cuerpo, que lo saca del
  // editor, y en un expediente no hay editor en pantalla. Habría
  // guardado el contenido en blanco.
  const renombrar = async()=>{
    const limpio = title.trim();
    if(!d || limpio === d.title) return;
    if(!limpio){
      setTitle(d.title);
      notify("El título no puede quedar vacío","err");
      return;
    }
    setSaving(true);
    const up = await aplicar(d,
      { accion:"EDICIÓN", contenido:`Se renombró a «${limpio}»` },
      { title: limpio },
      { autor:user, autorUid:uid });
    if(up){ setD(up); setTitle(up.title); notify("Título actualizado ✓"); }
    else { setTitle(d.title); notify("Error al guardar","err"); }
    setSaving(false);
  };

  // ← ACTUALIZADO (Etapa 3): el código viaja al servidor, que lo compara
  // contra un hash lento con sal y bloquea tras varios fallos. Antes se
  // comparaba aquí mismo, así que bastaba con alterar esta función.
  const trySign = async()=>{
    if(!tieneCodigo){ notify("No tienes código de firma configurado","err"); return; }
    setSaving(true);
    try{
      // Si esta firma era la conformidad final, antes de mandarla ya
      // lo sabíamos: la pantalla no enseña el botón hasta entonces.
      const eraLaFinal = expedienteStatus(d).firmaPendiente;

      const r = await llamar("firmarDocumento", { opId:d.id, codigo:pass.trim() });
      setD(r.doc); setModal(null); setPass("");
      notify(`✦ Firma de ${user} registrada`);

      // ← NUEVO (27 oct): que no se pierda en silencio.
      //
      // Quien registra la conformidad es el servidor. Si las funciones
      // desplegadas todavía no saben de ella, la firma se asienta como
      // un sello más y la barra se queda en 3 de 4 sin decir por qué:
      // el sello aparece, el progreso no avanza, y desde fuera parece
      // que el último paso no sirve. Mejor una frase incómoda.
      // Quien no es parte del acuerdo —un auditor, un lector— firma
      // como sello y ya: ahí no hay conformidad que registrar.
      const miParte = parteDe(r.doc, acctEmail);
      if(eraLaFinal && miParte && !firmaDe(r.doc, miParte, "conformidad")){
        notify("Se firmó, pero el servidor no registró la conformidad. Falta desplegar las funciones: firebase deploy --only functions","err");
      }
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

  // ← NUEVO (27 oct): pedir el reto y que el dispositivo lo firme.
  //
  // El reto lo emite el servidor atado al par (motivo, opId), así que
  // uno pedido para aceptar un contrato no sirve para firmar su
  // conformidad. El navegador sólo hace de mensajero.
  const pedirAsercion = async(motivo, opId)=>{
    const { reto, credenciales } = await llamar("retoBiometrico", { motivo, opId });
    return await bioAssert(credenciales, b64uToBytes(reto));
  };

  /** Un fallo de biometría no se lee como uno del servidor. */
  const textoDeFallo = (err)=>
    String(err?.code||"").startsWith("functions/") ? errorBackend(err) : bioError(err);

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
    // ← ARREGLADO (25 oct): el texto sale del EDITOR, no del estado.
    //
    // Desde que el papel es un contentEditable, `content` se queda con
    // lo último que se guardó: mientras escribes, el que va al día es
    // el DOM. Analizar `content` habría mandado a la IA el documento
    // de antes de los cambios, y en un borrador recién empezado eso es
    // el documento vacío.
    const cuerpo = cuerpoDelEditor();
    const texto = aTextoPlano(cuerpo);
    if(texto.trim().length < MIN_CONTRATO){
      notify(`Para analizarlo hace falta algo más de texto: llevas ${texto.trim().length} de ${MIN_CONTRATO} caracteres.`,"err");
      return;
    }
    setSmartRes(null); setSmartErr(""); setModal({t:"convertir"});
    setSmartBusy(true);
    try{
      setSmartMsg("");
      const res = await analyzeContract(texto, setSmartMsg);
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
      // ← ARREGLADO (25 oct): a Gemini se le manda PROSA, pero lo que
      // se GUARDA sigue siendo el documento con su formato.
      //
      // Ayer, al pasar el contenido a tener formato, esto se quedó a
      // medias: mandaba prosa a la IA —bien— y luego guardaba esa
      // misma prosa como contenido del expediente. O sea que convertir
      // un contrato bien maquetado, con sus títulos y sus cláusulas en
      // lista, lo dejaba en un bloque de texto plano. Se perdía el
      // trabajo justo en el paso que lo hace importante.
      const cuerpo = cuerpoDelEditor();
      const texto = aTextoPlano(cuerpo);
      let base = d;

      // Si había cambios sin guardar en el editor, primero se sellan.
      if(cuerpo !== (d.content||"")){
        const previo = await aplicar(base,
          { accion:"EDICIÓN", contenido:texto.slice(0,200) },
          { content:cuerpo }, { autor:user, autorUid:uid });
        if(!previo){ notify("No se pudo convertir","err"); return; }
        base = previo;
      }

      const up = await aplicar(base, {
        accion:"CONVERSIÓN",
        contenido:`Convertido en expediente con ${smartRes.requisitos.length} requisitos`,
        meta:{ tipo:"expediente", requisitos:smartRes.requisitos.length,
               fases:(smartRes.fases||[]).length, modelo:smartRes.modelo },
      }, {
        title: title.trim() || d.title,
        content: cuerpo,
        kind: "expediente", tplId: null, fields: null, destino: null,
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
        setD(up); setTitle(up.title); setContent(cuerpo);
        setEdit(false); setDirty(false); setModal(null); setSmartRes(null);
        refresh();
        notify(`Expediente con ${up.requisitos.length} requisitos ✓`);
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
      id: genId(), ...folioNuevo({ kind:"expediente" }), title:name, content:smartText, folder:mIn2||null,
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
                    // ← NUEVO (23 nov): el uid, no sólo el nombre. Hace falta
                    // para avisarle a quien subió esto si se lo rechazan, y un
                    // nombre no identifica una cuenta: hay dos Juan Pérez.
                    subidoEn:new Date().toISOString(), subidoPor:user, subidoPorUid:uid };
    // ← CAMBIADO (23 nov): el estado ya no es siempre «cumplido». Si
    // su dueño marcó este requisito con «necesita mi visto bueno»,
    // queda en «por-revisar». La regla vive en `nucleo/entregas.js`,
    // gemela de la del servidor.
    const requisitos = d.requisitos.map(r=> r.id!==reqId ? r : {
      ...quitarArchivoViejo(r), archivos:[...archivosDe(r), nuevo],
      estado: estadoDe(r, [...archivosDe(r), nuevo]),
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
                    hash, subidoEn:new Date().toISOString(), subidoPor:user, subidoPorUid:uid };
    const requisitos = d.requisitos.map(r=> r.id!==reqId ? r : {
      ...quitarArchivoViejo(r), archivos:[...archivosDe(r), nuevo],
      estado: estadoDe(r, [...archivosDe(r), nuevo]),
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
      estado: estadoDe(r, restantes),
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

  /**
   * ← NUEVO (16 nov): el original, cuando no hay servidor.
   *
   * Gemela de `registrarImagenLocal` y aparte por lo mismo que en el
   * servidor: el original de una factura suele ser un XML o un PDF, y
   * lleva su marca. Toma el documento por argumento porque se usa
   * justo despues de crearlo, cuando `d` todavia es el de antes.
   */
  const registrarOriginalLocal = async(doc0, { file, ruta, thumb })=>{
    const hash = await hashFile(file);
    const path = genId();
    const imagenes = [...(doc0.imagenes||[]), {
      path, ruta, nombre:file.name, tipo:file.type, tam:file.size, hash, thumb,
      subidoEn:new Date().toISOString(), subidoPor:user, esOriginal:true,
    }];
    const doc = await aplicar(doc0, {
      accion:"EVIDENCIA",
      contenido:`Archivo original «${file.name}» (${hash.slice(0,16)}…)`,
      meta:{ tipo:"original", archivo:file.name, huella:hash, tam:file.size, mime:file.type },
    }, { imagenes }, { autor:user, autorUid:uid });
    if(!doc) throw new Error("No se pudo guardar el archivo original.");
    return { doc };
  };

  const quitarImagenLocal = async(path)=>{
    const img = (d.imagenes||[]).find(x=>x.path===path);
    // El original no se retira. El motivo entero esta en `quitarImagen`,
    // en functions/index.js; aqui se repite la puerta porque sin
    // servidor esta es la unica que hay.
    if(img?.esOriginal){
      throw new Error("El archivo original no se puede quitar: es lo que prueba que "
        + "los datos de este comprobante salieron de algún lado.");
    }
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
    // ← NUEVO (3 nov): CUÁL se está subiendo, no sólo que algo se sube.
    // `saving` apaga los botones de todos los requisitos a la vez, así
    // que sin esto el aviso saldría en los seis y no se sabría dónde
    // fue a parar el archivo.
    setSubiendoReq(reqId);
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
        : "Archivo adjuntado ✓");
    }catch(e){
      console.error(e);
      if(ruta) await descartarSubida(ruta);   // no dejar basura en el almacén
      notify(errArchivo(e),"err");
    }
    finally{ setSaving(false); setSubiendoReq(null); }
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
  // ← NUEVO (14 oct): qué pestaña del expediente está abierta.
  // Vive aquí y no en la pantalla porque renderExpediente es una
  // función, no un componente, y porque hay que poder reiniciarla al
  // abrir otro documento: si no, entras a un expediente nuevo y te
  // recibe la pestaña del contrato del anterior.
  const [expTab, setExpTab] = useState("expediente");

  // ← NUEVO (14 oct): la recomendación abierta en el paso 1 de crear, y
  // la espera del botón de desbloquear los adjuntos.
  //
  // `tplInfo` guarda el id del tipo cuya ⓘ está abierta, no un booleano:
  // así abrir una cierra la anterior sin tener que acordarse de hacerlo.
  const [tplInfo, setTplInfo] = useState(null);
  const [desbloqueando, setDesbloqueando] = useState(false);

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
        : "Enlace registrado ✓");
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
    if(desbloqueando) return;
    if(!tieneCodigo){ notify("No tienes código de firma configurado","err"); return; }
    // ← NUEVO (14 oct): comprobar el código va al servidor, y hasta
    // ahora el botón se quedaba igual mientras tanto. En una conexión
    // lenta parecía que no había pasado nada y se le daba otra vez.
    setDesbloqueando(true);
    try{
      await llamar("verificarCodigoFirma", { codigo: pass.trim() });
      setFilesOpen(true); setPass(""); setModal(null);
      notify("Documentos desbloqueados ✓");
    }catch(e){ console.error(e); notify(errorBackend(e),"err"); }
    finally{ setDesbloqueando(false); }
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
  /**
   * Dar acceso a alguien con cuenta.
   *
   * ← CAMBIADO (15 nov): el rol se puede pasar.
   *
   * Hacía falta porque en un documento de texto que se firma el rol
   * NO se elige: lo decide el modal (ver PARA_FIRMAR en
   * `modales/Compartir.jsx`) y no hay radio que lo guarde en
   * `shareRol`. Llega por aquí.
   *
   * `typeof rolDado === "string"` no es paranoia: `onClick={doShare}`
   * le pasaría el EVENTO del clic en ese sitio, y un evento es
   * truthy. Eso ya pasó el 12 de nov con `conBio` y costó una tarde,
   * así que se arregla en los dos extremos —el botón llama a mano y
   * la función no se fía— porque va a volver a pasar.
   */
  const doShare = async(rolDado)=>{
    const rolAUsar = typeof rolDado === "string" ? rolDado : shareRol;
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
    if(rolPrevio && rolPrevio === rolAUsar){
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
        const r = await compartirServidor(d.id, correo, rolAUsar);
        setD(r.doc); setMIn(""); setShareFound(cuenta);
        notify(`${rolPrevio ? "Rol actualizado" : "Compartido"}: ${cuenta.nombre||correo} · ${ROL_TEXTO[rolAUsar]} ✓`);
        return;
      }

      const up = await aplicar(d, {
        accion:"COMPARTIDO",
        contenido:`Compartido con ${cuenta.nombre||correo} (${correo}) como ${ROL_TEXTO[rolAUsar]}`,
        meta:{ tipo:"alta", correo, rol:rolAUsar },
      }, {
        sharedWith:[...new Set([...(d.sharedWith||[]), correo])],
        roles:{ ...(d.roles||{}), [correo]: rolAUsar },
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

  /**
   * ← NUEVO (16 nov): traerle el original a un comprobante que no lo
   * tiene.
   *
   * Dos clientes, y los dos hacen falta:
   *
   *   · LOS DE ANTES. Los recibos y facturas creados cuando el
   *     producto sólo guardaba el nombre del archivo. Ricardo decidió
   *     que se marquen y que pidan el original para volver a
   *     compartirse o adjuntarse, y esto es por dónde lo traen.
   *   · LOS QUE FALLARON AL NACER. Si la subida se cae justo al
   *     crearlo, el comprobante queda sin original. Sin esta puerta
   *     el único arreglo sería borrarlo y empezar de nuevo.
   *
   * No acepta un segundo original: eso lo niega el servidor, que es
   * donde tiene que negarse.
   */
  const adjuntarOriginal = async(file)=>{
    if(!file || !d) return;
    setSaving(true);
    let ruta = null;
    try{
      const thumb = (file.type||"").startsWith("image/") ? await makeThumb(file) : null;
      ({ ruta } = await subirArchivo({ uid, docId:d.id, file }));
      const r = enServidor()
        ? await llamar("registrarOriginal", { opId:d.id, ruta, nombre:file.name, thumb })
        : await registrarOriginalLocal(d, { file, ruta, thumb });
      setD(r.doc);
      notify("Archivo original guardado ✓");
    }catch(e){
      console.error(e);
      if(ruta) await descartarSubida(ruta);
      notify(errArchivo(e),"err");
    }
    finally{ setSaving(false); }
  };

  // ── CORREGIR EL ARCHIVO ORIGINAL (24 nov) ──────────────────
  //
  // Ricardo: «¿qué tal si subí el que no era?». Hasta hoy la única
  // salida era borrar el comprobante entero y registrarlo de nuevo,
  // porque el original no se puede quitar.
  //
  // Esto no lo quita, lo SUSTITUYE, y hace exactamente el mismo
  // recorrido que al crearlo: se lee el archivo, se sacan los datos
  // de él, y se escriben encima. Gana el archivo nuevo en TODO,
  // también donde alguien hubiera corregido a mano: si el documento
  // estaba equivocado, sus correcciones también lo estaban.
  //
  // El motivo de por qué esto sí se puede, y quitarlo no, está en
  // `corregirOriginal` de functions/index.js.
  const [corrigiendo, setCorrigiendo] = useState(false);
  const corregirOriginal = async(file)=>{
    if(!file || !d || !d.tplId) return;
    setCorrigiendo(true);
    let ruta = null;
    try{
      // 1 · Leerlo. Igual que al importar: una foto va por OCR y lo
      //     demás por el lector de archivos.
      const esImagen = (file.type||"").startsWith("image/");
      const res = await (esImagen ? ocrImage : extractFromFile)(file, ()=>{});
      const lectura = extraerCampos({ tplId:d.tplId, texto:res.text });
      const campos = lectura.campos || {};
      if(!Object.keys(campos).length){
        // Ni un dato. Puede ser una foto borrosa o el archivo
        // equivocado; en cualquier caso cambiar el original por algo
        // ilegible deja el comprobante peor que antes.
        notify("No se pudo leer ningún dato de ese archivo. Revisa que sea el comprobante y que se lea bien.","err");
        return;
      }

      // 2 · Subirlo y pedirle al servidor el cambio. El bloque lo
      //     escribe él, que es quien tiene las dos huellas.
      const thumb = esImagen ? await makeThumb(file) : null;
      ({ ruta } = await subirArchivo({ uid, docId:d.id, file }));
      const datos = {
        opId:d.id, ruta, nombre:file.name, thumb,
        campos, origen:lectura.origen || {},
        contenido: serializeForm(d.tplId, campos),
        etiquetas: Object.fromEntries(
          Object.keys(campos).map(k=>[k, etiquetaDe(d.tplId, k)])),
      };
      const r = enServidor()
        ? await llamar("corregirOriginal", datos)
        : await corregirOriginalLocal(d, { file, ruta, thumb, ...datos });
      setD(r.doc);
      setFields(r.doc.fields || {});
      setContent(r.doc.content || "");
      setDirty(false);
      const n = (r.cambiados || []).length;
      notify(n
        ? `Archivo corregido ✓ · ${n} dato${n===1?"":"s"} cambió${n===1?"":"n"}`
        : "Archivo corregido ✓ · los datos que se leen son los mismos");
    }catch(e){
      console.error(e);
      if(ruta) await descartarSubida(ruta);
      notify(errArchivo(e),"err");
    }
    finally{ setCorrigiendo(false); }
  };

  // Sin servidor no hay quien compare las huellas, así que la
  // comparación se hace aquí. Es la misma puerta, con la única
  // cerradura que hay en este modo.
  const corregirOriginalLocal = async(doc0, { file, ruta, thumb, campos, origen, contenido, etiquetas })=>{
    const viejo = (doc0.imagenes||[]).find(x=>x.esOriginal);
    if(!viejo) throw new Error("Este comprobante todavía no tiene archivo original: adjúntalo en vez de corregirlo.");
    const hash = await hashFile(file);
    if(hash === viejo.hash) throw new Error("Ese es el mismo archivo que ya estaba. Si querías cambiarlo, elige otro.");

    const antes = doc0.fields || {};
    const cambiados = [...new Set([...Object.keys(antes), ...Object.keys(campos)])]
      .filter(k=>String(antes[k] ?? "") !== String(campos[k] ?? ""))
      .map(k=>({ k, antes:antes[k] ?? "", ahora:campos[k] ?? "" }));
    const frase = cambiados.length
      ? ` Al releerlo cambia${cambiados.length===1?"":"n"} ${cambiados.length} dato${cambiados.length===1?"":"s"}: `
        + cambiados.map(c=>`${etiquetas?.[c.k] || c.k} «${c.antes||"vacío"}» → «${c.ahora||"vacío"}»`).join("; ")
      : " Los datos que se leen son los mismos.";

    const nuevo = {
      path:genId(), ruta, nombre:file.name, tipo:file.type, tam:file.size, hash, thumb,
      subidoEn:new Date().toISOString(), subidoPor:user, esOriginal:true,
    };
    const doc = await aplicar(doc0, {
      accion:"EVIDENCIA",
      contenido:`Archivo original corregido: «${viejo.nombre}» (${String(viejo.hash||"").slice(0,16)}…) `
        + `pasa a «${nuevo.nombre}» (${hash.slice(0,16)}…).${frase}`,
      meta:{ tipo:"original-corregido",
        antes:{ archivo:viejo.nombre||null, huella:viejo.hash||null },
        ahora:{ archivo:nuevo.nombre, huella:hash, tam:file.size, mime:file.type },
        campos:cambiados },
    }, {
      imagenes:[...(doc0.imagenes||[]).filter(x=>!x.esOriginal), nuevo],
      fields:campos, content:contenido, origenCampos:origen, sourceFile:file.name,
    }, { autor:user, autorUid:uid });
    if(!doc) throw new Error("No se pudo corregir el archivo original.");
    if(viejo.ruta) await descartarSubida(viejo.ruta);
    return { doc, imagen:nuevo, cambiados };
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
  // ── QUITADO (25 nov): escribir el importe a mano ──────────
  //
  // Aquí vivía `setMontoReq`, que guardaba el importe que alguien
  // tecleaba sobre un archivo suelto. Se fue con su campo: esa cifra
  // entraba en la suma de lo comprobado y sostenía el «faltan
  // $3,000» del expediente, y un número tecleado encima de la foto
  // de otra persona no prueba nada. El importe sale ahora sólo de un
  // documento de OCTAVIN, que lo LEE del archivo. Ver `llevaImporte`.

  // ← NUEVO (3 nov): cambiar si las fases van en orden o son sueltas.
  //
  // El orden lo saca la IA del contrato, y si se equivoca la otra
  // parte se queda sin poder entregar. Esto es la salida. No es un
  // ajuste de pantalla: cambia qué se puede entregar y cuándo, así que
  // queda asentado quién lo cambió y a qué, como todo lo demás.
  const setFasesEnOrden = async(enOrden)=>{
    if(!d) return;
    setSaving(true);
    try{
      const up = await aplicar(d, {
        accion:"EDICIÓN",
        contenido: enOrden
          ? "Las fases pasan a entregarse en orden: cada una espera a la anterior."
          : "Las fases pasan a ser independientes: se pueden entregar en cualquier orden.",
        meta:{ tipo:"fases-orden", enOrden },
      }, { fasesEnOrden: enOrden });
      if(up){ setD(up); notify(enOrden ? "Las fases van en orden ✓" : "Las fases son independientes ✓"); }
      else notify("No se pudo cambiar el orden de las fases.","err");
    }catch(e){ console.error(e); notify("No se pudo cambiar el orden de las fases.","err"); }
    finally{ setSaving(false); }
  };

  // ← NUEVO (6 nov): salirse de algo que te compartieron.
  //
  // Vuelve al inicio a propósito: acabas de perder el acceso, así que
  // quedarte en la pantalla del documento sería quedarte mirando algo
  // que ya no puedes leer, y el primer refresco daría un error feo.
  const dejarDeVerDoc = (id)=> conEspera("saliendo", async()=>{
    try{
      await dejarDeVerServidor(id);
      setDocs(xs => xs.filter(x => x.id !== id));
      setModal(null);
      goHome();
      notify("Ya no verás este documento. Si lo necesitas, pídeselo otra vez a quien te lo compartió.");
    }catch(e){
      console.error(e); notify(errorBackend(e),"err");
    }
  });

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
        catch(e){ console.warn("[octavin] el paquete va sin anclaje:", e?.message || e); }
      }
      // ← NUEVO (28 oct): los originales viajan dentro del paquete.
      // Si no se pueden bajar —sesión caída, red— cada uno cae a su
      // miniatura por su cuenta y el paquete se genera igual: quedarse
      // sin paquete por una foto sería peor.
      let adjuntos = null;
      if(enServidor()){
        try{ adjuntos = await recogerAdjuntos(d, traerArchivo); }
        catch(e){ console.warn("[octavin] el paquete va sin los originales:", e?.message || e); }
      }
      const nombre = descargarPaquete(d, pruebas ? paraElPaquete(pruebas) : null, adjuntos);
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
  // ── LA DOBLE FIRMA DEL CONTRATO ──
  //
  // El estado se deriva del propio documento, no se guarda: lo calcula
  // `estadoAcuerdo` cada vez. Así no puede quedar una pastilla en
  // pantalla diciendo «vigente» sobre un contrato que nadie aceptó.
  const acu = estadoAcuerdo(d);

  // Si este contrato está esperando MI firma. La misma función que usa
  // el servidor para decidirlo, para que no puedan discrepar.
  const esperaMiFirma = esperaFirmaDe(d, acctEmail);

  // ← NUEVO (20 oct): si todavía tengo algo que decidir sobre este
  // contrato, abrirlo me lleva a leerlo, no al expediente.
  const decision = decideAhora(d, acctEmail);

  // ← ACTUALIZADO (20 oct): acepta el correo de quien lo llama.
  //
  // Antes sólo leía `enFirmeCorreo`, el del modal de poner en firme,
  // porque mandar a firmar vivía en su propia puerta. Ahora vive
  // dentro de Compartir, que tiene su propio campo de correo
  // (`mIn`), y el modal viejo se queda como atajo. Los dos llaman
  // aquí; cambia nada más de dónde sale el correo.
  // ← ACTUALIZADO (27 oct): `conBio` manda la aserción del dispositivo
  // en vez del código. Las dos vías valen lo mismo para el servidor;
  // lo que cambia es cómo demuestras que eres tú.
  /**
   * ← CAMBIADO (17 nov): gana un cuarto argumento, `conEnlace`.
   *
   * Dice si quien pulsó quería EL ENLACE —para alguien sin cuenta— o
   * mandarlo por la plataforma. No se adivina del correo: si se
   * adivinara, mandar a una persona sin cuenta por el botón de «con
   * cuenta» acabaría en un enlace que nadie pidió, y es justo la
   * confusión que esto viene a quitar.
   *
   * Va el ÚLTIMO y con valor por omisión para no mover las tres
   * llamadas que ya existen en `modales/Acuerdo.jsx`.
   */
  const mandarAFirmar = async(correoDe=null, nombreDe=null, conBio=false, conEnlace=false)=>{
    if(!enServidor()){ notify("Esto necesita el servidor activo","err"); return; }
    // ← NUEVO (12 nov): sólo cuenta si es texto.
    //
    // Un `onClick={mandarAFirmar}` mete aquí el evento del clic, y
    // `String(evento)` da "[object Object]": sin arroba, así que el
    // modal decía «escribe el correo de la otra parte» con el correo
    // escrito delante. Pasó de verdad y costó encontrarlo, porque el
    // mensaje señalaba a un sitio donde no estaba el fallo.
    const dado = typeof correoDe === "string" ? correoDe : null;
    const correo = String(dado ?? enFirmeCorreo).trim().toLowerCase();
    // ← CAMBIADO (17 nov): al pedir el enlace a propósito, el correo
    // es opcional. Lo pidió Ricardo: «sólo el código, para que este
    // enlace se lo puedas compartir por el medio que el usuario
    // quiera y no esté atado al correo». Para mandarlo DENTRO de la
    // aplicación sigue haciendo falta, claro: es a dónde llega.
    const porEnlace = conEnlace === true;
    if(!correo && !porEnlace){ setEnFirmeErr("Escribe el correo de la otra parte."); return; }
    if(correo && !correo.includes("@")){ setEnFirmeErr("Escribe el correo de la otra parte."); return; }
    if(correo && correo === (acctEmail||"").toLowerCase()){
      setEnFirmeErr("Ese es tu propio correo."); return;
    }
    // `=== true` y no a secas: lo que llega puede ser un evento, y un
    // evento es truthy. Quien quiera biometría la pide pasando true.
    const bio = conBio === true;
    if(bio && !bioCreds.length){ setEnFirmeErr("No tienes biometría activada."); return; }
    if(!bio && pass.trim().length<4){ setEnFirmeErr("Escribe tu código de firma."); return; }
    setFirmaBusy(true); setEnFirmeErr("");
    try{
      // El reto se pide DENTRO del try: si el dispositivo no verifica,
      // el fallo se lee igual que cualquier otro y no deja el botón
      // girando.
      const prueba = bio
        ? { asercion: await pedirAsercion("acuerdo", d.id) }
        : { codigo: pass.trim() };
      const r = await llamar("ponerEnFirme", {
        opId: d.id, correo,
        nombre: String((typeof nombreDe === "string" ? nombreDe : null) ?? enFirmeNombre).trim() || null,
        // ← NUEVO (17 nov): si se pidió el enlace a propósito. Sin
        // esto el servidor se niega cuando el correo no tiene cuenta,
        // que es justo lo que queremos al pulsar «Dar acceso», y lo
        // contrario de lo que queremos al pulsar «mandar a alguien
        // sin cuenta».
        conEnlace: conEnlace === true,
        ...prueba,
      });
      setD(r.doc); setPass("");
      setEnFirmeCorreo(""); setEnFirmeNombre("");
      setMIn(""); setShareErr(""); setShareFound(null); setShareRol("involucrado");
      await refresh();

      // ── LA PANTALLA DEL ENLACE, SÓLO SI HAY ENLACE (17 nov) ──
      //
      // El servidor ya decide: crea el enlace cuando esa persona no
      // tiene cuenta, o cuando se pidió a propósito. Si tiene cuenta
      // y no se pidió, `r.enlace` viene vacío y esto cierra el modal
      // con su aviso, que es lo que tenía que haber hecho siempre.
      //
      // Lo de antes mostraba el enlace SIEMPRE, con un comentario mío
      // que decía «el enlace no estorba a quien sí [tiene cuenta]».
      // Estorba: Ricardo compartió a alguien con cuenta, vio la
      // pantalla que dice «mándale esto para que lo firme» y entendió
      // que la plataforma no lo había mandado.
      if(r.enlace){
        setEnlaceNuevo({
          url: enlaceDeEntrega(r.enlace.testigo),
          expiraEn: r.enlace.expiraEn,
          paraFirmar: true, correo: correo || null,
          // ← CAMBIADO (17 nov): «esa persona no tiene cuenta» sólo
          // se puede decir si hubo una persona que buscar. Sin correo
          // el servidor no comprobó nada, y afirmarlo sería inventar.
          sinCuenta: Boolean(correo) && r.tieneCuenta === false,
        });
        setModal({ t:"share" });
        notify("Contrato firmado y listo para mandar \u2713");
      }else{
        setModal(null);
        notify(`Contrato mandado a firmar a ${correo} ✓`);
      }
    }catch(e){ console.error(e); setEnFirmeErr(textoDeFallo(e)); }
    finally{ setFirmaBusy(false); }
  };

  const aceptarElContrato = async(conBio=false)=>{
    if(!enServidor()){ notify("Esto necesita el servidor activo","err"); return; }
    // ← NUEVO (12 nov): `=== true`, no a secas.
    //
    // Este es el que rompió de verdad. El botón estaba puesto como
    // `onClick={aceptarElContrato}`, así que aquí llegaba el evento
    // del clic, que es truthy, y la función creía que se le había
    // pedido biometría. Resultado: te pedía la huella y no miraba tu
    // código nunca, por mucho que lo escribieras.
    const bio = conBio === true;
    if(bio && !bioCreds.length){ notify("No tienes biometría activada","err"); return; }
    if(!bio && pass.trim().length<4){ notify("Escribe tu código de firma","err"); return; }
    setFirmaBusy(true);
    try{
      const prueba = bio
        ? { asercion: await pedirAsercion("acuerdo", d.id) }
        : { codigo: pass.trim() };
      const r = await llamar("aceptarContrato", { opId: d.id, ...prueba });
      setD(r.doc); setModal(null); setPass("");
      await refresh();
      notify("Aceptaste el contrato ✓");
    }catch(e){ console.error(e); notify(textoDeFallo(e),"err"); }
    finally{ setFirmaBusy(false); }
  };

  const rechazarElContrato = async()=>{
    if(!enServidor()){ notify("Esto necesita el servidor activo","err"); return; }
    if(!rechMotivo){ notify("Elige un motivo","err"); return; }
    setFirmaBusy(true);
    try{
      const r = await llamar("rechazarContrato", {
        opId: d.id, motivo: rechMotivo, detalle: rechDetalle.trim() || null,
      });
      setD(r.doc); setModal(null);
      setRechMotivo(""); setRechDetalle("");
      await refresh();
      notify("Mandamos tu respuesta");
    }catch(e){ console.error(e); notify(errorBackend(e),"err"); }
    finally{ setFirmaBusy(false); }
  };

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
    //
    // ← ACTUALIZADO (10 nov): y un solo REQUISITO. Antes esto dejaba
    // pasar otro requisito del mismo contrato; Ricardo lo cerró, y con
    // razón: son dos obligaciones distintas cobradas con un solo
    // papel. Esto es comodidad —el servidor lo vuelve a comprobar en
    // `puertaDelVinculo`—, pero es donde se lee el motivo a tiempo.
    const yaUsado = dondeEstaAdjunto(d.id, exps||[])
      .filter(x=> !(x.expId===exp.id && x.reqId===reqId));
    if(yaUsado.length){
      const u = yaUsado[0];
      setLinkErr(u.expId===exp.id
        ? `Ya está adjuntado en «${u.reqTitulo}», de este mismo contrato. Un comprobante sólo se usa una vez: retíralo de ahí antes de ponerlo aquí.`
        : `Ya está adjuntado a «${u.expTitulo}». Un comprobante sólo se usa una vez: retíralo de ahí antes de adjuntarlo a otro contrato.`);
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
                      subidoEn:new Date().toISOString(), subidoPor:user, subidoPorUid:uid };
      // Vincular un documento propio ES entregar, así que pasa por la
      // misma regla: si el requisito pide visto bueno, queda
      // «por-revisar» igual que un PDF suelto. Dejarlo fuera habría
      // premiado la versión con menos revisión.
      const requisitos = exp.requisitos.map(r=> r.id!==reqId ? r : {
        ...quitarArchivoViejo(r),
        archivos:[...archivosDe(r), nuevo],
        estado: estadoDe(r, [...archivosDe(r), nuevo]),
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

      // ← NUEVO (2 nov): si esta segunda escritura falla, se dice.
      //
      // Adjuntar escribe en DOS sitios: el contrato y el documento de
      // origen. Antes, si el segundo fallaba, esto hacía `if(src)` y
      // seguía como si nada: el comprobante aparecía adjunto, nadie se
      // enteraba, y la consecuencia —que la otra parte no pueda
      // abrirlo, porque es aquí donde se escribe de qué contrato es
      // evidencia— salía horas después como un «no tienes acceso» sin
      // relación aparente con esto. Nos costó una tarde entera.
      if(src) setD(src);
      else notify("Se adjuntó al contrato, pero no quedó asentado en este documento. "
        + "La otra parte podría no poder abrirlo: retíralo y vuelve a adjuntarlo.", "err");

      setModal(null); setLinkExp(null);
      refresh();   // ← NUEVO: así el aviso de duplicado aparece de inmediato
      notify(`Adjuntado a «${exp.title}» ✓`);
    }catch(e){ console.error(e); setLinkErr("Error al adjuntar."); }
    finally{ setLinkBusy(false); }
  };

  // ← NUEVO: retirar el acceso también queda asentado en la cadena
  // ← NUEVO (21 oct): cambiarle el rol a alguien que ya tiene acceso.
  //
  // `doShare` ya sabía hacerlo, pero sólo desde el modal de compartir:
  // había que volver a escribir el correo de alguien que ya está en la
  // lista para cambiarle una cosa. Esto es lo mismo sin ese rodeo, y
  // es lo que usan las pestañas de accesos.
  const [rolBusy,setRolBusy] = useState("");
  const cambiarRol = async(correo, rol)=>{
    if(!correo || !rol) return;
    if(rolDe(d, null, correo) === rol) return;
    setRolBusy(correo);
    try{
      if(enServidor()){
        const r = await compartirServidor(d.id, correo, rol);
        setD(r.doc); notify(`${correo} entra ahora como ${ROL_TEXTO[rol]} ✓`);
        return;
      }
      const up = await aplicar(d, {
        accion:"COMPARTIDO",
        contenido:`Rol de ${correo} cambiado a ${ROL_TEXTO[rol]}`,
        meta:{ tipo:"cambio", correo, rol },
      }, { roles:{ ...(d.roles||{}), [correo]: rol } }, { autor:user, autorUid:uid });
      if(up){ setD(up); notify(`${correo} entra ahora como ${ROL_TEXTO[rol]} ✓`); }
      else notify("No se pudo guardar","err");
    }catch(e){ console.error(e); notify(errorBackend(e),"err"); }
    finally{ setRolBusy(""); }
  };

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
    try{
      // ← ACTUALIZADO (25 oct): el servidor decide si esto se borra
      // de verdad o sólo se quita de tu lista, y lo dice de vuelta.
      // El aviso tiene que contar lo que pasó, no lo que se pidió.
      const r = await store.del(id);
      await refresh();
      setModal(null);
      notify(r?.borrado === false
        ? "Quitado de tu lista. El documento sigue existiendo."
        : "Documento eliminado");
    }catch(e){
      console.error(e);
      // ← ACTUALIZADO (11 oct): el motivo en un modal, no en un aviso
      // que se va solo.
      //
      // El servidor sólo deja borrar al dueño. Quien intentaba borrar
      // un documento que le compartieron veía «Error» de paso, abajo
      // a un lado, y el documento seguía en su lista sin explicación.
      // Cada línea dice algo distinto: el título qué pasó, el texto
      // por qué, y el detalle qué se puede hacer en su lugar.
      const dueno = String(e?.code||"").endsWith("permission-denied");
      setModal({
        t: "aviso",
        titulo: dueno ? "Sólo el dueño puede eliminarlo" : "No se pudo eliminar",
        texto: dueno
          ? "Este documento te lo compartieron. Borrarlo lo quitaría también para quien lo creó y para todos los demás con acceso."
          : errorBackend(e),
        detalle: dueno
          ? "Pídele a quien lo creó que lo elimine, o que te retire el acceso."
          : null,
      });
    }
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
    const { doc: dd, motivo } = await store.get(id, { conMotivo:true });
    // ← ACTUALIZADO (23 oct): decía «No encontrado» y dejaba la tarjeta
    // ahí, así que volvías a darle y volvía a no pasar nada.
    //
    // Pasa cuando el documento ya no existe: la regla de Firestore
    // pregunta por los datos del documento, y si no hay documento no
    // hay datos, así que contesta «permiso denegado» en vez de «no
    // existe». Desde fuera parece un problema de permisos y es una
    // tarjeta fantasma.
    //
    // Refrescar la lista la quita de en medio, que es lo que uno
    // esperaría que pasara solo.
    //
    // ← AFINADO: «permiso denegado» tampoco distingue entre BORRADO y
    // ACCESO RETIRADO —en los dos casos la regla no tiene datos que
    // mirar—, así que el aviso no puede afirmar ninguno de los dos.
    // Decir «ya no está» de un documento al que simplemente te
    // retiraron el acceso es la misma mentira con otro traje: el
    // documento existe y su dueño lo ve. Lo que sí se puede separar es
    // un tropiezo de red, y ése no merece ni refresco ni alarma.
    if(!dd){
      if(motivo === "fallo"){
        notify("No se pudo abrir ahora mismo. Revisa tu conexión e inténtalo de nuevo.","err");
        return;
      }
      notify("Ya no puedes abrir ese documento: o lo borraron, o te retiraron el acceso.","err");
      await refresh();
      return;
    }
    setFocoDup(foco);
    setD(dd); setTitle(dd.title); setContent(dd.content||"");
    setFields(dd.fields||{}); setSecciones(seccionesDe(dd));    // ← NUEVO
    setFilesOpen(false);                                        // ← NUEVO: se re-bloquea al abrir otro
    setVinculos({});                                            // ← NUEVO: limpia el anterior
    setFaseSel(null);                                           // ← NUEVO
    setExpTab("expediente");                                    // ← NUEVO: siempre se entra por la primera
    setDocTab("documento");                                     // ← NUEVO: igual para el documento
    // ← NUEVO (25 oct): un borrador se abre editando. Es a lo que se
    // entra: no hay nada que leer todavía, y pedir un clic más en
    // «Editar» para seguir escribiendo lo que dejaste a medias sobra.
    setUnlocked(!estaProtegido(dd)); setEdit(esBorradorContrato(dd)); setDirty(false);
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
    // ← CAMBIADO (15 nov): un documento de texto no tiene requisitos,
    // así que estos dos frenos sólo valen para un expediente. Sin
    // esta línea, «mandar a alguien sin cuenta» en un documento de
    // texto contestaba «no falta ningún comprobante por entregar»,
    // que además de ser inútil es confuso: nadie había pedido
    // ninguno. El propósito del enlace lo decide el SERVIDOR leyendo
    // el documento; de aquí no se manda.
    const esExp = d.kind==="expediente";
    const pendientes = (d.requisitos||[]).filter(r=>r.estado!=="cumplido");
    if(esExp && shareTodo && pendientes.length === 0){
      notify("No falta ningún comprobante por entregar","err"); return;
    }
    if(esExp && !shareTodo && shareReqs.length === 0){
      notify("Elige al menos un comprobante","err"); return;
    }
    setSaving(true);
    try{
      const r = await llamar("crearInvitacion", {
        opId: d.id,
        todoLoQueFalta: esExp ? !!shareTodo : false,
        reqIds: (esExp && !shareTodo) ? shareReqs : [],
        correo: (mIn||"").trim() || null,
        dias: invDias || 7,
      });
      setD(r.doc);
      setEnlaceNuevo({
        url: enlaceDeEntrega(r.testigo),
        requisitos: r.requisitos || [],
        proposito: r.proposito || "entrega",
        correo: (mIn||"").trim() || null,
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

  // ← NUEVO (25 oct): crear una carpeta y dejarla seleccionada.
  //
  // Si ya existía no es un error: lo que quiere quien la escribió es
  // guardar ahí, así que se selecciona la que ya había y a correr.
  // Regañar por pedir algo que ya está hecho es de las cosas que más
  // molestan de un formulario.
  const crearCarpeta = (nombre)=>{
    const r = revisarCarpeta(nombre, folders);
    if(!r.ok){ setCarpErr(r.error); return; }
    if(!r.yaEsta) setFolders(conCarpeta(folders, r.nombre));
    setMIn2(r.nombre);
    setCarpNueva(null); setCarpErr("");
    notify(r.yaEsta ? `Ya tenías «${r.nombre}». La dejo seleccionada.` : `Carpeta «${r.nombre}» creada ✓`);
  };

  const copiarEnlace = (url)=>{
    navigator.clipboard.writeText(url);
    notify("Enlace copiado ✓");
  };

  const copyLink = (id)=>{
    navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?doc=${id||d.id}`);
    notify("Enlace copiado ✓");
  };

  // ← NUEVO (22 oct): lo que otra gente hizo contigo, derivado de los
  // documentos que ya están cargados. Una tabla de «leídos» habría que
  // escribirla, limpiarla, y se desincroniza entre el teléfono y la
  // computadora; esto no, porque no existe. Ver `nucleo/notificaciones.js`.
  const notis = notificacionesDe(docs, { uid, email: acctEmail, descartes });

  // Se guarda en los dos sitios: en el navegador para que el aviso
  // desaparezca en el acto, y en la cuenta para que siga quitado en el
  // teléfono. Si la red falla, el de aquí ya está puesto y la próxima
  // entrada vuelve a intentar subirlo al fundir.
  const guardarDescartes = (mapa)=>{
    setDescartes(mapa);
    guardarLocales(uid, mapa);
    saveProfile(uid, { descartes: mapa });
  };
  const quitarNoti = (n)=>{
    guardarDescartes(descartar(descartes, n));
    setUltimaQuitada(n);
  };
  const deshacerNoti = ()=>{
    if(!ultimaQuitada) return;
    guardarDescartes(recuperar(descartes, ultimaQuitada.clave));
    setUltimaQuitada(null);
  };
  // Al volver a abrir la campana, el «deshacer» de la vez pasada ya no
  // viene a cuento: se quito hace rato y se dio por bueno.
  const olvidarUndo = ()=> setUltimaQuitada(null);

  // Todo lo que las pantallas y modales necesitan del estado y los manejadores.
  const ctx = {
    MAX_IMGS, moveTo, acctEmail, addImage, adjuntarOriginal, attachEvidence, authBusy, authMode, authStep,
    bioBusy, bioCreds, bioOk, cancelarSolicitud, closeCreate, confirmarConversion,
    content, convOculto, copyLink, creando, crearBorrador, createDoc, createExpediente, createStep, d, delDoc, doLogin,
    expTab, setExpTab, tplInfo, setTplInfo, desbloqueando,
    // ← NUEVO (21 oct): secciones apagables y cambio de rol en sitio.
    secciones, setSecciones, cambiarRol, rolBusy,
    carpNueva, setCarpNueva, carpErr, setCarpErr, crearCarpeta,
    aplicarEstilo, estiloAct,
    docTab, setDocTab,
    // ← NUEVO (22 oct): la campana.
    notis, campanaOpen, setCampana,
    quitarNoti, deshacerNoti, ultimaQuitada, olvidarUndo,
    abrirEnlace, cerrarEnlace, guardarEnlace, entregarEnlaceReq,
    enlReq, enlUrl, enlNom, enlErr, enlBusy, setEnlUrl, setEnlNom,
    doLogout, doReset, doShare, doSignCode, doSignup, doVerify, docs, dragOver, drop,
    dropFase, dropReq, editMode, email, enrollBio, exportarPaquete, exps, faseSel,
    dejarDeVerDoc,
    subiendoReq, setFasesEnOrden, carpAbierta, setCarpAbierta,
    orden, setOrden, busca, setBusca,
    fields, filesOpen, filterF, finishAuth, focoDup, folders, getFile, goHome,
    handleFile, histOpen, histTab, imp, impErr, impMeta, impText, iniciarConversion,
    irADuplicado, linkBusy, linkErr, linkExp, linkSitios, linkToExpediente, lockInput,
    mIn, mIn2, menuOpen, method, modal, notif, notify, ocultarConvertir, ocupado, onDrop, openCreate, openDoc,
    openExpedientes, openSec, pass, puedeConvertir, removeEvidence,
    corregirOriginal, corrigiendo,
    removeImage, resetImport, revokeShare, runAnalysis, save, saveSettings, saving,
    setContent, setCreateStep, setD, setDirty, setDragOver, setDrop, setEdit, setEmail,
    setFaseSel, setFields, setFilesOpen, setFilterF, setFocoDup, setFolders, setHist,
    setHistTab, setLinkErr, setLinkExp, setLock, setLockInput, setMIn, setMIn2, setMenu,
    setMethod, setModal, setOpenSec, setPass, setShareErr, setShareFound,
    setShowHashes, setSmartErr, setSmartRes, setSmartText, setSolMsg,
    renombrar, pedirRedaccion, usarRedaccion, redBusy, redRes,
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
    // ← ACTUALIZADO (18 oct): el rol dice quién eres; el estado del
    // acuerdo dice si lo que pides tiene sentido ahora. Va aquí, en el
    // único sitio donde la interfaz pregunta «¿puedo?», para no tener
    // que acordarse en cada botón.
    puedo: (accion)=> !bloquea(d, accion) && puede(rolDe(d, uid, acctEmail), accion),
    puedoSubirA: (reqId)=> !bloquea(d, "subir")
      && puedeSubirA(d, rolDe(d, uid, acctEmail), acctEmail, reqId),
    acu, esperaMiFirma, decision,
    mandarAFirmar, aceptarElContrato, rechazarElContrato,
    firmaBusy, rechMotivo, setRechMotivo, rechDetalle, setRechDetalle,
    enFirmeCorreo, setEnFirmeCorreo, enFirmeNombre, setEnFirmeNombre,
    enFirmeErr,
    verificado, verifBusy, reenviarVerificacion, comprobarVerificacion,
    verificarFiscal, verificandoFiscal,
    revisarProveedores, revisando69B, hallazgos69B,
    invitacion, invError, invBusy, invPaso, invSubiendo, entregas, entregar,
    invNombre, setInvNombre, aceptarInvitacion, invAceptando, invAceptError,
    invRechazando, setInvRechazando, invMotivo, setInvMotivo, rechazarInvitacion,
    invClave, setInvClave, abrirConClave, invClaveBusy, invClaveErr,
    reqTitulo, setReqTitulo, reqDesc, setReqDesc, reqBusy, reqErr,
    pedirRequisito, guardarRequisito, quitarEsteRequisito, confirmarQuitarRequisito,
    reqVisto, setReqVisto,
    revisando, aprobarEntrega, pedirRechazo, confirmarRechazo,
    rechMotivoAdj, setRechMotivoAdj,
    firmarInvitacion,
    crearEnlace, verEnlaces, revocarEnlace, copiarEnlace, enlaces,
    enlaceNuevo, setEnlaceNuevo, invDias, setInvDias, avisos,
    accCaso: accion?.caso || null, accEstado, accCorreo, accError, accBusy,
    accPass, setAccPass, accPass2, setAccPass2,
    guardarContrasena, irALaApp, pedirOtroEnlace,
  };

  // ── RENDER: ENLACE DEL CORREO ──
  // Antes que todo lo demás, incluso que la entrega: quien llega por
  // un enlace de contraseña no tiene sesión, y la pantalla de acceso
  // en medio sería justo lo que no puede hacer.
  if(accion) return (<><style>{ESTILOS}</style>{renderAccion(ctx)}</>);

  // ── RENDER: ENTREGA POR ENLACE ──
  // Va primero a propósito: quien llega con un enlace no tiene cuenta,
  // y no tiene por qué toparse con la pantalla de acceso.
  if(testigo) return renderEntrega(ctx);

  // ── RENDER: LOADING ──
  if(screen==="loading") return (<><style>{ESTILOS}</style>
    {/* ← ACTUALIZADO (14 oct): decía «Conectando con la cadena…».
        Nombraba la pieza de adentro, no lo que el usuario está
        esperando, y a quien entra por primera vez «la cadena» no le
        dice nada. */}
    <div className="loading"><div className="spin"/><p>Cargando documentos…</p></div></>);

  // ── RENDER: AUTH ──
  if(screen==="auth") return renderAcceso(ctx);

  // ── RENDER: HOME ──
  if(screen==="home") return renderInicio(ctx);

  // ── RENDER: REVISIÓN DEL CONTRATO ──
  // Va antes que el documento: mientras tengas algo que decidir sobre
  // este contrato, lo primero es el contrato. Al expediente se entra
  // después de haberlo aceptado.
  if(decision) return (<><style>{ESTILOS}</style>{renderRevision(ctx)}</>);

  // ── RENDER: DOC ──
  return renderDocumento(ctx);
}
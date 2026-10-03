// El panel de la e.firma, en su propio archivo: el despachador de
// modales exporta funciones, no componentes, y mezclar las dos cosas
// rompe la recarga en caliente de Vite.

import { useState } from "react";
import { llamar, errorBackend } from "../nucleo/backend";
import { firmarConEfirma, enPalabras } from "../nucleo/efirma";

/** Los dos archivos, la contraseña y el proceso completo. */
export function PanelEfirma({ ctx }){
  const { d, notify, setD, setModal } = ctx;

  const [cer, setCer]     = useState(null);
  const [key, setKey]     = useState(null);
  const [clave, setClave] = useState("");
  const [paso, setPaso]   = useState("");
  const [err, setErr]     = useState("");
  const [busy, setBusy]   = useState(false);

  const listo = cer && key && clave.trim() && !busy;

  const tomar = (set, termina) => async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";                       // deja volver a elegir el mismo
    if(!f) return;
    setErr("");
    if(!f.name.toLowerCase().endsWith(termina)){
      setErr(`Ese archivo no termina en ${termina}. Busca el que sí.`);
      return;
    }
    if(f.size > 20 * 1024){                    // una e.firma pesa 1–3 KB
      setErr("Ese archivo es demasiado grande para ser parte de una e.firma.");
      return;
    }
    set({ nombre: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
  };

  const cerrar = () => {
    setClave("");                              // no se queda en memoria
    setModal(null);
  };

  const firmar = async () => {
    setErr(""); setBusy(true); setPaso("Preparando…");
    try{
      // 1. El servidor dice qué hay que firmar. Va atado a este
      //    expediente, a su último bloque y a un reto de un solo uso.
      const { hashHex } = await llamar("retoEfirma", { opId: d.id });

      // 2. Se firma aquí. La llave descifrada vive dentro de esta
      //    llamada y no sale de ella.
      const r = await firmarConEfirma({
        cer: cer.bytes, key: key.bytes, contraseña: clave, hashHex, onPaso: setPaso,
      });

      // 3. El servidor comprueba la firma y la cadena hasta el SAT.
      setPaso("Comprobando con los certificados del SAT…");
      const res = await llamar("firmarConEfirma", {
        opId: d.id, certificado: r.certificado, firma: r.firma,
      });

      setD(res.doc);
      setClave("");
      setModal(null);
      notify(`✦ Firma con e.firma registrada · ${res.firmante?.rfc || ""}`);
    }catch(e){
      console.error(e);
      // Los errores del servidor ya vienen en palabras; los de aquí
      // los traduce el propio módulo de la e.firma.
      setErr(String(e?.code || "").startsWith("functions/") ? errorBackend(e) : enPalabras(e));
    }finally{
      setBusy(false); setPaso("");
    }
  };

  return (
    <div className="ov" onClick={()=>{ if(!busy) cerrar(); }}>
      <div className="modal efirma" onClick={e=>e.stopPropagation()}>
        <h2>Firmar con tu e.firma</h2>
        <p className="sub">
          La misma e.firma con la que presentas declaraciones ante el SAT.
          Queda constancia de que firmaste tú, comprobable por cualquiera.
        </p>

        <div className="efirma-aviso">
          Tus archivos <strong>no se suben</strong>. La firma se hace en este
          dispositivo; al servidor sólo llega el certificado, que es público.
        </div>

        <label className="efirma-archivo">
          <span className="ea-t">Certificado <code>.cer</code></span>
          <span className={`ea-v ${cer?"on":""}`}>{cer ? cer.nombre : "Elegir archivo…"}</span>
          <input type="file" accept=".cer" onChange={tomar(setCer, ".cer")} disabled={busy}/>
        </label>

        <label className="efirma-archivo">
          <span className="ea-t">Llave privada <code>.key</code></span>
          <span className={`ea-v ${key?"on":""}`}>{key ? key.nombre : "Elegir archivo…"}</span>
          <input type="file" accept=".key" onChange={tomar(setKey, ".key")} disabled={busy}/>
        </label>

        <input className="inp" type="password" placeholder="Contraseña de la llave privada"
          value={clave} onChange={e=>setClave(e.target.value)} disabled={busy}
          onKeyDown={e=>{ if(e.key==="Enter" && listo) firmar(); }}/>

        {paso && <div className="efirma-paso"><span className="spin-min"/>{paso}</div>}
        {err && <div className="efirma-err">{err}</div>}

        <div className="modal-row">
          <button className="btn btn-secondary" onClick={cerrar} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary" onClick={firmar} disabled={!listo}>
            {busy ? "Firmando…" : "Firmar"}
          </button>
        </div>

        <p className="efirma-pie">
          ¿No sabes dónde están? Son los dos archivos que te dio el SAT cuando
          tramitaste tu e.firma, normalmente en tu computadora.
        </p>
      </div>
    </div>
  );
}

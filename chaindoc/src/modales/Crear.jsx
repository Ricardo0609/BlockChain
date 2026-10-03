// Modal para crear documentos y contratos inteligentes.

import { ACCEPTED_DOCS, ACCEPTED_IMAGES } from "../fileImport";
import { Icon } from "../ui/iconos";
import { METHODS, TEMPLATES } from "../nucleo/catalogos";
import { aiConfigured, listModels } from "../smartContract";
import { fmtFecha } from "../nucleo/formato";

export function modalCrear(ctx){
  const {
    closeCreate, createDoc, createExpediente, createStep, dragOver, dropFase, dropReq,
    folders, handleFile, imp, impErr, impMeta, impText, mIn, mIn2, method, modal,
    onDrop, resetImport, runAnalysis, setCreateStep, setDragOver, setMIn, setMIn2,
    setMethod, setSmartErr, setSmartRes, setSmartText, setTpl, smartBusy, smartErr,
    smartMsg, smartRes, smartText, tpl,
  } = ctx;
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
        <div className="tpl-grid tres">
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

  return null;
}
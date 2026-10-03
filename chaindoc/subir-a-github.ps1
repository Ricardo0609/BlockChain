# ============================================================
#  chaindoc - subir-a-github.ps1
#
#      .\subir-a-github.ps1
#      .\subir-a-github.ps1 -Mensaje "lo que quieras poner"
#
#  Prepara el repositorio, REVISA que no se vaya nada que no deba, te
#  ensena exactamente que va a subir, y solo sube si escribes SUBIR.
#
#  POR QUE SE DETIENE A PREGUNTAR
#
#  Lo que se sube a GitHub es muy dificil de borrar de verdad: aunque
#  despues quites el archivo, queda en el historial, y si el repositorio
#  es publico hay robots leyendo commits nuevos a los pocos segundos.
#  Una llave filtrada no se arregla borrandola: se arregla rotandola.
#
#  Por eso aqui no hay "subir y ya". Hay: preparar, ensenar, confirmar.
#
#  Lo que NUNCA deja pasar:
#    node_modules/        (600 MB de dependencias que se instalan solas)
#    dist/                (lo compilado; Render lo genera el solo)
#    .env, .env.local     (ahi vive la llave de Gemini)
#    serviceAccount*.json, *-adminsdk-*.json  (llaves de servidor)
#    *.pem, *.p12
#    cualquier texto que parezca una llave privada
# ============================================================

param(
  [string]$Mensaje = ""
)

$ErrorActionPreference = "Continue"

if(-not (Get-Command git -ErrorAction SilentlyContinue)){
  Write-Host "No tienes git instalado. Bajalo de https://git-scm.com/download/win" -ForegroundColor Red
  return
}

if(-not (git config --global user.email)){
  Write-Host ""
  Write-Host "Git todavia no sabe quien eres. Corre una vez:" -ForegroundColor Yellow
  Write-Host '   git config --global user.name "Ricardo Garcia"' -ForegroundColor Gray
  Write-Host '   git config --global user.email "tu@correo.com"' -ForegroundColor Gray
  Write-Host ""
  return
}

# -- Encontrar el repositorio ---------------------------------
$repo = $null
$d = (Get-Location).Path
while($d -and -not $repo){
  if(Test-Path (Join-Path $d ".git")){ $repo = $d }
  else { $d = Split-Path $d -Parent }
}
if(-not $repo){
  Write-Host ""
  Write-Host "Esta carpeta todavia no es un repositorio de git." -ForegroundColor Yellow
  Write-Host ""
  Write-Host "Si ya tienes el repositorio BlockChain en GitHub, parate en la carpeta" -ForegroundColor White
  Write-Host "que quieres subir y corre, una sola vez:" -ForegroundColor White
  Write-Host ""
  Write-Host "   git init" -ForegroundColor Gray
  Write-Host "   git remote add origin https://github.com/TU-USUARIO/BlockChain.git" -ForegroundColor Gray
  Write-Host "   git branch -M main" -ForegroundColor Gray
  Write-Host ""
  Write-Host "Y despues vuelve a correr este script." -ForegroundColor White
  return
}

Write-Host ""
Write-Host "  Repositorio: $repo" -ForegroundColor Cyan

# -- Las reglas de lo que no se sube --------------------------
$reglas = @(
  "# -- Puesto por subir-a-github.ps1 --",
  "",
  "# Dependencias: se instalan solas con npm install.",
  "node_modules/",
  "",
  "# Lo compilado: Render lo genera en cada despliegue.",
  "dist/",
  "mock/dist/",
  "",
  "# Variables de entorno. Aqui vive la llave de Gemini.",
  ".env",
  ".env.*",
  "!.env.example",
  "",
  "# Llaves de servidor de Firebase.",
  "serviceAccount*.json",
  "*-adminsdk-*.json",
  "*.pem",
  "*.p12",
  "",
  "# Scripts de instalacion de sesiones pasadas: no son del proyecto,",
  "# son el envoltorio con el que llegaron los archivos.",
  "instalar-*.ps1",
  "aplicar-*.ps1",
  "",
  "# Basura de herramientas.",
  ".firebase/",
  "*.log",
  "npm-debug.log*",
  ".DS_Store",
  "Thumbs.db",
  ".vscode/",
  ".idea/"
)

$rutaIgnore = Join-Path $repo ".gitignore"
$actual = if(Test-Path $rutaIgnore){ @(Get-Content $rutaIgnore) } else { @() }

# Se mira si falta alguna regla de verdad (las lineas en blanco y los
# comentarios no cuentan).
$importantes = $reglas | Where-Object { $_ -and -not $_.StartsWith("#") }
$faltan = @($importantes | Where-Object { $actual -notcontains $_ })

if($faltan.Count -gt 0){
  $nuevo = if($actual.Count -gt 0){ $actual + @("") + $reglas } else { $reglas }
  # UTF-8 sin BOM: un BOM al principio del .gitignore se pega a la primera
  # linea y esa regla deja de aplicar.
  $sinBom = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($rutaIgnore, ($nuevo -join "`n") + "`n", $sinBom)
  Write-Host "  .gitignore actualizado ($($faltan.Count) reglas nuevas)" -ForegroundColor Green
} else {
  Write-Host "  .gitignore ya estaba completo" -ForegroundColor DarkGray
}

# -- Volver a aplicar las reglas a lo que ya estuviera dentro -
# Sin esto, un node_modules que se subio una vez sigue subiendose
# aunque este en .gitignore: git no deja de seguir lo que ya seguia.
Write-Host "  Aplicando las reglas a lo que ya estaba..." -ForegroundColor DarkGray
git -C $repo rm -r --cached . --quiet 2>$null | Out-Null
git -C $repo add -A 2>$null | Out-Null

# -- Que va a subir -------------------------------------------
$todos = @(git -C $repo ls-files)
if($todos.Count -eq 0){
  Write-Host "  No hay nada que subir." -ForegroundColor Yellow
  return
}

function EsPeligroso($p){
  if($p -match "(^|/)node_modules/")        { return "dependencias de node" }
  if($p -match "(^|/)dist/")                { return "carpeta compilada" }
  if($p -match "(^|/)\.env$")               { return "variables de entorno" }
  if($p -match "(^|/)\.env\." -and $p -notmatch "\.env\.example$"){ return "variables de entorno" }
  if($p -match "serviceAccount.*\.json$")   { return "llave de servidor" }
  if($p -match "adminsdk.*\.json$")         { return "llave de servidor" }
  if($p -match "\.(pem|p12|pfx)$")          { return "llave o certificado" }
  return $null
}

$bloqueados = @()
foreach($p in $todos){
  $motivo = EsPeligroso $p
  if($motivo){ $bloqueados += [pscustomobject]@{ Archivo = $p; Motivo = $motivo } }
}

# -- Buscar llaves dentro del texto ---------------------------
# Hay tres sitios donde estas palabras aparecen A PROPOSITO, y hay que
# saltarlos o el revisor se grita a si mismo:
#
#  . src/firebase.js          - trae la configuracion web de Firebase, que
#                               incluye algo con forma de llave. NO es
#                               secreta: Firebase la publica en toda app
#                               web, y lo que protege los datos son las
#                               reglas de Firestore.
#  . pruebas/fixtures/        - certificados sinteticos, generados para las
#                               pruebas. Nunca una e.firma de verdad.
#  . pruebas/recorrido.test.js - la prueba que comprueba que el paquete de
#                               evidencia NO lleve secretos dentro; para
#                               eso tiene que nombrarlos.
#  . este mismo script        - lleva la lista de lo que busca.
#
# Cada excepcion se cuenta y se dice al final, porque un revisor que calla
# lo que no reviso no sirve de nada.
$textos = @(".js", ".jsx", ".json", ".md", ".txt", ".html", ".css", ".rules", ".yml", ".yaml", ".ps1", ".env")
$sospechas = @()
$saltados = @()

foreach($p in $todos){
  $ext = [IO.Path]::GetExtension($p).ToLower()
  if($textos -notcontains $ext){ continue }
  if($p -match "(^|/)src/firebase\.js$")          { $saltados += $p; continue }
  if($p -match "(^|/)pruebas/fixtures/")           { $saltados += $p; continue }
  if($p -match "(^|/)pruebas/recorrido\.test\.js$"){ $saltados += $p; continue }
  if($p -match "(^|/)subir-a-github\.ps1$")        { $saltados += $p; continue }

  $full = Join-Path $repo $p
  if(-not (Test-Path $full)){ continue }
  if((Get-Item $full).Length -gt 2MB){ continue }

  $t = [IO.File]::ReadAllText($full)
  if($t -match "BEGIN [A-Z ]*PRIVATE KEY"){ $sospechas += "$p  (una llave privada en texto)" }
  elseif($t -match '"private_key"')        { $sospechas += "$p  (parece una llave de servidor de Google)" }
  elseif($t -match "AIza[0-9A-Za-z_\-]{30,}"){ $sospechas += "$p  (algo con forma de llave de Google)" }
  elseif($t -match "(?m)^[A-Z_]*API_KEY\s*=\s*[A-Za-z0-9_\-]{20,}"){ $sospechas += "$p  (una llave en una variable)" }
}

# -- El informe -----------------------------------------------
$pesoTotal = 0
foreach($p in $todos){
  $full = Join-Path $repo $p
  if(Test-Path $full){ $pesoTotal += (Get-Item $full).Length }
}
$mb = [math]::Round($pesoTotal / 1MB, 1)

Write-Host ""
Write-Host "  ---------------------------------------------" -ForegroundColor DarkGray
Write-Host "  Se van a subir $($todos.Count) archivos ($mb MB)" -ForegroundColor Cyan
Write-Host "  ---------------------------------------------" -ForegroundColor DarkGray

$porCarpeta = $todos | ForEach-Object {
  if($_ -match "/"){ ($_ -split "/")[0] + "/" } else { "(raiz)" }
} | Group-Object | Sort-Object Count -Descending

foreach($g in $porCarpeta){
  Write-Host ("    {0,-24} {1,4} archivos" -f $g.Name, $g.Count) -ForegroundColor White
}

if($bloqueados.Count -gt 0 -or $sospechas.Count -gt 0){
  Write-Host ""
  Write-Host "  ALTO. Esto no debe subirse:" -ForegroundColor Red
  Write-Host ""
  foreach($b in $bloqueados){ Write-Host ("    " + $b.Archivo + "   <- " + $b.Motivo) -ForegroundColor Red }
  foreach($s in $sospechas)  { Write-Host ("    " + $s) -ForegroundColor Red }
  Write-Host ""
  Write-Host "  No se subio nada. Copiame esta lista y lo resolvemos." -ForegroundColor Yellow
  Write-Host "  (Si alguno de estos archivos ya se subio antes, la llave que" -ForegroundColor DarkGray
  Write-Host "   tenga dentro hay que cambiarla, no basta con borrar el archivo.)" -ForegroundColor DarkGray
  Write-Host ""
  return
}

Write-Host ""
Write-Host "  Revisado: ni dependencias, ni carpetas compiladas, ni llaves." -ForegroundColor Green
if($saltados.Count -gt 0){
  Write-Host ("  (No se rastrearon " + $saltados.Count + " archivos que nombran esas palabras a proposito:") -ForegroundColor DarkGray
  foreach($x in $saltados){ Write-Host ("     " + $x) -ForegroundColor DarkGray }
  Write-Host "   la configuracion web de Firebase es publica, y los demas son pruebas.)" -ForegroundColor DarkGray
}

# -- Confirmar ------------------------------------------------
$rama = (git -C $repo rev-parse --abbrev-ref HEAD 2>$null)
if(-not $rama -or $rama -eq "HEAD"){ $rama = "main"; git -C $repo branch -M main 2>$null | Out-Null }

$remoto = (git -C $repo remote get-url origin 2>$null)
if(-not $remoto){
  Write-Host ""
  Write-Host "  No hay un destino configurado. Corre una vez:" -ForegroundColor Yellow
  Write-Host "     git remote add origin https://github.com/TU-USUARIO/BlockChain.git" -ForegroundColor Gray
  Write-Host "  y vuelve a correr este script." -ForegroundColor Yellow
  return
}

if(-not $Mensaje){
  $Mensaje = "Etapa 5 completa: anclaje en Bitcoin, e.firma del SAT y recorrido de pruebas"
}

Write-Host ""
Write-Host "  Destino: $remoto" -ForegroundColor White
Write-Host "  Rama:    $rama" -ForegroundColor White
Write-Host "  Mensaje: $Mensaje" -ForegroundColor White
Write-Host ""
$r = Read-Host "  Escribe SUBIR para continuar (cualquier otra cosa cancela)"

if($r -ne "SUBIR"){
  Write-Host "  Cancelado. No se subio nada." -ForegroundColor Yellow
  return
}

# -- Subir ----------------------------------------------------
Write-Host ""
git -C $repo commit -m $Mensaje
if($LASTEXITCODE -ne 0){
  Write-Host "  No habia nada nuevo que guardar, o git pidio algo. Mira el mensaje de arriba." -ForegroundColor Yellow
}

git -C $repo push -u origin $rama
if($LASTEXITCODE -eq 0){
  Write-Host ""
  Write-Host "  Subido." -ForegroundColor Green
  Write-Host "  Si Render ya esta conectado a este repositorio, el despliegue arranca solo." -ForegroundColor DarkGray
} else {
  Write-Host ""
  Write-Host "  El push fallo. Copiame el mensaje de arriba." -ForegroundColor Red
}
Write-Host ""

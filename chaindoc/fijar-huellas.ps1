# ============================================================
#  chaindoc - fijar-huellas.ps1
#
#  Toma una foto del estado actual del proyecto y la deja como
#  referencia, reescribiendo revisar-todo.ps1 con las huellas de TUS
#  archivos.
#
#      .\fijar-huellas.ps1
#
#  POR QUE EXISTE ESTE ARCHIVO
#
#  La primera version de revisar-todo.ps1 traia las huellas calculadas
#  en mi copia del proyecto, no en la tuya. Las dos copias se habian
#  separado -por un salto de linea al final de cada archivo, y por
#  alguna version mas vieja de otro-, asi que el revisor marcaba como
#  "distinto" lo que en realidad estaba bien.
#
#  La referencia tiene que nacer aqui, en tu maquina, el dia que todo
#  esta en verde. A partir de ahi, cualquier cosa que cambie se nota.
#
#  Por eso esto NO fija nada si algo esta roto: una foto de algo roto
#  no sirve de referencia. Corre lint, pruebas y build antes, y si algo
#  falla se detiene.
#
#  Cuando pegues archivos nuevos y todo vuelva a quedar en verde,
#  corre esto otra vez para mover la referencia.
# ============================================================

param([switch]$Forzar)

$ErrorActionPreference = "Continue"

$raiz = $null
$d = (Get-Location).Path
while($d -and -not $raiz){
  if(Test-Path (Join-Path $d "package.json")){ $raiz = $d }
  else { $d = Split-Path $d -Parent }
}
if(-not $raiz){
  Write-Host "No encontre package.json. Abre PowerShell dentro de la carpeta del proyecto." -ForegroundColor Red
  return
}

$ESC = [char]27
function SinColor($t){ return ($t -replace "$ESC\[[0-9;]*m", "") }

Push-Location $raiz

# -- Antes de fijar nada, comprobar que esta todo bien --------
if(-not $Forzar){
  Write-Host ""
  Write-Host "  Comprobando que este todo en verde antes de fijar la referencia..." -ForegroundColor Cyan

  $salida = SinColor (& npm run lint 2>&1 | Out-String)
  if($LASTEXITCODE -ne 0){
    Write-Host "  El estilo no pasa. Arreglalo antes de fijar la referencia." -ForegroundColor Red
    Pop-Location; return
  }
  Write-Host "  OK    estilo" -ForegroundColor Green

  $salida = SinColor (& npm test 2>&1 | Out-String)
  if($LASTEXITCODE -ne 0){
    Write-Host "  Hay pruebas en rojo. Arreglalas antes de fijar la referencia." -ForegroundColor Red
    Pop-Location; return
  }
  $m = [regex]::Match($salida, "Tests\s+(\d+)\s+passed")
  Write-Host ("  OK    pruebas" + $(if($m.Success){ " (" + $m.Groups[1].Value + ")" } else { "" })) -ForegroundColor Green

  $salida = SinColor (& npm run build 2>&1 | Out-String)
  if($LASTEXITCODE -ne 0){
    Write-Host "  No compila. Arreglalo antes de fijar la referencia." -ForegroundColor Red
    Pop-Location; return
  }
  Write-Host "  OK    compilacion" -ForegroundColor Green
}

# -- Recoger los archivos -------------------------------------
$extensiones = @(".js", ".jsx", ".css", ".json", ".rules", ".html", ".md")
$carpetas    = @("src", "functions", "pruebas")
$sueltos     = @("firestore.rules", "storage.rules", "index.html", "vite.config.js", "eslint.config.js")

$lista = New-Object System.Collections.ArrayList

foreach($c in $carpetas){
  $ruta = Join-Path $raiz $c
  if(-not (Test-Path $ruta)){ continue }
  Get-ChildItem -Path $ruta -Recurse -File | ForEach-Object {
    if($_.FullName -like "*\node_modules\*"){ return }
    if($_.Name.StartsWith(".")){ return }
    if($_.Name -eq "package-lock.json"){ return }
    if($extensiones -notcontains $_.Extension.ToLower()){ return }
    [void]$lista.Add($_.FullName.Substring($raiz.Length + 1).Replace("\", "/"))
  }
}
foreach($s in $sueltos){
  if(Test-Path (Join-Path $raiz $s)){ [void]$lista.Add($s) }
}

$lista = @($lista | Sort-Object -Unique)
if($lista.Count -eq 0){
  Write-Host "  No encontre archivos que vigilar. Estas en la carpeta correcta?" -ForegroundColor Red
  Pop-Location; return
}

# -- Calcular las huellas -------------------------------------
$sha  = [System.Security.Cryptography.SHA256]::Create()
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Huella($ruta){
  $bytes = [IO.File]::ReadAllBytes($ruta)
  $txt = [Text.Encoding]::UTF8.GetString($bytes) -replace "`r`n", "`n"
  $h = $sha.ComputeHash($utf8.GetBytes($txt))
  return ([BitConverter]::ToString($h) -replace "-", "").ToLower()
}

$filas = foreach($rel in $lista){
  $p = Join-Path $raiz $rel
  $t = ([IO.File]::ReadAllText($p)) -replace "`r`n", "`n"
  'Revisar "{0}" "{1}" {2}' -f $rel, (Huella $p), (($t -split "`n").Count)
}

# -- Escribir el nuevo revisar-todo.ps1 -----------------------
$hoy = Get-Date -Format "d MMM yyyy"

$cabecera = @(
  '# ============================================================',
  '#  chaindoc - revisar-todo.ps1',
  ('#  Referencia fijada el ' + $hoy + ' en esta maquina, con todo en verde.'),
  '#',
  ('#  Comprueba ' + $lista.Count + ' archivos comparando su HUELLA SHA-256 completa'),
  '#  contra la que tenian cuando se fijo la referencia. Es mas estricto',
  '#  que buscar una marca de texto: una marca no detecta lo que FALTA, y',
  '#  el fallo del 29 de septiembre fue justo ese - un archivo nuevo que',
  '#  era el viejo menos una linea, y la marca seguia ahi.',
  '#',
  '#  Los saltos de linea se normalizan antes de calcular la huella, asi',
  '#  que no importa con que editor se haya guardado el archivo.',
  '#',
  '#  DISTINTO no siempre es un error: si tu cambiaste ese archivo a',
  '#  proposito, es correcto que salga distinto. Cuando vuelva a estar',
  '#  todo en verde, corre .\fijar-huellas.ps1 para mover la referencia.',
  '# ============================================================',
  '',
  '$ErrorActionPreference = "Stop"',
  '',
  '$raiz = $null',
  '$d = (Get-Location).Path',
  'while($d -and -not $raiz){',
  '  if(Test-Path (Join-Path $d "package.json")){ $raiz = $d }',
  '  else { $d = Split-Path $d -Parent }',
  '}',
  'if(-not $raiz){',
  '  Write-Host "No encontre package.json. Abre PowerShell dentro de la carpeta del proyecto." -ForegroundColor Red',
  '  return',
  '}',
  'Write-Host "Proyecto: $raiz" -ForegroundColor Cyan',
  'Write-Host ""',
  '',
  '$sha = [System.Security.Cryptography.SHA256]::Create()',
  '$utf8 = New-Object System.Text.UTF8Encoding($false)',
  '$faltan = 0; $distintos = 0; $iguales = 0',
  '$malos = @()',
  '',
  'function Huella($ruta){',
  '  $bytes = [IO.File]::ReadAllBytes($ruta)',
  '  $txt = [Text.Encoding]::UTF8.GetString($bytes) -replace "`r`n", "`n"',
  '  $h = $sha.ComputeHash($utf8.GetBytes($txt))',
  '  return ([BitConverter]::ToString($h) -replace "-", "").ToLower()',
  '}',
  '',
  'function Revisar($rel, $esperada, $lineas){',
  '  $p = Join-Path $raiz $rel',
  '  if(-not (Test-Path $p)){',
  '    Write-Host ("FALTA     " + $rel) -ForegroundColor Red',
  '    $script:faltan++; $script:malos += $rel; return',
  '  }',
  '  if((Huella $p) -eq $esperada){ $script:iguales++; return }',
  '  $n = ((([IO.File]::ReadAllText($p)) -replace "`r`n","`n") -split "`n").Count',
  '  Write-Host ("DISTINTO  " + $rel + "   (tiene " + $n + " lineas, la referencia tenia " + $lineas + ")") -ForegroundColor Yellow',
  '  $script:distintos++; $script:malos += $rel',
  '}',
  ''
)

$pie = @(
  '',
  'Write-Host ""',
  'if($faltan -eq 0 -and $distintos -eq 0){',
  '  Write-Host ("Todo al dia. " + $iguales + " archivos, ninguno fuera de sitio.") -ForegroundColor Green',
  '} else {',
  '  Write-Host ("Al dia: " + $iguales + "   Distintos: " + $distintos + "   Faltan: " + $faltan) -ForegroundColor Yellow',
  '  Write-Host ""',
  '  Write-Host "Archivos a revisar:" -ForegroundColor Yellow',
  '  foreach($m in $malos){ Write-Host ("   " + $m) -ForegroundColor White }',
  '  Write-Host ""',
  '  Write-Host "Si no los tocaste tu, copiame esta lista." -ForegroundColor White',
  '}',
  ''
)

$todo = ($cabecera + $filas + $pie) -join "`n"
[IO.File]::WriteAllText((Join-Path $raiz "revisar-todo.ps1"), $todo + "`n", $utf8)

Pop-Location

Write-Host ""
Write-Host ("  Referencia fijada: " + $lista.Count + " archivos.") -ForegroundColor Green
Write-Host "  revisar-todo.ps1 quedo escrito con el estado actual." -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Compruebalo:  .\probar-todo.ps1" -ForegroundColor White
Write-Host ""

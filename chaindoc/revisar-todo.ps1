# ============================================================
#  chaindoc - revisar-todo.ps1
#  Referencia fijada el 10 oct. 2026 en esta maquina, con todo en verde.
#
#  Comprueba 101 archivos comparando su HUELLA SHA-256 completa
#  contra la que tenian cuando se fijo la referencia. Es mas estricto
#  que buscar una marca de texto: una marca no detecta lo que FALTA, y
#  el fallo del 29 de septiembre fue justo ese - un archivo nuevo que
#  era el viejo menos una linea, y la marca seguia ahi.
#
#  Los saltos de linea se normalizan antes de calcular la huella, asi
#  que no importa con que editor se haya guardado el archivo.
#
#  DISTINTO no siempre es un error: si tu cambiaste ese archivo a
#  proposito, es correcto que salga distinto. Cuando vuelva a estar
#  todo en verde, corre .\fijar-huellas.ps1 para mover la referencia.
# ============================================================

$ErrorActionPreference = "Stop"

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
Write-Host "Proyecto: $raiz" -ForegroundColor Cyan
Write-Host ""

$sha = [System.Security.Cryptography.SHA256]::Create()
$utf8 = New-Object System.Text.UTF8Encoding($false)
$faltan = 0; $distintos = 0; $iguales = 0
$malos = @()

function Huella($ruta){
  $bytes = [IO.File]::ReadAllBytes($ruta)
  $txt = [Text.Encoding]::UTF8.GetString($bytes) -replace "`r`n", "`n"
  $h = $sha.ComputeHash($utf8.GetBytes($txt))
  return ([BitConverter]::ToString($h) -replace "-", "").ToLower()
}

function Revisar($rel, $esperada, $lineas){
  $p = Join-Path $raiz $rel
  if(-not (Test-Path $p)){
    Write-Host ("FALTA     " + $rel) -ForegroundColor Red
    $script:faltan++; $script:malos += $rel; return
  }
  if((Huella $p) -eq $esperada){ $script:iguales++; return }
  $n = ((([IO.File]::ReadAllText($p)) -replace "`r`n","`n") -split "`n").Count
  Write-Host ("DISTINTO  " + $rel + "   (tiene " + $n + " lineas, la referencia tenia " + $lineas + ")") -ForegroundColor Yellow
  $script:distintos++; $script:malos += $rel
}

Revisar "eslint.config.js" "33dc28b22c2c24247e06413f3a08df3e46ab558c753e25b01e9c7ec86b79d9cc" 27
Revisar "firestore.rules" "d1d9798d9d38d935a457e0ae78f47e74e3054dbc81fa602c117f79aa9805c34a" 188
Revisar "functions/index.js" "791433095e17f714df28e320ad90c671d554daabc9c6bb4b8056e68dae125017" 2368
Revisar "functions/lib/anclaje.js" "b84a76dcb0ce8e38292fd730e2b2c618ca586688aafdc500633a550b6b98acf5" 529
Revisar "functions/lib/bloques.js" "37af412db8ab71795d327e16ae98c47ec373f8bf2cb330c0b84b6b72934476dd" 138
Revisar "functions/lib/cfdi.js" "bd0d3e7fe9bfb824b6c53110f74b0bf8c123fedfebb40fa34e3890f97a8e4cb3" 271
Revisar "functions/lib/efirma.js" "96ac1717cb371e0183f9a082dab2c256813b1a6cde2280ab1ef0fe27981e5066" 230
Revisar "functions/lib/enlaces.js" "fd6b7636f5f3be271cf3c917b98b823f269ab339b888648dd01c8a4875195435" 56
Revisar "functions/lib/expediente.js" "7ba20db781ed21af4a4ee605ed18c9740b7dea82636215b4768b7559601bfaa4" 50
Revisar "functions/lib/ia.js" "2e8b61bab2cbd70f6c259f5432e2dee91fa7d7aea6ab48a849be0974e494c8f0" 280
Revisar "functions/lib/identidad.js" "9753e51807a5ab9526970da93751db293a61edb7a98b14c6921e62f8ea568813" 189
Revisar "functions/lib/invitaciones.js" "baf0fa080b98f103e744a7c5712cf2d0880a152b96ddfe9c673b1065ede51e5d" 185
Revisar "functions/lib/lista69b.js" "b4d6aa69551adfd1a2531c3c4bcc60ccb03736320dc7d01d3bfff895585fec80" 133
Revisar "functions/lib/permisos.js" "bcbd81654bd2d8eca34ee4cda3c7068c36e0fdb747eb5ccd58bbfd4690f191ca" 163
Revisar "functions/lib/revision.js" "51511e39318ea405af04d973ab2aa73f70a67cf7f7ea779a7d8fdb83d4a9567a" 69
Revisar "functions/lib/rfc.js" "7e13188a98627525b485efb7df84eebbeb93ed86d27193bed37e248053c708a9" 134
Revisar "functions/lib/sat.js" "1fb76cd2eadd0e09379dda7f5418478283ed8321d0706a348687ceac87b5df14" 98
Revisar "functions/lib/zip.js" "41a47093d5bc2d1d2318bae827c3c20a1f1783422b0a52f6376316e4d7bf49a6" 120
Revisar "functions/package.json" "bb3d139787437ec411d1456a50b3fafb72679b98c9488d88dcb2202ef0f0170d" 20
Revisar "index.html" "6e006bbcf48e1af46feffcabd6cc705cc4f30f0f8dd785061e25f617e0881290" 20
Revisar "pruebas/anclaje.test.js" "a97a709e7a1bb160b1c1bbbf8313070e939fb9d6ae2df6a6135e738b058be1a1" 344
Revisar "pruebas/anclaje-e2e.test.js" "48da2a354674af81e0d9011540b138e3b769779af6c8316be84af32935589f8d" 146
Revisar "pruebas/archivos.test.js" "2697e28d98b6a1baecbec8d2b615e9dfc1c6549c9c31fe8e2c243395952ed565" 104
Revisar "pruebas/bloques.test.js" "4c67a9dc4f94304de048dadac75bb41645aa25bf1afa8478bda1b04520af7a7b" 133
Revisar "pruebas/cadena.test.js" "7149d1b4a6dcb0220f72ce6bda3634807191bb0349e7f42ea65376d48a814edf" 81
Revisar "pruebas/Catalogos.test.js" "d26af3f1511d6d8c726574d3b4bd0f0c1e89db7d6177acde32cdff88ab7059af" 109
Revisar "pruebas/cfdi.test.js" "8258dba11ccefb98788684425144183f7902e5a484212ff04b93b05c3768554f" 257
Revisar "pruebas/efirma.test.js" "7f7cc73e41bf800168aaf855043274eacaa4acfb9698d4c277ea3ba1a749adf6" 345
Revisar "pruebas/efirma-servidor.test.js" "36830fdf659a62741f5d53273293d6714464a870226ea22b675a45ad5940506a" 270
Revisar "pruebas/enlaces.test.js" "d82003da8e3e1466c819df73b08ce85f5703e1ade255d2f645de58d837ec782f" 261
Revisar "pruebas/expediente.test.js" "3f7731fdc4d42144c76ac96a33dee72d68dd5506de9fd812b68d4c5cfdaef78b" 252
Revisar "pruebas/fixtures/LEEME.md" "40cb87c47eda78fefb4f95006b628ade982c9a496849ba4829b655eda0e9fa69" 28
Revisar "pruebas/ia.test.js" "7c0edd9ff9d5c35c8ae50b44fd49eb177cac4bd78a20692f7e20937eecd37b81" 120
Revisar "pruebas/identidad.test.js" "30138842ee2d7a25592ae3f34afc5c40a0ff7cffde2088f369b1f2f588f15d63" 181
Revisar "pruebas/invitaciones.test.js" "04335e51013491fc14eaf248e3963f12f22f2307bc22f7d53afae50c705d8443" 237
Revisar "pruebas/legal.test.js" "92e878ffabc957d82ecd9268ba709e853d1a78cc3230f6c99b22aa8819ffb17c" 209
Revisar "pruebas/recorrido.test.js" "605b827be7f4ad3406b8ee29e5aab88e92f378d393519ea68599c902a0805827" 621
Revisar "pruebas/revision.test.js" "1efcad11f6763e9be17ed29dfb41444f9dbb9e999cfb62be97316e07c39ec009" 134
Revisar "pruebas/rfc.test.js" "60154e1290f3c443ba89c72be9f9d1c1b86fd3c4d093e99b6262dabfee816ccb" 106
Revisar "pruebas/roles.test.js" "de1b375de2e0228c68c3d5f80c1dd0dff1f74233259270b4cca0c073ea91924b" 189
Revisar "pruebas/sat.test.js" "dd1f4461f4ef9a4f9bae492d89bb725b794b50621b984bf6251d88692766f07f" 172
Revisar "pruebas/servidor.test.js" "1e226925493590822d199ac2d1f6f6ada23219bfdb70deddea9ca14ec8d04fcc" 85
Revisar "pruebas/utilidades.test.js" "3597b6ab98f01afa88c8907f7f7c0d19744952728d308dc84a9bb3304417266c" 59
Revisar "src/App.jsx" "c3598979e17bc2b22525541de77375adc71f52e21c28cab6ab01f8e137521feb" 1744
Revisar "src/auth.js" "d13bea31217043f590df6b4721694dfec17b6c7363b698e31e503ed8d84ba3fe" 169
Revisar "src/biometric.js" "4f1a7761207b2cd2f19aecafb9b0af0fb726a4b4863b11e93cdd26e3e3f5cf50" 258
Revisar "src/fileImport.js" "62b0ae92ced5ada3579b560847fc475a2e3aa40f1bf2e5c98fc0cac2c53b0ea1" 187
Revisar "src/firebase.js" "dede965d490260b93016b54fc1b88039c2b490ad552993a280c6da4fbb625d09" 72
Revisar "src/index.css" "fda85fffe7f006d822fb9ab4e774b9e2b8fadffa73a3806b038dc0b8456cbbeb" 112
Revisar "src/main.jsx" "98718acca141894863f8f5c9094cb5b6f7aa98431b2e3e1ed9371379f1a9ffcc" 17
Revisar "src/modales/Ajustes.jsx" "a983eabc00edb32c9ea2e3922187b99fa071c060b4305142e3029b8b98c1f9bf" 59
Revisar "src/modales/Carpetas.jsx" "7ced0f9d0205cb31d56229693cb3841c09f9fa7ec4b70c01b548d43ef79c4f61" 56
Revisar "src/modales/Compartir.jsx" "9ea81e26c2fd2f7be02bbdc0154170204cd37a0ac625c430c197fdbdf74810e4" 298
Revisar "src/modales/Crear.jsx" "9ebf622b3c343a2e4a82f26e77c06ccb43955838bb6cdaa2d51b27ec3fb564af" 294
Revisar "src/modales/Efirma.jsx" "3e66cbae7acfa3a25d55f9e069804730cfd90e84398e708f2d2a4ed10b81f103" 26
Revisar "src/modales/Expediente.jsx" "fcfbec363a978e3e208e4f3fce6baf2a43c22c53d677fae7b21ef10e81bd5554" 269
Revisar "src/modales/Firma.jsx" "18ff477c8ef244322f6aa3bafa1026f7df302d1eade7ed74e4f57bc7698d8fa0" 108
Revisar "src/modales/index.jsx" "bad94597ba21b2aff1a5f0ca9072f1432f3ccecadb9d04c829adcf1b09d5d644" 25
Revisar "src/modales/Legal.jsx" "5e4030038bb6c93e4c1f6de866d843e27bf0bbe4280166f21f86dd4f615567a2" 49
Revisar "src/modales/Salir.jsx" "0bd7ce4a5236b54183d4ec1ea42865cb048bbb21c808c31dfa0f91565674ce7f" 31
Revisar "src/monitoreo.js" "03ec05cf078850c85acded7257113b5f3b56379fc3aeccfbd21a9c802493f913" 53
Revisar "src/nucleo/accesos.js" "e96b32639247abe26acfd08e9fa3fddc1421caf1c9350cc42f399967c1822b24" 113
Revisar "src/nucleo/anclaje.js" "da68cdb52c3f263a03ef876ff06e3d5bb5738fc366f408ac031e7e91bc7d1e0a" 108
Revisar "src/nucleo/asn1.js" "a8b328f5fb47e1f0f4717c5303a1a44fef38ec173913403393e56ea7b33c7267" 161
Revisar "src/nucleo/avisos.js" "e6a32844b383144f603b92ccf50a5e2940e083e7ccd91cf1b182c6ee0c6a74d9" 59
Revisar "src/nucleo/backend.js" "ef8757ff76e06441586ee5aa616b1f040673047b8dbec332633139988d75f6a0" 40
Revisar "src/nucleo/bloques.js" "37af412db8ab71795d327e16ae98c47ec373f8bf2cb330c0b84b6b72934476dd" 138
Revisar "src/nucleo/cadena.js" "fe2b29427b1159dbaeed1eee136cc5a1c75fc86cb018e107d9605bbb6eeb0b5a" 25
Revisar "src/nucleo/catalogos.js" "ddb1f139c1a6b00327a728cebe436c5b315495049daccbdaa58152d9d2c1eca4" 86
Revisar "src/nucleo/cfdi.js" "bd0d3e7fe9bfb824b6c53110f74b0bf8c123fedfebb40fa34e3890f97a8e4cb3" 271
Revisar "src/nucleo/datos.js" "6627fcba74998e6f0b18b39a7afd859b3f19aa206a7406702fed32952890298a" 251
Revisar "src/nucleo/des.js" "d0be9135358b89a8454f8ad4ca46e47c9d852d70f52c48901db9d154c9701842" 212
Revisar "src/nucleo/efirma.js" "d67024e42739da0bfc81ffb7d899cdcef3eecc222af7acd15ccb8da470e681bb" 425
Revisar "src/nucleo/enlaces.js" "86c12690a3b04de1937611560051697cb7636b0750295ce066828bb7d954dd9e" 65
Revisar "src/nucleo/extraccion.js" "221cc70b97602d05a8199d83f3c561bb938fe51ec168a4c71a288162325c9340" 44
Revisar "src/nucleo/formato.js" "88030e9524de5a0298c49aa5a827c7c1e5098856b23431460b9cb4ee14caf57a" 29
Revisar "src/nucleo/invitaciones.js" "61ecbd9225c54bbd723b0ac2ea7eb754bf9a448644cf276ee5bf5792da55782c" 93
Revisar "src/nucleo/legal.js" "ee1a567e7c2430ad93fb3e22b96ff766049ba1c0243d117c49e3df9c74220601" 428
Revisar "src/nucleo/rfc.js" "7e13188a98627525b485efb7df84eebbeb93ed86d27193bed37e248053c708a9" 134
Revisar "src/pantallas/Acceso.jsx" "3dad92233ab974108aaadb2aaba4f7097cd15ad80b3ed8324abf0323706a69b0" 128
Revisar "src/pantallas/Documento.jsx" "133a1b5f508f9ffee4bccf9741ac1ea9a553b0cd847968771e02a0077648f532" 453
Revisar "src/pantallas/Entrega.jsx" "a3bab84274316f7521598ca8908fa49f6967fcc220003ab2632f03b4125feef8" 167
Revisar "src/pantallas/Expediente.jsx" "61db31a6a2828811d931efb0dc1f38c7148cc701c709763f9822b89144ac4dbe" 586
Revisar "src/pantallas/Inicio.jsx" "727fd39075ab1865029eb82d23f00b0a1d2f5932df3fc4721c7252054c4823c7" 365
Revisar "src/pantallas/MenuLateral.jsx" "178d6dd09c02dbeb2e6458e341cff09cfa66e9dc4f2072b9fddfd5bf2adee608" 48
Revisar "src/paquete.js" "00a164215a49ea438e0441870d5ee8f1c7d302a14df16a0f066addf91abf9a9c" 487
Revisar "src/smartContract.js" "b22e3f78b167b5a73a3758c7bd0bca55a80bb7a54e404c1822eb61d9b7e95621" 914
Revisar "src/storage.js" "a00601636bc631c2a36155f3da84b5e3b0525083b9b4d3ad91b2665ff5484e18" 138
Revisar "src/ui/CampoEnlace.jsx" "04d5d98987cf0959517c67eb21721b8bf6f628eb1ffd6b06805de97c1720708b" 58
Revisar "src/ui/EfirmaPanel.jsx" "04650659f1c7e031613ad5f23d74f4d5af82be304a22bb8bef2227b772773f50" 124
Revisar "src/ui/estilos.js" "2a14c0af34943258409c7267b118a14a18569914752a87e214a5e61cde847103" 1232
Revisar "src/ui/eventos.js" "16e3f79cab58b5dc32efe1f09e40aa7cf8857225c877a6cccd9f924b1b9d461e" 90
Revisar "src/ui/FormDoc.jsx" "14cb0f9ea37711e864dd42754e3500fe389580ab8f767b12b2347454262696cf" 93
Revisar "src/ui/formularios.js" "2814eccbcdebe6661091a923711809b983b5170b2a81fe842c6fa433ab25b458" 57
Revisar "src/ui/iconos.jsx" "63dd9759664bfd0d2b69356058382a4184d8f678eb7b46e354faac03b4495e2a" 23
Revisar "src/ui/LegalDoc.jsx" "087d5ae77d2f48ad82a75dbea57c9170d4d98ca608bdb0109cea45779da2b1d9" 35
Revisar "src/ui/SelloFiscal.jsx" "a0816e59b02167f59f8e03055aef58706abb9b9850ff5312d44236dc0f3c9b36" 91
Revisar "src/ui/Sistema.jsx" "9d05f52d2b0b7e70d78e2d3c2726c935c9bbe5d56a44731d5060f09512836bbf" 37
Revisar "src/ui/Timeline.jsx" "657c83e3f6d6906a9dae65c44bb7128c8cda542c58f41301d541e84bccdaa6a5" 55
Revisar "storage.rules" "79175fb97b33483babbe3f3bc6467eaacdd4940ef9531824f1481e42f4d1ccd2" 41
Revisar "vite.config.js" "ba29f338a47b7850dedc810d9491df2df5ae45754aedd66539cc38e54b980528" 12

Write-Host ""
if($faltan -eq 0 -and $distintos -eq 0){
  Write-Host ("Todo al dia. " + $iguales + " archivos, ninguno fuera de sitio.") -ForegroundColor Green
} else {
  Write-Host ("Al dia: " + $iguales + "   Distintos: " + $distintos + "   Faltan: " + $faltan) -ForegroundColor Yellow
  Write-Host ""
  Write-Host "Archivos a revisar:" -ForegroundColor Yellow
  foreach($m in $malos){ Write-Host ("   " + $m) -ForegroundColor White }
  Write-Host ""
  Write-Host "Si no los tocaste tu, copiame esta lista." -ForegroundColor White
}


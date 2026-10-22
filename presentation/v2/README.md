# Apresentação técnica v2 — narrada e sem áudio

Edição de **231 segundos (3min51s), 1920×1080, 30 fps**, com dez cenas. A versão anterior de 124 segundos permanece em `../renders/apresentacao-cdv.mp4`, sem substituição.

## Arquivos

- `renders/apresentacao-cdv-v2-narrada.mp4`: narração sintética local em português brasileiro, Kokoro `pf_dora`, sem imitar a voz do candidato.
- `renders/apresentacao-cdv-v2-sem-audio.mp4`: a mesma sequência visual, **sem stream de áudio**. Não é uma faixa apenas mutada.
- `ROTEIRO.md`: fala pronta por cena e timecodes para gravar sua própria explicação.
- `scenes.json`: conteúdo editável; `build.mjs`: gerador; `index.html` e `compositions/`: composição HyperFrames.
- `index-sem-audio.html`: fonte alternativa sem elementos de áudio. A entrega silenciosa é remuxada da narrada sem recodificar vídeo, garantindo a mesma edição.
- `assets/*.wav`: narrações locais prontas. `legendas.srt`: frases com alinhamento aproximado; as legendas também estão incorporadas visualmente nas duas versões.
- `evidence/`: metadados, hashes, medições de áudio, snapshots e quadros decodificados.

## Gravar rosto e voz

Importe o MP4 **sem áudio** no editor ou no OBS. Use uma tela de 1920×1080 a 30 fps. Coloque sua câmera na reserva inferior direita: **x=1470, y=770, largura=360, altura=230 pixels**. Essa área não contém dados, comandos ou legendas. A área é espaço negativo, sem borda nem marcador visual. Ajuste o recorte da câmera mantendo esses limites.

Grave seu microfone sobre a edição de 3min51s, acompanhando `ROTEIRO.md`. O texto é uma explicação da solução, não uma declaração de autoria pessoal. Você pode adaptar a fala e as pausas, mantendo o limite de cinco minutos. O arquivo não inclui rosto artificial ou voz que imite o candidato.

## Renderizar e verificar novamente

Use as dependências já fixadas no projeto pai, HyperFrames **0.8.186**, Node e FFmpeg/ffprobe. Não executar `check`, linter ou typecheck. Do diretório `presentation/`:

```powershell
node disable-auto-lint.mjs
node v2/build.mjs
npx hyperframes render v2 --quality delivery --fps 30 --output v2/renders/apresentacao-cdv-v2-narrada.mp4
ffmpeg -y -i v2/renders/apresentacao-cdv-v2-narrada.mp4 -map 0:v:0 -c:v copy -an -movflags +faststart v2/renders/apresentacao-cdv-v2-sem-audio.mp4
ffprobe -v error -show_format -show_streams -of json v2/renders/apresentacao-cdv-v2-narrada.mp4
ffprobe -v error -show_format -show_streams -of json v2/renders/apresentacao-cdv-v2-sem-audio.mp4
```

O patch versionado no pai verifica versão e hashes da dependência local e remove somente lint implícito do render e snapshot. Nesta tarefa o probe de atualização informou que 0.8.186 já era a versão corrente; nenhum upgrade de runtime foi aplicado. Preview/Studio não foi iniciado porque seu fluxo pode executar lint. Render e snapshots usam Chromium externo/headless, nunca o browser integrado Orca.

O build copia Georgia, Arial e Consolas da instalação local do Windows; fontes seguem fora do Git. Em outro sistema, use fontes licenciadas equivalentes e adapte os caminhos. GSAP é copiado da dependência fixada. O WAV existente permite render sem reinstalar TTS. Para regenerar uma cena, com o ambiente de voz existente disponível no PATH:

```powershell
$env:PATH=(Join-Path (Get-Location) '.voice-env/Scripts')+';'+$env:PATH
npx hyperframes tts --text-file v2/assets/abertura.txt --voice pf_dora --lang pt-br --speed 1.12 --output v2/assets/abertura.wav
node v2/build.mjs
```

Se mudar `scenes.json`, sincronize o `.txt` de voz e regenere o WAV correspondente antes do build. O build calcula duração pelo áudio, acrescenta pausas e recusa durações iguais ou superiores a 300 segundos.

## Evidência e estado operacional

Os resultados **71 PASS / 6 WARN**, modo estrito **71 PASS / 6 FAIL**, seis posições negativas e regras de incremental vêm do README e código dbt. Os **205 checks HTTP e 54 Edge** são evidências históricas da integração local com sessões reais em `docs/qa/web_access_review.md`; não são apresentados como teste de recebimento de e-mail. A captura Copper é um recorte histórico de `docs/qa/web_desktop_copper.png`; foram excluídos os antigos rótulos de acesso público. O vídeo explica a arquitetura privada atual.

Durante esta produção, o coordenador informou SMTP/Brevo configurado, templates relidos e login publicado habilitado em env revision 4. **Recebimento real de e-mail ainda não foi validado por este worker.** Esse estado transitório fica no relatório; a narração remete à documentação operacional, sem afirmar envio validado. Nenhum segredo, token, cookie ou contrassenha real aparece nos quadros.

Nenhum pipeline, banco, CSV ou arquivo fora de `presentation/` foi modificado pelo worker. Nenhum upload, publicação, commit ou envio de e-mail foi feito nesta tarefa.

Resultado final e hashes: [ENTREGA.md](ENTREGA.md).

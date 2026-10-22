> **Versão 2:** edição de 3min51s com pipeline e extensão Vinext, em versões narrada e sem áudio para facecam. Veja [v2/README.md](v2/README.md) e [roteiro por cena](v2/ROTEIRO.md). A versão 1 descrita abaixo permanece preservada.

# Apresentação técnica — Clube do Valor

Vídeo gerado, narrado em português brasileiro por voz sintética local Kokoro `pf_dora`, sem imitar o candidato. Duração planejada e renderizada: 124 segundos (2min04s), 1920×1080, 30 fps. Arquivo de entrega: `renders/apresentacao-cdv.mp4`.

## Conteúdo e edição

- `scenes.json`: títulos, textos e roteiro de voz.
- `index.html` e `compositions/*.html`: fonte HyperFrames editável, uma cena por arquivo.
- `assets/*.wav`: narração local pronta, suficiente para renderizar sem reinstalar TTS.
- `ROTEIRO.md` e `legendas.srt`: roteiro e legendas; sincronismo das legendas por frase é aproximado, proporcional à duração de cada narração.
- `build.mjs`: reconstrói HTML, roteiro, SRT e `timing.json` a partir do JSON e dos áudios.
- `evidence/`: snapshots e verificação técnica do arquivo final.

O vídeo explica a fonte preservada, três camadas, exemplo parcial C1/PETR4, alertas conhecidos, modo estrito e limites do incremental. Os resultados exibidos vêm de `../scripts/validation_results.json` e `../target/evidence/test.json`, conferidos em 22/10/2026. A reprodução do **pipeline dbt** está no `../README.md`; os comandos abaixo são somente da apresentação.

## Renderizar novamente

Ambiente validado: Windows, Node 24.14.1, FFmpeg/ffprobe no PATH, HyperFrames 0.8.186. Execute dentro de `presentation/`:

```powershell
npm ci
node disable-auto-lint.mjs
node build.mjs
npm run render
ffprobe -v error -show_entries format=duration,size -show_streams -of json renders/apresentacao-cdv.mp4
```

`npm ci` aplica pelo `postinstall` a exceção de lint descrita abaixo. O render usa os HTML existentes; o build restaura as fontes locais e reconstrói os HTML. Se alterar `scenes.json`, atualize também a voz quando necessário. O build usa Arial instalada no Windows para criar os arquivos locais de fonte; esses arquivos ficam fora do Git. Em outra máquina, forneça fontes licenciadas equivalentes e adapte os caminhos no build.

Para gerar novamente a voz local:

```powershell
python -m venv .voice-env
.\.voice-env\Scripts\python -m pip install kokoro-onnx==0.6.1 soundfile==0.14.0
$env:PATH=(Join-Path (Get-Location) '.voice-env\Scripts')+';'+$env:PATH
# O CLI baixa os modelos locais na primeira execução; não usa conta de terceiros.
npx hyperframes tts --text-file assets/origem.txt --voice pf_dora --lang pt-br --speed 1.05 --output assets/origem.wav
```

Repita para as outras cenas. Os `.txt` devem acompanhar o roteiro. Não há música ou som de sucesso: a voz é o áudio principal.

## Preferência de não executar lint/typecheck

Não executar `hyperframes check`, `hyperframes lint` ou typecheck. A versão 0.8.186 invoca lint implicitamente nos comandos `render` e `snapshot`, sem opção para desativá-lo. `disable-auto-lint.mjs` modifica **somente a dependência local em node_modules**, valida a versão e hashes SHA-256 originais e falha se o código divergir. Remove a chamada automática do render e o bloco de diagnóstico de lint do snapshot; não altera captura, compilação, áudio, licença, quota ou verificações de segurança. Não alega que lint passou.

O comando padrão de preview também pode disparar lint. Não foi usado nesta entrega. A revisão foi feita via snapshots e frames decodificados do MP4, sem browser integrado Orca. Não abra Studio automaticamente enquanto persistir a proibição de lint.

Snapshots permitidos, após aplicar o patch local:

```powershell
npx hyperframes snapshot --review --output evidence/review --describe=false
```

## Distribuição

Nenhum upload ou publicação foi feito. O MP4 está fora do Git para evitar incluir binário grande inadvertidamente; envie-o separadamente ou publique apenas quando autorizado. Fontes do Windows também estão excluídas do Git. A fonte HTML, o roteiro e as narrações ficam disponíveis no projeto. Dependências e ambiente TTS são locais e ignorados.

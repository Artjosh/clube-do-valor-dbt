# Entrega v2 — apresentação técnica e base para facecam

Concluída em 22/10/2026. Task `task_332aaef8b5e6`, Dispatch `ctx_2904d73639c9`. Escrita de artefatos restrita a `presentation/`; nenhum commit, upload ou publicação executado.

## Arquivos finais

| Versão | Caminho relativo à raiz | Tamanho |
|---|---|---:|
| Narrada pt-BR | `presentation/v2/renders/apresentacao-cdv-v2-narrada.mp4` | 11.622.435 bytes |
| Sem áudio | `presentation/v2/renders/apresentacao-cdv-v2-sem-audio.mp4` | 6.371.871 bytes |

Ambas: **231,000 segundos (3min51s), H.264, 1920×1080, 30 fps, 6.930 quadros**. Estão abaixo do limite de cinco minutos. A edição de 124 segundos e a release anterior não foram substituídas; hash do MP4 v1 antes/depois confirmado igual.

SHA-256 dos arquivos:

```text
narrada   06115a2d2ada28866998047de23461e19138c2484ce60c95b9e7414a47a7271d
sem-audio f256b71c66cd9e16e296343096f5de53a994f20f6a73fa3cd9ea7b080f71db58
```

## Verificação técnica e visual

- Narrada: **AAC estéreo, 48 kHz**, −21,7 LUFS integrados, pico verdadeiro −1,5 dBFS, faixa de loudness 4,2 LU. A faixa está presente e tem sinal mensurável, sem pico acima de zero. Medição técnica, não escuta humana.
- Silenciosa: **zero streams de áudio**. Gerada por remux `-map 0:v:0 -c:v copy -an`, não por volume zero.
- Hash SHA-256 dos pacotes do vídeo igual nas duas versões: `f4f9e69faa1c704214603a20ded104c91dedf77a0a6725a7302fd1f9483cd7f9`. Mesma edição, frames e duração.
- Decodificação integral por FFmpeg de cada MP4: exit 0, sem erros.
- Doze quadros do MP4 final, em 0, 10, 31, 54, 77, 102, 127, 149, 170, 193, 218 e 230 segundos, inspecionados visualmente. Títulos, comandos, legendas, diagramas e captura do dashboard aparecem sem cortes ou quadros vazios nas amostras. O quadro de 149s extraído do silencioso também foi inspecionado e possui o mesmo hash PNG do narrado.
- A área **x1470/y770, 360×230** permanece espaço negativo livre, sem borda ou marcador de edição, conforme revisão do coordenador. Nenhum dado, comando ou legenda fica sob a facecam.
- Prévia de todos os blocos e amostras de cortes revisadas antes do render. Roteiro corrigido para comandos em crases, sem pontuação que pudesse virar `--profiles-dir ..`.

Evidências: `evidence/verification.json`, `narrada-ffprobe.json`, `sem-audio-ffprobe.json`, `audio-ebur128.txt`, `silent-frame-comparison.json`, `decoded/` e `final-review/`. `verify.mjs` reproduz remux, metadados, hashes, decodificação, medição e quadros.

Render final HyperFrames 0.8.186: **drawelement capture, hardware GPU**, compile 2,3s, áudio 1,9s, setup 8,2s, captura/encode simultâneo 3min36,2s, montagem 4,2s; total 3min53,1s. O mixer reduziu automaticamente 1,1 dB para seu teto de pico. Log em `evidence/render-final.log`.

## Conteúdo e fonte editável

Dez cenas: objetivo; fonte e canonização; staging/intermediate/marts; semântica BUY−SELL; 71 PASS/6 WARN e modo estrito; incremental com janela/limites; comandos seed/run/test e README; Vinext Copper/Silver/Gold; DuckDB analítico separado de Supabase/PostgreSQL para identidade; evidências e limites.

Fontes de conteúdo em `evidence/source-hashes.json`. O vídeo não inventa retorno financeiro ou estado de serviço. A captura histórica Copper é identificada e recortada para excluir os rótulos antigos de acesso público. Nenhuma credencial, contrassenha, token ou cookie real aparece.

Fonte: `scenes.json`, `build.mjs`, `index.html`, `index-sem-audio.html`, `compositions/`, assets de voz e ledger. Instruções e coordenadas para gravar rosto/microfone em `README.md`; fala completa com timecodes em `ROTEIRO.md`; legendas também em `legendas.srt`.

## Limites e estado operacional

Voz sintética local Kokoro `pf_dora`, pt-BR, velocidade 1.12, sem imitação do candidato. Nenhuma escuta humana foi certificada; revisar pronúncia de siglas e ritmo antes de enviar. Legendas por frase com alinhamento aproximado. A versão sem áudio conserva os textos visuais da edição narrada e permite gravar rosto/voz sobre o roteiro.

O coordenador informou SMTP/Brevo configurado, templates relidos sem diferenças e login publicado habilitado em env revision 4. **Recebimento real de e-mail ainda não foi validado por este worker.** O vídeo separa os 205 checks HTTP/54 Edge de integração local real da validação operacional de e-mail, e remete à documentação atual para o estado publicado.

Nenhum typecheck, linter, HyperFrames check ou preview que pudesse disparar lint foi executado. Patch local versionado de render/snapshot aplicado após leitura e verificação de versão/hashes. Probe de upgrade somente leitura informou a mesma versão 0.8.186. A atualização da skill informou que general-video foi incorporada à skill HyperFrames; a referência de explainer e domínios de composição, CLI, mídia e animação foram consultados. Voz foi gerada offline com o ambiente existente; nenhuma conta paga ou credencial de terceiros foi usada.

Sessão principal preservada; nenhum subagente criado ou liberado.

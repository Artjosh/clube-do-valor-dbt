# Entrega — apresentação técnica

Concluída em 22/10/2026. Escopo de escrita: somente `presentation/`. Modelos, seeds, README raiz, configurações e banco não foram modificados por este worker.

## Arquivos principais

| Item | Caminho relativo à raiz do workspace |
|---|---|
| Vídeo final | `presentation/renders/apresentacao-cdv.mp4` |
| Fonte editável | `presentation/index.html` e `presentation/compositions/` |
| Conteúdo e voz | `presentation/scenes.json`, `presentation/assets/*.wav` |
| Roteiro | `presentation/ROTEIRO.md` |
| Legendas | `presentation/legendas.srt` |
| Reprodução | `presentation/README.md` |
| Revisão visual | `presentation/REVIEW.md` |
| Metadados finais | `presentation/evidence/ffprobe.json` |
| Medição sonora | `presentation/evidence/audio.json` |
| Hash do vídeo | `presentation/evidence/video-hash.json` |
| Quadros decodificados | `presentation/evidence/decoded/` |
| Snapshots das cenas e cortes | `presentation/evidence/review/` |

## Verificação

- MP4 H.264, 1920×1080, 30 fps, 3.720 quadros, **124,000 segundos**, abaixo de 300 segundos.
- Áudio AAC estéreo, 48 kHz, mesma duração de 124 segundos.
- Tamanho: **6.178.878 bytes**, aproximadamente 5,89 MiB / 6,18 MB decimal.
- `ffmpeg -hide_banner -loglevel error -i renders/apresentacao-cdv.mp4 -f null NUL` terminou com saída zero e sem erro de decodificação.
- Quadros do arquivo final em 0, 10, 29, 50, 72, 94, 115 e 123 segundos; cenas e encerramento inspecionados visualmente, sem textos cortados ou quadros vazios observados.
- Medição local de áudio: **-21,5 LUFS integrados**, **-1,5 dBTP**, **0 clipping**. Sem escuta humana; pronúncia de siglas/termos ingleses não certificada.
- Captura HyperFrames por screenshot com GPU NVIDIA RTX 4060, navegador headless externo ao Orca; render local em aproximadamente 3min06s.
- Render retornou código zero com aviso `sub_timeline_readiness_timeout` para `captions`: a composição de legendas não usa timeline própria. O engine aguardou 45 segundos e prosseguiu; legendas aparecem nos snapshots e no MP4 decodificado. O aviso afeta o tempo de inicialização, sem defeito visual observado nas amostras.
- Usage conhecido: 94% semanal restante no início deste worker, 91% antes de render e 89% na conclusão; reset informado em 29/10/2026 às 19:09:08 UTC.

## Evidências de conteúdo

Três camadas, filtros, join, fórmulas e incremental foram lidos diretamente em `models/` e `macros/`. O exemplo C1/PETR4 é explicitamente parcial, baseado em T001 e T011; não afirma ser saldo final. Os resultados exibidos de **71 PASS / 6 WARN** e modo estrito **71 PASS / 6 FAIL** foram extraídos de `target/evidence/test.json`, `strict.json` e corroborados por `scripts/validation_results.json` e README raiz. Contagens de status e hashes das fontes estão em `evidence/pipeline-statuses.json` e `source-hashes.json`.

Nenhuma afirmação de que os dados estão sem problemas. O vídeo explica que WARN evidencia defeitos conhecidos e que o modo estrito falha intencionalmente. Limites de atraso/correção histórica do incremental e reconstrução completa são explícitos.

## Limitações e decisões

Voz sintética local Kokoro `pf_dora` em pt-BR, sem imitar o candidato. Legendas por frase com alinhamento aproximado. Sem música, gravação pessoal, upload, publicação, envio de email ou feedback externo. Avaliação final por pessoa pode ajustar pronúncia e ritmo.

Não rodados typecheck, linter ou HyperFrames check. Como render e snapshot da versão 0.8.186 executam lint implicitamente, `disable-auto-lint.mjs` aplica uma alteração mínima na dependência **local**, com versão e hashes verificados e falha em divergência. Não remove validações de licença/quota/segurança nem modifica o pipeline de captura. Preview omitido por poder disparar lint; preferência explícita do usuário prevalece sobre o fluxo da skill. Microsoft Edge externo foi encontrado no sistema; nenhum browser integrado do Orca foi aberto.

Dependências, ambiente TTS, caches, fontes do Windows e MP4 estão ignorados pelo Git. O vídeo continua disponível no caminho acima para distribuição separada. O build restaura fontes a partir da instalação local do Windows; em outro sistema, adaptar para fontes licenciadas equivalentes. Não há dependência de credencial de TTS para renderizar: WAVs gerados estão presentes.

O próximo passo fora deste escopo é a revisão humana e, se autorizado, a hospedagem do MP4 para obter um link público. Este worker principal permanece preservado para reutilização; nenhum outro worker ou sessão Claude foi alterado.

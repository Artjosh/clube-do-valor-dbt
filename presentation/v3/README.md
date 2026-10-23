# Apresentação v3 — sem legendas sobrepostas

Dez etapas, 243 segundos (4min03s), 1920×1080, 30 fps. As versões narrada e sem áudio usam exatamente os mesmos pacotes de vídeo. A composição não contém faixa de captions, transcrição ou arquivo SRT.

- `renders/apresentacao-cdv-v3-narrada.mp4`: voz sintética local pt-BR, Kokoro `pf_dora`, velocidade 1.12.
- `renders/apresentacao-cdv-v3-sem-audio.mp4`: nenhum stream de áudio; pronta para gravação pessoal.
- `FALA-POR-ETAPA.md`: números 01–10, títulos, intervalos da tela e da voz, fala pronta.
- `scenes.json`, `build.mjs`, `compositions/`, `index.html`: fontes editáveis.
- `evidence/verification.json`: hashes, formatos, decode, áudio e preservação da v2.

Área negativa para facecam: x=1470, y=770, largura=360, altura=230, sem marcador visual. Não cobrir os títulos ou a coluna lateral acima dessa área.

## Reproduzir esta edição

Com as dependências locais da apresentação já instaladas, executar em `presentation/`:

```powershell
node disable-auto-lint.mjs
node v3/build.mjs
npx hyperframes snapshot v3 --at 10,31,54,77,102,127,149,174,204,228 --output v3/evidence/snapshots --describe=false
npx hyperframes render v3 --quality delivery --fps 30 --output "$PWD/v3/renders/apresentacao-cdv-v3-narrada.mp4"
node v3/verify.mjs
```

O patch versionado no diretório pai verifica a versão/hash e remove apenas lint implícito do render/snapshot. Não executar lint, typecheck, check ou preview que os acione. `verify.mjs` remuxa a versão silenciosa sem reencodar imagem, mede áudio, decodifica os dois arquivos e extrai uma amostra por etapa.

Para regenerar uma fala alterada, usar o ambiente de voz local existente e `npx hyperframes tts --text-file v3/assets/dashboard.txt --voice pf_dora --lang pt-br --speed 1.12 --output v3/assets/dashboard.wav`, substituindo o nome da etapa. Atualizar `scenes.json` e o texto da fala juntos; depois executar `build.mjs` para recalcular os tempos.

## Escopo editorial e limitações

A v2 permanece preservada. Somente as vozes das etapas 08 e 10 foram refeitas; as outras oito são cópias binárias. A etapa 08 declara explicitamente que a página é completamente desnecessária para os requisitos do teste e que a avaliação técnica é atendida por dbt/DuckDB local, sem conta ou serviço externo. A etapa 10 conclui no núcleo e no README, sem depender da documentação web.

O recorte do dashboard é histórico, reaproveitado da v2; não representa atualização em tempo real. Os resultados 71 PASS / 6 WARN são evidências do dataset original. A etapa 09 descreve o contrato de acesso, sem afirmar entrega operacional de e-mail. A voz é sintética, não imita o candidato; a validação de áudio é técnica, sem alegação de audição humana.

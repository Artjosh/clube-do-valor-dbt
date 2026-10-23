# Entrega v3

Concluída em 22/10/2026 (horário de Brasília). Alterações limitadas a `presentation/v3/`; v1/v2 preservadas. O patch existente foi executado em `presentation/` e confirmou a remoção de lint implícito; nenhum lint, typecheck, check ou preview foi executado. Nenhuma publicação ou commit.

## Arquivos finais

| Arquivo em renders/ | Duração | Bytes | SHA-256 |
| --- | --- | --- | --- |
| apresentacao-cdv-v3-narrada.mp4 | 243 s | 11104683 | 5dd65ba01c511d4541f2fb6c800a491f75f849c6935ee5a229f1f9f88fc73e24 |
| apresentacao-cdv-v3-sem-audio.mp4 | 243 s | 5582294 | 9d7026a06d5e1843d87555dc9eb325203816d3143d88fc4f34387f0fb3bd99ef |

Ambos: H.264, 1920×1080, 30 fps, 7290 quadros. Narrado: AAC estéreo 48 kHz, loudness integrado -21,7 LUFS, pico verdadeiro -1,5 dBFS. Silencioso: zero streams de áudio. Decodificação integral dos dois arquivos: saída 0, sem erros. Hash dos pacotes de vídeo idêntico: `fb16dc3ffe62e80f450bcc1da228bd63b0c899c6e2770e3f2cabf4636b8dba90`.

## Revisão editorial e visual

As dez etapas conservam números 01–10, títulos e conteúdo didático. A composição de captions e seus hosts foram removidos integralmente; não há arquivo SRT nem elemento de legenda nas composições. Inspecionados os snapshots e o mosaico de dez quadros decodificados do MP4 (`evidence/decoded/contact-sheet.jpg`): ausência de faixa sobreposta, conteúdo legível e área inferior direita livre para facecam.

A etapa 08 declara que a página é completamente desnecessária para os requisitos do teste, servindo apenas à visualização; dbt/DuckDB locais atendem à avaliação sem conta ou serviço externo. O fechamento retorna ao núcleo e ao README. Apenas as vozes de 08 e 10 foram alteradas, e as outras oito mantêm hashes binários idênticos à v2. O coordenador aprovou o texto antes da conclusão do render.

`FALA-POR-ETAPA.md` contém os dez números idênticos à tela, títulos, timecodes de cena e áudio, e falas completas sincronizadas com os WAVs. A voz sintética começa 0,5 segundo após cada entrada de etapa. A área livre permanece em x=1470, y=770, 360×230.

## Evidências e preservação

- `evidence/verification.json`: verificações funcionais, hashes, metadados e medições.
- `evidence/narrada-ffprobe.json` e `evidence/sem-audio-ffprobe.json`: sondagens completas.
- `evidence/audio-ebur128.txt`: medição técnica do áudio.
- `evidence/decoded/`: uma amostra de cada etapa extraída do arquivo final.
- `evidence/snapshots/`: quadros de revisão das composições.
- `evidence/v2-before.json`: manifesto SHA-256 de todos os arquivos preexistentes na v2, comparado integralmente após render (`v2Preserved: true`).
- `evidence/render.log`: render concluído em aproximadamente 153 segundos, GPU local.

Não foi versionada informação de quota/usage. A v2 narrada mantém SHA-256 `06115a2d2ada28866998047de23461e19138c2484ce60c95b9e7414a47a7271d`, e a v2 silenciosa mantém `f256b71c66cd9e16e296343096f5de53a994f20f6a73fa3cd9ea7b080f71db58`.

Limitações: voz sintética local, validada tecnicamente sem alegação de audição humana; screenshot histórico reaproveitado; nenhuma afirmação de SMTP operacional. As contagens de testes representam a evidência do dataset original, não uma nova execução do pipeline. Não há pendência técnica desta entrega; publicação, se desejada, cabe ao coordenador.

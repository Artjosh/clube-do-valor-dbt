# Ativar login com Brevo

O usuário conectará o Brevo. Login desativado localmente e na hospedagem (`AUTH_ENABLED=false`); com a nova política privada, **as análises também ficam bloqueadas** até haver sessão verificada com role `analyst`. O primeiro login normal cria conta sem acesso. A contrassenha seguida de e-mail verificado é o único fluxo que concede a role.

## Conectar SMTP

No [Supabase dedicado — SMTP](https://supabase.com/dashboard/project/igucxanapndewkbtarfn/auth/smtp), habilitar custom SMTP com:

| Campo | Valor |
|---|---|
| Host | `smtp-relay.brevo.com` |
| Porta | `587` |
| Usuário | Login SMTP exibido no Brevo |
| Senha | Chave **SMTP** do Brevo, não chave da API nem senha da conta |
| Remetente | Endereço verificado/autorizado no Brevo |
| Nome do remetente | Nome do candidato ou do projeto, sem sugerir comunicação oficial da empresa |

Manter a chave no painel Supabase; não enviar pelo chat ou colocar no repositório. O domínio/remetente deve estar autorizado para envio. Consulte a [integração oficial Brevo/Supabase](https://developers.brevo.com/docs/supabase-smtp-integration) e [configuração SMTP do Supabase](https://supabase.com/docs/guides/auth/auth-smtp).

## Aplicar os templates já preparados

Após conectar SMTP, a partir de `web/`, usando Supabase CLI autenticado:

```sh
supabase config diff --project-ref igucxanapndewkbtarfn
supabase config push --project-ref igucxanapndewkbtarfn
```

Revisar somente alterações de Auth declaradas em `supabase/config.toml`: site URL, redirects, TTL de 300 segundos, comprimento do OTP e os dois templates. As configurações SMTP salvas no painel não são declaradas no arquivo e devem ser preservadas. **Não executar db push, reset ou reaplicar migrations já registradas no relatório de publicação**. Config diff remoto de 22/10 identificou TTL3600 e site_url local ainda vigentes; o push anterior foi recusado.

Templates `magic_link.html` e `confirmation.html` devem incluir o código `{{ .Token }}` para OTP e o link opcional para `RedirectTo` com `token_hash` e `type=email`. O redirect original já inclui `challengeId`. Não substituir por `ConfirmationURL`: isso muda o comportamento de consumo no GET. Desativar tracking/reescrita de links no Brevo. Confirmar no painel que os dois corpos foram aplicados; a tentativa anterior foi recusada e não é prova de configuração.

## Ativação final

1. A entrada pode ser aberta na hospedagem conforme autorização explícita do usuário. Publicar essa configuração somente após comprovar os guards: sessão ausente não lê dados; conta sem role não lê dados; somente `analyst` acessa SSR/RSC, APIs e CSV. Não exigir a conta ChatGPT do proprietário dos avaliadores.
2. Revisar `AUTH_ORIGIN`: deve ser exatamente a origem HTTPS publicada; os secrets Supabase e a chave de cookie já estão no armazenamento de runtime do Site. Não colocar valores em `.openai/hosting.json`.
3. Alterar `AUTH_ENABLED` para `true` no Site e republicar a versão aprovada para aplicar a revisão de ambiente. Não mudar as demais chaves.
4. Com um endereço de teste autorizado pelo usuário, fazer login por OTP: a conta nova deve ficar sem acesso. Depois usar a contrassenha, comprovar o e-mail e confirmar a role `analyst` e leitura autorizada. Testar também o link no celular: digitar o código do PC e aprovar; o PC recebe sua sessão por polling, sem transferi-la ao celular.
5. Validar acesso direto às APIs, logout, revogação, expiração e nova tentativa; conferir os registros do Brevo sem copiar links/tokens para relatórios. O envio e a jornada real em dois aparelhos permanecem **pendentes até esta etapa**.

Se envio/template falhar, manter `AUTH_ENABLED=false`. Os testes já executados de banco e token são detalhados em [web-auth.md](web-auth.md); eles não substituem este teste SMTP.

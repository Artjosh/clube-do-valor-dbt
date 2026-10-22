# Ativar login com Brevo

O Brevo foi conectado em 22/10/2026 com a credencial SMTP existente, recuperada dos projetos locais expressamente autorizados. STARTTLS e autenticação SMTP retornaram 235; o remetente está ativo. Configuração SMTP, origem, redirects, validade do OTP e os dois templates foram aplicados ao Supabase dedicado via CLI; a comparação posterior não encontrou diferenças declaradas. Nenhum projeto de origem foi alterado e nenhuma chave nova foi criada. Veja a [proveniência sanitizada](brevo-discovery.md).

O login está habilitado na hospedagem (`AUTH_ENABLED=true`, revisão de ambiente 5); a configuração local continua desabilitada para evitar envios acidentais. **O usuário confirmou o recebimento do primeiro OTP real em 22/10/2026. A jornada completa PC/celular ainda está em validação.** O primeiro login normal cria conta sem acesso. A contrassenha seguida de e-mail verificado é o único fluxo público que concede a role `analyst`.

## Configuração SMTP aplicada

No [Supabase dedicado — SMTP](https://supabase.com/dashboard/project/igucxanapndewkbtarfn/auth/smtp), custom SMTP foi habilitado com:

| Campo | Valor |
|---|---|
| Host | `smtp-relay.brevo.com` |
| Porta | `587` |
| Usuário | Login SMTP exibido no Brevo |
| Senha | Chave **SMTP** do Brevo, não chave da API nem senha da conta |
| Remetente | Endereço verificado/autorizado no Brevo |
| Nome do remetente | Nome do candidato ou do projeto, sem sugerir comunicação oficial da empresa |

Manter a chave no painel Supabase; não enviar pelo chat ou colocar no repositório. O domínio/remetente deve estar autorizado para envio. Consulte a [integração oficial Brevo/Supabase](https://developers.brevo.com/docs/supabase-smtp-integration) e [configuração SMTP do Supabase](https://supabase.com/docs/guides/auth/auth-smtp).

## Manutenção dos templates aplicados

Os templates HTML responsivos já foram aplicados; o push posterior atualizou somente o tamanho de OTP para seis dígitos e o conteúdo dos dois templates. O diff de configuração não inclui comparação do conteúdo HTML; o recibo de push confirma esses campos separadamente. Para uma alteração futura, a partir de `web/`, usando Supabase CLI autenticado:

```sh
supabase config diff --project-ref igucxanapndewkbtarfn
supabase config push --project-ref igucxanapndewkbtarfn
```

Revisar somente alterações de Auth declaradas em `supabase/config.toml`: site URL, redirects, TTL de 300 segundos, OTP de seis dígitos e os dois templates. As configurações SMTP remotas não são declaradas no arquivo versionado e devem ser preservadas. **Não executar db push, reset ou reaplicar migrations já registradas no relatório de publicação**. A recusa inicial de templates pelo serviço padrão foi resolvida ao configurar SMTP próprio; o push posterior atualizou 14 propriedades de Auth e preservou as seis configurações remotas não declaradas.

Templates `magic_link.html` e `confirmation.html` incluem o código `{{ .Token }}` para OTP e o link opcional para `RedirectTo` com `token_hash` e `type=email`. O redirect original já inclui `challengeId`. Não substituir por `ConfirmationURL`: isso muda o comportamento de consumo no GET. Conferir no teste de entrega se o link chega preservado; tracking/reescrita de links não foi alterado nesta missão.

## Validação final de entrega

1. A entrada pode ser aberta na hospedagem conforme autorização explícita do usuário. Publicar essa configuração somente após comprovar os guards: sessão ausente não lê dados; conta sem role não lê dados; somente `analyst` acessa SSR/RSC, APIs e CSV. Não exigir a conta ChatGPT do proprietário dos avaliadores.
2. Revisar `AUTH_ORIGIN`: deve ser exatamente a origem HTTPS publicada; os secrets Supabase e a chave de cookie já estão no armazenamento de runtime do Site. Não colocar valores em `.openai/hosting.json`.
3. `AUTH_ENABLED=true` já foi aplicado pelo deploy `appgdep_6ada9494b95c8191a4d51f23b75e184a`, revisão de ambiente 5, com OTP6 e HTML responsivo na versão 5. Não alterar as demais chaves.
4. Com um endereço de teste autorizado pelo usuário, fazer login por OTP: a conta nova deve ficar sem acesso. Depois usar a contrassenha, comprovar o e-mail e confirmar a role `analyst` e leitura autorizada. Testar também o link no celular: digitar o código do PC e aprovar; o PC recebe sua sessão por polling, sem transferi-la ao celular.
5. Validar acesso direto às APIs, logout, revogação, expiração e nova tentativa; conferir os registros do Brevo sem copiar links/tokens para relatórios. O primeiro recebimento foi confirmado pelo usuário; a conclusão da jornada real em dois aparelhos continua pendente.

Se o teste confirmar falha de envio/template, corrigir a causa e desabilitar temporariamente `AUTH_ENABLED` com novo deploy se necessário. Os testes de banco e token em [web-auth.md](web-auth.md) não substituem a comprovação de entrega. O remetente existente usa um provedor público de e-mail; seu domínio não aparece como domínio autenticado da conta Brevo. Não houve alteração de DNS ou domínio.

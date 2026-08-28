# Checklist manual — usuários e permissões

- [ ] **A — Primeiro acesso:** entrar com novo usuário Google; confirmar `role: pendente` e tela “Acesso aguardando liberação”.
- [ ] **B — Liberação:** admin muda pendente para atendimento; confirmar entrada automática ou pelo botão “Verificar liberação”.
- [ ] **C — Promoção:** admin muda atendimento para gestor; confirmar que Pessoas, Agendas e Fluxo ficam disponíveis.
- [ ] **D — Desativação:** admin desativa outro usuário conectado; confirmar bloqueio imediato e tela “Acesso desativado”.
- [ ] **E — Autobloqueio:** na própria conta admin, confirmar “Sua conta”, seletor e desativação indisponíveis.
- [ ] **F — Atendimento:** tentar alcançar Configurações; confirmar menu ausente, fallback da aplicação e negação pelas rules.
- [ ] **G — Gestor:** tentar alcançar Usuários; confirmar menu ausente, fallback da aplicação e negação pelas rules.

Verifique também a criação correspondente em `auditoria` após mudanças de role e status.

## Antes do checklist

- Execute `npm run lint`, `npm run build` e `npm run test:rules`.
- Confirme Google habilitado e Anonymous desabilitado em **Authentication > Sign-in method**.
- Siga `FIRST_ADMIN.md` para o bootstrap e `DEPLOY.md` para qualquer publicação futura.

## Fase 6 — cancelamento e correção administrativa (somente Emulator)

- [ ] Agendar uma pessoa, cancelar o atendimento e agendar novamente na mesma agenda; confirmar dois registros distintos no histórico (`Cancelado` e `Agendado`), apenas uma reserva ativa e contagem de vagas correta.
- [ ] Tentar agendar novamente a mesma pessoa enquanto o segundo atendimento estiver ativo; confirmar a mensagem “Esta pessoa já possui um atendimento nesta agenda.” e ausência de terceiro registro.
- [ ] Agenda com apenas `Agendado`, `Faltou` ou `Cancelado`: confirmar que **Cancelar Agenda** funciona e preserva os atendimentos.
- [ ] Agenda com `Presente` ou `Concluído`: confirmar botão desabilitado, explicação visível e ausência de `AGENDA_CANCELADA`.
- [ ] Como admin, executar `Agendado → Presente → Concluído`, abrir **Corrigir Status** e voltar para `Presente` com motivo; confirmar chegada preservada, saída removida e auditoria `STATUS_ATENDIMENTO_CORRIGIDO`.
- [ ] Corrigir `Presente → Agendado`; confirmar chegada removida e `vagasOcupadas` inalterado.
- [ ] Em agenda concluída, confirmar que admin ainda pode corrigir; em agenda cancelada, confirmar bloqueio.
- [ ] Como gestor/atendimento, confirmar que **Corrigir Status** não aparece e que as Rules recusam tentativa direta.

## Fase 6B — reagendamento e realocação (somente Emulator)

- [ ] Como admin e gestor, mover todos os serviços de um atendimento `Agendado`; confirmar origem `Reagendado`, destino `Agendado`, locks corretos e dois registros no histórico.
- [ ] Mover somente um serviço; confirmar que os demais continuam ativos na origem e que o destino contém somente o serviço selecionado.
- [ ] Repetir a partir de agenda cancelada e de serviço cancelado na origem; confirmar sucesso sem reabrir a agenda.
- [ ] Tentar destino cheio, incompatível, cancelado ou já ocupado pela pessoa; confirmar rollback completo e mensagem específica.
- [ ] Confirmar que perfil Atendimento não vê a ação e recebe negação das Rules em tentativa direta.
- [ ] Após realocação parcial, cancelar a origem; confirmar devolução somente das vagas dos serviços ainda ativos.

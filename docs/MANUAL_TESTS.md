# Checklist manual — usuários e permissões

- [ ] **A — Primeiro acesso:** entrar com novo usuário Google; confirmar `role: pendente` e tela “Acesso aguardando liberação”.
- [ ] **B — Liberação:** admin muda pendente para atendimento; confirmar entrada automática ou pelo botão “Verificar liberação”.
- [ ] **C — Promoção:** admin muda atendimento para gestor; confirmar que Pessoas, Agendas e Fluxo ficam disponíveis.
- [ ] **D — Desativação:** admin desativa outro usuário conectado; confirmar bloqueio imediato e tela “Acesso desativado”.
- [ ] **E — Autobloqueio:** na própria conta admin, confirmar “Sua conta”, seletor e desativação indisponíveis.
- [ ] **F — Atendimento:** tentar alcançar Configurações; confirmar menu ausente, fallback da aplicação e negação pelas rules.
- [ ] **G — Gestor:** tentar alcançar Usuários; confirmar menu ausente, fallback da aplicação e negação pelas rules.

Verifique também a criação correspondente em `auditoria` após mudanças de role e status.

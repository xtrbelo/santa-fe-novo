# Changelog

## Fase 2 — administração de usuários e permissões

- Módulo administrativo de usuários com busca, filtros, ordenação e contador de pendentes.
- Alteração de perfil e status com confirmação, batch e auditoria.
- Perfil logado reativo, telas separadas para acesso pendente e desativado.
- Proteção contra autobloqueio e identificação do usuário na sidebar.
- Indicador de usuários pendentes no Painel do administrador.
- Rules reforçadas para `usuarios`, `uid` e `auditoria`.

## Fase 1 — segurança e integridade

- Login Google e perfil pendente automático.
- Autorização por perfil e rules com negação padrão.
- CPF válido/único, desativação lógica e auditoria.
- Agendamento transacional com tipo, duplicidade e vagas.
- Consultas de inscritos filtradas por agenda.
- Remoção do `public/index.html` legado.

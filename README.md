# Sistema Santa Fé

Aplicação interna para cadastro de consulentes e membros, configuração de trabalhos/serviços, criação de agendas e controle do fluxo diário de atendimentos. O frontend usa React, Vite, Tailwind CSS e Firebase Authentication/Firestore.

## Desenvolvimento

1. Copie `.env.example` para `.env.local` e configure o projeto Firebase.
2. Ative o provedor Google no Firebase Authentication.
3. Execute `npm install` e `npm run dev`.

Validações: `npm run lint` e `npm run build`.

Testes locais das Firestore Rules: `npm run test:rules`. O comando requer Java 21+ e usa exclusivamente o Firebase Emulator; consulte `docs/DEPLOY.md`.

## Segurança

O acesso exige conta Google e perfil ativo em `artifacts/{appId}/public/data/usuarios/{uid}`. Novos usuários recebem `role: "pendente"`. Consulte `docs/SECURITY.md` antes de publicar as regras e prepare o primeiro administrador.

Depois que o primeiro administrador é configurado manualmente, o módulo **Usuários** permite liberar, promover, ativar e desativar outras contas sem usar o Firebase Console.

Antes de qualquer publicação, siga `docs/FIRST_ADMIN.md` e `docs/DEPLOY.md`.

## Operação

O fluxo diário usa transições controladas de chegada, falta e conclusão. Agendas definem o tipo de trabalho, público e serviços disponíveis; limites são configurados por agenda e serviço. Cancelamentos preservam o histórico e geram auditoria. A tela de Pessoas oferece histórico de atendimentos, e agendas encerradas permanecem consultáveis sem aceitar novas alterações.

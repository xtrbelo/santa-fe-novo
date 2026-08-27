# Contexto do projeto

O Sistema Santa Fé centraliza pessoas, agendas, inscrições e o fluxo diário. É uma SPA Vite hospedável no Firebase Hosting. Os dados funcionais ficam sob `artifacts/{appId}/public/data`.

Módulos: Painel, Pessoas, Agendas, Fluxo do Dia e Configurações. A autenticação é exclusivamente Google; o documento Firestore do usuário determina o perfil e o acesso. Esta Fase 1 prioriza autorização, auditoria, integridade de CPF, vagas e consultas específicas por agenda.

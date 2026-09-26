# Pendências futuras

- Planejar e revisar uma migração opcional dos campos legados somente após autorização específica; o sistema usa adaptadores em tempo de execução e não exige essa migração.
- Acompanhar avisos de segurança transitivos do `firebase-tools` e atualizar quando houver versão corrigida compatível.
- Atualizar `firebase-functions` em uma fase técnica própria, com testes de compatibilidade.

## Melhorias futuras após a versão 26H

- 26I (opcional, sem prioridade atual): validação assistida do PDF assinado, com acesso ao VALIDAR/ITI, registro do resultado, data, responsável e histórico auditável. Não afirmar validação automática do certificado.

## Fechamento pendente da sequência homologada

- Backup pré-deploy de produção concluído em 25/09/2026 no bucket privado de backups.
- As alterações acumuladas até a versão 26H estão homologadas somente em HML.
- Produção, commit, push, merge e tag permanecem sujeitos aos checkpoints do fechamento técnico.

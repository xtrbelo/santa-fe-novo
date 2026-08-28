# Desenvolvimento local seguro

Testes destrutivos da Fase 6 devem ser feitos exclusivamente no Firestore Emulator. Nunca habilite o modo abaixo para validar contra dados remotos.

## Configuração

Crie um `.env.local` (ignorado pelo Git) com a configuração Firebase usada pelo projeto e:

```env
VITE_USE_FIRESTORE_EMULATOR=true
```

O emulador só é conectado quando o Vite está em desenvolvimento **e** a variável é exatamente `true`. Em build de produção ele nunca é ativado. Com `false` ou sem a variável, a aplicação usa o Firestore remoto.

## Execução em três terminais (PowerShell)

Terminal 1 — iniciar somente o Firestore local:

```powershell
npm run emulator
```

Terminal 2 — usar o UID mostrado pela conta Google logada localmente e criar dados fictícios:

```powershell
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
$env:EMULATOR_ADMIN_UID='<UID_DO_USUARIO_LOGADO>'
npm run seed:emulator
npm run validate:emulator
```

O UID não é salvo no repositório. O seed se recusa a executar sem `FIRESTORE_EMULATOR_HOST` e nunca possui fallback para produção.

Terminal 3 — iniciar a aplicação:

```powershell
npm run dev
```

O seed cria somente identidades e dados fictícios, incluindo as agendas A vazia para exclusão, B com histórico para testar o bloqueio, C aberta para cancelamento e D para validar as permissões do gestor. `validate:emulator` exercita essas operações automaticamente; para validação visual, execute novamente o seed antes de abrir o Vite. O login continua usando Firebase Auth real, mas todas as leituras e escritas do Firestore vão para `127.0.0.1:8080`.

Antes de qualquer teste destrutivo, confira no console do navegador que o Vite foi iniciado com `VITE_USE_FIRESTORE_EMULATOR=true` e mantenha o Terminal 1 aberto. Nunca use essas agendas de teste com o modo remoto.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('conclusão oferece retorno e abre Agendamentos com a pessoa selecionada', async () => {
  const flowCard = await readFile(new URL('../src/modules/Fluxo/AtendimentoDiaCard.jsx', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const schedules = await readFile(new URL('../src/modules/Agendas/AgendasModule.jsx', import.meta.url), 'utf8');
  assert.match(flowCard, /title="Agendar retorno"/);
  assert.match(flowCard, /st === 'Concluído'.*setReturnTarget/);
  assert.match(app, /setReturnRequest\(appointment\).*selectTab\(MODULES\.AGENDAS\)/);
  assert.match(schedules, /getAppDoc\('pessoas', returnRequest\.pessoaBaseId\)/);
  assert.match(schedules, /setPessoa\(\{ id: snapshot\.id, \.\.\.snapshot\.data\(\) \}\)/);
});

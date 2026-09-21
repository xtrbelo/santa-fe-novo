import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const moduleSource = readFileSync(new URL('../src/modules/Auditoria/AuditoriaModule.jsx', import.meta.url), 'utf8');
const functionSource = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
const rulesSource = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

test('retenção usa 24 meses e exige ação manual explícita', () => {
  assert.match(functionSource, /AUDIT_RETENTION_MONTHS = 24/);
  assert.match(functionSource, /request\.data\?\.action !== 'archive'/);
  assert.match(moduleSource, /Verificar elegíveis/);
  assert.match(moduleSource, /window\.confirm/);
});

test('arquivamento preserva o registro e separa a consulta', () => {
  assert.match(functionSource, /auditoria_arquivada/);
  assert.match(functionSource, /registroOriginalId/);
  assert.match(moduleSource, /Histórico ativo/);
  assert.match(moduleSource, /Arquivados/);
});

test('arquivo é somente leitura para clientes e restrito ao administrador', () => {
  assert.match(rulesSource, /auditoria_arquivada\/\{id\}[\s\S]*allow read: if isAdmin\(appId\);[\s\S]*allow write: if false;/);
});

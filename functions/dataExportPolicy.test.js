import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDataExportRequest } from './dataExportPolicy.js';

test('aceita somente módulos e totais autorizados', () => { assert.deepEqual(validateDataExportRequest({ module: 'pessoas', rowCount: 10, filters: 'ativos' }), { module: 'pessoas', rowCount: 10, filters: 'ativos' }); assert.throws(() => validateDataExportRequest({ module: 'usuarios', rowCount: 10 }), /EXPORTACAO_INVALIDA/); assert.throws(() => validateDataExportRequest({ module: 'pessoas', rowCount: 0 }), /EXPORTACAO_INVALIDA/); });
test('limita metadados dos filtros', () => assert.equal(validateDataExportRequest({ module: 'auditoria', rowCount: 1, filters: 'x'.repeat(700) }).filters.length, 500));

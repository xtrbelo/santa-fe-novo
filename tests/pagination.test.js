import test from 'node:test';
import assert from 'node:assert/strict';
import { paginateItems } from '../src/utils/pagination.js';

const items = Array.from({ length: 23 }, (_, index) => index + 1);

test('mostra 10 registros por padrão', () => {
  assert.deepEqual(paginateItems(items).items, items.slice(0, 10));
});

test('navega e limita a página ao intervalo válido', () => {
  assert.deepEqual(paginateItems(items, 2, 10).items, items.slice(10, 20));
  assert.equal(paginateItems(items, 99, 10).currentPage, 3);
});

test('aceita somente 10, 20, 50 ou 100 registros', () => {
  assert.equal(paginateItems(items, 1, 20).items.length, 20);
  assert.equal(paginateItems(items, 1, 7).items.length, 10);
});

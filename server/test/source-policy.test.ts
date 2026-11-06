import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { auditSources, budgetGrowthIssues } from '../../scripts/source-policy.js';

test('source policy rejects JS, new any and disabled TypeScript checking', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'game-source-policy-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, 'new.js'), 'export const value = 1;');
  writeFileSync(path.join(root, 'new.ts'), 'export const value: any = 1;');
  writeFileSync(path.join(root, 'unchecked.ts'), '// @ts-nocheck\nexport const value = 1;');
  const { issues } = auditSources(root, {});
  assert.equal(issues.length, 3);
  assert.ok(issues.some((issue) => issue.includes('authored JavaScript')));
  assert.ok(issues.some((issue) => issue.includes('explicit any')));
  assert.ok(issues.some((issue) => issue.includes('suppressing TypeScript')));
});

test('source policy permits existing debt but cannot move it to a new file', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'game-source-policy-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, 'legacy.ts'), 'export const value: any = 1;');
  mkdirSync(path.join(root, 'dist'));
  writeFileSync(path.join(root, 'dist', 'built.js'), 'export const value = 1;');
  assert.deepEqual(auditSources(root, { 'legacy.ts': 1 }).issues, []);
  writeFileSync(path.join(root, 'new.ts'), 'export const value: any = 1;');
  assert.equal(auditSources(root, { 'legacy.ts': 1 }).issues.length, 1);
});

test('committed debt budgets can decrease but cannot increase or add file allowances', () => {
  assert.deepEqual(budgetGrowthIssues({ 'legacy.ts': 2 }, { 'legacy.ts': 1 }), []);
  assert.equal(budgetGrowthIssues({ 'legacy.ts': 1 }, { 'legacy.ts': 2 }).length, 1);
  assert.equal(budgetGrowthIssues({ 'legacy.ts': 1 }, { 'legacy.ts': 1, 'new.ts': 1 }).length, 1);
});

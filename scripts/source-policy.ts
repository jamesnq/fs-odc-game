import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export type TypeDebtBudget = Record<string, number>;
export interface SourceAudit { issues: string[]; anyCounts: TypeDebtBudget; files: number }
const excluded = new Set(['node_modules', 'dist', '.git', '.worktrees', '.agents', '.claude', '.codex', 'captures']);

export function budgetGrowthIssues(previous: TypeDebtBudget, current: TypeDebtBudget): string[] {
  return Object.entries(current).filter(([file, count]) => count > (previous[file] ?? 0))
    .map(([file]) => `${file}: increasing the committed type-debt budget is forbidden`);
}

/** Inspect authored code; build outputs, local tools and assets are outside this policy. */
export function auditSources(root: string, budget: TypeDebtBudget): SourceAudit {
  const issues: string[] = [];
  const anyCounts: TypeDebtBudget = {};
  let files = 0;
  function inspect(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (excluded.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (entry.isDirectory()) { inspect(absolute); continue; }
      if (!entry.isFile()) continue;
      if (/\.(?:js|jsx|mjs|cjs)$/.test(entry.name)) {
        issues.push(`${relative}: authored JavaScript is forbidden; use TypeScript/TSX`);
        continue;
      }
      if (!/\.(?:ts|tsx|mts|cts)$/.test(entry.name)) continue;
      files++;
      const source = readFileSync(absolute, 'utf8');
      const ast = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true);
      let count = 0;
      function visit(node: ts.Node): void {
        if (node.kind === ts.SyntaxKind.AnyKeyword) count++;
        ts.forEachChild(node, visit);
      }
      visit(ast);
      if (count) anyCounts[relative] = count;
      if (count > (budget[relative] ?? 0)) issues.push(`${relative}: ${count} explicit any types exceeds existing budget ${budget[relative] ?? 0}`);
      const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.JSX, source);
      for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
        if ((token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia)
          && /^\s*(?:\/\/|\/\*)\s*@ts-(?:ignore|nocheck)\b/.test(scanner.getTokenText())) {
          issues.push(`${relative}: suppressing TypeScript checks is forbidden`);
        }
      }
    }
  }
  inspect(root);
  return { issues, anyCounts: Object.fromEntries(Object.entries(anyCounts).sort(([a], [b]) => a.localeCompare(b))), files };
}

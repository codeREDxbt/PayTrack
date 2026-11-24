/**
 * Splits a multi-statement SQL script into executable statements.
 *
 * Naively splitting on `;` breaks CREATE TRIGGER: its body is a sequence of
 * semicolon-terminated statements between BEGIN and END. The splitter
 * therefore tracks:
 *   - string / identifier quoting ('' escapes inside them),
 *   - line and block comments,
 *   - CREATE TRIGGER ... BEGIN ... END, where semicolons only end the trigger
 *     at the block depth the body started at (this also handles the nested
 *     CASE ... END and SELECT ... CASE ... END inside trigger bodies).
 */

const BEGIN_BLOCK_RE = /\bBEGIN\s*$/i;
const END_BLOCK_RE = /\bEND\s*$/i;

export function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let i = 0;
  // Depth > 0 while inside a CREATE TRIGGER body. 0 means plain statement text.
  let blockDepth = 0;
  let pendingTrigger = false;

  const trimmedTail = () => current.trim();

  while (i < sql.length) {
    const ch = sql[i];

    if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') current += sql[i++];
      continue;
    }
    if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      current += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      current += sql[i++];
      while (i < sql.length) {
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) {
            current += sql[i] + sql[i + 1];
            i += 2;
            continue;
          }
          current += sql[i++];
          break;
        }
        current += sql[i++];
      }
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      let word = '';
      while (i < sql.length && /[A-Za-z0-9_]/.test(sql[i])) word += sql[i++];
      current += word;
      const upper = word.toUpperCase();
      if (upper === 'CREATE' && blockDepth === 0) pendingTrigger = true;
      else if (pendingTrigger && upper === 'TRIGGER') pendingTrigger = false;
      if (upper === 'BEGIN' && BEGIN_BLOCK_RE.test(trimmedTail()) && blockDepth >= 0) {
        blockDepth += 1;
      } else if (upper === 'END' && END_BLOCK_RE.test(trimmedTail()) && blockDepth > 0) {
        blockDepth -= 1;
      }
      continue;
    }

    if (ch === ';' && blockDepth === 0) {
      const stmt = current.trim();
      if (stmt) statements.push(stmt);
      current = '';
      pendingTrigger = false;
      i += 1;
      continue;
    }

    current += ch;
    i += 1;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements.filter((s) => s && !/^[\s;]*$/.test(s));
}

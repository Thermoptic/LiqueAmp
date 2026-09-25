// Runs the pgTAP files in supabase/tests against the LINKED Supabase project
// without Docker (`supabase test db` needs Docker). Each file runs inside one
// PL/pgSQL subtransaction that is always rolled back: fixtures, the pgtap
// extension and every change disappear, nothing is left in the database.
//
//   npx supabase login && npx supabase link --project-ref <ref>   (once)
//   npm run db:test:remote                 (all files)
//   npm run db:test:remote -- friends      (files whose name contains "friends")
//
// The files stay plain pgTAP, so `npx supabase test db` works too wherever
// Docker is available. Supported file shape: statements end with ";" at the
// end of a line; a multi-line helper function ends with a line ending in "$$;".
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = 'supabase/tests';
const only = process.argv[2] ?? '';
const files = readdirSync(dir).filter((f) => f.endsWith('.test.sql') && f.includes(only));
const DROP = new Set(['begin;', 'rollback;', 'select * from finish();', 'create extension if not exists pgtap with schema extensions;']);
const ASSERTION = /^select (plan|has_table|col_is_pk|policies_are|results_eq|is_empty|isnt_empty|is|isnt|ok|lives_ok|throws_ok)\(/;

function statements(sql) {
  const out = [];
  let current = [];
  let inFunction = false;
  for (const line of sql.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('--') || DROP.has(t)) continue;
    current.push(line);
    // a multi-line function body: "create function … as $$" … "end $$;"
    if (!inFunction && t.endsWith('$$') && /^create (or replace )?function/i.test(current[0].trim())) inFunction = true;
    else if (inFunction ? t.endsWith('$$;') : t.endsWith(';')) {
      out.push(current.join('\n'));
      current = [];
      inFunction = false;
    }
  }
  if (current.join('').trim()) throw new Error(`unterminated statement: ${current.join('\n')}`);
  return out;
}

function wrap(sql) {
  // pgTAP prints its results; they are collected in a temp table readable by every test role.
  const body = [
    'create temporary table tap_out (ord serial, line text);',
    'grant all on tap_out to public; grant all on sequence tap_out_ord_seq to public;',
    ...statements(sql).map((s) => (ASSERTION.test(s.trim()) ? `insert into tap_out(line) ${s.trim()}` : s)),
  ].join('\n');
  if (body.includes('$BODY$')) throw new Error('test file must not contain $BODY$');
  return `create or replace function pg_temp.run_tap() returns table(line text) language plpgsql as $runner$
declare ctx text; lines text[] := '{}'; failure text := null;
begin
  begin
    create extension if not exists pgtap with schema extensions;
    execute $BODY$${body}$BODY$;
    execute 'reset role';
    select array_agg(t.line order by t.ord) into lines from tap_out t;
    raise exception 'tap_rollback';
  exception when others then
    if sqlerrm <> 'tap_rollback' then
      get stacked diagnostics ctx = pg_exception_context;
      failure := sqlstate || ' ' || sqlerrm || ' @ ' || ctx;
    end if;
  end;
  execute 'reset role';
  if failure is not null then return query select 'ERROR: ' || failure; end if;
  return query select unnest(lines);
end $runner$;
select * from pg_temp.run_tap();
`;
}

let failed = 0;
const tmp = mkdtempSync(join(tmpdir(), 'liqueamp-dbtest-'));
try {
  for (const file of files) {
    const path = join(tmp, file);
    writeFileSync(path, wrap(readFileSync(join(dir, file), 'utf8')));
    const raw = execFileSync('npx', ['supabase', 'db', 'query', '--linked', '-f', path], { encoding: 'utf8', shell: process.platform === 'win32' });
    const lines = JSON.parse(raw.slice(raw.indexOf('{'))).rows.map((r) => r.line);
    const planned = Number(/^1\.\.(\d+)$/.exec(lines[0] ?? '')?.[1] ?? NaN);
    const oks = lines.filter((l) => l.startsWith('ok ')).length;
    const bad = lines.filter((l) => l.startsWith('not ok') || l.startsWith('ERROR:'));
    console.log(`# ${file}`);
    for (const l of lines) console.log(l);
    if (bad.length || oks !== planned) failed++;
    console.log(bad.length || oks !== planned ? `# FAILED (${oks}/${planned})\n` : `# passed ${oks}/${planned}\n`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
if (!files.length) console.log(`no test files in ${dir} matching "${only}"`);
process.exit(failed ? 1 : 0);

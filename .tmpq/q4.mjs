import Database from 'better-sqlite3';
const db = new Database('data/gym.db', { readonly: true });
const A=1;
for (const [gap,win] of [[14,30],[21,30],[14,60],[21,60],[30,90]]) {
  const r = db.prepare(`
   WITH ent AS (SELECT aluno_id, timestamp ts, LAG(timestamp) OVER (PARTITION BY aluno_id ORDER BY timestamp) prev
                FROM access_events WHERE academy_id=? AND tipo_evento='entrada')
   SELECT COUNT(DISTINCT aluno_id) c FROM ent
   WHERE prev IS NOT NULL AND ts-prev >= ?*86400000 AND ts >= (strftime('%s','now')-?*86400)*1000`).get(A,gap,win);
  console.log(`gap>=${gap}d, retorno nos ultimos ${win}d:`, r.c);
}
console.log('--- novatos invisiveis: entrada<=45d, <=3 acessos, ultimo acesso <7d ---');
console.log(db.prepare(`
 SELECT COUNT(*) c FROM students s WHERE s.academy_id=? AND s.status IN ('ativo','inadimplente')
  AND s.data_entrada >= date('now','-45 days')
  AND (SELECT COUNT(*) FROM access_events e WHERE e.aluno_id=s.id AND e.tipo_evento='entrada') BETWEEN 1 AND 3
  AND COALESCE((SELECT MAX(timestamp) FROM access_events e WHERE e.aluno_id=s.id AND e.tipo_evento='entrada'),0) >= (strftime('%s','now')-7*86400)*1000`).get(A));
console.log('--- total matriculados entrada<=45d ---');
console.log(db.prepare(`SELECT COUNT(*) c FROM students WHERE academy_id=? AND status IN ('ativo','inadimplente') AND data_entrada >= date('now','-45 days')`).get(A));

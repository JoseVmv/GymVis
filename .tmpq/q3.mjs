import Database from 'better-sqlite3';
const db = new Database('data/gym.db', { readonly: true });
const A=1;
console.log('--- novatos (entrada <=45d) matriculados: acessos totais ---');
console.log(db.prepare(`
 SELECT (SELECT COUNT(*) FROM access_events e WHERE e.aluno_id=s.id AND e.tipo_evento='entrada') n, COUNT(*) qtd
 FROM students s WHERE s.academy_id=? AND s.status IN ('ativo','inadimplente')
   AND s.data_entrada >= date('now','-45 days')
 GROUP BY n ORDER BY n`).all(A));
console.log('--- novatos 45d com <=3 acessos ---');
console.log(db.prepare(`
 SELECT COUNT(*) c FROM students s WHERE s.academy_id=? AND s.status IN ('ativo','inadimplente')
  AND s.data_entrada >= date('now','-45 days')
  AND (SELECT COUNT(*) FROM access_events e WHERE e.aluno_id=s.id AND e.tipo_evento='entrada') <= 3`).get(A));
console.log('--- retornos: matriculados que ficaram 21+ dias sem vir e voltaram nos últimos 14d ---');
console.log(db.prepare(`
 WITH ent AS (SELECT aluno_id, timestamp ts, LAG(timestamp) OVER (PARTITION BY aluno_id ORDER BY timestamp) prev
              FROM access_events WHERE academy_id=? AND tipo_evento='entrada')
 SELECT COUNT(DISTINCT aluno_id) c FROM ent
 WHERE prev IS NOT NULL AND ts-prev >= 21*86400000 AND ts >= (strftime('%s','now')-14*86400)*1000`).get(A));
console.log('--- distribuicao mes de entrada dos matriculados (aniversario/renovacao) ---');
console.log(db.prepare(`
 SELECT substr(data_entrada,6,2) mes, COUNT(*) c FROM students WHERE academy_id=? AND status IN ('ativo','inadimplente') GROUP BY mes ORDER BY mes`).all(A));
console.log('--- risco alto/critico por plano (aprox: 30+ dias sem acesso) ---');
console.log(db.prepare(`
 SELECT p.nome, COUNT(*) c, SUM(s.mensalidade_centavos)/100.0 receita
 FROM students s JOIN plans p ON p.id=s.plano_id
 WHERE s.academy_id=? AND s.status IN ('ativo','inadimplente')
   AND COALESCE((SELECT MAX(timestamp) FROM access_events e WHERE e.aluno_id=s.id AND e.tipo_evento='entrada'),0) < (strftime('%s','now')-30*86400)*1000
 GROUP BY p.nome`).all(A));

import Database from 'better-sqlite3';
const db = new Database('data/gym.db', { readonly: true });
const A = 1;
// retenção por plano: % ainda matriculado 6 meses após entrada, por plano
console.log('--- sobrevivência 6m por plano ---');
console.log(db.prepare(`
  SELECT p.nome,
    COUNT(*) total,
    SUM(CASE WHEN s.data_saida IS NULL OR s.data_saida >= date(s.data_entrada,'+6 months') THEN 1 ELSE 0 END) viv6,
    ROUND(AVG(s.mensalidade_centavos)/100.0,2) ticket
  FROM students s JOIN plans p ON p.id=s.plano_id
  WHERE s.academy_id=? AND date(s.data_entrada,'+6 months') <= date('now')
  GROUP BY p.nome ORDER BY p.nome`).all(A));
console.log('--- ativos e receita por plano (hoje) ---');
console.log(db.prepare(`
  SELECT p.nome, COUNT(*) c, SUM(s.mensalidade_centavos)/100.0 receita
  FROM students s JOIN plans p ON p.id=s.plano_id
  WHERE s.academy_id=? AND s.status IN ('ativo','inadimplente') GROUP BY p.nome`).all(A));
console.log('--- acessos por hora (últimos 30d) ---');
console.log(db.prepare(`
  SELECT strftime('%H', timestamp/1000, 'unixepoch', 'localtime') h, COUNT(*) c
  FROM access_events WHERE academy_id=? AND tipo_evento='entrada' AND timestamp >= (strftime('%s','now')-30*86400)*1000
  GROUP BY h ORDER BY h`).all(A));
console.log('--- acessos por dia da semana (últimos 30d) ---');
console.log(db.prepare(`
  SELECT strftime('%w', timestamp/1000,'unixepoch','localtime') w, COUNT(*) c
  FROM access_events WHERE academy_id=? AND tipo_evento='entrada' AND timestamp >= (strftime('%s','now')-30*86400)*1000
  GROUP BY w ORDER BY w`).all(A));

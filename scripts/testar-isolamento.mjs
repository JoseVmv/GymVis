/**
 * Prova que cada conta só enxerga os dados da própria academia.
 * Faz login com dois donos diferentes e cruza os ids.
 */
const BASE = 'http://localhost:3001';

async function login(email, senha) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha }),
  });
  if (!r.ok) throw new Error(`login ${email}: ${r.status} ${await r.text()}`);
  return { cookie: r.headers.get('set-cookie').split(';')[0], user: (await r.json()).user };
}
const get = (c, p) => fetch(`${BASE}/api${p}`, { headers: { cookie: c } });

const a = await login('demo@gymvis.app', 'demo1234');
const b = await login('carlos@teste.com', 'senha12345');
console.log(`conta A: ${a.user.email} -> academia ${a.user.academyId} "${a.user.academyNome}"`);
console.log(`conta B: ${b.user.email} -> academia ${b.user.academyId} "${b.user.academyNome}"`);
if (a.user.academyId === b.user.academyId) throw new Error('as duas contas caíram na mesma academia!');

const listaA = (await (await get(a.cookie, '/students')).json()).students;
const listaB = (await (await get(b.cookie, '/students')).json()).students;
const idsA = new Set(listaA.map((s) => s.id));
const idsB = new Set(listaB.map((s) => s.id));
const intersecao = [...idsA].filter((id) => idsB.has(id));

console.log(`\nalunos vistos por A: ${listaA.length} | por B: ${listaB.length}`);
console.log(`alunos em comum: ${intersecao.length} ${intersecao.length === 0 ? '(correto)' : '<<< VAZAMENTO'}`);

// A tenta ler um aluno de B pelo id direto (IDOR)
const alvo = listaB[0].id;
const r1 = await get(a.cookie, `/students/${alvo}`);
console.log(`\nA tentando abrir o aluno ${alvo} (que é de B): HTTP ${r1.status} ${r1.status === 404 ? '(bloqueado)' : '<<< VAZOU'}`);

// A tenta editar um aluno de B
const r2 = await fetch(`${BASE}/api/students/${alvo}`, {
  method: 'PUT', headers: { cookie: a.cookie, 'Content-Type': 'application/json' },
  body: JSON.stringify({ nome: 'Invasao', email: null, telefone: null, planoId: listaA[0].planoId,
    promocaoId: null, mensalidadeCentavos: 100, dataEntrada: '2026-01-01', dataSaida: null, status: 'ativo' }),
});
console.log(`A tentando EDITAR o aluno ${alvo} de B: HTTP ${r2.status} ${r2.status === 404 ? '(bloqueado)' : '<<< VAZOU'}`);

// A tenta apagar um aluno de B
const r3 = await fetch(`${BASE}/api/students/${alvo}`, { method: 'DELETE', headers: { cookie: a.cookie } });
console.log(`A tentando EXCLUIR o aluno ${alvo} de B: HTTP ${r3.status} ${r3.status === 404 ? '(bloqueado)' : '<<< VAZOU'}`);

// confirma que o aluno de B continua intacto
const depois = (await (await get(b.cookie, `/students/${alvo}`)).json());
console.log(`aluno de B após as tentativas: "${depois.nome}" ${depois.nome !== 'Invasao' ? '(intacto)' : '<<< ALTERADO'}`);

// números agregados não podem coincidir por acaso
const ovA = await (await get(a.cookie, '/overview?period=30')).json();
const ovB = await (await get(b.cookie, '/overview?period=30')).json();
console.log(`\nalunos ativos A=${ovA.activeStudents} B=${ovB.activeStudents} | acessos A=${ovA.totalAccesses} B=${ovB.totalAccesses}`);

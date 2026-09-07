import Database from 'better-sqlite3';
const db = new Database('data/gym.db', { readonly: true });
console.log('TABLES', db.prepare("select name from sqlite_master where type='table'").all());
console.log('PLANS', db.prepare('select * from plans').all());
console.log('STATUS', db.prepare('select status, count(*) c from students where academy_id=1 group by status').all());
console.log('EVENT TYPES', db.prepare('select tipo_evento, count(*) c from access_events where academy_id=1 group by tipo_evento').all());
console.log('ACADEMIES', db.prepare('select * from academies').all());
console.log('STUDENT SAMPLE', db.prepare('select * from students where academy_id=1 limit 3').all());

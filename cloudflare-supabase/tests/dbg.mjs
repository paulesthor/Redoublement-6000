import './api.mjs';
const { call, settle, DB, J, env } = globalThis.__T;
let [s, r] = await call(null, 'POST', '/api/register', { name: 'Alice', password: 'secret1' }); const A = r.token;
[s, r] = await call(A, 'GET', '/api/catalog/search?q=paris'); console.log(s, J(r).slice(0, 400));
[s, r] = await call(A, 'GET', '/api/quiz/preview?q=Paris'); console.log(s, J(r).slice(0, 600));
process.exit(0);

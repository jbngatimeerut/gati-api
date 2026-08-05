import * as jwt from 'jsonwebtoken';
const token = jwt.sign({ sub: 'cmr22kgfd003ljon0thxcy9ud', role: 'ADMIN' }, 'local-dev-secret-12345');
import fetch from 'node-fetch';

(async () => {
  const r = await fetch('http://127.0.0.1:4000/api/messages/threads', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const t = await r.text();
  console.log(t);
})();

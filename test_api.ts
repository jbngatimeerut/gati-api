import * as jwt from 'jsonwebtoken';
const token = jwt.sign({ sub: 'cmr22kovh0069jon0js297tjh', role: 'ADMIN' }, 'local-dev-secret-12345');
import fetch from 'node-fetch';

(async () => {
  const r = await fetch('http://127.0.0.1:4000/api/messages/with/cmr22kgfd003ljon0thxcy9ud', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const t = await r.text();
  console.log(t);
})();

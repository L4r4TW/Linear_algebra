import { createServer } from 'node:http';

const page = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Experimental workspace</title>
<style>
  body { font: 18px/1.6 system-ui, sans-serif; max-width: 44rem; margin: 12vh auto; padding: 1.5rem; color: #18302a; background: #f4f8f6; }
  code { background: #e2ece6; padding: .2rem .4rem; border-radius: .25rem; }
</style>
<h1>Experimental workspace</h1>
<p>Your Docker sandbox is running.</p>
<p>Edit <code>workspace/server.mjs</code> to begin experimenting, then refresh this page.</p>
</html>`;

createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok', workspace: 'experimental' }));
    return;
  }
  if (request.url !== '/') {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(page);
}).listen(3000, '0.0.0.0', () => {
  console.log('Experimental workspace listening on port 3000');
});

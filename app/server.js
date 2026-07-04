// Task Manager POC — implements FR-1..FR-4 (see docs/requirements.md)
const http = require('http');

const tasks = []; // ponytail: in-memory per FR out-of-scope note; swap for DB when persistence needed
let nextId = 1;

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const { method, url } = req;

  // FR-4: health check
  if (method === 'GET' && url === '/health') return json(res, 200, { status: 'ok' });

  // FR-2: list tasks, newest first
  if (method === 'GET' && url === '/tasks') return json(res, 200, [...tasks].reverse());

  // FR-1: create task
  if (method === 'POST' && url === '/tasks') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let title;
      try {
        title = JSON.parse(body).title;
      } catch {
        return json(res, 400, { error: 'invalid JSON' });
      }
      if (typeof title !== 'string' || title.length < 1 || title.length > 100) {
        return json(res, 400, { error: 'title is required, 1-100 characters' });
      }
      const task = { id: nextId++, title, status: 'open' };
      tasks.push(task);
      return json(res, 201, task);
    });
    return;
  }

  // FR-3: complete task
  const m = url.match(/^\/tasks\/(\d+)\/complete$/);
  if (method === 'POST' && m) {
    const task = tasks.find((t) => t.id === Number(m[1]));
    if (!task) return json(res, 404, { error: 'task not found' });
    task.status = 'complete';
    return json(res, 200, task);
  }

  json(res, 404, { error: 'not found' });
});

const port = process.env.PORT || 3210;
server.listen(port, () => console.log(`task-manager listening on :${port}`));

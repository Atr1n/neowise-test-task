import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { performance } from 'node:perf_hooks';

let server, url;
before(async () => {
  process.env.PORT = '0';
  ({ server } = await import('../server.mjs'));
  if (!server.listening) await once(server, 'listening');
  url = `http://127.0.0.1:${server.address().port}/api/triage`;
});
after(async () => {
  if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
async function post(raw) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw });
  return { status: response.status, body: await response.json() };
}
const manual = { status: 200, body: { status: 'manual_review', topic: null, draft: null } };
for (const raw of ['{', '', '{}', 'null', '{"text":null}', '{"text":42}', '{"text":""}', '{"text":"  \\n "}']) {
  test(`invalid input: ${JSON.stringify(raw)}`, async () => {
    assert.deepEqual(await post(raw), { status: 400, body: { status: 'invalid_input' } });
  });
}
for (const [text, topic] of [['Когда доставка?', 'delivery'], ['Какая цена?', 'pricing'], ['Здравствуйте', 'other']]) {
  test(`valid topic: ${topic}`, async () => {
    assert.deepEqual(await post(JSON.stringify({ text })), { status: 200, body: { status: 'ready', topic, draft: 'Спасибо за обращение. Уточним детали заявки.' } });
  });
}
for (const marker of ['[error]', '[bad-json]', '[bad-topic]', '[empty-draft]', '[timeout]']) {
  test(`manual review: ${marker}`, async () => {
    const start = performance.now();
    assert.deepEqual(await post(JSON.stringify({ text: marker })), manual);
    if (marker === '[timeout]') assert.ok(performance.now() - start < 900, 'must not wait for the full 1200 ms mock delay');
  });
}

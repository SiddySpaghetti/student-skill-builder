// Self-check of the sequence-diagram flow: login -> roadmap -> progress -> skill gap &
// recommendation -> join project (role assignment) -> project status.  Run: npm test
import assert from 'node:assert/strict';
import { createServer } from './server.js';
import { openDb } from './db.js';

const server = createServer(openDb(':memory:')).listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://localhost:${server.address().port}/api`;

function client() {
  let cookie = '';
  return async (path, body, method = body ? 'POST' : 'GET') => {
    const res = await fetch(base + path, {
      method, headers: { 'Content-Type': 'application/json', cookie }, body: body && JSON.stringify(body),
    });
    cookie = res.headers.get('set-cookie')?.split(';')[0] ?? cookie;
    return { status: res.status, data: await res.json() };
  };
}

try {
  const a = client();
  assert.equal((await a('/me')).status, 401, 'API requires login');
  assert.equal((await a('/register', { name: 'A', email: 'bad', password: '123456' })).status, 400, 'email validated');
  assert.equal((await a('/register', { name: 'Asha', email: 'asha@test.dev', password: 'secret1' })).status, 200);
  assert.equal((await a('/register', { name: 'X', email: 'ASHA@test.dev', password: 'secret1' })).status, 409, 'duplicate email');
  await a('/logout', {});
  assert.equal((await a('/login', { email: 'asha@test.dev', password: 'wrong!!' })).status, 401, 'wrong password rejected');
  assert.equal((await a('/login', { email: 'asha@test.dev', password: 'secret1' })).status, 200);

  // Skill roadmap for "Full Stack Web Developer" (career 1)
  assert.equal((await a('/profile', { name: 'Asha', careerId: 1 }, 'PUT')).status, 200);
  let road = (await a('/roadmap')).data;
  assert.equal(road.topics[0].skill, 'HTML');
  assert.equal(road.percent, 0);
  assert.match(road.topics[0].video, /youtube\.com/);

  // Learning progress + skill gap
  for (const skill of ['HTML', 'CSS', 'JavaScript']) await a('/progress', { skill, done: true });
  road = (await a('/roadmap')).data;
  assert.equal(road.percent, 33);
  assert.equal(road.next, 'Git');
  assert.equal((await a('/progress', { skill: 'Cooking', done: true })).status, 400, 'unknown skill rejected');

  // Recommendations: Real-time Chat App needs CSS, JavaScript, Node.js -> 67% match, ranked first
  const projects = (await a('/projects')).data;
  assert.equal(projects[0].title, 'Real-time Chat App');
  assert.equal(projects[0].match, 67);
  assert.deepEqual(projects[0].missing, ['Node.js']);

  // Join: Asha gets a role she has a skill for; a second student gets a different role in the same team
  const team = (await a(`/projects/${projects[0].id}/join`, {})).data;
  assert.equal(team.myRole, 'UI Developer');
  assert.equal((await a(`/projects/${projects[0].id}/join`, {})).status, 409, 'no double join');

  const b = client();
  await b('/register', { name: 'Ben', email: 'ben@test.dev', password: 'secret2' });
  const teamB = (await b(`/projects/${projects[0].id}/join`, {})).data;
  assert.equal(teamB.id, team.id, 'joins the open team');
  assert.notEqual(teamB.myRole, team.myRole, 'roles are unique in a team');
  assert.equal(teamB.members.length, 2);

  // Project status: only members can update; finishing all 8 stages completes it
  const c = client();
  await c('/register', { name: 'Cy', email: 'cy@test.dev', password: 'secret3' });
  assert.equal((await c(`/teams/${team.id}/stage`, { stage: 3 })).status, 404, 'non-member blocked');
  assert.equal((await a(`/teams/${team.id}/stage`, { stage: 99 })).status, 400);
  assert.equal((await a(`/teams/${team.id}/stage`, { stage: 3 })).data.status, 'In progress');
  assert.equal((await a(`/teams/${team.id}/stage`, { stage: 8 })).data.status, 'Completed');

  // A completed team takes no new members: the next student starts a new team
  const teamC = (await c(`/projects/${projects[0].id}/join`, {})).data;
  assert.notEqual(teamC.id, team.id);

  const html = await fetch(base.replace('/api', '/'));
  assert.equal(html.status, 200);
  assert.equal((await fetch(base.replace('/api', '/..%2f..%2fserver.js'))).status, 404, 'no path traversal');

  console.log('All checks passed.');
} finally {
  server.close();
}

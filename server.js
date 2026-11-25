// Backend server: REST API (Authentication, Profile, Skill Roadmap, Progress Tracker,
// Skill Gap Analyzer, Project Recommender, Team Management, Project Guide & Tracking)
// plus static hosting of the frontend in ./public.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, STAGES } from './db.js';

const PUBLIC = fileURLToPath(new URL('./public/', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESSION_DAYS = 7;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };
const hash = (password, salt) => scryptSync(password, salt, 64).toString('hex');
const youtube = (skill) => `https://www.youtube.com/results?search_query=${encodeURIComponent(`${skill} tutorial for beginners`)}`;
const statusOf = (stage) => (stage >= STAGES.length ? 'Completed' : stage === 0 ? 'Not started' : 'In progress');

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 100_000) fail(413, 'Request too large.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    const body = JSON.parse(Buffer.concat(chunks));
    return body && typeof body === 'object' ? body : {};
  } catch {
    fail(400, 'Invalid JSON.');
  }
}

async function serveStatic(pathname, res) {
  const file = normalize(join(PUBLIC, pathname === '/' ? 'index.html' : pathname));
  try {
    if (!file.startsWith(PUBLIC)) throw new Error('outside public');
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

export function createServer(db) {
  const q = (sql) => db.prepare(sql);
  const skillsOf = (userId) => new Set(q('SELECT skill FROM progress WHERE user_id = ?').all(userId).map((r) => r.skill));

  function currentUser(req) {
    const token = /(?:^|;\s*)sid=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1];
    if (!token) return null;
    return q(`SELECT u.*, s.token FROM sessions s JOIN users u ON u.id = s.user_id
              WHERE s.token = ? AND s.created_at > datetime('now', ?)`).get(token, `-${SESSION_DAYS} days`);
  }

  function startSession(res, userId) {
    const token = randomBytes(24).toString('hex');
    q('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId);
    res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}`);
    return { ok: true };
  }

  function teamView(team, userId) {
    const members = q(`SELECT u.name, m.role, m.user_id FROM members m JOIN users u ON u.id = m.user_id
                       WHERE m.team_id = ? ORDER BY m.joined_at, u.name`).all(team.id);
    return {
      id: team.id,
      projectId: team.project_id,
      project: team.title,
      description: team.description,
      stage: team.stage,
      status: statusOf(team.stage),
      myRole: members.find((m) => m.user_id === userId)?.role,
      members: members.map(({ name, role }) => ({ name, role })),
      stages: STAGES,
    };
  }

  const myTeam = (teamId, userId) =>
    q(`SELECT t.*, p.title, p.description FROM teams t JOIN projects p ON p.id = t.project_id
       JOIN members m ON m.team_id = t.id WHERE t.id = ? AND m.user_id = ?`).get(teamId, userId);

  // [method, path pattern, handler, isPublic]
  const routes = [
    ['POST', /^\/api\/register$/, ({ body, res }) => {
      const name = String(body.name ?? '').trim();
      const email = String(body.email ?? '').trim().toLowerCase();
      const password = String(body.password ?? '');
      if (!name || !EMAIL.test(email) || password.length < 6) {
        fail(400, 'Enter your name, a valid email and a password of at least 6 characters.');
      }
      if (q('SELECT 1 FROM users WHERE email = ?').get(email)) fail(409, 'That email is already registered.');
      const salt = randomBytes(16).toString('hex');
      const { lastInsertRowid } = q('INSERT INTO users (name, email, salt, password_hash, branch, year) VALUES (?, ?, ?, ?, ?, ?)')
        .run(name, email, salt, hash(password, salt), String(body.branch ?? '').trim(), String(body.year ?? ''));
      return startSession(res, lastInsertRowid);
    }, true],

    ['POST', /^\/api\/login$/, ({ body, res }) => {
      const user = q('SELECT * FROM users WHERE email = ?').get(String(body.email ?? '').trim().toLowerCase());
      const ok = user && timingSafeEqual(Buffer.from(hash(String(body.password ?? ''), user.salt), 'hex'), Buffer.from(user.password_hash, 'hex'));
      if (!ok) fail(401, 'Invalid email or password.');
      return startSession(res, user.id);
    }, true],

    ['POST', /^\/api\/logout$/, ({ user, res }) => {
      q('DELETE FROM sessions WHERE token = ?').run(user.token);
      res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    }],

    ['GET', /^\/api\/careers$/, () =>
      q(`SELECT c.id, c.name, c.description, COUNT(t.id) AS topics FROM careers c
         LEFT JOIN topics t ON t.career_id = c.id GROUP BY c.id ORDER BY c.id`).all(), true],

    ['GET', /^\/api\/me$/, ({ user }) => ({
      id: user.id, name: user.name, email: user.email, branch: user.branch, year: user.year,
      careerId: user.career_id, skills: [...skillsOf(user.id)],
    })],

    ['PUT', /^\/api\/profile$/, ({ body, user }) => {
      const name = String(body.name ?? '').trim();
      if (!name) fail(400, 'Name is required.');
      const careerId = body.careerId ? Number(body.careerId) : null;
      if (careerId && !q('SELECT 1 FROM careers WHERE id = ?').get(careerId)) fail(400, 'Unknown career goal.');
      q('UPDATE users SET name = ?, branch = ?, year = ?, career_id = ? WHERE id = ?')
        .run(name, String(body.branch ?? '').trim(), String(body.year ?? ''), careerId, user.id);
    }],

    // Skill Roadmap + Skill Gap Analyzer (for the chosen career goal)
    ['GET', /^\/api\/roadmap$/, ({ user }) => {
      if (!user.career_id) return { career: null, topics: [] };
      const have = skillsOf(user.id);
      const career = q('SELECT id, name, description FROM careers WHERE id = ?').get(user.career_id);
      const topics = q('SELECT seq, skill, description FROM topics WHERE career_id = ? ORDER BY seq').all(user.career_id)
        .map((t) => ({ ...t, done: have.has(t.skill), video: youtube(t.skill) }));
      const done = topics.filter((t) => t.done).length;
      return {
        career, topics,
        percent: Math.round((100 * done) / topics.length),
        missing: topics.filter((t) => !t.done).map((t) => t.skill),
        next: topics.find((t) => !t.done)?.skill ?? null,
      };
    }],

    // Progress Tracker
    ['POST', /^\/api\/progress$/, ({ body, user }) => {
      const skill = String(body.skill ?? '');
      if (!q('SELECT 1 FROM topics WHERE skill = ?').get(skill)) fail(400, 'Unknown skill.');
      if (body.done) q('INSERT OR IGNORE INTO progress (user_id, skill) VALUES (?, ?)').run(user.id, skill);
      else q('DELETE FROM progress WHERE user_id = ? AND skill = ?').run(user.id, skill);
    }],

    // Project Recommender: rank by how many of the project's skills the student has learned.
    ['GET', /^\/api\/projects$/, ({ user }) => {
      const have = skillsOf(user.id);
      const joined = new Set(q('SELECT t.project_id FROM members m JOIN teams t ON t.id = m.team_id WHERE m.user_id = ?')
        .all(user.id).map((r) => r.project_id));
      return q('SELECT * FROM projects ORDER BY id').all().map((p) => {
        const roles = q('SELECT role, skill FROM project_roles WHERE project_id = ? ORDER BY rowid').all(p.id);
        const skills = [...new Set(roles.map((r) => r.skill))];
        const missing = skills.filter((s) => !have.has(s));
        const match = Math.round((100 * (skills.length - missing.length)) / skills.length);
        return { ...p, roles, skills, missing, match, joined: joined.has(p.id) };
      }).sort((a, b) => b.match - a.match || a.id - b.id);
    }],

    // Team Management: join the oldest unfinished team with a free role, else start a new team.
    // The student gets a free role matching a skill they have, if there is one.
    ['POST', /^\/api\/projects\/(\d+)\/join$/, ({ user, params }) => {
      const projectId = Number(params[0]);
      if (!q('SELECT 1 FROM projects WHERE id = ?').get(projectId)) fail(404, 'Project not found.');
      if (q('SELECT 1 FROM members m JOIN teams t ON t.id = m.team_id WHERE t.project_id = ? AND m.user_id = ?').get(projectId, user.id)) {
        fail(409, 'You are already in a team for this project.');
      }
      const roles = q('SELECT role, skill FROM project_roles WHERE project_id = ? ORDER BY rowid').all(projectId);
      const have = skillsOf(user.id);
      const pick = (free) => free.find((r) => have.has(r.skill)) ?? free[0];

      let teamId, role;
      for (const team of q('SELECT id FROM teams WHERE project_id = ? AND stage < ? ORDER BY id').all(projectId, STAGES.length)) {
        const taken = new Set(q('SELECT role FROM members WHERE team_id = ?').all(team.id).map((m) => m.role));
        const free = roles.filter((r) => !taken.has(r.role));
        if (free.length) { teamId = team.id; role = pick(free).role; break; }
      }
      if (!teamId) {
        teamId = q('INSERT INTO teams (project_id) VALUES (?)').run(projectId).lastInsertRowid;
        role = pick(roles).role;
      }
      q('INSERT INTO members (team_id, user_id, role) VALUES (?, ?, ?)').run(teamId, user.id, role);
      return teamView(myTeam(teamId, user.id), user.id);
    }],

    // Project Guide & Tracking
    ['GET', /^\/api\/teams$/, ({ user }) =>
      q(`SELECT t.*, p.title, p.description FROM teams t JOIN projects p ON p.id = t.project_id
         JOIN members m ON m.team_id = t.id WHERE m.user_id = ? ORDER BY m.joined_at DESC`)
        .all(user.id).map((t) => teamView(t, user.id))],

    ['POST', /^\/api\/teams\/(\d+)\/stage$/, ({ body, user, params }) => {
      const stage = Number(body.stage);
      if (!Number.isInteger(stage) || stage < 0 || stage > STAGES.length) fail(400, 'Invalid stage.');
      if (!myTeam(Number(params[0]), user.id)) fail(404, 'Team not found.');
      q('UPDATE teams SET stage = ? WHERE id = ?').run(stage, Number(params[0]));
      return teamView(myTeam(Number(params[0]), user.id), user.id);
    }],
  ];

  return http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (!pathname.startsWith('/api/')) return serveStatic(pathname, res);
    try {
      const route = routes.find(([method, re]) => method === req.method && re.test(pathname)) ?? fail(404, 'Not found.');
      const [, re, handler, isPublic] = route;
      const user = currentUser(req);
      if (!isPublic && !user) fail(401, 'Please log in.');
      const body = req.method === 'POST' || req.method === 'PUT' ? await readJson(req) : {};
      const out = handler({ body, user, params: re.exec(pathname).slice(1), res });
      send(res, 200, out ?? { ok: true });
    } catch (err) {
      if (!(err instanceof HttpError)) console.error(err);
      send(res, err.status ?? 500, { error: err instanceof HttpError ? err.message : 'Server error.' });
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  const port = Number(process.env.PORT) || 3000;
  createServer(openDb()).listen(port, () => console.log(`Student Skill Builder running at http://localhost:${port}`));
}

// Web Application (UI): talks to the backend only through the REST API.
const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const bar = (pct, ok = pct === 100) => `<div class="bar ${ok ? 'ok' : ''}" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>`;
let me = null;

async function api(path, body, method = body ? 'POST' : 'GET') {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong.'), { status: res.status });
  return data;
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

function onSubmit(form, handler) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button[type=submit]', form);
    const err = $('.error', form);
    btn.disabled = true;
    err.textContent = '';
    try { await handler(Object.fromEntries(new FormData(form))); }
    catch (ex) { err.textContent = ex.message; }
    finally { btn.disabled = false; }
  });
}

function renderNav(view) {
  const links = me
    ? [['dashboard', 'Dashboard'], ['roadmap', 'Skill Roadmap'], ['projects', 'Projects'], ['teams', 'My Teams'], ['profile', 'Profile']]
    : [['login', 'Log in'], ['register', 'Sign up']];
  $('#nav').innerHTML = links.map(([v, label]) =>
    `<a href="#/${v}" ${v === view ? 'aria-current="page"' : ''}>${label}</a>`).join('') +
    (me ? `<span class="spacer"></span><span class="who">${esc(me.name)}</span><button class="btn ghost small" id="logout">Log out</button>` : '');
  $('#logout')?.addEventListener('click', async () => {
    await api('/logout', {});
    me = null;
    location.hash = '#/login';
  });
}

// ---------- Views ----------

function login() {
  app.innerHTML = `
    <section class="auth">
      <div class="hero"><h1>Student Skill Builder</h1><p>Learn skills, find your gaps and join projects that match you.</p></div>
      <form class="card stack" novalidate>
        <h2>Log in</h2>
        <label>Email <input name="email" type="email" autocomplete="email" required></label>
        <label>Password <input name="password" type="password" autocomplete="current-password" required></label>
        <p class="error" role="alert"></p>
        <button class="btn" type="submit">Log in</button>
      </form>
      <p class="switch muted">New here? <a href="#/register">Create an account</a></p>
    </section>`;
  onSubmit($('form'), async (data) => {
    await api('/login', data);
    me = await api('/me');
    location.hash = '#/dashboard';
  });
}

function register() {
  app.innerHTML = `
    <section class="auth">
      <div class="hero"><h1>Create your account</h1><p>It takes a minute. Then pick a career goal.</p></div>
      <form class="card stack" novalidate>
        <label>Full name <input name="name" autocomplete="name" required></label>
        <label>Email <input name="email" type="email" autocomplete="email" required></label>
        <label>Password <input name="password" type="password" autocomplete="new-password" minlength="6" required></label>
        <label>Branch <input name="branch" placeholder="e.g. Computer Engineering"></label>
        <label>Year
          <select name="year"><option value="">Select</option>${[1, 2, 3, 4].map((y) => `<option>${y}</option>`).join('')}</select>
        </label>
        <p class="error" role="alert"></p>
        <button class="btn" type="submit">Sign up</button>
      </form>
      <p class="switch muted">Already registered? <a href="#/login">Log in</a></p>
    </section>`;
  onSubmit($('form'), async (data) => {
    await api('/register', data);
    me = await api('/me');
    toast('Account created. Choose your career goal.');
    location.hash = '#/profile';
  });
}

async function dashboard() {
  const [roadmap, projects, teams] = await Promise.all([api('/roadmap'), api('/projects'), api('/teams')]);
  const active = teams.filter((t) => t.status !== 'Completed').length;
  app.innerHTML = `
    <h1>Hi, ${esc(me.name.split(' ')[0])}</h1>
    <p class="muted">${roadmap.career ? `Your goal: <strong>${esc(roadmap.career.name)}</strong>` : 'You have not chosen a career goal yet.'}</p>
    ${roadmap.career ? '' : `<div class="card row"><span>Choose a career goal to get your skill roadmap.</span><a class="btn" href="#/profile">Choose goal</a></div>`}
    <div class="stats">
      <div class="card stat"><div class="value">${roadmap.career ? roadmap.percent : 0}%</div><div class="label">Roadmap complete</div>${bar(roadmap.percent || 0)}</div>
      <div class="card stat"><div class="value">${me.skills.length}</div><div class="label">Skills learned</div></div>
      <div class="card stat"><div class="value">${active}</div><div class="label">Active projects</div></div>
      <div class="card stat"><div class="value">${teams.length - active}</div><div class="label">Projects completed</div></div>
    </div>
    ${roadmap.next ? `<div class="card row"><span>Next skill to learn: <strong>${esc(roadmap.next)}</strong></span><a class="btn ghost" href="#/roadmap">Open roadmap</a></div>` : ''}
    <section class="section">
      <div class="row"><h2>Recommended projects</h2><a href="#/projects">See all</a></div>
      <div class="grid">${projects.filter((p) => !p.joined).slice(0, 3).map(projectCard).join('')}</div>
    </section>
    ${teams.length ? `<section class="section"><div class="row"><h2>My teams</h2><a href="#/teams">Open</a></div>
      <div class="grid">${teams.map((t) => `<div class="card"><div class="row"><h3>${esc(t.project)}</h3><span class="badge ${t.status.replace(' ', '-')}">${t.status}</span></div>
        <p class="muted">Role: ${esc(t.myRole)} · Stage ${Math.min(t.stage + 1, t.stages.length)} of ${t.stages.length}</p>${bar(Math.round((100 * t.stage) / t.stages.length))}</div>`).join('')}</div></section>` : ''}`;
  bindJoin();
}

async function profile() {
  const careers = await api('/careers');
  app.innerHTML = `
    <h1>Profile</h1>
    <form class="stack" novalidate>
      <div class="card stack">
        <label>Full name <input name="name" value="${esc(me.name)}" required></label>
        <label>Email <input value="${esc(me.email)}" disabled></label>
        <label>Branch <input name="branch" value="${esc(me.branch)}"></label>
        <label>Year
          <select name="year"><option value="">Select</option>${[1, 2, 3, 4].map((y) => `<option ${String(y) === me.year ? 'selected' : ''}>${y}</option>`).join('')}</select>
        </label>
      </div>
      <fieldset class="card" style="margin:0">
        <legend><h2 style="margin:0">Career goal</h2></legend>
        <p class="muted">Your skill roadmap is built from this goal. You can change it any time; learned skills are kept.</p>
        <div class="choices">${careers.map((c) => `
          <label class="choice">
            <input type="radio" name="careerId" value="${c.id}" ${c.id === me.careerId ? 'checked' : ''}>
            <div class="card"><h3>${esc(c.name)}</h3><p class="muted">${esc(c.description)}</p><span class="chip">${c.topics} topics</span></div>
          </label>`).join('')}
        </div>
      </fieldset>
      <p class="error" role="alert"></p>
      <div><button class="btn" type="submit">Save profile</button></div>
    </form>`;
  onSubmit($('form'), async (data) => {
    await api('/profile', data, 'PUT');
    me = await api('/me');
    toast('Profile saved.');
    location.hash = '#/roadmap';
  });
}

async function roadmap() {
  const r = await api('/roadmap');
  if (!r.career) {
    app.innerHTML = `<div class="card empty"><h1>No career goal yet</h1><p class="muted">Pick a goal and we will build your roadmap.</p><a class="btn" href="#/profile">Choose goal</a></div>`;
    return;
  }
  app.innerHTML = `
    <h1>${esc(r.career.name)} roadmap</h1>
    <p class="muted">${esc(r.career.description)}</p>
    <div class="card" style="margin:1rem 0">
      <div class="row"><strong>${r.percent}% complete</strong><span class="muted">${r.topics.length - r.missing.length} of ${r.topics.length} topics</span></div>
      ${bar(r.percent)}
      <h3 style="margin-top:1rem">Skill gap</h3>
      ${r.missing.length ? `<ul class="chips">${r.missing.map((s) => `<li class="chip gap">${esc(s)}</li>`).join('')}</ul>` : '<p class="muted">No gaps. You have learned every skill on this roadmap.</p>'}
    </div>
    <ol class="topics">${r.topics.map((t) => `
      <li class="card topic ${t.done ? 'done' : ''}">
        <span class="num">${t.done ? '✓' : t.seq}</span>
        <div><h3>${esc(t.skill)}</h3><p class="muted" style="margin:0">${esc(t.description)}</p></div>
        <div class="actions">
          <a class="btn ghost small" href="${esc(t.video)}" target="_blank" rel="noopener">Watch on YouTube</a>
          <label class="check"><input type="checkbox" data-skill="${esc(t.skill)}" ${t.done ? 'checked' : ''}> Learned</label>
        </div>
      </li>`).join('')}
    </ol>`;
  app.querySelectorAll('input[data-skill]').forEach((box) => box.addEventListener('change', async () => {
    box.disabled = true;
    try {
      await api('/progress', { skill: box.dataset.skill, done: box.checked });
      me = await api('/me');
      toast(box.checked ? `${box.dataset.skill} marked as learned.` : `${box.dataset.skill} unmarked.`);
      await roadmap();
    } catch (e) {
      box.checked = !box.checked;
      box.disabled = false;
      toast(e.message);
    }
  }));
}

function projectCard(p) {
  return `
    <article class="card project">
      <div class="head"><h3>${esc(p.title)}</h3><span class="badge">${esc(p.difficulty)}</span></div>
      <p class="muted">${esc(p.description)}</p>
      <div class="row"><small>Skill match</small><small><strong>${p.match}%</strong></small></div>
      ${bar(p.match)}
      <ul class="chips">${p.skills.map((s) => `<li class="chip ${p.missing.includes(s) ? 'gap' : 'have'}">${esc(s)}</li>`).join('')}</ul>
      <ul class="roles">${p.roles.map((r) => `<li>${esc(r.role)} (${esc(r.skill)})</li>`).join('')}</ul>
      <div class="foot">
        <small class="muted">${p.missing.length ? `To learn: ${esc(p.missing.join(', '))}` : 'You have every skill needed'}</small>
        ${p.joined ? '<a class="btn ghost small" href="#/teams">Joined</a>' : `<button class="btn small" data-join="${p.id}">Join</button>`}
      </div>
    </article>`;
}

function bindJoin() {
  app.querySelectorAll('[data-join]').forEach((btn) => btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const team = await api(`/projects/${btn.dataset.join}/join`, {});
      toast(`Joined ${team.project} as ${team.myRole}.`);
      location.hash = '#/teams';
    } catch (e) {
      btn.disabled = false;
      toast(e.message);
    }
  }));
}

async function projects() {
  const list = await api('/projects');
  app.innerHTML = `
    <h1>Project recommendations</h1>
    <p class="muted">Ranked by how many of each project's skills you have learned. Green skills you have, orange ones are your gap.</p>
    <div class="grid">${list.map(projectCard).join('')}</div>`;
  bindJoin();
}

async function teams() {
  const list = await api('/teams');
  if (!list.length) {
    app.innerHTML = `<div class="card empty"><h1>No team yet</h1><p class="muted">Join a recommended project to get a team role and a development guide.</p><a class="btn" href="#/projects">Browse projects</a></div>`;
    return;
  }
  app.innerHTML = `<h1>My teams</h1><p class="muted">Follow the development guide and update your project status as your team finishes each stage.</p>` +
    list.map((t) => `
    <section class="card team">
      <div class="row"><h2>${esc(t.project)}</h2><span class="badge ${t.status.replace(' ', '-')}">${t.status}</span></div>
      <p class="muted">${esc(t.description)}</p>
      <p>Your role: <strong>${esc(t.myRole)}</strong></p>
      <h3>Team members</h3>
      <ul class="members">${t.members.map((m) => `<li>${esc(m.name)} · ${esc(m.role)}</li>`).join('')}</ul>
      <div style="margin-top:1rem">${bar(Math.round((100 * t.stage) / t.stages.length))}</div>
      <ol class="stages">${t.stages.map((s, i) => {
        const state = i < t.stage ? 'done' : i === t.stage ? 'current' : '';
        const action = i < t.stage
          ? `<button class="btn ghost small" data-team="${t.id}" data-stage="${i}" aria-label="Reopen ${esc(s.name)}">Undo</button>`
          : i === t.stage ? `<button class="btn small" data-team="${t.id}" data-stage="${i + 1}">Mark done</button>` : '';
        return `<li class="stage ${state}"><span class="dot">${i < t.stage ? '✓' : i + 1}</span>
          <div><strong>${esc(s.name)}</strong>${state === 'current' ? `<p class="tip">${esc(s.tip)}</p>` : ''}</div>${action}</li>`;
      }).join('')}</ol>
    </section>`).join('');
  app.querySelectorAll('[data-stage]').forEach((btn) => btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const t = await api(`/teams/${btn.dataset.team}/stage`, { stage: Number(btn.dataset.stage) });
      toast(t.status === 'Completed' ? `${t.project} completed!` : `Status: ${t.status}`);
      await teams();
    } catch (e) {
      btn.disabled = false;
      toast(e.message);
    }
  }));
}

// ---------- Router ----------

const views = { login, register, dashboard, profile, roadmap, projects, teams };
const PUBLIC_VIEWS = ['login', 'register'];

async function route() {
  const name = location.hash.replace(/^#\//, '') || 'dashboard';
  if (!me) me = await api('/me').catch(() => null);
  if (!me && !PUBLIC_VIEWS.includes(name)) { location.hash = '#/login'; return; }
  if (me && PUBLIC_VIEWS.includes(name)) { location.hash = '#/dashboard'; return; }
  const view = views[name] ? name : 'dashboard';
  renderNav(view);
  app.innerHTML = '<p class="muted">Loading…</p>';
  try {
    await views[view]();
    app.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } catch (e) {
    if (e.status === 401) { me = null; location.hash = '#/login'; return; }
    app.innerHTML = `<p class="error">${esc(e.message)}</p>`;
  }
}

window.addEventListener('hashchange', route);
route();

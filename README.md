# Student Skill Builder & Project Matcher

A web app for students to follow a skill roadmap toward a career goal, track their learning, see their skill gaps, get project recommendations, join a team with a role, and track the project through a development guide.

## Run

Needs Node.js 22.13 or newer. There is nothing to install.

```
npm start      # http://localhost:3000
npm test       # runs the full login → roadmap → progress → recommend → join → status flow
```

The database `skill_builder_db.sqlite` is created and seeded on first start. Delete it to reset.

## How it maps to the lab diagrams

| Diagram element | Where |
|---|---|
| Web Application (UI): HTML, CSS, JavaScript | `public/` |
| Backend Server / Node.js REST API | `server.js` |
| Authentication | `/api/register`, `/api/login`, `/api/logout` |
| Profile Management | `/api/me`, `/api/profile` |
| Skill Roadmap (+ YouTube resources) | `/api/roadmap` |
| Progress Tracker | `/api/progress` |
| Skill Gap Analyzer | `missing` in `/api/roadmap` and `/api/projects` |
| Project Recommender | `/api/projects` (ranked by skill match) |
| Team Management (role assignment) | `/api/projects/:id/join` |
| Project Guide & Tracking (status) | `/api/teams`, `/api/teams/:id/stage` |
| Database `skill_builder_db` | `db.js` |

// Database component: skill_builder_db (users, topics, progress, skills, projects, teams).
// ponytail: built-in SQLite (node:sqlite) instead of MySQL so it runs with zero installs;
// the SQL is plain enough to move to MySQL with mysql2 if the deployment needs a DB server.
import { DatabaseSync } from 'node:sqlite';

// Project development guide, in the order of the project activity diagram.
export const STAGES = [
  ['Requirements Analysis', 'Meet your team, list what the project must do, who will use it and the main features.'],
  ['Technology Selection', 'Choose the languages, frameworks and database, based on what the team already knows.'],
  ['UI/UX Design', 'Sketch the main screens and how a user moves from one screen to the next.'],
  ['Database Design', 'Decide the tables, their fields and how they relate to each other.'],
  ['Implementation', 'Split the work by role and build features in small pieces. Commit to Git often.'],
  ['Integration', 'Connect the frontend, backend and database, and fix what breaks between them.'],
  ['Testing', 'Test each feature (unit, API and UI tests), log bugs and retest after every fix.'],
  ['Deployment', 'Host the app, share the link and write a short README for users.'],
].map(([name, tip]) => ({ name, tip }));

const CAREERS = [
  ['Full Stack Web Developer', 'Build complete web apps, from the page in the browser to the server and the database.', [
    ['HTML', 'Page structure: elements, links, forms and semantic tags.'],
    ['CSS', 'Styling and layout with Flexbox, Grid and media queries.'],
    ['JavaScript', 'Variables, functions, the DOM, events and async/await.'],
    ['Git', 'Version control: commits, branches and pull requests on GitHub.'],
    ['React', 'Components, props, state and hooks for building user interfaces.'],
    ['Node.js', 'JavaScript on the server, npm packages and Express.'],
    ['SQL', 'Tables, queries, joins and indexes in MySQL.'],
    ['REST APIs', 'Designing endpoints, HTTP methods, status codes and JSON.'],
    ['Testing', 'Unit tests with Jest and API tests with Postman.'],
  ]],
  ['Data Scientist', 'Turn raw data into insights and predictions using statistics and machine learning.', [
    ['Python', 'Syntax, data types, functions and working with files.'],
    ['Statistics', 'Mean, variance, probability, distributions and hypothesis tests.'],
    ['NumPy & Pandas', 'Loading, cleaning and transforming tabular data.'],
    ['Data Visualization', 'Charts with Matplotlib and Seaborn that tell a clear story.'],
    ['SQL', 'Querying and joining data stored in relational databases.'],
    ['Machine Learning', 'Regression, classification and model evaluation with scikit-learn.'],
    ['Git', 'Versioning notebooks and code, and collaborating on GitHub.'],
  ]],
  ['Android Developer', 'Design and build mobile apps for Android phones.', [
    ['Java', 'Object-oriented programming: classes, inheritance and collections.'],
    ['Kotlin', 'The modern Android language: null safety, data classes and coroutines.'],
    ['Android Studio', 'Activities, layouts, Jetpack Compose and the emulator.'],
    ['Git', 'Version control for app source code.'],
    ['REST APIs', 'Calling web services from the app with Retrofit.'],
    ['Firebase', 'Authentication, Firestore database and push notifications.'],
    ['Testing', 'Unit tests with JUnit and UI tests with Espresso.'],
  ]],
  ['Cloud & DevOps Engineer', 'Automate how software is built, shipped and run on cloud servers.', [
    ['Linux', 'Shell commands, file permissions, processes and scripting.'],
    ['Git', 'Branching strategies and code review workflows.'],
    ['Networking', 'IP addresses, DNS, HTTP/HTTPS, ports and firewalls.'],
    ['Docker', 'Images, containers, Dockerfiles and Docker Compose.'],
    ['CI/CD', 'Automated build, test and deploy pipelines with GitHub Actions.'],
    ['AWS', 'EC2, S3, IAM and RDS: the core cloud services.'],
    ['Kubernetes', 'Pods, deployments and services for running containers at scale.'],
  ]],
];

// [title, difficulty, description, [[team role, skill the role needs], ...]]
const PROJECTS = [
  ['Student Attendance Portal', 'Beginner', 'Teachers mark attendance online and students see their attendance percentage.',
    [['Frontend Developer', 'JavaScript'], ['Backend Developer', 'Node.js'], ['Database Designer', 'SQL']]],
  ['Online Bookstore', 'Intermediate', 'Browse books, add them to a cart and place orders, with an admin page for stock.',
    [['React Developer', 'React'], ['API Developer', 'REST APIs'], ['Database Designer', 'SQL'], ['Tester', 'Testing']]],
  ['Real-time Chat App', 'Intermediate', 'Group chat rooms for classmates with live messages.',
    [['UI Developer', 'CSS'], ['Frontend Developer', 'JavaScript'], ['Backend Developer', 'Node.js']]],
  ['Movie Recommender', 'Intermediate', 'Suggest movies to a user based on ratings from similar users.',
    [['Python Developer', 'Python'], ['Data Engineer', 'NumPy & Pandas'], ['ML Engineer', 'Machine Learning']]],
  ['College Placement Dashboard', 'Beginner', 'Charts of placement statistics by branch, company and year.',
    [['Python Developer', 'Python'], ['Database Designer', 'SQL'], ['Data Analyst', 'Data Visualization']]],
  ['Expense Tracker App', 'Beginner', 'An Android app to log daily expenses and see monthly totals.',
    [['Android Developer', 'Kotlin'], ['UI Designer', 'Android Studio'], ['Backend Developer', 'Firebase']]],
  ['Campus Notes Sharing App', 'Intermediate', 'Students upload and download class notes by subject.',
    [['Android Developer', 'Java'], ['API Developer', 'REST APIs'], ['Tester', 'Testing']]],
  ['CI/CD Pipeline for a Web App', 'Intermediate', 'Every push is built, tested and deployed automatically.',
    [['Version Control Lead', 'Git'], ['Container Engineer', 'Docker'], ['DevOps Engineer', 'CI/CD']]],
  ['Cloud Deployed Microservices', 'Advanced', 'Split an app into services and run them on a Kubernetes cluster in AWS.',
    [['Linux Admin', 'Linux'], ['Container Engineer', 'Docker'], ['Orchestration Engineer', 'Kubernetes'], ['Cloud Engineer', 'AWS']]],
];

const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS careers (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY, career_id INTEGER NOT NULL REFERENCES careers(id),
  seq INTEGER NOT NULL, skill TEXT NOT NULL, description TEXT NOT NULL,
  UNIQUE (career_id, skill));
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  salt TEXT NOT NULL, password_hash TEXT NOT NULL,
  branch TEXT NOT NULL DEFAULT '', year TEXT NOT NULL DEFAULT '',
  career_id INTEGER REFERENCES careers(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS progress (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, skill TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, skill));
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL UNIQUE, difficulty TEXT NOT NULL, description TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS project_roles (
  project_id INTEGER NOT NULL REFERENCES projects(id), role TEXT NOT NULL, skill TEXT NOT NULL,
  PRIMARY KEY (project_id, role));
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id),
  stage INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS members (
  team_id INTEGER NOT NULL REFERENCES teams(id), user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL, joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (team_id, user_id), UNIQUE (team_id, role));
`;

function seed(db) {
  db.exec('BEGIN');
  const career = db.prepare('INSERT INTO careers (name, description) VALUES (?, ?)');
  const topic = db.prepare('INSERT INTO topics (career_id, seq, skill, description) VALUES (?, ?, ?, ?)');
  for (const [name, description, topics] of CAREERS) {
    const { lastInsertRowid: id } = career.run(name, description);
    topics.forEach(([skill, text], i) => topic.run(id, i + 1, skill, text));
  }
  const project = db.prepare('INSERT INTO projects (title, difficulty, description) VALUES (?, ?, ?)');
  const role = db.prepare('INSERT INTO project_roles (project_id, role, skill) VALUES (?, ?, ?)');
  for (const [title, difficulty, description, roles] of PROJECTS) {
    const { lastInsertRowid: id } = project.run(title, difficulty, description);
    for (const [name, skill] of roles) role.run(id, name, skill);
  }
  db.exec('COMMIT');
}

export function openDb(file = 'skill_builder_db.sqlite') {
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  if (!db.prepare('SELECT COUNT(*) AS n FROM careers').get().n) seed(db);
  return db;
}

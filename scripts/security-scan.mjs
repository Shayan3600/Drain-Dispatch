import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, relative } from 'node:path';
import { parse } from 'dotenv';

// Never emit matching text, environment contents, or subprocess diagnostics.
const root = process.cwd();
const failures = [];
const git = (args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) throw new Error('Git inspection failed; scan incomplete.');
  return result.stdout;
};
const privateFiles = [];
function findPrivateFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!['.git', 'node_modules', '.data', '.tmp', 'uploads', 'dist', 'test-results', 'playwright-report', '.agents', '.codex'].includes(entry.name)) findPrivateFiles(resolve(directory, entry.name));
    } else if (/(?:^\.env(?:\.|$)|\.env(?:\.|$)|credentials)/i.test(entry.name) && entry.name !== '.env.example') {
      privateFiles.push(resolve(directory, entry.name));
    }
  }
}
findPrivateFiles(root);
const knownSecrets = new Set();
for (const file of privateFiles) {
  if (!statSync(file).isFile()) continue;
  const values = parse(readFileSync(file));
  for (const [name, value] of Object.entries(values)) {
    if (!/(?:SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|DATABASE_URL|CONNECTION_STRING|PROJECT_ID)/i.test(name) || value.length < 8) continue;
    if (/^(?:example|placeholder|your[-_]|replace[-_])/i.test(value)) continue;
    knownSecrets.add(value);
    knownSecrets.add(encodeURIComponent(value));
    if (/(?:DATABASE_URL|CONNECTION_STRING)/i.test(name)) {
      try {
        const password = decodeURIComponent(new URL(value).password);
        if (password.length >= 8) {
          knownSecrets.add(password);
          knownSecrets.add(encodeURIComponent(password));
        }
      } catch { /* Invalid URLs are reported by config validation, never echoed. */ }
    }
  }
}
const rules = [
  ['google-api-key', /AIza[0-9A-Za-z_-]{35}/g],
  ['github-token', /\b(?:gh[pousr]_[0-9A-Za-z]{30,}|github_pat_[0-9A-Za-z_]{40,})\b/g],
  ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  ['database-password', /postgres(?:ql)?:\/\/[^\s/:]+:([^\s@]+)@([^\s/:?]+)/g],
  ['cloudinary-secret-url', /cloudinary:\/\/[^\s/:]+:([^\s@]+)@/g],
];
function scan(content, location) {
  for (const value of knownSecrets) {
    if (content.includes(value)) failures.push({ location, rule: 'local-credential-match' });
  }
  for (const [name, pattern] of rules) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      // Fictional examples are permitted; real credential-bearing URLs are not.
      if (match[1] && /^(?:password|example|placeholder|your_password|replace_me|test|secret)$/i.test(match[1])) continue;
      if (name === 'database-password' && /\.(?:example|invalid)$/i.test(match[2] || '')) continue;
      failures.push({ location, rule: name });
    }
  }
}
try {
  const tracked = git(['ls-files', '-z']).split('\0').filter(Boolean);
  const untracked = git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
  for (const path of [...tracked, ...untracked]) {
    if (/(?:^|\/)(?:\.env(?:\.|$)|[^/]*credentials[^/]*|[^/]+\.env(?:\.|$))/i.test(path) && !path.endsWith('/.env.example') && path !== '.env.example') failures.push({location:path, rule:'tracked-private-file'});
    const absolute = resolve(root, path);
    if (existsSync(absolute) && statSync(absolute).isFile()) scan(readFileSync(absolute, 'utf8'), path);
  }
  // Verify the exact public build as well, without uploading or logging its contents.
  function scanPublicBuild(directory) {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, {withFileTypes:true})) {
      const file = resolve(directory, entry.name);
      if (entry.isDirectory()) scanPublicBuild(file);
      else scan(readFileSync(file, 'utf8'), `public-build:${relative(root,file)}`);
    }
  }
  scanPublicBuild(resolve(root,'client/dist'));
  const staged = git(['diff', '--cached', '--name-only', '-z']).split('\0').filter(Boolean);
  for (const path of staged) {
    const result = spawnSync('git', ['show', `:${path}`], { cwd:root, encoding:'utf8', maxBuffer:32*1024*1024 });
    if (result.status === 0) scan(result.stdout, `staged:${path}`);
    else if (existsSync(resolve(root,path))) throw new Error('Staged file inspection failed.');
  }
  const history = git(['rev-list', '--all']).trim().split('\n').filter(Boolean);
  const seen = new Set();
  for (const commit of history) {
    scan(git(['show', '-s', '--format=%B', commit]), `commit:${commit.slice(0, 12)}`);
    const tree = git(['ls-tree', '-r', '-z', commit]).split('\0').filter(Boolean);
    for (const entry of tree) {
      const parsed = /^\d+ blob ([a-f0-9]+)\t(.+)$/.exec(entry);
      if (!parsed) continue;
      const [, blob, path] = parsed;
      if (seen.has(blob)) continue;
      seen.add(blob);
      if (/(?:^|\/)(?:\.env(?:\.|$)|[^/]*credentials[^/]*|[^/]+\.env(?:\.|$))/i.test(path) && !path.endsWith('/.env.example') && path !== '.env.example') failures.push({location:`history:${commit.slice(0,12)}:${path}`,rule:'historical-private-file'});
      scan(git(['cat-file', 'blob', blob]), `history:${commit.slice(0,12)}:${path}`);
    }
  }
  const ignored = privateFiles.every(file => spawnSync('git', ['check-ignore', '-q', '--', relative(root, file)], {cwd:root}).status === 0);
  if (!ignored) failures.push({location:'private environment files', rule:'missing-gitignore'});
  const unique = [...new Map(failures.map(f => [JSON.stringify(f), f])).values()];
  console.log(JSON.stringify({ok:unique.length===0,trackedFiles:tracked.length,untrackedSourceFiles:untracked.length,stagedFiles:staged.length,historyCommits:history.length,historyBlobs:seen.size,privateFilesIgnored:ignored,findings:unique},null,2));
  process.exitCode = unique.length ? 1 : 0;
} catch {
  console.error('Secret scan could not complete. Publication is blocked until inspection succeeds.');
  process.exitCode = 2;
}

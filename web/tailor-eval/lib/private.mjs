/**
 * Keeps private output out of commits. A path inside the repository may be written only when
 * git ignores it. A path outside the repository, such as the temp folder, is allowed.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function runGit(args, cwd) {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
}

/** Throws unless git ignores the file, or the file is outside the repository. */
export function assertIgnoredPath(file, { git = runGit, what = 'results' } = {}) {
  let top;
  try {
    top = path.resolve(git(['rev-parse', '--show-toplevel'], HERE));
  } catch {
    return;
  }
  const relative = path.relative(top, path.resolve(file));
  if (relative.startsWith('..') || path.isAbsolute(relative)) return;
  try {
    git(['check-ignore', '-q', '--no-index', relative.split(path.sep).join('/')], top);
  } catch {
    throw new Error(`Refusing to write ${what} to ${relative}, because git does not ignore it. Add web/tailor-eval/private/ to .gitignore first.`);
  }
}

/** The same check for a folder: a file written inside it must be ignored. */
export function assertPrivateFolder(dir, options = {}) {
  assertIgnoredPath(path.join(dir, 'probe.json'), options);
}

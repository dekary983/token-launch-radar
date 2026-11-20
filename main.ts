import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

function arg(name: string, fallback: string): string {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  if (index !== -1 && process.argv[index + 1] !== undefined) return process.argv[index + 1]!;
  const equals = process.argv.find((value) => value.startsWith(`${flag}=`));
  return equals === undefined ? fallback : equals.slice(flag.length + 1);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`launch radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exitCode = 2;
} else {
  const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
  const { board, radar } = buildRadar(snapshot);
  const issue = boardIssue(board, snapshot);
  if (typeof issue === 'string') {
    process.stderr.write(`launch radar: the model wrote a board the gate refuses: ${issue}\n`);
    process.exitCode = 1;
  } else {
    const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
    writeFileSync(join(out, 'data.js'), dataScript(radar));

    function copyTree(from: string, to: string): string[] {
      if (!existsSync(from)) return [];
      mkdirSync(to, { recursive: true });
      const copied: string[] = [];
      for (const name of readdirSync(from).sort()) {
        if (name.startsWith('.')) continue;
        const source = join(from, name);
        const destination = join(to, name);
        const stats = statSync(source);
        if (stats.isDirectory()) {
          copied.push(...copyTree(source, destination).map((child) => `${name}/${child}`));
        } else if (stats.isFile()) {
          copyFileSync(source, destination);
          copied.push(name);
        }
      }
      return copied;
    }

    const pageFiles = copyTree(join(here, 'dashboard'), join(out, 'dashboard'));
    const shots = copyTree(join(here, 'screenshots'), join(out, 'screenshots'));
    if (shots.length < 3) {
      process.stderr.write(`launch radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
      process.exitCode = 1;
    } else {
      const invalidShot = shots.find((name) => !/^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/.test(name));
      if (invalidShot !== undefined) {
        process.stderr.write(`launch radar: screenshots/${invalidShot}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
        process.exitCode = 1;
      } else {
        writeFileSync(join(out, 'dossier.json'), buildDossier(out, {
          text_max_bytes: 65536,
          screenshots: { max: 4, max_bytes: 524288 },
          dashboard: { max_files: 400, max_bytes: 4194304 },
        }));
        process.stdout.write(`launch radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${radar.board_size} rows scored (${radar.early_size} early, ${radar.live_size} live peers shown)\n`);
        process.stdout.write(`launch radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${pageFiles.length} files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`);
      }
    }
  }
}

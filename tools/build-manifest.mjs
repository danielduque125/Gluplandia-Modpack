import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const packVersion = process.env.PACK_VERSION || '1.0.0';
const fabricVersion = process.env.FABRIC_VERSION || '0.19.5';
const owner = process.env.GITHUB_REPOSITORY_OWNER || 'danielduque125';
const repo = (process.env.GITHUB_REPOSITORY || `${owner}/Gluplandia-Modpack`).split('/')[1];
const branch = process.env.PACK_BRANCH || 'main';
const root = path.resolve(`packs/${packVersion}`);
const manifestPath = path.join(root, 'manifest.json');
const areas = ['mods', 'config', 'resourcepacks', 'shaderpacks'];
const baseUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/packs/${packVersion}`;

async function sha256(file) {
  const data = await fs.readFile(file);
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function walk(relative, files) {
  const dir = path.join(root, relative);
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  for (const entry of entries) {
    const relativePath = `${relative}/${entry.name}`.replaceAll('\\', '/');
    const absolutePath = path.join(root, relativePath);
    if (entry.isSymbolicLink()) throw new Error(`No se permiten enlaces simbólicos en ${relativePath}`);
    if (entry.isDirectory()) {
      await walk(relativePath, files);
      continue;
    }
    if (relative === 'mods' && !entry.name.toLowerCase().endsWith('.jar')) continue;
    const stat = await fs.stat(absolutePath);
    if (stat.size < 1) throw new Error(`Archivo vacío no permitido ${relativePath}`);
    const encoded = relativePath.split('/').map(encodeURIComponent).join('/');
    files.push({
      id: relativePath,
      name: entry.name,
      path: relativePath,
      url: `${baseUrl}/${encoded}`,
      sha256: await sha256(absolutePath),
      size: stat.size,
      required: true
    });
  }
}

const files = [];
for (const area of areas) await walk(area, files);
files.sort((a, b) => a.path.localeCompare(b.path));

let previous = null;
try {
  previous = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const comparablePrevious = previous ? {
  schemaVersion: previous.schemaVersion,
  version: previous.version,
  minecraftVersion: previous.minecraftVersion,
  fabricVersion: previous.fabricVersion,
  files: previous.files
} : null;
const comparableNext = {
  schemaVersion: 1,
  version: packVersion,
  minecraftVersion: '26.2',
  fabricVersion,
  files
};
const changed = JSON.stringify(comparablePrevious) !== JSON.stringify(comparableNext);
const previousRevision = Number.isSafeInteger(previous?.revision) && previous.revision > 0 ? previous.revision : 0;
const revision = changed ? previousRevision + 1 : Math.max(previousRevision, 1);

const manifest = {
  schemaVersion: 1,
  version: packVersion,
  revision,
  minecraftVersion: '26.2',
  fabricVersion,
  files
};

await fs.mkdir(root, { recursive: true });
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Manifest generado con ${files.length} archivos y revisión ${revision}.`);

#!/usr/bin/env node
/**
 * Anvi Mitra ERP local storage connector.
 *
 * This is a small, permissioned bridge for a school-owned PC/NAS folder.
 * It never scans outside the explicitly selected root directory.
 * Use READ_ONLY=1 to disable writes.
 */
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(process.env.ERP_LOCAL_ROOT || '.');
const readOnly = process.env.READ_ONLY === '1';

function safePath(relativePath) {
  if (!relativePath || path.isAbsolute(relativePath)) throw new Error('A relative path is required');
  const target = path.resolve(root, relativePath);
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error('Path escapes selected ERP folder');
  return target;
}

async function manifest() {
  const out = [];
  async function walk(dir, rel = '') {
    for (const item of await fs.readdir(dir, {withFileTypes:true})) {
      const childRel = path.join(rel, item.name);
      const child = path.join(dir, item.name);
      if (item.isDirectory()) await walk(child, childRel);
      else if (item.isFile()) {
        const stat = await fs.stat(child);
        const hash = crypto.createHash('sha256').update(await fs.readFile(child)).digest('hex');
        out.push({path: childRel.replaceAll(path.sep,'/'), size: stat.size, mtimeMs: stat.mtimeMs, sha256: hash});
      }
    }
  }
  await walk(root);
  return out.sort((a,b)=>a.path.localeCompare(b.path));
}

async function copyFromServer(relativePath, sourceFile) {
  if (readOnly) throw new Error('Connector is read-only');
  const target = safePath(relativePath);
  await fs.mkdir(path.dirname(target), {recursive:true});
  await fs.copyFile(sourceFile, target);
  return target;
}

async function remove(relativePath) {
  if (readOnly) throw new Error('Connector is read-only');
  await fs.rm(safePath(relativePath), {force:true,recursive:true});
}

async function main() {
  await fs.mkdir(root,{recursive:true});
  const command = process.argv[2] || 'manifest';
  if (command === 'manifest') console.log(JSON.stringify({root,readOnly,files:await manifest()},null,2));
  else if (command === 'remove') await remove(process.argv[3]);
  else if (command === 'copy') await copyFromServer(process.argv[3], process.argv[4]);
  else throw new Error('Commands: manifest | copy <relativePath> <sourceFile> | remove <relativePath>');
}

main().catch(error=>{ console.error(error.message); process.exitCode=1; });

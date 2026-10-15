// Existing documents only: read-only S3 GetObject, local files outside Git.
// Requires @aws-sdk/client-s3 (npm dependencies, or NODE_PATH to an installed workspace).
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const base = path.join(root, '.research', fs.readFileSync(path.join(root, '.research/LATEST'), 'utf8').trim());
const sha = buffer => createHash('sha256').update(buffer).digest('hex');
const quote = s => "'" + s.replaceAll("'", "'\\''") + "'";

async function main() {
  process.umask(0o077);
  const data = JSON.parse(fs.readFileSync(path.join(base, 'cohort.json')));
  const dest = path.join(base, 'documents');
  fs.mkdirSync(dest, { recursive: true, mode: 0o700 });
  // Only these storage settings leave the source container; never print or persist them.
  const keys = ['S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_FORCE_PATH_STYLE'];
  const source = `process.stdout.write(JSON.stringify(Object.fromEntries(${JSON.stringify(keys)}.map(k=>[k,process.env[k]]))))`;
  const env = JSON.parse(execFileSync('sudo', ['-n', 'ssh', '-T', '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes',
    '-o', 'ConnectTimeout=12', '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=/home/debian/.ssh/known_hosts',
    '-i', '/etc/ssh/ssh_host_ed25519_key', 'root@pq.soul.it',
    `cd /srv/soul-pq && docker compose -p soul-prospect-qualifier exec -T api node -e ${quote(source)}`], {encoding:'utf8', timeout:30000}));
  if (env.S3_BUCKET !== 'soul-pq-production' || env.S3_ENDPOINT !== 'https://r3-it.storage.cloud.it') throw new Error('Unexpected source storage');
  const client = new S3Client({endpoint:env.S3_ENDPOINT, region:env.S3_REGION, forcePathStyle:env.S3_FORCE_PATH_STYLE !== 'false',
    credentials:{accessKeyId:env.S3_ACCESS_KEY_ID, secretAccessKey:env.S3_SECRET_ACCESS_KEY}});
  const manifest = [];
  const downloaded = new Map();
  try {
    for (const doc of data.PropertyDocument) {
      let hash = downloaded.get(doc.storageKey);
      if (!hash) {
        const cached = doc.sha256 && path.join(dest, `${doc.sha256}.pdf`);
        let bytes;
        if (cached && fs.existsSync(cached)) bytes = fs.readFileSync(cached);
        else {
          const response = await client.send(new GetObjectCommand({Bucket:env.S3_BUCKET, Key:doc.storageKey}));
          bytes = Buffer.from(await response.Body.transformToByteArray());
        }
        hash = sha(bytes);
        if (doc.sha256 && doc.sha256 !== hash) throw new Error(`Checksum mismatch: ${doc.id}`);
        if (doc.sizeBytes != null && doc.sizeBytes !== bytes.length) throw new Error(`Size mismatch: ${doc.id}`);
        fs.writeFileSync(path.join(dest, `${hash}.pdf`), bytes, {mode:0o600});
        downloaded.set(doc.storageKey, hash);
      }
      manifest.push({id:doc.id, propertyId:doc.propertyId, type:doc.type, sha256:hash, file:`${hash}.pdf`});
      if (manifest.length % 50 === 0) process.stdout.write(`Verified ${manifest.length}/${data.PropertyDocument.length} document references\n`);
    }
    fs.writeFileSync(path.join(base, 'document-manifest.json'), JSON.stringify(manifest, null, 2)+'\n', {mode:0o600});
    console.log(JSON.stringify({references:manifest.length, distinctObjects:downloaded.size, distinctFiles:new Set(manifest.map(x=>x.sha256)).size}));
  } finally {client.destroy();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});

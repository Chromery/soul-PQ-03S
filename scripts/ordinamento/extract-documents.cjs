// Execute inside the existing API image with --network none and the snapshot mounted read-only at /data.
// stdout is JSON; redirect it to .research/<snapshot>/document-text.json.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const manifest = JSON.parse(fs.readFileSync('/data/document-manifest.json'));
const result = {};
for (const doc of manifest) {
  if (result[doc.sha256]) continue;
  try {
    const text = execFileSync('pdftotext', ['-layout', `/data/documents/${doc.file}`, '-'], {encoding:'utf8', timeout:30000, maxBuffer:8*1024*1024, stdio:['ignore','pipe','pipe']});
    result[doc.sha256] = {text, method:'pdftotext', characters:text.trim().length};
  } catch (error) {result[doc.sha256] = {text:'', method:'failed', error:String(error.status || 'extraction_error'), characters:0};}
}
process.stdout.write(JSON.stringify(result)+'\n');

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
function run(mode) {
 const dir=mkdtempSync(path.join(tmpdir(),"pq-backup-fixture-")), bin=path.join(dir,"bin"), data=path.join(dir,"data");mkdirSync(bin);mkdirSync(data);
 const scripts={ pg_dump:'while [ "$1" != "-f" ]; do shift; done; shift; printf fixture > "$1"; exit "${DUMP_EXIT:-0}"', pg_restore:'exit 0', aws:'test "$AWS_REQUEST_CHECKSUM_CALCULATION" = "${EXPECTED_CHECKSUM_MODE:-when_required}" || exit 90; test "$AWS_RESPONSE_CHECKSUM_VALIDATION" = "${EXPECTED_CHECKSUM_MODE:-when_required}" || exit 91; exit "${AWS_EXIT:-0}"' };
 for(const [name,body] of Object.entries(scripts))writeFileSync(path.join(bin,name),"#!/bin/sh\n"+body+"\n",{mode:0o700});
 try {const r=spawnSync("sh",["scripts/postgres-backup.sh"],{encoding:"utf8",timeout:5000,env:{PATH:bin+":"+process.env.PATH,BACKUP_DIR:data,BACKUP_ONCE:"true",POSTGRES_DB:"fixture",S3_ENDPOINT:"https://unused.invalid",S3_BUCKET:"fixture",S3_ACCESS_KEY_ID:"fixture",S3_SECRET_ACCESS_KEY:"fixture",...mode}});
 return {status:r.status, files:readdirSync(data).map(name=>({name,mode:statSync(path.join(data,name)).mode&0o777}))};
 }finally{rmSync(dir,{recursive:true,force:true});}
}
test("failed database dump is not reported as success or left as a complete archive",()=>assert.deepEqual(run({DUMP_EXIT:"1"}),{status:1,files:[]}));
test("remote upload failure propagates but preserves the valid local recovery copy",()=>{const r=run({AWS_EXIT:"1"});assert.equal(r.status,1);assert.equal(r.files.length,1);assert.match(r.files[0].name,/\.dump$/);assert.equal(r.files[0].mode,0o600);});
test("validated complete local and remote backup succeeds",()=>{const r=run({});assert.equal(r.status,0);assert.equal(r.files.length,1);assert.equal(r.files[0].mode,0o600);});
test("an explicit checksum policy overrides the compatible default",()=>{const r=run({AWS_REQUEST_CHECKSUM_CALCULATION:"when_supported",AWS_RESPONSE_CHECKSUM_VALIDATION:"when_supported",EXPECTED_CHECKSUM_MODE:"when_supported"});assert.equal(r.status,0);});

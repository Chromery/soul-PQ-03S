import { test } from "node:test";
import assert from "node:assert/strict";
import { checkDeployment } from "./deployment-preflight.mjs";
const password="test-only-"+"x".repeat(32);
const valid={APP_ENV:"production",CLERK_SECRET_KEY:"sk_live_fixture",VITE_CLERK_PUBLISHABLE_KEY:"pk_live_fixture",
 CLERK_AUTHORIZED_PARTIES:"https://pq.example.com",CORS_ORIGIN:"https://pq.example.com",ERP_SYNC_TOKEN:"t".repeat(40),POSTGRES_PASSWORD:password,
 DATABASE_URL_DOCKER:`postgresql://soul:${password}@postgres:5432/soul_pq`,DB_PORT:"127.0.0.1:5432",API_PORT:"127.0.0.1:3001",WEB_PORT:"127.0.0.1:8080",
 S3_ENDPOINT:"https://s3.example.com",S3_REGION:"eu",S3_BUCKET:"fixture",S3_ACCESS_KEY_ID:"fixture",S3_SECRET_ACCESS_KEY:"fixture",S3_KEY_PREFIX:"erp",BACKUP_REMOTE_PREFIX:"backups/postgres",NEURALWATT_API_KEY:"fixture"};
test("migration preflight accepts a complete isolated configuration",()=>assert.deepEqual(checkDeployment(valid).failures,[]));
test("migration preflight catches weak defaults, public ports and wrong environment",()=>{
 for(const changes of [{POSTGRES_PASSWORD:"soul_dev_password"},{API_PORT:"3001"},{VITE_CLERK_PUBLISHABLE_KEY:"pk_test_fixture"},{ERP_SYNC_TOKEN:""},{APP_ENV:"staging"},{PQ_AUTOMATION_SECRET:"x".repeat(32)}])
  assert.ok(checkDeployment({...valid,...changes}).failures.length>0);
});

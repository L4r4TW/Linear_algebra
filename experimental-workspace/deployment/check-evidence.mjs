import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {readFileSync} from 'node:fs';
import {runtimeFingerprint} from '../application/server/catalog-compatibility.mjs';import {listExercises,inspectCatalogCompatibility} from '../application/server/exercise-catalog.mjs';
const report=JSON.parse(readFileSync(new URL('../compatibility/regression-observations.json',import.meta.url)));
assert.equal(report.fixtureCatalogFingerprint,createHash('sha256').update(readFileSync(new URL('../compatibility/catalog.json',import.meta.url))).digest('hex'));assert.equal(report.runtimeFingerprint,runtimeFingerprint());assert.equal(report.complete,true);assert.equal(report.partial,false);
assert.equal(report.exercises.length,44);
const enabled=new Set(listExercises().map(entry=>entry.id));assert.equal(enabled.size,6);
assert.ok(inspectCatalogCompatibility().filter(entry=>entry.enabled).every(entry=>enabled.has(entry.id)));
for(const row of report.exercises.filter(row=>enabled.has(row.id))){assert.equal(row.passed,true);assert.equal(row.sourceVerified,true);assert.deepEqual(row.limitations,[]);}
console.log(JSON.stringify({matchingRuntime:true,completeCases:44,enabled:enabled.size,importedActivation:false}));

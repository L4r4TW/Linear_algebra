import {readFileSync} from 'node:fs';
import {assessCatalogEntry,runtimeFingerprint} from './catalog-compatibility.mjs';
const read=file=>JSON.parse(readFileSync(new URL('./'+file,import.meta.url),'utf8'));
export function createExerciseCatalog({catalog,profile,evidence,batches,fingerprint}){
 const entries=new Map();
 for(const entry of catalog.exercises){if(entries.has(entry.id))throw new Error('Duplicate catalog exercise ID.');entries.set(entry.id,structuredClone(entry));}
 const assessment=entry=>assessCatalogEntry(entry,{profile,evidence,batches:batches.batches,fingerprint});
 return {
  listExercises(){return [...entries.values()].filter(entry=>assessment(entry).enabled).map(({id,title,topicId,topic,description})=>({id,title,topicId,topic,description}));},
  getExerciseById(id){const entry=entries.get(id);return entry&&assessment(entry).enabled?structuredClone(entry):undefined;},
  inspectCompatibility(){return [...entries.values()].map(entry=>({id:entry.id,...assessment(entry)}));}
 };
}
const service=createExerciseCatalog({catalog:read('exercise-catalog.json'),profile:read('compatibility-profile.json'),evidence:read('catalog-compatibility-evidence.json'),batches:read('activation-batches.json'),fingerprint:runtimeFingerprint()});
export const listExercises=()=>service.listExercises();
export const getExerciseById=id=>service.getExerciseById(id);
// Operator-only; not an HTTP endpoint. Includes indexed/disabled failure details.
export const inspectCatalogCompatibility=()=>service.inspectCompatibility();

// Reference normalization for reviewed operator snapshots only. Not imported by the student runtime.
import {createHash} from 'node:crypto';
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));return value;}
export function compatibilityModelDigest(value){return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');}
export function normalizeCompatibilityModel({catalog,profile,evidence,batches,fingerprint,assess,generatedAt=new Date().toISOString()}){
 if(typeof assess!=='function')throw Error('The existing trusted catalog assessor is required.');
 const ids=catalog.exercises.map(e=>e.id);if(new Set(ids).size!==ids.length)throw Error('Duplicate catalog identity.');
 const expected=profile.seeds.flatMap(seed=>profile.viewports.map(viewport=>JSON.stringify([seed,viewport])));
 const requirements=[],evidenceBindings=[],cases=[],decisions=[];
 let coverageComplete=evidence.complete===true;
 for(const entry of catalog.exercises){
  const proof=evidence.entries?.[entry.id],requiredCapabilities=structuredClone(entry.compatibility?.requiredCapabilities??[]);
  requirements.push({exerciseId:null,legacyId:entry.id,sourceVersionId:null,sourceIdentity:structuredClone(entry.source?{repository:entry.source.repository,revision:entry.source.revision,path:entry.source.path,sha256:entry.source.sha256}:null),requiredCapabilities,requirementsDigest:compatibilityModelDigest([...requiredCapabilities].sort()),provenance:'existing-catalog-declaration-not-new-detection'});
  if(proof)evidenceBindings.push({bindingKey:entry.id,sourceVersionId:null,testedSourceIdentity:structuredClone(proof.source??null),testedRendererPath:proof.rendererPath??null,testedRequiredCapabilities:structuredClone(proof.requiredCapabilities??[]),repositoryIdentity:null,repositoryProvenance:'not-explicit-in-legacy-evidence-envelope'});
  const rows=proof?.cases??[],seen=new Set(rows.map(c=>JSON.stringify([c.verificationSeed,c.viewport])));
  const complete=rows.length===expected.length&&seen.size===rows.length&&expected.every(key=>seen.has(key));coverageComplete&&=complete;
  for(const [ordinal,c]of rows.entries())cases.push({caseId:null,legacyId:entry.id,evidenceBindingKey:entry.id,snapshotOrdinal:ordinal,verificationSeed:c.verificationSeed,viewport:c.viewport,sourceVerified:c.sourceVerified===true,reportedPassed:c.passed===true,phase:c.phase??null,checks:structuredClone(c.checks??{}),correctScore:c.correctScore??null,clearedScore:c.clearedScore??null,limitations:structuredClone(c.limitations??[]),failureCode:c.error??null,capabilityFailures:structuredClone(c.capabilityFailures??[]),attemptOrdinal:null,provenance:'legacy-selected-case-observation-not-attempt-history'});
  const decision=assess(entry,{profile,evidence,batches:batches.batches,fingerprint});
  decisions.push({decisionId:null,exerciseId:null,legacyId:entry.id,status:decision.status,enabled:decision.enabled,coverageComplete:complete,issues:structuredClone(decision.issues),authority:'existing-local-assessCatalogEntry',notNewApproval:true});
 }
 const requiredPass=c=>c.sourceVerified&&c.reportedPassed&&c.phase==='complete'&&profile.checks.every(check=>c.checks[check]===true)&&c.correctScore===1&&c.clearedScore===0;
 const passing=cases.filter(requiredPass).length;
 return {version:1,kind:'compatibility-model-example',state:'design-only-not-applied',generatedAt,digestMethod:'SHA-256 of recursively key-sorted JSON; array order retained. Not a raw-file checksum or signature.',
  environmentObservation:{runtimeFingerprint:evidence.runtimeFingerprint,currentRuntimeFingerprint:fingerprint,matchesCurrentRuntime:evidence.runtimeFingerprint===fingerprint,rendererRevision:evidence.rendererRevision,sourceRevision:evidence.sourceRevision,pgRevision:null,dependencyManifestDigest:null,workerIdentity:null,provenance:'legacy-envelope-only-not-new-environment-certification'},
  profileObservation:{profileId:null,key:profile.version,contentDigest:compatibilityModelDigest(profile),scope:profile.scope,seeds:structuredClone(profile.seeds),viewports:structuredClone(profile.viewports),checks:structuredClone(profile.checks),capabilities:Object.entries(profile.capabilities).map(([key,value])=>({key,...structuredClone(value)}))},
  runObservation:{runId:null,origin:'existing catalog-compatibility-evidence.json',observedAt:evidence.observedAt,sourceEnvelopeDigest:compatibilityModelDigest(evidence),reportedComplete:evidence.complete===true,selectedCoverageComplete:coverageComplete,targetLegacyIds:ids,expectedCaseCount:ids.length*expected.length,recordedCaseCount:cases.length,requiredPassingCaseCount:passing,requiredFailingCaseCount:cases.length-passing,allRequiredCasesPass:coverageComplete&&cases.length===passing,attemptHistoryStatus:'not-recorded',approvalActor:null,newRendererExecution:false},
  requirements,evidenceBindings,caseObservations:cases,eligibilityDecisions:decisions,
  activationObservations:batches.batches.map(batch=>({batchId:null,legacyBatchId:batch.id,state:batch.state,profileKey:batch.profileVersion,targetLegacyIds:[...batch.exerciseIds],deploymentScope:profile.scope,approvalActor:null,eventHistoryStatus:'not-recorded',sourceVersionPins:'not-expressed-in-legacy-batch-format',historicalEvents:[]})),
  summary:{indexed:ids.length,enabled:decisions.filter(d=>d.enabled).length,statusCounts:Object.fromEntries(['unverified','verified','limited','unsupported','failed','stale'].map(status=>[status,decisions.filter(d=>d.status===status).length])),knownFailureCodes:[...new Set(cases.map(c=>c.failureCode).filter(Boolean))]},
  constraints:['Model normalization is not publication, new verification or UUID allocation.','Unknown environment/attempt/approval history stays null or explicitly not-recorded.','Retain required failures even when unsupported takes classification precedence.','Compatibility, activation, metadata publication and rights/deployment policy remain separate.']};
}

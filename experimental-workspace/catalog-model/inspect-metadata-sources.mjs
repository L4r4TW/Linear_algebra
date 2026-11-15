// Header/notice inventory only. Never executes PG or interprets a license as permission.
import assert from 'node:assert/strict';import {readFile,readdir,writeFile,lstat} from 'node:fs/promises';import {createHash} from 'node:crypto';import {dirname,join} from 'node:path';import {execFileSync} from 'node:child_process';
const root='/usr/app/webwork-open-problem-library',input=globalThis.metadataSourceInput;
const sha=b=>createHash('sha256').update(b).digest('hex');
const head=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
const rootLicense=await readFile(root+'/OPL_LICENSE');
const fields=['Author','Institution','Level','Language','KEYWORDS','TitleText1','AuthorText1'];
const entries=[];
for(const entry of input.entries){assert.equal(entry.appliesTo.revision,head);const parts=entry.appliesTo.path.split('/');assert.equal(parts[0],'OpenProblemLibrary');let location=root;for(const part of parts){assert.ok(part&&part!=='.'&&part!=='..'&&!part.includes('\\'));location=join(location,part);assert.ok(!(await lstat(location)).isSymbolicLink());}const bytes=await readFile(location);assert.equal(sha(bytes),entry.appliesTo.sha256);
 const declarations=[];bytes.toString('utf8').split(/\r?\n/).forEach((text,i)=>{const m=text.match(/^\s*#+\s*([A-Za-z][A-Za-z0-9]*)\s*\((.*)\)\s*$/);if(!m)return;const field=fields.find(f=>f.toLowerCase()===m[1].toLowerCase());if(field)declarations.push({field,line:i+1,argument:m[2],text});});
 const notices=[];let dir=dirname(location);while(dir.startsWith(root+'/')){for(const file of await readdir(dir,{withFileTypes:true})){if(!file.isFile()||!/^(?:LICEN[SC]E|COPYING|COPYRIGHT|README)(?:[._-].*)?$/i.test(file.name))continue;const path=join(dir,file.name);notices.push({path:path.slice(root.length+1),sha256:sha(await readFile(path)),reviewState:'not-reviewed'});}dir=dirname(dir);}
 entries.push({legacyId:entry.legacyId,source:entry.appliesTo,declarations,parentNoticeCandidates:notices,individualAndAssetNoticeReview:'not-performed'});
}
const report={version:1,kind:'metadata-source-observations',observedAt:new Date().toISOString(),sourceRevision:head,method:'Read-only lexical declaration and ancestor-notice inventory; no PG execution, student data, language inference, difficulty mapping or license clearance.',rootLicense:{path:'OPL_LICENSE',sha256:sha(rootLicense),reviewState:'conditional-default-evidence-not-clearance'},entries,complete:true};
await writeFile('/tmp/metadata-source-observations.json',JSON.stringify(report,null,2)+'\n');console.log('PASS: '+entries.length+' source hashes and metadata/notice inventories.');

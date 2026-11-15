import {parseFragment} from 'parse5';
/** Project authored student messages, never answer/solution objects or HTML attributes. */
export function feedbackText(value) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > 64_000) throw new Error('Invalid feedback message.');
  const blocks = new Set(['div','p','br','li','ul','ol','tr']);
  function text(node) {
    if (node.nodeName === '#text') return node.value;
    const attrs=Object.fromEntries((node.attrs??[]).map(a=>[a.name,a.value]));
    if (['style','iframe','object','embed','template','noscript','annotation','annotation-xml'].includes(node.tagName) ||
        'hidden' in attrs || attrs['aria-hidden']==='true' || /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attrs.style??'') ||
        /(?:^|\s)(?:correct[_-]ans(?:wer)?|correct[_-]value|solution)(?:\s|$)/i.test((attrs.class??'')+' '+(attrs.id??''))) return '';
    if (node.tagName==='script') {
      if (!/^math\/tex(?:;\s*mode=display)?$/.test(attrs.type??'')) return '';
      const tex=(node.childNodes??[]).map(n=>n.nodeName==='#text'?n.value:'').join('');
      return attrs.type.includes('display')?'\\['+tex+'\\]':'\\('+tex+'\\)';
    }
    if(node.tagName==='br')return '\n';
    const content=(node.childNodes??[]).map(text).join('');
    if(node.tagName==='sup')return '^('+content+')';
    if(node.tagName==='sub')return '_('+content+')';
    return blocks.has(node.tagName)?'\n'+content+'\n':content;
  }
  return text(parseFragment(value)).replace(/\r\n?/g,'\n').split('\n').map(line=>line.replace(/[^\S\n]+/g,' ').trim()).join('\n').replace(/\n{3,}/g,'\n\n').trim();
}
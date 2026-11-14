import { randomBytes, createHash } from 'node:crypto';
import { parse, parseFragment, serializeOuter } from 'parse5';

const CDN = 'https://cdn.jsdelivr.net/npm/jsxgraph@1.7.0/distrib/';
const pinned = new Map([
  [CDN+'jsxgraphcore.min.js', '53033b03ea10ad32fd6398a93d6fc7c7b4ec1a0110eb31fda1a3ef9cafde79ec'],
  [CDN+'jsxgraph.min.css', 'b527c4fce59d980d318d98ef24e31dfc45a9341bba49c9c74308cfc9c90cd155'],
]);
const get = (node, name) => node.attrs?.find(a => a.name === name)?.value;
const walk = (node, fn) => { fn(node); for (const child of node.childNodes ?? []) walk(child, fn); };
// Reviewed dependencies from the pinned renderer. Editor, form, submit helpers and MathQuill stay excluded.
const scriptPath = /^\/(?:node_modules\/jquery\/dist\/jquery\.min\.js|node_modules\/bootstrap\/dist\/js\/bootstrap\.bundle\.min\.js|pg_files\/js\/(?:GraphTool\/(?:graphtool|pointtool|quadratictool|cubictool|intervaltools)|Scaffold\/scaffold|Problem\/details-accordion)\.[a-f0-9]+\.min\.js)$/;
const stylePath = /^\/(?:css\/bootstrap\.[a-f0-9]+\.min\.css|pg_files\/js\/(?:Problem\/problem|GraphTool\/graphtool|Scaffold\/scaffold)\.[a-f0-9]+\.min\.css)$/;
const imagePath = /^\/pg_files\/(?:tmp\/images\/[A-Za-z0-9_-]+\.(?:gif|png|jpe?g|svg|webp)|js\/GraphTool\/images\/(?:SelectTool|PointTool|LineTool|CircleTool|VerticalParabolaTool|HorizontalParabolaTool|QuadraticTool|CubicTool|FillTool|SolidTool|DashTool|IncludePointTool|IncludePointBracketTool|ExcludePointTool|ExcludePointParenthesisTool|IntervalTool|IntervalBracketTool)\.svg)$/i;
const mime = {js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',gif:'image/gif',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',svg:'image/svg+xml',webp:'image/webp',woff:'font/woff',woff2:'font/woff2'};

/** Opaque, expiring read capabilities, minted only while presenting an owned session.
 * No client-selected URL/path, cookies or renderer JWT is forwarded upstream.
 */
export function createExerciseAssets({ rendererBaseUrl, fetchAsset = fetch, now = Date.now,
  ttlMs = 60*60*1000, maxManifests = 64, maxBytes = 32*1024*1024 } = {}) {
  const manifests = new Map();
  let cachedBytes = 0;
  function source(value) {
    if (typeof value !== 'string' || value.length > 2048 || /[\\\s\x00-\x1f]/.test(value)) return;
    if (pinned.has(value)) return new URL(value);
    // Never normalize traversal, encoded paths, arbitrary origins, or secret-bearing queries.
    if (value.includes('%') && value.split('?')[0].includes('%')) return;
    if (value.split(/[?#]/)[0].split('/').some(p => p === '.' || p === '..')) return;
    if (/^(?:[a-z]+:|\/\/)/i.test(value)) return;
    const url = new URL(value.replace(/^\//,''), 'http://renderer.invalid/');
    if (url.hash || [...url.searchParams.keys()].some(k => k !== 'version')) return;
    if (!scriptPath.test(url.pathname) && !stylePath.test(url.pathname) && !imagePath.test(url.pathname)) return;
    if (!rendererBaseUrl) return;
    return new URL(url.pathname+url.search, new URL(rendererBaseUrl).origin);
  }
  function remove(key, manifest) {
    for (const asset of manifest.assets) cachedBytes -= asset.body?.length ?? 0;
    manifests.delete(key);
  }
  function prune() {
    for (const [key, manifest] of manifests) if (manifest.expires <= now()) remove(key,manifest);
    while (manifests.size > maxManifests) { const [key,m] = manifests.entries().next().value; remove(key,m); }
  }
  function prepare({ html, resources = {}, identity }) {
    prune();
    const fingerprint = createHash('sha256').update(String(identity)+'\0'+html+'\0'+JSON.stringify(resources)).digest('hex');
    for (const manifest of manifests.values()) if (manifest.fingerprint === fingerprint) return manifest.presentation;
    const capability = randomBytes(32).toString('base64url');
    const manifest = { fingerprint, expires: now()+ttlMs, assets:[] };
    const urls = new Map();
    function register(value, kind) {
      const url = source(value);
      if (!url) throw new Error('Unsupported exercise resource');
      const extension = url.pathname.split('.').pop().toLowerCase();
      if ((kind === 'script' && extension !== 'js') || (kind === 'style' && extension !== 'css') || (kind === 'image' && !imagePath.test(url.pathname))) throw new Error('Invalid exercise resource type');
      if (urls.has(url.href)) return urls.get(url.href);
      if (manifest.assets.length >= 128) throw new Error('Too many exercise resources');
      const local = '/assets/exercise/'+capability+'/'+manifest.assets.length;
      manifest.assets.push({url:url.href,extension}); urls.set(url.href,local); return local;
    }
    manifest.register=register;
    const doc = parse(html);
    const dependencies = [];
    walk(doc, node => {
      if (node.tagName !== 'head') return;
      for (const child of node.childNodes ?? []) {
        const kind = child.tagName === 'script' ? 'script' : child.tagName === 'link' && get(child,'rel') === 'stylesheet' ? 'style' : undefined;
        if (!kind) continue;
        const value = get(child,kind === 'script' ? 'src' : 'href');
        const url = source(value);
        if (!url || !(pinned.has(url.href) || (kind === 'script' ? scriptPath : stylePath).test(url.pathname))) continue;
        dependencies.push({kind,url:register(value,kind),defer:kind === 'script' && get(child,'defer') !== undefined});
      }
    });
    // Caller passes the already projected body separately below. Aliases are exact only; never execute renderer regexes.
    function project(fragment) {
      const root = parseFragment(fragment);
      walk(root,node => {
        if (['img','image'].includes(node.tagName)) {
          for (const attr of node.attrs ?? []) if (['src','href','xlink:href'].includes(attr.name) && !attr.value.startsWith('data:')) {
            attr.value = register(resources.alias?.[attr.value] ?? attr.value,'image');
          }
          node.attrs = (node.attrs ?? []).filter(a=>a.name !== 'srcset');
        }
        if (node.tagName === 'script' && get(node,'src')) {
          const attr = node.attrs.find(a=>a.name === 'src'); attr.value = register(attr.value,'script');
        }
      });
      return root.childNodes.map(serializeOuter).join('');
    }
    // Projection is supplied to avoid bringing the outer renderer form into the frame.
    const presentation = { project, dependencies };
    manifest.presentation = presentation;
    manifests.set(capability, manifest); prune();
    return presentation;
  }
  async function read(capability, index) {
    prune();
    const manifest = manifests.get(capability), asset = manifest?.assets[Number(index)];
    if (!asset || !/^(?:0|[1-9]\d*)$/.test(index)) return;
    if (!asset.body) {
      if (!asset.pending) asset.pending = (async()=>{
        const controller = new AbortController(), timer = setTimeout(()=>controller.abort(),15000);
        try {
          const response = await fetchAsset(asset.url,{redirect:'error',signal:controller.signal,headers:{Accept:'*/*'}});
          if (!response.ok || Number(response.headers.get('content-length')) > 2*1024*1024) throw new Error('Resource unavailable');
          const chunks=[]; let size=0;
          for await(const chunk of response.body) {size+=chunk.length;if(size>2*1024*1024)throw new Error('Resource too large');chunks.push(chunk);}
          let body=Buffer.concat(chunks);
          if (pinned.has(asset.url) && createHash('sha256').update(body).digest('hex') !== pinned.get(asset.url)) throw new Error('Resource integrity failure');
          if (asset.extension === 'css') {
            // Rewrite reviewed stylesheet images through this same capability; block every other transitive URL/import.
            let css = body.toString('utf8');
            css = css.replace(/@import\s+(?:url\([^)]*\)|["'][^"']*["'])[^;]*;/gi,'');
            css = css.replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)/gi,(match,double,single,bare)=>{
              const value=double??single??bare;
              if (value.startsWith('data:')) return match;
              try {
                if (/[\\\x00-\x1f]/.test(value)) throw new Error('Invalid CSS URL');
                const target=new URL(value,asset.url);
                if (target.origin !== new URL(rendererBaseUrl).origin || target.search || target.hash) throw new Error('Unapproved CSS URL');
                return 'url("'+manifest.register(target.pathname,'image')+'")';
              } catch { return 'url("data:,")'; }
            });
            body=Buffer.from(css);
          }
          for (const [key,other] of manifests) {
            if (cachedBytes+body.length <= maxBytes) break;
            if (other !== manifest) remove(key,other);
          }
          if (cachedBytes+body.length > maxBytes) throw new Error('Resource cache full');
          if (manifests.get(capability) !== manifest) throw new Error('Resource expired');
          asset.body=body; cachedBytes+=body.length;
        } finally {clearTimeout(timer);controller.abort();}
      })().finally(()=>{asset.pending=undefined;});
      await asset.pending;
    }
    return {body:asset.body,contentType:mime[asset.extension]};
  }
  return {prepare,read};
}
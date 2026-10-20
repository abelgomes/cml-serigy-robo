const URL_ = 'https://www.municipioonline.com.br/se/camara/lagarto/cidadao/despesa';
let cookies = '';
async function req(method, body) {
  const r = await fetch(URL_, { method, body, redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookies, 'User-Agent': 'Mozilla/5.0' } });
  const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  if (sc.length) cookies = sc.map(c => c.split(';')[0]).join('; ');
  return r.text();
}
const h = await req('GET');
const campos = {};
for (const m of h.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
  const n = (m[0].match(/name="([^"]+)"/) || [])[1]; const v = (m[0].match(/value="([^"]*)"/) || [, ''])[1];
  if (n) campos[n] = v.replace(/&amp;/g, '&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
}
Object.assign(campos, { 'ctl00$body$hfAnoEmpenhos': '2025', 'ctl00$body$hfMesEmpenhos': '0', 'ctl00$body$hfDtInicioEmpenhos': '01/01/2025', 'ctl00$body$hfDtFimEmpenhos': '31/12/2025', 'ctl00$body$btnFiltrarEmpenhosS': 'Button', __EVENTTARGET: '', __EVENTARGUMENT: '' });
const body = new URLSearchParams(campos).toString();
const p = await req('POST', body);
import { writeFileSync } from 'node:fs'; writeFileSync('p.html', p);

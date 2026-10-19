/** Every ENS query cut at a limit asks for the MOST RECENT facts. */
import * as fs from 'fs';
import * as path from 'path';

const root = path.join(__dirname, '..', 'public');
const files: string[] = [];
const walk = (dir: string) => {
  for (const name of fs.readdirSync(dir)) {
    const ruta = path.join(dir, name);
    if (fs.statSync(ruta).isDirectory()) walk(ruta);
    else if (/\.(ts|tsx)$/.test(name)) files.push(ruta);
  }
};
walk(root);

let failures = 0;
let calls = 0;
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const mark = 'useEsSearch({';
  let since = 0;
  for (;;) {
    const i = text.indexOf(mark, since);
    if (i < 0) break;
    let level = 0;
    let j = i + mark.length - 1;
    for (; j < text.length; j++) {
      if (text[j] === '{') level++;
      else if (text[j] === '}' && --level === 0) break;
    }
    const call = text.slice(i, j + 1);
    since = j + 1;
    calls++;
    const conTope = /\bsize:\s*(?!0\b)[\w.]+/.test(call);
    const recentOnes = /sorting:\s*\[\s*\{\s*timestamp:\s*\{\s*order:\s*'desc'/.test(call);
    const sitio = path.relative(path.join(__dirname, '..'), file);
    if (conTope && !recentOnes) {
      failures++;
      console.log(`  FAIL ${sitio}: capped query without asking for the most recent`);
    } else {
      console.log(`  ok   ${sitio}${conTope ? ': capped, the most recent' : ': sin tope'}`);
    }
  }
}

if (calls === 0) {
  console.log('  FAIL no useEsSearch query was found');
  failures++;
}
console.log(failures ? `\n${failures} query(ies) without order.` : '\nAll capped queries ask for the most recent.');
process.exit(failures ? 1 : 0);

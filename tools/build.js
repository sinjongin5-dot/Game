// 단일 HTML 파일로 묶기:  node tools/build.js [출력경로]
// index.html은 그대로 더블클릭해도 실행되지만, 파일 하나로 배포/공유하고 싶을 때 쓴다.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/, (_, f) => `<style>\n${fs.readFileSync(path.join(root, f), 'utf8')}</style>`);
html = html.replace(/<!--SCRIPTS-->([\s\S]*?)<!--\/SCRIPTS-->/, (_, block) => {
  let js = '';
  for (const m of block.matchAll(/<script src="([^"]+)"><\/script>/g)) js += `// ── ${m[1]} ──\n${fs.readFileSync(path.join(root, m[1]), 'utf8')}\n`;
  const boot = block.match(/<script>([^<]+)<\/script>/)[1];
  if (js.includes('</script')) throw new Error('인라인 불가: </script 포함');
  return `<script>\n${js}${boot}\n</script>`;
});
// --page: 문서 뼈대(doctype/html/head/body) 없이 본문만 내보낸다 (뼈대를 따로 씌우는 호스팅용)
const args = process.argv.slice(2), page = args.includes('--page');
if (page) {
  const title = html.match(/<title>[^<]*<\/title>/)[0], style = html.match(/<style>[\s\S]*?<\/style>/)[0], body = html.match(/<body>([\s\S]*)<\/body>/)[1];
  const extra = '<style>:root{color-scheme:dark}body{padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}</style>';
  const font = (html.match(/<link rel="stylesheet" href="https:[^>]+>/) || [''])[0];
  html = `${title}\n<meta name="claude:viewport-fit-sides" content="cover">\n${font}\n${style}\n${extra}\n${body}`;
}
const out = args.find((a) => !a.startsWith('--')) || path.join(root, 'dist', page ? 'crosslink-page.html' : 'crosslink.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('built', out, (html.length / 1024).toFixed(0) + ' KB');

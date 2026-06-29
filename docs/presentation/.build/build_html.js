const fs = require("fs");
const path = require("path");
const IMG = JSON.parse(fs.readFileSync(path.join(__dirname, "images.json"), "utf8"));

const css = `
:root{--bg:#0B0D12;--panel:#151A24;--line:#27303f;--ink:#ECEEF4;--dim:#9AA4B8;
--amber:#FF7A1F;--steel:#5CC8FF;--good:#2FA968;--warn:#E08A2B;--plan:#8C96AB;}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:#05060a;font-family:Arial,'Segoe UI',sans-serif;overflow:hidden}
#fit{position:absolute;inset:0;display:grid;place-items:center}
#stage{width:1280px;height:720px;position:relative;overflow:hidden;transform-origin:center}
.slide{position:absolute;inset:0;overflow:hidden;background:var(--bg);color:var(--ink);padding:64px 80px;display:none;flex-direction:column}
.slide.active{display:flex}
.slide.mid{justify-content:center}
.eyebrow{font-size:15px;font-weight:700;letter-spacing:4px;color:var(--amber);text-transform:uppercase;margin-bottom:16px}
.title{font-size:44px;font-weight:800;line-height:1.05;margin-bottom:8px}
.am{color:var(--amber)}.st{color:var(--steel)}.gd{color:var(--good)} b{font-weight:800}
.glow{position:absolute;border-radius:50%;filter:blur(12px);opacity:.16;pointer-events:none}
.badge{display:inline-block;padding:7px 16px;border-radius:20px;border:1.5px solid;font-size:13px;font-weight:800;letter-spacing:1px;text-transform:uppercase}
.foot{position:absolute;left:80px;bottom:26px;font-size:11px;letter-spacing:1px;color:var(--dim)}
.foot b{color:var(--amber)}
.pageno{position:absolute;right:80px;bottom:26px;font-size:12px;color:var(--dim)}
/* steps */
.steps{display:flex;gap:22px;margin-top:30px}
.step{flex:1;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:26px;position:relative;display:flex;flex-direction:column;gap:14px}
.stepnum{width:56px;height:56px;border-radius:50%;display:grid;place-items:center;font-size:27px;font-weight:800;color:var(--bg)}
.step .sname{font-size:25px;font-weight:800}
.step .sdesc{font-size:17px;color:var(--dim);line-height:1.35;flex:1}
.arrow{position:absolute;right:-30px;top:64px;font-size:34px;color:#46505f;z-index:2}
.note{margin-top:26px;font-size:18px;color:var(--dim);line-height:1.4}
.note b{color:var(--ink)}
/* arch flow */
.flow{display:flex;align-items:stretch;gap:16px;margin-top:40px}
.fbox{flex:1;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:24px;display:flex;flex-direction:column;justify-content:center}
.fbox h3{font-size:21px;margin-bottom:8px}.fbox p{font-size:15px;color:var(--dim);line-height:1.4}
.fcon{display:flex;align-items:center;font-size:30px;color:var(--steel);font-weight:800}
.ext{display:flex;flex-direction:column;gap:16px;flex:1}
.ext .fbox{padding:18px 22px}
/* big list */
.biglist{margin-top:34px;display:flex;flex-direction:column;gap:22px}
.li{display:flex;gap:20px;align-items:flex-start}
.lidot{width:46px;height:46px;border-radius:50%;flex:none;display:grid;place-items:center;font-size:20px;font-weight:800;color:#fff;background:var(--amber)}
.li h3{font-size:23px;margin-bottom:4px}
.li p{font-size:17px;color:var(--dim);line-height:1.4}
.next{margin-top:30px;display:flex;flex-direction:column;gap:16px}
.next .row{display:flex;gap:16px;align-items:center;font-size:21px}
.next .n{width:30px;height:30px;border-radius:50%;background:var(--steel);color:var(--bg);display:grid;place-items:center;font-size:15px;font-weight:800;flex:none}
.demo{margin-top:auto;background:var(--panel);border:1px solid var(--amber);border-radius:16px;padding:24px 30px;font-size:30px;font-weight:800}
`;

const foot = (n) => `<div class="foot"><b>3D FORGE</b> · Midterm</div><div class="pageno">${n} / 5</div>`;
const S = [];

// 1 — TITLE
S.push(`<section class="slide active">
  <div class="glow" style="width:560px;height:560px;background:#FF7A1F;left:-180px;top:-220px"></div>
  <div class="glow" style="width:520px;height:520px;background:#5CC8FF;right:-160px;bottom:-200px"></div>
  <div style="display:flex;align-items:center;gap:50px;margin:auto 0">
    <div style="flex:1">
      <div class="eyebrow" style="color:var(--steel)">CSIS 4495 · Midterm Progress</div>
      <div style="font-size:96px;font-weight:800;letter-spacing:2px;line-height:1">3D <span class="am">FORGE</span></div>
      <div style="font-size:23px;color:var(--dim);margin-top:18px;line-height:1.4;max-width:640px">Generate a 3D model from text — then edit it by <b style="color:var(--ink)">pointing</b> at the part you want to change.</div>
      <div style="margin-top:46px;font-size:17px;color:var(--dim)"><b style="color:var(--ink)">Mikhail Senatorov</b> &amp; <b style="color:var(--ink)">Javid Aliyev</b> &nbsp;·&nbsp; June 27, 2026</div>
    </div>
    <img src="${IMG.hand}" style="width:420px;border-radius:14px;flex:none">
  </div>
</section>`);

// 2 — WHAT WE BUILT (the 3-step tool)
S.push(`<section class="slide mid">
  <div class="eyebrow">What we built</div>
  <div class="title">A 3-step tool: <span class="am">image</span> → <span class="st">model</span> → <span class="gd">edit</span></div>
  <div class="steps" style="flex:0 0 auto">
    <div class="step">
      <div style="display:flex;align-items:center;gap:14px"><div class="stepnum" style="background:var(--amber)">1</div><div class="sname">Image</div></div>
      <div class="sdesc">Generate a reference image first — cheaper, sharper, faster to iterate.</div>
      <div><span class="badge" style="border-color:var(--plan);color:var(--plan)">Planned</span></div>
      <div class="arrow">→</div>
    </div>
    <div class="step">
      <div style="display:flex;align-items:center;gap:14px"><div class="stepnum" style="background:var(--steel)">2</div><div class="sname">Model</div></div>
      <div class="sdesc">Text-to-3D with Meshy — two quality tiers (M5 / M6). Spin it in the browser.</div>
      <div><span class="badge" style="border-color:var(--good);color:var(--good)">Working</span></div>
      <div class="arrow">→</div>
    </div>
    <div class="step">
      <div style="display:flex;align-items:center;gap:14px"><div class="stepnum" style="background:var(--good)">3</div><div class="sname">Edit</div></div>
      <div class="sdesc">Click a point, describe the change — our “spatial prompt”. Points &amp; prompts work.</div>
      <div><span class="badge" style="border-color:var(--warn);color:var(--warn)">In progress</span></div>
    </div>
  </div>
  <div class="note" style="line-height:1.7"><b style="color:var(--good)">Done:</b> model generation + the spatial prompt + a community app (accounts, gallery, voice input).<br><b style="color:var(--amber)">Not yet:</b> the image step, and real editing of an existing model.</div>
  ${foot(2)}
</section>`);

// 3 — HOW IT'S BUILT (tech + architecture, said once)
S.push(`<section class="slide mid">
  <div class="eyebrow">How it's built</div>
  <div class="title">Tech &amp; architecture</div>
  <div class="flow">
    <div class="fbox"><h3 class="st">Browser</h3><p>React + Vite<br>Three.js 3D viewer</p></div>
    <div class="fcon">→</div>
    <div class="fbox"><h3 class="am">Server</h3><p>Node + Express<br>Spatial Prompt Engine</p></div>
    <div class="fcon">→</div>
    <div class="ext">
      <div class="fbox"><h3>Meshy</h3><p>text-to-3D (M5 / M6)</p></div>
      <div class="fbox"><h3>Claude</h3><p>refines the prompt</p></div>
    </div>
  </div>
  <div class="note" style="margin-top:36px">Runs fully <b>key-free in “mock mode”</b> — no API keys or database needed to run the demo.</div>
  ${foot(3)}
</section>`);

// 4 — CHALLENGES
S.push(`<section class="slide mid">
  <div class="eyebrow">Challenges</div>
  <div class="title">The hard parts</div>
  <div class="biglist">
    <div class="li"><div class="lidot">1</div><div><h3>Spatial prompting</h3><p>Turning a 3D click + region + your words into one instruction the generator actually respects.</p></div></div>
    <div class="li"><div class="lidot">2</div><div><h3>Meshy can’t edit a mesh</h3><p>It’s text-to-3D only — it re-generates the whole model and ignores our 3D points. Real same-model editing needs another path.</p></div></div>
    <div class="li"><div class="lidot">3</div><div><h3>APIs &amp; the browser</h3><p>Async generation, Meshy’s CORS, credit cost, voice input — solved with a server proxy, a daily cost cap, and mock mode.</p></div></div>
  </div>
  ${foot(4)}
</section>`);

// 5 — WHAT'S NEXT → DEMO
S.push(`<section class="slide">
  <div class="glow" style="width:520px;height:520px;background:#FF7A1F;right:-160px;top:-200px"></div>
  <div class="eyebrow">What's next</div>
  <div class="title">Next — and a live demo</div>
  <div class="next">
    <div class="row"><div class="n">1</div><div>Add the <b>image step</b> (cheap iteration before the 3D build)</div></div>
    <div class="row"><div class="n">2</div><div>Real <b>same-model editing</b> (retexture + local geometry edits)</div></div>
    <div class="row"><div class="n">3</div><div>Compare other generators &amp; <b>deploy live</b></div></div>
  </div>
  <div class="demo">→ &nbsp;Live demo: let's open the app</div>
  ${foot(5)}
</section>`);

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>3D Forge — Midterm</title><style>${css}</style></head>
<body><div id="fit"><div id="stage">${S.join("\n")}</div></div>
<script>
const slides=[...document.querySelectorAll('.slide')];let i=0;
function show(n){i=Math.max(0,Math.min(slides.length-1,n));slides.forEach((s,k)=>s.classList.toggle('active',k===i))}
function fit(){document.getElementById('stage').style.transform='scale('+Math.min(innerWidth/1280,innerHeight/720)+')'}
addEventListener('resize',fit);fit();show(0);
addEventListener('keydown',e=>{if(['ArrowRight','ArrowDown',' ','PageDown'].includes(e.key)){e.preventDefault();show(i+1)}if(['ArrowLeft','ArrowUp','PageUp'].includes(e.key)){e.preventDefault();show(i-1)}if(e.key==='Home')show(0);if(e.key==='End')show(slides.length-1)});
addEventListener('click',e=>{if(e.clientX<innerWidth*0.25)show(i-1);else show(i+1)});
</script></body></html>`;
fs.writeFileSync(path.join(__dirname, "3D-Forge-Midterm.html"), html);
console.log("HTML written:", (Buffer.byteLength(html)/1024).toFixed(0)+"KB", S.length, "slides");

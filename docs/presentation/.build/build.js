const pptxgen = require("pptxgenjs");
const path = require("path");

const ASSET = (f) => path.join(__dirname, "..", f);
const HAND = ASSET("img_hand.png");
const CHAIR = ASSET("img_chair.png");
const MOTO = ASSET("img_motorcycle.png");
const SPHERE = ASSET("img_sphere.png");

// ---- palette (the project's own "precision forge" identity) ----
const DARK = "0B0D12";
const PANEL = "151A24";
const INK = "ECEEF4";
const DIM = "9AA4B8";
const AMBER = "FF7A1F";
const STEEL = "5CC8FF";
const WHITE = "FFFFFF";
const TXT = "1C2330"; // body text on light
const MUTE = "697586"; // muted on light
const CARD = "F4F6F9"; // light card fill
const GOOD = "2FA968";
const WARN = "E08A2B";
const PLAN = "8C96AB";

const FONT = "Arial";
const sh = () => ({ type: "outer", color: "000000", blur: 7, offset: 2, angle: 90, opacity: 0.1 });

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
pres.author = "Mikhail Senatorov & Javid Aliyev";
pres.title = "3D Forge — Midterm Progress";
const W = 13.333, H = 7.5, M = 0.7;

// ---------- helpers ----------
function eyebrow(slide, text, color = AMBER) {
  slide.addText(text.toUpperCase(), {
    x: M, y: 0.55, w: W - 2 * M, h: 0.35, margin: 0,
    fontFace: FONT, fontSize: 13, bold: true, color, charSpacing: 3, align: "left",
  });
}
function title(slide, text, color = TXT) {
  slide.addText(text, {
    x: M, y: 0.9, w: W - 2 * M, h: 0.95, margin: 0,
    fontFace: FONT, fontSize: 32, bold: true, color, align: "left", valign: "top",
  });
}
function pageTag(slide, n) {
  slide.addText([
    { text: "3D FORGE", options: { color: AMBER, bold: true } },
    { text: "   ·   Midterm Progress", options: { color: MUTE } },
  ], { x: M, y: H - 0.55, w: 6, h: 0.3, margin: 0, fontFace: FONT, fontSize: 9, charSpacing: 1 });
  slide.addText(String(n), { x: W - 1.2, y: H - 0.55, w: 0.5, h: 0.3, margin: 0,
    fontFace: FONT, fontSize: 9, color: MUTE, align: "right" });
}
function badge(slide, x, y, label, color) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 1.55, h: 0.34, rectRadius: 0.17,
    fill: { color: WHITE }, line: { color, width: 1 } });
  slide.addText(label.toUpperCase(), { x, y, w: 1.55, h: 0.34, margin: 0, align: "center", valign: "middle",
    fontFace: FONT, fontSize: 9.5, bold: true, color, charSpacing: 1 });
}
function card(slide, x, y, w, h, fill = CARD) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.1,
    fill: { color: fill }, line: { color: "E3E8EF", width: 1 }, shadow: sh() });
}
function circleNum(slide, x, y, d, text, fill, txtColor = WHITE) {
  slide.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill } });
  slide.addText(text, { x, y, w: d, h: d, margin: 0, align: "center", valign: "middle",
    fontFace: FONT, fontSize: d * 26, bold: true, color: txtColor });
}

// ============================================================
// 1 — TITLE (dark)
// ============================================================
let s = pres.addSlide();
s.background = { color: DARK };
s.addShape(pres.shapes.OVAL, { x: -2.5, y: -3, w: 8, h: 8, fill: { color: AMBER, transparency: 88 } });
s.addShape(pres.shapes.OVAL, { x: W - 4.5, y: H - 4, w: 8, h: 8, fill: { color: STEEL, transparency: 90 } });
s.addText("CSIS 4495  ·  MIDTERM PROGRESS & IMPLEMENTATION", { x: M, y: 1.5, w: 11, h: 0.4, margin: 0,
  fontFace: FONT, fontSize: 14, bold: true, color: STEEL, charSpacing: 3 });
s.addText([
  { text: "3D ", options: { color: INK } },
  { text: "FORGE", options: { color: AMBER } },
], { x: M, y: 2.0, w: 11, h: 1.6, margin: 0, fontFace: FONT, fontSize: 80, bold: true, charSpacing: 2 });
s.addText("AI-assisted 3D model generation and spatial editing, in the browser.", {
  x: M, y: 3.7, w: 11, h: 0.6, margin: 0, fontFace: FONT, fontSize: 22, color: DIM });
s.addText([
  { text: "Mikhail Senatorov", options: { color: INK, bold: true } },
  { text: "  &  ", options: { color: MUTE } },
  { text: "Javid Aliyev", options: { color: INK, bold: true } },
  { text: "        June 27, 2026", options: { color: DIM } },
], { x: M, y: 5.9, w: 11, h: 0.4, margin: 0, fontFace: FONT, fontSize: 15 });
s.addText("Instructor: Michael Ma", { x: M, y: 6.35, w: 11, h: 0.3, margin: 0, fontFace: FONT, fontSize: 12, color: MUTE });

// ============================================================
// 2 — WHAT IS 3D FORGE (light)
// ============================================================
s = pres.addSlide(); s.background = { color: WHITE };
eyebrow(s, "What we are building");
title(s, "Make 3D models by pointing and talking");
s.addText([
  { text: "Generate", options: { bold: true, color: AMBER } },
  { text: " a 3D model from a text prompt, then ", options: { color: TXT } },
  { text: "click the exact part", options: { bold: true, color: STEEL } },
  { text: " you want to change and describe the edit in plain language.", options: { color: TXT } },
], { x: M, y: 2.05, w: 6.7, h: 1.6, margin: 0, fontFace: FONT, fontSize: 21, lineSpacingMultiple: 1.15 });
s.addText("No 3D-modelling skills required. It grew into a small community platform where people publish, like, comment and follow.", {
  x: M, y: 3.75, w: 6.7, h: 1.2, margin: 0, fontFace: FONT, fontSize: 15, color: MUTE, lineSpacingMultiple: 1.2 });
// 3 capability pills
const caps = [["Generate", AMBER], ["Edit by region", STEEL], ["Share & follow", GOOD]];
caps.forEach(([t, c], i) => {
  const x = M + i * 2.25;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 5.25, w: 2.05, h: 0.6, rectRadius: 0.3,
    fill: { color: CARD }, line: { color: c, width: 1.5 } });
  s.addText(t, { x, y: 5.25, w: 2.05, h: 0.6, margin: 0, align: "center", valign: "middle",
    fontFace: FONT, fontSize: 13, bold: true, color: c });
});
s.addImage({ path: HAND, x: 7.9, y: 1.95, w: 4.8, h: 2.7, sizing: { type: "contain", w: 4.8, h: 2.7 } });
s.addText("Our base model — the same mesh users remix in the gallery.", {
  x: 7.9, y: 4.7, w: 4.8, h: 0.4, margin: 0, align: "center", fontFace: FONT, fontSize: 11, italic: true, color: MUTE });
pageTag(s, 2);

// ============================================================
// 3 — PROJECT PROGRESS (light)
// ============================================================
s = pres.addSlide(); s.background = { color: WHITE };
eyebrow(s, "Overall project progress");
title(s, "Where we are now");
const phases = [
  ["DONE", GOOD, "Foundation", ["Text-to-3D viewer + region select", "Spatial Prompt Engine", "Accounts & community platform", "Real Meshy generation (M5 / M6)"]],
  ["NOW", WARN, "In progress", ["Per-point spatial prompts", "Voice-to-prompt in the browser", "Edit / delete, follow, notifications", "Model previews on cards"]],
  ["NEXT", PLAN, "Planned", ["Image-first step (cheap iteration)", "Real same-model 3D editing", "Compare multiple gen APIs", "Live deployment with keys"]],
];
phases.forEach(([tag, color, head, items], i) => {
  const x = M + i * 4.13;
  card(s, x, 2.0, 3.85, 4.6);
  badge(s, x + 0.3, 2.3, tag, color);
  s.addText(head, { x: x + 0.3, y: 2.78, w: 3.2, h: 0.45, margin: 0, fontFace: FONT, fontSize: 18, bold: true, color: TXT });
  s.addText(items.map((t) => ({ text: t, options: { bullet: { indent: 14 }, breakLine: true, color: TXT } })), {
    x: x + 0.3, y: 3.35, w: 3.3, h: 3.0, margin: 0, fontFace: FONT, fontSize: 12.5, color: TXT, paraSpaceAfter: 8, lineSpacingMultiple: 1.05 });
});
pageTag(s, 3);

// ============================================================
// 4 — SYSTEM ARCHITECTURE (light, diagram)
// ============================================================
s = pres.addSlide(); s.background = { color: WHITE };
eyebrow(s, "System architecture");
title(s, "How the pieces fit together");
function archBox(x, y, w, h, head, headColor, lines, fill = CARD) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.1, fill: { color: fill }, line: { color: "DCE2EA", width: 1 }, shadow: sh() });
  s.addText(head, { x: x + 0.2, y: y + 0.18, w: w - 0.4, h: 0.4, margin: 0, fontFace: FONT, fontSize: 15, bold: true, color: headColor });
  s.addText(lines.map((t) => ({ text: t, options: { breakLine: true } })), { x: x + 0.2, y: y + 0.62, w: w - 0.4, h: h - 0.7, margin: 0, fontFace: FONT, fontSize: 11.5, color: MUTE, lineSpacingMultiple: 1.1 });
}
// connectors first (behind boxes look fine too, but draw before)
s.addShape(pres.shapes.LINE, { x: 3.95, y: 3.7, w: 1.1, h: 0, line: { color: STEEL, width: 2.5, endArrowType: "triangle", beginArrowType: "triangle" } });
[2.85, 3.7, 4.55].forEach((yy) => s.addShape(pres.shapes.LINE, { x: 8.35, y: 3.7, w: 0.95, h: yy - 3.7, line: { color: AMBER, width: 2, endArrowType: "triangle" } }));
archBox(0.9, 2.6, 3.05, 2.2, "Browser — Client", STEEL, ["React + Vite (SPA)", "Three.js 3D viewer", "Click-to-select points", "Web Speech (voice)"]);
archBox(5.05, 2.6, 3.3, 2.2, "Server — Express API", AMBER, ["Auth (JWT + bcrypt)", "Posts / likes / comments", "Follows / notifications", "Spatial Prompt Engine"]);
archBox(9.3, 2.25, 3.1, 1.0, "Meshy API", TXT, ["text-to-3D (M5 / M6)"], "FFF3E8");
archBox(9.3, 3.35, 3.1, 1.0, "Claude API", TXT, ["prompt refinement"], "EAF6FF");
archBox(9.3, 4.45, 3.1, 1.0, "MongoDB / mock store", TXT, ["data (file-persisted)"], CARD);
s.addText("Runs fully key-free in “mock mode” — no database or API keys needed to demo. Add keys to go live.", {
  x: M, y: 6.15, w: W - 2 * M, h: 0.5, margin: 0, align: "center", fontFace: FONT, fontSize: 13, italic: true, color: MUTE });
pageTag(s, 4);

// ============================================================
// 5 — TECH STACK (light)
// ============================================================
s = pres.addSlide(); s.background = { color: WHITE };
eyebrow(s, "Tech stack");
title(s, "Technologies we use");
const stacks = [
  ["Frontend", STEEL, "React · Vite · Three.js · React Router · Web Speech API"],
  ["Backend", AMBER, "Node.js · Express · Mongoose · JWT · bcrypt"],
  ["AI & external", GOOD, "Meshy (text-to-3D) · Anthropic Claude (prompt refinement)"],
  ["Tooling & build", PLAN, "Plain JS (ESM) · node --test · GitHub Actions · Claude Code"],
];
stacks.forEach(([head, color, body], i) => {
  const y = 2.1 + i * 1.15;
  card(s, M, y, W - 2 * M, 1.0);
  s.addShape(pres.shapes.OVAL, { x: M + 0.3, y: y + 0.28, w: 0.44, h: 0.44, fill: { color: color } });
  s.addText(head, { x: M + 1.0, y: y + 0.12, w: 3.0, h: 0.76, margin: 0, valign: "middle", fontFace: FONT, fontSize: 17, bold: true, color: TXT });
  s.addText(body, { x: M + 4.0, y: y + 0.12, w: W - 2 * M - 4.3, h: 0.76, margin: 0, valign: "middle", fontFace: FONT, fontSize: 14.5, color: MUTE });
});
pageTag(s, 5);

// ============================================================
// 6 — PIPELINE: 3 STEPS (dark divider)
// ============================================================
s = pres.addSlide(); s.background = { color: DARK };
s.addText("THE PRODUCT — THREE STEPS", { x: M, y: 0.9, w: 11, h: 0.4, margin: 0, fontFace: FONT, fontSize: 14, bold: true, color: STEEL, charSpacing: 3 });
s.addText("Image  →  Model  →  Edit", { x: M, y: 1.4, w: 12, h: 0.9, margin: 0, fontFace: FONT, fontSize: 38, bold: true, color: INK });
const steps = [
  ["1", "Image", AMBER, "Generate a reference image first", "Sharper 3D, saves credits, cheap to iterate", "PLANNED", PLAN],
  ["2", "Model", STEEL, "Text-to-3D via Meshy (M5 / M6)", "Working on the site today", "WORKING", GOOD],
  ["3", "Edit", GOOD, "Change it with spatial prompts", "Points + prompts ready; editing is next", "IN PROGRESS", WARN],
];
steps.forEach(([num, name, c, line1, line2, st, stc], i) => {
  const x = 0.85 + i * 4.15;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 2.9, w: 3.8, h: 3.6, rectRadius: 0.12, fill: { color: PANEL } });
  circleNum(s, x + 0.35, 3.25, 0.85, num, c, DARK);
  s.addText(name, { x: x + 1.4, y: 3.35, w: 2.2, h: 0.7, margin: 0, valign: "middle", fontFace: FONT, fontSize: 24, bold: true, color: INK });
  s.addText(line1, { x: x + 0.35, y: 4.35, w: 3.1, h: 0.7, margin: 0, fontFace: FONT, fontSize: 14.5, bold: true, color: INK, lineSpacingMultiple: 1.1 });
  s.addText(line2, { x: x + 0.35, y: 5.05, w: 3.1, h: 0.8, margin: 0, fontFace: FONT, fontSize: 12.5, color: DIM, lineSpacingMultiple: 1.1 });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x + 0.35, y: 5.95, w: 1.7, h: 0.36, rectRadius: 0.18, fill: { color: PANEL }, line: { color: stc, width: 1 } });
  s.addText(st, { x: x + 0.35, y: 5.95, w: 1.7, h: 0.36, margin: 0, align: "center", valign: "middle", fontFace: FONT, fontSize: 9.5, bold: true, color: stc, charSpacing: 1 });
  if (i < 2) s.addText("→", { x: x + 3.78, y: 3.9, w: 0.55, h: 1, margin: 0, align: "center", fontFace: FONT, fontSize: 30, bold: true, color: MUTE });
});

// ============================================================
// 7 — STEP 1: IMAGE (light)
// ============================================================
s = pres.addSlide(); s.background = { color: WHITE };
eyebrow(s, "Step 1 — Image", AMBER);
title(s, "Start from an image (planned)");
s.addText("Before paying for a full 3D generation, the user generates a reference image. It's cheap, fast, and easy to iterate on.", {
  x: M, y: 2.05, w: 7.0, h: 1.1, margin: 0, fontFace: FONT, fontSize: 18, color: TXT, lineSpacingMultiple: 1.2 });
const why = [
  ["Sharper results", "A clear image guides the 3D model and raises fidelity."],
  ["Saves tokens & credits", "Iterate on a cheap image, not an expensive 3D mesh."],
  ["Edit before you commit", "Lock the look first, then build the heavy 3D once."],
];
why.forEach(([h, b], i) => {
  const y = 3.35 + i * 1.05;
  s.addShape(pres.shapes.OVAL, { x: M, y: y + 0.05, w: 0.34, h: 0.34, fill: { color: AMBER } });
  s.addText(h, { x: M + 0.55, y: y - 0.05, w: 6.3, h: 0.4, margin: 0, fontFace: FONT, fontSize: 16, bold: true, color: TXT });
  s.addText(b, { x: M + 0.55, y: y + 0.33, w: 6.3, h: 0.5, margin: 0, fontFace: FONT, fontSize: 13, color: MUTE });
});
badge(s, M, 6.55, "Planned", PLAN);
s.addImage({ path: SPHERE, x: 8.4, y: 2.2, w: 4.3, h: 3.3, sizing: { type: "contain", w: 4.3, h: 3.3 } });
s.addText("Today every model starts from text — the image step is the next upgrade.", {
  x: 8.4, y: 5.6, w: 4.3, h: 0.6, margin: 0, align: "center", fontFace: FONT, fontSize: 11, italic: true, color: MUTE });
pageTag(s, 7);

// ============================================================
// 8 — STEP 2: MODEL GENERATION (light)
// ============================================================
s = pres.addSlide(); s.background = { color: WHITE };
eyebrow(s, "Step 2 — Model generation", STEEL);
title(s, "Text-to-3D with the Meshy API");
s.addText([
  { text: "Working today. ", options: { bold: true, color: GOOD } },
  { text: "A prompt becomes a real GLB model you can spin in the browser.", options: { color: TXT } },
], { x: M, y: 2.05, w: 7.0, h: 0.9, margin: 0, fontFace: FONT, fontSize: 18, lineSpacingMultiple: 1.2 });
const m2 = [
  ["Two quality tiers", "M5 — fast & cheap (~5 credits) · M6 — prettier (~20)"],
  ["Daily cost guard", "Caps real generations per day; mock mode is unlimited"],
  ["Mock mode", "Full demo with no API key — a stub generator stands in"],
  ["Asset proxy", "Server streams Meshy GLBs (browser CORS workaround)"],
];
m2.forEach(([h, b], i) => {
  const y = 3.15 + i * 0.92;
  s.addShape(pres.shapes.OVAL, { x: M, y: y + 0.05, w: 0.3, h: 0.3, fill: { color: STEEL } });
  s.addText([{ text: h + "  ", options: { bold: true, color: TXT } }, { text: "— " + b, options: { color: MUTE } }], {
    x: M + 0.5, y: y - 0.05, w: 6.6, h: 0.6, margin: 0, fontFace: FONT, fontSize: 13.5, lineSpacingMultiple: 1.05 });
});
badge(s, M, 6.85, "Working", GOOD);
s.addImage({ path: MOTO, x: 8.4, y: 2.2, w: 4.3, h: 3.2, sizing: { type: "contain", w: 4.3, h: 3.2 } });
s.addImage({ path: CHAIR, x: 9.7, y: 5.0, w: 2.0, h: 1.6, sizing: { type: "contain", w: 2.0, h: 1.6 } });
pageTag(s, 8);

// ============================================================
// 9 — STEP 3: SPATIAL EDITING (light)
// ============================================================
s = pres.addSlide(); s.background = { color: WHITE };
eyebrow(s, "Step 3 — Spatial editing", GOOD);
title(s, "Edit by pointing: the Spatial Prompt");
s.addText("Click a spot on the mesh, type what to change there. We turn click + region + your words into one grounded instruction.", {
  x: M, y: 2.05, w: 7.0, h: 1.0, margin: 0, fontFace: FONT, fontSize: 17, color: TXT, lineSpacingMultiple: 1.2 });
// mini "prompt" illustration
s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: M, y: 3.2, w: 6.9, h: 1.5, rectRadius: 0.1, fill: { color: "0B0D12" } });
s.addText([
  { text: "point ", options: { color: STEEL, bold: true } },
  { text: "(x, y, z)  +  ", options: { color: DIM } },
  { text: "region ", options: { color: STEEL, bold: true } },
  { text: "“index finger”  +  ", options: { color: DIM } },
  { text: "“make it longer”", options: { color: AMBER, bold: true } },
], { x: M + 0.3, y: 3.45, w: 6.3, h: 0.6, margin: 0, fontFace: "Courier New", fontSize: 13.5 });
s.addText("→  one structured prompt, refined by Claude, sent to the generator", {
  x: M + 0.3, y: 4.05, w: 6.3, h: 0.5, margin: 0, fontFace: FONT, fontSize: 12.5, italic: true, color: INK });
const done = ["Click-to-select points on the model", "A separate prompt per point (numbered)", "Spatial vs. plain comparison + rating"];
done.forEach((t, i) => {
  const y = 5.0 + i * 0.5;
  s.addText([{ text: "✓  ", options: { color: GOOD, bold: true } }, { text: t, options: { color: TXT } }], {
    x: M, y, w: 6.9, h: 0.45, margin: 0, fontFace: FONT, fontSize: 13.5 });
});
badge(s, M, 6.7, "In progress", WARN);
s.addImage({ path: HAND, x: 8.4, y: 2.4, w: 4.3, h: 2.6, sizing: { type: "contain", w: 4.3, h: 2.6 } });
s.addText("The hand: click a finger, describe the change.", {
  x: 8.4, y: 5.1, w: 4.3, h: 0.4, margin: 0, align: "center", fontFace: FONT, fontSize: 11, italic: true, color: MUTE });
pageTag(s, 9);

// ============================================================
// 10 — CURRENT IMPLEMENTATION (light)
// ============================================================
s = pres.addSlide(); s.background = { color: WHITE };
eyebrow(s, "Current implementation");
title(s, "What works right now");
const feats = [
  ["Forge tool", STEEL, "Generate, upload, click points, per-point prompts, history, compare"],
  ["Accounts", AMBER, "Register / login (JWT + bcrypt), profiles with avatars"],
  ["Community gallery", GOOD, "Publish, Explore feed, search + tags, model thumbnails"],
  ["Social", AMBER, "Likes, comments, follow / following, activity notifications"],
  ["Post pages", STEEL, "Rotating viewer, share link, present mode, edit / delete"],
  ["Voice input", GOOD, "Speak your prompt in the browser (Web Speech API)"],
];
feats.forEach(([h, c, b], i) => {
  const col = i % 3, row = Math.floor(i / 3);
  const x = M + col * 4.13, y = 2.05 + row * 2.25;
  card(s, x, y, 3.85, 2.05);
  s.addShape(pres.shapes.OVAL, { x: x + 0.3, y: y + 0.3, w: 0.4, h: 0.4, fill: { color: c } });
  s.addText(h, { x: x + 0.85, y: y + 0.24, w: 2.8, h: 0.55, margin: 0, valign: "middle", fontFace: FONT, fontSize: 16, bold: true, color: TXT });
  s.addText(b, { x: x + 0.3, y: y + 0.95, w: 3.25, h: 0.95, margin: 0, fontFace: FONT, fontSize: 12.5, color: MUTE, lineSpacingMultiple: 1.1 });
});
pageTag(s, 10);

// ============================================================
// 11 — CHALLENGES (light)
// ============================================================
s = pres.addSlide(); s.background = { color: WHITE };
eyebrow(s, "Challenges & issues");
title(s, "The hard parts");
const chal = [
  ["Spatial prompting", "Turning a 3D click + region + free text into one instruction a generator actually respects — the core research problem."],
  ["Meshy can't edit a mesh", "It's text-to-3D only: it re-generates the whole model and ignores our 3D points. Real same-model editing needs another path."],
  ["API integration", "Async task polling, Meshy's CORS, credit costs — solved with a server proxy, a daily cost guard, and a key-free mock mode."],
  ["Voice in the browser", "Web Speech API differs across browsers; wired it into both the generate box and the per-point editors."],
];
chal.forEach(([h, b], i) => {
  const col = i % 2, row = Math.floor(i / 2);
  const x = M + col * 6.05, y = 2.05 + row * 2.25;
  card(s, x, y, 5.75, 2.05);
  s.addShape(pres.shapes.OVAL, { x: x + 0.3, y: y + 0.32, w: 0.5, h: 0.5, fill: { color: AMBER } });
  s.addText(String(i + 1), { x: x + 0.3, y: y + 0.32, w: 0.5, h: 0.5, margin: 0, align: "center", valign: "middle", fontFace: FONT, fontSize: 16, bold: true, color: WHITE });
  s.addText(h, { x: x + 0.95, y: y + 0.28, w: 4.6, h: 0.55, margin: 0, valign: "middle", fontFace: FONT, fontSize: 16.5, bold: true, color: TXT });
  s.addText(b, { x: x + 0.3, y: y + 0.95, w: 5.15, h: 0.95, margin: 0, fontFace: FONT, fontSize: 12.5, color: MUTE, lineSpacingMultiple: 1.12 });
});
pageTag(s, 11);

// ============================================================
// 12 — AI USAGE (light)
// ============================================================
s = pres.addSlide(); s.background = { color: WHITE };
eyebrow(s, "AI usage in implementation");
title(s, "AI in the product — and in how we built it");
card(s, M, 2.1, 5.75, 4.2);
s.addShape(pres.shapes.OVAL, { x: M + 0.35, y: 2.45, w: 0.55, h: 0.55, fill: { color: AMBER } });
s.addText("In the product", { x: M + 1.05, y: 2.45, w: 4.4, h: 0.55, margin: 0, valign: "middle", fontFace: FONT, fontSize: 18, bold: true, color: TXT });
s.addText([
  "Meshy AI — text-to-3D generation (M5 / M6)",
  "Anthropic Claude — refines the spatial prompt before generation",
  "Web Speech API — voice-to-prompt input",
].map((t) => ({ text: t, options: { bullet: { indent: 14 }, breakLine: true } })), {
  x: M + 0.35, y: 3.25, w: 5.1, h: 2.8, margin: 0, fontFace: FONT, fontSize: 14, color: TXT, paraSpaceAfter: 12, lineSpacingMultiple: 1.15 });
card(s, M + 6.05, 2.1, 5.75, 4.2);
s.addShape(pres.shapes.OVAL, { x: M + 6.4, y: 2.45, w: 0.55, h: 0.55, fill: { color: STEEL } });
s.addText("In how we built it", { x: M + 7.1, y: 2.45, w: 4.4, h: 0.55, margin: 0, valign: "middle", fontFace: FONT, fontSize: 18, bold: true, color: TXT });
s.addText([
  "Claude Code — AI pair-programming for features & tests",
  "Code-review subagents check every branch before a PR",
  "A GitHub @claude bot reviews each pull request",
  "Branch → review → PR → merge, every change verified",
].map((t) => ({ text: t, options: { bullet: { indent: 14 }, breakLine: true } })), {
  x: M + 6.4, y: 3.25, w: 5.1, h: 2.8, margin: 0, fontFace: FONT, fontSize: 14, color: TXT, paraSpaceAfter: 10, lineSpacingMultiple: 1.15 });
pageTag(s, 12);

// ============================================================
// 13 — LIVE DEMO (dark divider)
// ============================================================
s = pres.addSlide(); s.background = { color: DARK };
s.addShape(pres.shapes.OVAL, { x: W - 5, y: -2.5, w: 8, h: 8, fill: { color: AMBER, transparency: 90 } });
s.addText("LIVE DEMO", { x: M, y: 2.3, w: 11, h: 0.5, margin: 0, fontFace: FONT, fontSize: 16, bold: true, color: STEEL, charSpacing: 4 });
s.addText("Let's open the app", { x: M, y: 2.8, w: 11, h: 1.0, margin: 0, fontFace: FONT, fontSize: 46, bold: true, color: INK });
s.addText([
  "Home & the community gallery (real model thumbnails)",
  "The Forge — generate, click points, write per-point prompts, voice input",
  "A post page — likes, comments, follow, edit / delete",
  "All running key-free in mock mode",
].map((t) => ({ text: t, options: { bullet: { indent: 16 }, breakLine: true, color: DIM } })), {
  x: M, y: 4.1, w: 10.5, h: 2.5, margin: 0, fontFace: FONT, fontSize: 17, paraSpaceAfter: 10, lineSpacingMultiple: 1.1 });

// ============================================================
// 14 — NEXT STEPS + CLOSE (light)
// ============================================================
s = pres.addSlide(); s.background = { color: WHITE };
eyebrow(s, "Next steps");
title(s, "What's next");
const next = [
  ["Image-first generation", "Add Step 1 so users iterate on a cheap image before the 3D build."],
  ["Real same-model editing", "Retexture for colour + local Three.js geometry edits, since Meshy can't."],
  ["Compare generators", "Plug in other 3D APIs side-by-side to compare quality & cost."],
  ["Go live", "Real Meshy + MongoDB Atlas keys, then deploy for the final demo."],
];
next.forEach(([h, b], i) => {
  const y = 2.1 + i * 1.08;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: M, y, w: W - 2 * M, h: 0.92, rectRadius: 0.08, fill: { color: CARD }, line: { color: "E3E8EF", width: 1 } });
  circleNum(s, M + 0.28, y + 0.21, 0.5, String(i + 1), STEEL, WHITE);
  s.addText(h, { x: M + 1.05, y: y + 0.08, w: 4.2, h: 0.76, margin: 0, valign: "middle", fontFace: FONT, fontSize: 16, bold: true, color: TXT });
  s.addText(b, { x: M + 5.3, y: y + 0.08, w: W - 2 * M - 5.6, h: 0.76, margin: 0, valign: "middle", fontFace: FONT, fontSize: 13.5, color: MUTE });
});
pageTag(s, 14);

// ============================================================
// 15 — THANK YOU (dark)
// ============================================================
s = pres.addSlide(); s.background = { color: DARK };
s.addShape(pres.shapes.OVAL, { x: -2.5, y: H - 4.5, w: 8, h: 8, fill: { color: STEEL, transparency: 90 } });
s.addText([{ text: "Thank you", options: { color: INK } }], { x: M, y: 2.7, w: 11, h: 1.1, margin: 0, fontFace: FONT, fontSize: 54, bold: true });
s.addText("Questions & live demo", { x: M, y: 3.9, w: 11, h: 0.6, margin: 0, fontFace: FONT, fontSize: 22, color: AMBER });
s.addText([
  { text: "Mikhail Senatorov  &  Javid Aliyev", options: { color: DIM } },
  { text: "      github.com/SenatorBLOG/3D-Forge", options: { color: STEEL } },
], { x: M, y: 5.4, w: 11.5, h: 0.4, margin: 0, fontFace: FONT, fontSize: 14 });

pres.writeFile({ fileName: path.join(__dirname, "3D-Forge-Midterm.pptx") }).then((f) => console.log("WROTE", f));

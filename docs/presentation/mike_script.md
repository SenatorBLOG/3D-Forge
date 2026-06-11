# 🎤 Mike — Presentation Script & Defense

**Твои слайды: 1, 2, 3, 4, 5 + закрытие 11 (+ опционально 12).**
Javid делает 6–10.

---

# ЧАСТЬ 1 — РУССКИЙ (концепт + позиция защиты)

## Главный принцип (мантра)
**Никогда не защищай продукт. Защищай знание.**
Споришь «наше приложение уникально» → проиграл (всегда есть с чем сравнить).
Говоришь «приложение — инструмент, вклад — измерение и датасет» → спорить не с чем.

## Техника «Согласись → разверни» (айкидо)
1. **Согласись с правдой:** «Да, локальное редактирование существует.»
2. **Разверни:** «Именно поэтому наш вклад — не редактирование, а измерение точности и открытый датасет.»

Согласие + разворот = умный и подготовленный.
Спор + переоценка = тебя уничтожают.

## Позиция в 3 предложениях
1. Приложение — это **инструмент сбора данных**, не научный вклад.
2. Вклад = **(а) измерение** прироста точности от пространственной привязки + **(б) первый открытый датасет** язык↔3D-координаты.
3. **Новый алгоритм НЕ заявляем.** Заявляем новое знание. Для applied research этого достаточно.

## Ловушки — НЕ падай
- ❌ Не говори «первая в мире система». → «первый, насколько нам известно, датасет».
- ❌ Не говори «никто не редактирует по региону» — ложь (DreamEditor, Vox-E). Дадут ссылку — труп.
- ❌ Не лезь в детали реализации без вопроса. Больше слов = больше поводов придраться.
- ❌ Не нервничай. Спокойный тон = ты прав.

## Концепт по слайдам
- **1 Титул:** заявка, не задерживайся. (На слайде «print-on-demand» и «5 AI agents» — объясни только если спросят.)
- **2 Проблема:** ставишь **gap** — пробел в знании. Фундамент новизны.
- **3 Живой 3D:** доказательство что вьюер работает. Коротко. Это «инструмент».
- **4 Как работает:** механизм. Подчеркни слово **structured** — структура рождает датасет.
- **5 Демо:** живое действие. Коротко.
- **11 Закрытие:** ⚠️ НЕ читай вслух «первая система тыкнуть в геометрию». Веди с 3 deliverables: app, **dataset, paper**. Закрывай знанием, не продуктом.

---

# ЧАСТЬ 2 — ENGLISH (точный скрипт)

**Bold = must say. Calm, slow on bold parts.**

---

### SLIDE 1 — Title (10 sec, don't linger)
> "Good [morning/afternoon]. We are Mike and Javid. Our project is **3D Forge** — a research project on spatial prompting for AI-generated 3D models.
> The 3D generation market is growing fast — over thirty billion dollars by 2030. But there is a problem nobody has solved well. Let me show you."

---

### SLIDE 2 — The Problem ⭐
> "Every 3D generation tool today is a black box. **You type words, the AI generates whatever it wants, and you cannot point at one part and say 'change only this.'**
> The result: thirty-five percent of people abandon 3D printing within six months, because edits are unpredictable.
> **And here is the key gap — there is no tool that lets you edit by exact 3D coordinates, and no open data that connects language to 3D space.** That gap is what our research targets."

---

### SLIDE 3 — Live 3D Viewer (show, don't over-talk)
> "This is our working viewer. The model loads directly in the browser. I can rotate it, zoom in, and — most importantly — **click any point on the surface to attach a prompt to that exact location.**
> So instead of describing the whole object, the user points at the part they want to change."

---

### SLIDE 4 — How It Works ⭐ (emphasize "structured")
> "Here is the pipeline. Five steps.
> One — load the model. Two — the user clicks, and a raycaster finds the exact x, y, z coordinates on the surface.
> Three — and this is our core piece — **we build a structured spatial prompt: coordinates, plus the mesh region, plus a label, plus the instruction.**
> Four — that structured prompt goes to Claude and Meshy. Five — the model updates.
> **The important part is the word 'structured.' Because every prompt is structured the same way, every interaction automatically becomes a clean data record. That is how our dataset is born.**"

---

### SLIDE 5 — See It In Action (short)
> "Here you can see the full flow live. The user places a point, types an instruction for that spot, and the system packages it and sends it to the AI.
> Every step you see here is also being recorded as data."

**Hand to Javid:** "Javid will now take you through who this is for, the tech, and our research plan."

---

*( … Javid: slides 6–10 … then back to you. )*

---

### SLIDE 11 — Conclusion ⭐⭐ (LEAD WITH KNOWLEDGE, NOT PRODUCT)
> "To close. **I want to be precise about what we are contributing, because it is not the app.**
> **The app is our instrument. Our research contribution is two things.**
> **First — a measurement. We will measure whether adding spatial grounding to a prompt improves the precision of AI 3D edits, compared to text alone. That number does not exist yet.**
> **Second — an open dataset. The first one, to our knowledge, that links natural-language instructions with 3D coordinates, regions, and before-and-after geometry.**
> By August 2026 we deliver three things: a working web app, that open dataset, and a research paper.
> **A working tool is engineering. A measurement and an open dataset — that is new, shareable knowledge.** Thank you. We're happy to take questions."

**Optional finish — Slide 12:**
> "And here is one of our generated models, live in the browser — this is the kind of object our pipeline produces and annotates."

---

## 🛡️ DEFENSE Q&A (memorize)

**Q: "What is genuinely new? This already exists."**
> "You're right that the components exist. **Our contribution is not the components — it's the knowledge. We're measuring something no one has measured, and releasing a dataset no one has released.**"

**Q: "DreamEditor / research already does local 3D editing."**
> "Correct, and we cite them. **But they're not on commercial APIs, not in the browser for normal users, and no one measured the precision gain or published it as an open dataset.** That's our space."

**Q: "This is just an engineering project / a wrapper around Claude and Meshy."**
> "The engineering is the instrument. **The research output is the measurement and the dataset — those are recognized scientific contributions. We're not claiming a new model; we're producing new knowledge about an existing one.**"

**Q: "Why are you sure your dataset is the first?"**
> "We say 'to our knowledge,' and we're verifying it in our literature review. **If a similar dataset exists, we'll position relative to it.**"

**Q: "Is this enough for a research contribution?"**
> "For applied research, the bar is new shareable knowledge, not a new algorithm. **A measurement plus an open dataset meets that bar.**"

**Q (cornered / don't know):**
> "That's a fair point — we'll address it in detail in the full proposal and literature review." *(safe exit)*

---

## 🗣️ Delivery reminders
- The two lines that decide your grade = bold lines on **Slide 11**. Practice until automatic.
- Professor pushes → **pause, agree, redirect.** Never argue fast.
- Don't volunteer implementation detail. **Less said = fewer attack surfaces.**
- If you blank: *"Javid, want to add?"* — you're a team.

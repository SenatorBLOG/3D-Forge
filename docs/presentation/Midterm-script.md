# 3D Forge — Midterm: word-for-word script (~5 min)

Two presenters. **[M]** = Mikhail, **[J]** = Javid. Read it naturally — slides are just backup, the demo is the main thing.

---

## Slide 1 — Title
**[M]** "Hi everyone, we're Mikhail and Javid, and our project is **3D Forge**. It's a web app that lets you create a 3D model just by typing what you want — and then edit it by clicking the part you want to change. Today we'll show what we've built so far, then give a live demo."

## Slide 2 — What we built
**[M]** "Our tool works in three steps.
**Step one, Image** — generate a reference picture first. That part is still planned.
**Step two, Model** — you type a prompt and we turn it into a real 3D model using the Meshy API. This works today — you can spin the model right in the browser.
**Step three, Edit** — you click a point on the model and describe the change in plain words. We call this our *spatial prompt*. The clicking and the prompts already work.
So — **done:** generating models, the spatial prompt, and a small community app with accounts and a gallery. **Not done yet:** the image step, and editing an existing model — Javid will explain why in a second."

## Slide 3 — Tech & architecture
**[J]** "Quickly, how it's built. The front end is **React** with **Three.js** for the 3D viewer. The back end is **Node** and **Express**. The server calls **Meshy** to generate the models, and **Claude** to clean up the prompt before sending it. And the whole app runs in 'mock mode' with no API keys or database — so we can demo it anywhere."

## Slide 4 — Challenges
**[J]** "Our main challenges.
First, the spatial prompting itself — taking a 3D click plus a few words and turning it into one instruction the AI actually understands.
Second, and this is the biggest one: **Meshy only does text-to-3D. It re-generates the whole model from scratch and ignores our 3D points — so it can't really edit an existing model.** That's the part we still need to solve.
Third, the usual API problems — speed, CORS, and cost — which we handled with a server proxy, a daily cost limit, and the mock mode."

## Slide 5 — What's next → demo
**[M]** "What's next: add the image step, build real editing of an existing model, and deploy it live.
That's the overview — now let me actually show you the app."

---

## LIVE DEMO  (Mikhail drives, ~3 min)
> Open the app first (`npm run dev` → the localhost link). Talk while you click.

- "This is the home page — these are real 3D models published by the community."
- "Here's the **Forge**, our main tool. I type a prompt… and it generates a model."
- "Now I **click a point** on the model, and type what I want to change there — that's the **spatial prompt**."
- *(if voice works)* "I can even **speak** the prompt instead of typing it."
- "And here's a model's page — you can **like** it, **comment**, and **follow** the maker."
- "Everything you're seeing runs with no API keys, in mock mode."

## Closing
**[M / J]** "So that's our progress: generation and the spatial prompt are working, the community side is built, and editing an existing model is what we'll focus on next. Thanks — happy to answer questions."

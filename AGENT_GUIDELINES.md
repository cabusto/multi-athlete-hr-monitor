# AGENT_GUIDELINES.md

## Role of this product

This product is a **coach utility**.

It is not an athlete app, not a team platform, and not a sports science product.

Its job is extremely narrow:

> Show multiple athletes’ live heart rates on one screen, clearly enough that a coach can use it during a workout.

Every implementation decision must support that job.

---

## Prime Directive

> Preserve simplicity. Reduce friction. Do not overbuild.

If a feature does not make it easier for a coach to:
- identify the athlete
- see the current HR
- trust the signal
- keep coaching

then it should not exist in this prototype.

---

## Product Identity

This tool is:

- a live monitor
- a shared screen
- a utility
- glanceable

This tool is not:

- a dashboard
- a historical analytics product
- a data science experiment
- a communication tool
- a wearable platform

---

## User Mental Model

The coach should think:

> “I can see everyone’s heart rate right now.”

They should not have to think:

- how the radios work
- what protocol is being used
- how data is persisted
- what setup mode they are in

Hide implementation complexity whenever possible.

---

## UX Priorities

### 1. Glanceability beats detail
A coach should understand the screen in under 2 seconds.

### 2. Readability beats density
Large text and clean spacing matter more than fitting more data on screen.

### 3. Stability beats features
A smaller, simpler feature set is better if it makes the prototype more reliable.

### 4. Explicit beats clever
Do not infer more than necessary.
Do not auto-organize more than necessary.
Do not hide important state.

---

## UI Guidance

### The heart rate number is the hero
Every tile should prioritize:
1. Athlete name
2. Current HR

Everything else is supporting metadata.

### Avoid table-like thinking
This should look like a **grid of athlete tiles**, not a spreadsheet.

### Use visual calm
Prefer:
- simple cards or panels
- large typography
- high contrast
- minimal color

Avoid:
- excessive badges
- gradients
- charts
- unnecessary icons
- tiny labels

---

## Required Data Handling Behavior

### Device identity
Treat the ANT+ device ID as the stable identity key.

### Naming
If a coach assigns a name to a device ID:
- save it locally
- restore it automatically on restart

### Missing data
If battery is unavailable:
- show `Unknown`
- or hide the field

Do not fabricate values.

### Lost signal
If a device stops updating:
- keep it visible briefly
- mark it stale if possible

Do not remove it immediately without explanation.

---

## Engineering Guidance

### Optimize for working quickly
This is a proof of concept.
Use the simplest implementation that works.

### Prefer local-first architecture
- local backend
- local persistence
- local web UI

No cloud unless absolutely necessary.

### Keep dependencies pragmatic
Use libraries that simplify ANT+ integration quickly.
Do not build protocol handling from scratch unless forced.

---

## What not to add

Do not add any of the following unless explicitly asked:

- user login
- cloud sync
- session history
- charts
- trend lines
- alerts
- HR zones
- athlete profiles beyond names
- workout timers
- BLE support
- exports
- admin panels
- mobile apps

These are distractions in this phase.

---

## Failure Conditions

The prototype has failed if:

- the UI is hard to read at a glance
- setup is confusing
- naming devices is annoying
- too much screen space is spent on low-value metadata
- the product feels like a dashboard instead of a utility

---

## Success Standard

The prototype succeeds if a coach can:

1. Turn it on
2. See 3–8 athletes live
3. Know who is who
4. Read their HR instantly
5. Keep coaching without fiddling

That is enough.

---

## Final Reminder

> This product is for live coaching, not for explaining itself.

If you are deciding between:
- adding capability
- making the screen calmer

choose the calmer screen.
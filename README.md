# Supernova Component Classes Exporter

A custom Supernova exporter that generates `@layer components` CSS classes from your component-level design tokens. It pairs alongside your existing Tailwind/CSS exporter.

## What it generates

Given Figma variables structured as `alert/padding-x → space/inset/sm`, this exporter outputs:

```css
@layer components {

  /* alert */
  .alert {
    padding-inline: var(--spacing-alert-padding-x);
    padding-block: var(--spacing-alert-padding-y);
    gap: var(--spacing-alert-gap);
    border-radius: var(--radius-alert-radius);
  }

  .alert--success {
    background-color: var(--color-alert-success-bg);
    border-color: var(--color-alert-success-border);
    color: var(--color-alert-success-icon);
  }

  /* button */
  .button {
    padding-inline: var(--spacing-button-padding-x);
    ...
  }
}
```

## Token structure expected in Figma

| Figma variable path | Generates |
|---|---|
| `alert/padding-x` | base class `.alert { padding-inline: ... }` |
| `alert/padding-y` | base class `.alert { padding-block: ... }` |
| `alert/radius` | base class `.alert { border-radius: ... }` |
| `alert/success/bg` | variant class `.alert--success { background-color: ... }` |
| `alert/warning/border` | variant class `.alert--warning { border-color: ... }` |

Paths with **2 segments** → base component class  
Paths with **3 segments** → variant modifier class

## CSS variable naming convention

This exporter assumes your CSS/Tailwind exporter uses the prefix format:

```
--{type}-{component}-{token-name}
--{type}-{component}-{variant}-{token-name}
```

Examples: `--spacing-alert-padding-x`, `--radius-alert-radius`, `--color-alert-success-bg`

This matches the default Supernova CSS exporter `tokenPrefixes` config.

## Setup

### 1. Install in Supernova

In Supernova → **Code Automation → Exporters → Install custom exporter** → paste this repo URL.

### 2. Create a pipeline

In Supernova → **Code Automation → Pipelines → New pipeline** → select this exporter.

Point the output to the same directory as your existing CSS/Tailwind exporter output (e.g. `src/styles/`).

### 3. Configure (optional)

Open `src/index.ts` and adjust the top-level constants:

| Constant | Purpose |
|---|---|
| `CSS_PROPERTY_MAP` | Add new token name → CSS property mappings |
| `TYPE_PREFIX_MAP` | Match the prefixes your CSS exporter uses |
| `COMPONENT_COLLECTION_NAME` | Must match your Figma collection name exactly |

### 4. Local development

```bash
npm install
# Then use the Supernova VS Code extension to run the exporter locally
# Output appears in .build/
```

## Extending

To add a new component property (e.g. `letter-spacing`), simply add it to `CSS_PROPERTY_MAP`:

```ts
const CSS_PROPERTY_MAP = {
  // ... existing entries
  "letter-spacing": "letter-spacing",
}
```

Then make sure the corresponding Figma variable has the correct scope set (**Letter spacing** in Figma's variable scope panel).

## Output file

The exporter generates a single file: `component-classes.css`

Import it in your main CSS entry point after your Tailwind base:

```css
@import "tailwindcss";
@import "./component-classes.css";
```

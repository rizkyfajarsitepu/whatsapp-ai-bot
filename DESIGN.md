---
name: Executive Precision
colors:
  surface: '#f6fafe'
  surface-dim: '#d6dade'
  surface-bright: '#f6fafe'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f4f8'
  surface-container: '#eaeef2'
  surface-container-high: '#e4e9ed'
  surface-container-highest: '#dfe3e7'
  on-surface: '#171c1f'
  on-surface-variant: '#474556'
  inverse-surface: '#2c3134'
  inverse-on-surface: '#edf1f5'
  outline: '#787588'
  outline-variant: '#c8c4d9'
  surface-tint: '#543af1'
  primary: '#4829e7'
  on-primary: '#ffffff'
  primary-container: '#624bff'
  on-primary-container: '#f0ebff'
  inverse-primary: '#c6c0ff'
  secondary: '#555f6c'
  on-secondary: '#ffffff'
  secondary-container: '#d6e1ef'
  on-secondary-container: '#596470'
  tertiary: '#8f3900'
  on-tertiary: '#ffffff'
  tertiary-container: '#b64a00'
  on-tertiary-container: '#ffe9e1'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e4dfff'
  primary-fixed-dim: '#c6c0ff'
  on-primary-fixed: '#150066'
  on-primary-fixed-variant: '#3b09db'
  secondary-fixed: '#d9e3f2'
  secondary-fixed-dim: '#bdc7d6'
  on-secondary-fixed: '#121c27'
  on-secondary-fixed-variant: '#3e4854'
  tertiary-fixed: '#ffdbcc'
  tertiary-fixed-dim: '#ffb694'
  on-tertiary-fixed: '#351000'
  on-tertiary-fixed-variant: '#7a2f00'
  background: '#f6fafe'
  on-background: '#171c1f'
  surface-variant: '#dfe3e7'
  surface-white: '#FFFFFF'
  text-main: '#212B36'
  text-muted: '#64748B'
  border-subtle: '#E2E8F0'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
  headline-md-mobile:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 32px
---

## Brand & Style
The design system is engineered for high-density information environments where clarity, efficiency, and professional trust are paramount. It adopts a **Corporate / Modern** aesthetic, prioritizing functional minimalism to reduce cognitive load for power users. 

The visual language is defined by a rigorous "Surface-on-Base" architecture. It utilizes a cool-toned neutral foundation to provide a restful backdrop for data-heavy visualizations, while using a vibrant primary blue to drive action and highlight critical state changes. The overall emotional response should be one of stability, technical competence, and organized control.

## Colors
The color strategy employs a layered approach to establish hierarchy. The **Neutral Base** (#F1F5F9) acts as the canvas for the entire application, while **Surface White** (#FFFFFF) is reserved exclusively for interactive cards and data containers to create a "lifted" effect.

The **Primary Blue** (#624BFF) is the high-visibility signal color used for primary actions, active navigation states, and progress indicators. The **Secondary Dark** (#212B36) provides strong contrast for typography and persistent side-navigation elements, ensuring the structure of the dashboard remains grounded.

## Typography
This design system utilizes **Inter** exclusively to take advantage of its exceptional legibility in digital interfaces and various weights. 

The type scale is optimized for dashboard density. **Body-md (14px)** is the workhorse size for all standard data and form inputs. **Label-md** uses an uppercase treatment with slight tracking to differentiate metadata and section headers from actionable content. For mobile views, large headlines should scale down to maintain a balanced information ratio without forcing excessive scrolling.

## Layout & Spacing
The layout follows a **Fluid Grid** model centered on an 8px rhythmic scale (derived from the 4px base unit). 

- **Desktop:** 12-column grid with 24px gutters. The main content area sits on the neutral background, while the sidebar remains fixed at 256px.
- **Tablet:** 8-column grid with 24px gutters. The sidebar collapses into a hamburger menu or icon-only rail.
- **Mobile:** 4-column grid with 16px margins. Cards should span the full width of the viewport to maximize readability.

Spacing between related items (e.g., input and label) uses `sm`, while spacing between unrelated sections or cards uses `lg` or `xl`.

## Elevation & Depth
Depth is communicated through **Tonal Layers** supplemented by **Ambient Shadows**. This design system avoids heavy shadows to maintain a clean, "flat-plus" look.

1.  **Level 0 (Background):** The neutral base (#F1F5F9).
2.  **Level 1 (Cards/Surfaces):** White background with a very soft, diffused shadow: `0px 2px 4px rgba(33, 43, 54, 0.05)`.
3.  **Level 2 (Dropdowns/Modals):** White background with a more pronounced shadow to indicate temporal overlay: `0px 8px 16px rgba(33, 43, 54, 0.10)`.

A 1px border (#E2E8F0) is applied to all Level 1 surfaces to ensure separation when the background color is subtle.

## Shapes
The shape language is consistently **Rounded** (0.5rem / 8px). This radius is applied to cards, buttons, and input fields to soften the industrial nature of data-heavy layouts. 

Small components like checkboxes or tags utilize a 4px radius (`rounded-sm`), while large containers like modals or primary dashboard panels maintain the standard 8px radius. Full pills are used exclusively for status "badges" (e.g., Success, Warning) to distinguish them from interactive buttons.

## Components
- **Buttons:** 
  - *Primary:* Solid #624BFF with white text. 
  - *Secondary:* Outlined with a 1px #E2E8F0 border and #212B36 text.
  - *Ghost:* No border or background; text-only for low-priority actions.
- **Input Fields:** 1px #E2E8F0 border, white background. On focus, the border transitions to #624BFF with a subtle 2px glow of the same color at 20% opacity.
- **Cards:** White surfaces with 8px corner radius and Level 1 shadow. Headers within cards should have a subtle bottom border to separate titles from body content.
- **Chips/Badges:** Small, 12px font-size. Success/Error states use a 10% opacity background of their respective semantic color with 100% opacity text for high legibility without visual noise.
- **Lists:** Rows should have a minimum height of 48px to remain touch-friendly, using a subtle background hover state of #F8FAFC.
- **Navigation:** Vertical sidebar uses #212B36. Active links are indicated by a left-hand border of #624BFF and a slightly lightened background tint.
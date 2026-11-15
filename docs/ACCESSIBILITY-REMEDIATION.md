# Accessibility remediation

The evidence drawer now sets initial focus, traps Tab and Shift+Tab, closes on Escape, restores the opener focus, has a labelled modal, exposes action selection with `aria-pressed`, and marks mutation/import failures as alerts. Reduced-motion CSS remains enabled. Automated coverage should verify these behaviors on every supported viewport.

This is targeted remediation, not a WCAG conformance claim. Contrast, screen-reader output, mobile layouts, and assistive technology combinations still require a dedicated audit.

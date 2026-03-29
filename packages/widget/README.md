# @tres-crm/widget

Embeddable support widget for TRES CRM. Drop a single `<script>` tag into any website to enable customer ticket submission.

## Quick Start

```html
<script
  src="https://cdn.trescrm.com/widget/v1/tres-widget.min.js"
  data-tenant="your-tenant-slug"
  data-token="pub_your_widget_token"
  data-position="bottom-right"
  data-accent="#4F46E5">
</script>
```

## Programmatic Usage

```js
TresCRM.init({
  tenant: "your-tenant-slug",
  token: "pub_your_widget_token",
  position: "bottom-right",
  accentColor: "#4F46E5",
  greeting: "How can we help?",
});

TresCRM.open();   // Open the widget
TresCRM.close();  // Close the widget
TresCRM.destroy(); // Remove from DOM
```

## Features

- Shadow DOM CSS isolation (no conflicts with host page)
- Responsive: panel on desktop, fullscreen on mobile
- Keyboard accessible (Escape to close, focus management)
- Respects `prefers-reduced-motion`
- Auto-init from `<script>` tag data attributes
- WCAG 2.1 AA compliant

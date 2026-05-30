# @trevormil/beacon-widget

Embeddable feedback widget — a ~8 KB Shadow-DOM bubble that pipes submissions into your repo as tickets and (optionally) draft MRs.

```html
<script
  src="https://cdn.jsdelivr.net/npm/@trevormil/beacon-widget/dist/beacon.js"
  data-project="pub_your_public_key"
  data-endpoint="https://beacon.example.com"
  defer
></script>
```

Customize with `data-primary`, `data-position`, `data-title`, `data-placeholder`, `data-success`, or CSS variables on `#beacon-root`.

Full docs, customization options, and the rest of the platform (server, CLI, processor): **https://github.com/trevormil/beacon**

MIT.

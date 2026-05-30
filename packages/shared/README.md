# @trevormil/beacon-shared

Shared types, DAL interface, and four driver adapters for [Beacon](https://github.com/trevormil/beacon).

```ts
import { createDal, generatePublicKey, hashSecret } from "@trevormil/beacon-shared";

// URL-scheme dispatch: postgres / mysql / mongodb / sqlite (incl. :memory:)
const dal = await createDal(process.env.DATABASE_URL!);
await dal.init();
```

`BeaconDal` is a single ~12-method interface; the four adapters implement it on top of `postgres-js`, `mysql2`, `mongodb`, and `bun:sqlite` respectively. Schema stays inside the portable SQL subset so any dialect works with the same code.

Used internally by `@trevormil/beacon-server`. Adapter authors can target it directly.

Full docs: **https://github.com/trevormil/beacon**

MIT.

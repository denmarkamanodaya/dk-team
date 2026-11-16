# Template: TypeScript versioned unit (web `core/`, `services/`, `hooks/`; backend `domain/`, `usecases/`, `adapters/`, `handlers/`)

Rules this template follows (never restated here): versioning and test placement `stack/versioning.md`; doc comments `stack/code-style.md`; `Result<T, E>` and error codes `stack/errors-and-resilience.md`; ports, `deps` injection and thin handlers `core/architecture-hexagonal.md`. Paths are relative to `@DK_TEAM@/rules/`.

```
src/<layer>/<area>/<unit-kebab>/
  v1.ts
  v1.test.ts                 beside the version file
  index.ts
src/<layer>/__tests__/
  pointers.test.ts           one file per layer, one `it` per unit; never inside the unit directory
```

`index.ts` (the pointer; its only line):

```ts
export * from './v1.js';
```

`v1.ts` (a use case or domain rule: driven ports arrive through `deps`, expected failures are returned, never thrown):

```ts
// <File header: what this file is, which plan document asked for it, which contract it implements.>
import type { Clock } from '<ports>/clock.js';
import type { <Port> } from '<ports>/<port-kebab>.js';
import { err, ok, type Result } from '<shared>/result.js';
import type { <Area>Error } from '<area errors>';

/**
 * <One sentence, third person, what it does.>
 *
 * @version 1
 * @since <yyyy-mm-dd>
 * @rollback n/a, first version
 * @param deps - Driven ports: `<port>` (<what it provides>), `clock`.
 * @returns A function taking `<In>` (<units, ranges>) and returning `Ok` with <shape>, or `Err`
 *   with code `<UPPER_SNAKE>` when <condition>.
 * @see contracts/<area>/v1/fixtures
 */
export const <unitCamel> =
  (deps: { readonly <port>: <Port>; readonly clock: Clock }) =>
  async (input: <In>): Promise<Result<<Out>, <Area>Error>> => {
    // ...
  };
```

A pure helper or adapter without ports keeps the same doc block and exports a plain function. Add `@throws` only for programmer errors.

`v1.test.ts` (names are sentences; fixtures over literals; fakes from test support):

```ts
import { <unitCamel> } from './v1.js';
import { build<In>, build<Out> } from '<test-support>/builders.js';
import { fake<Port>, fakeClock } from '<test-support>/fakes.js';
import { loadFixture } from '<test-support>/fixtures.js';

describe('<unitCamel> v1', () => {
  it('<states the rule in a sentence>', async () => {
    const input = build<In>(loadFixture('<area>/v1/<case>.json'));
    const expected = build<Out>(loadFixture('<area>/v1/<case>.expected.json'));

    const out = await <unitCamel>({ <port>: fake<Port>(), clock: fakeClock() })(input);

    expect(out).toEqual(ok(expected));
  });
});
```

`build<In>` / `build<Out>` live in test support and turn fixture JSON into domain values, so the use case never receives a wire shape (`core/architecture-hexagonal.md`, "Adapters translate at the boundary"); a builder reuses the adapter's mapper rather than restating it (`core/dry.md`). `<shared>/result.ts` is a plain shared-kernel module, not a directory with an `index.ts` barrel (barrels exist only as version pointers: `stack/versioning.md`).

Pointer test, one `it` per unit in `src/<layer>/__tests__/pointers.test.ts`:

```ts
import * as current from '../<area>/<unit-kebab>/index.js';
import * as v1 from '../<area>/<unit-kebab>/v1.js';

it('<unit> pointer exports v1', () => expect(current.<unitCamel>).toBe(v1.<unitCamel>));
```

Bumping to v2 is one PR: `v2.ts` (`@version 2`, `@since`, `@change`, `@rollback`), `v2.test.ts`, the one-line change in `index.ts`, and the pointer-test update; nothing else. When a bump is allowed: `stack/versioning.md`.

React hook unit: same layout under `src/hooks/use-<thing>/`, exporting `useThing` from `v1.ts`. The hook gets bound use cases from the composition context (`app/`) and never imports a service module, axios or `fetch` directly.

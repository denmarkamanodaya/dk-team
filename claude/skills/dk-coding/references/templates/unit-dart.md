# Template: Dart versioned unit (`lib/core/`, `lib/services/`, `lib/data/`, `lib/platform/`, Notifiers in `lib/features/`)

Rules this template follows (never restated here): versioning and test placement `stack/versioning.md`; doc comments `stack/code-style.md`; `Result<T, E>` and the error families `stack/errors-and-resilience.md`; ports and injection `core/architecture-hexagonal.md`. Paths are relative to `@DK_TEAM@/rules/`.

```
lib/<layer>/<area>/<unit_snake>/
  v1.dart
  current.dart
test/<layer>/<area>/<unit_snake>/
  v1_test.dart                         mirrored tree, never beside the source
test/architecture/
  pointers_<layer>_test.dart           or one pointers_test.dart
```

`current.dart` (the pointer; its only line):

```dart
export 'v1.dart';
```

`v1.dart`:

```dart
// <File header: what this file is, which plan document asked for it, which contract it implements.>

import 'package:<pkg>/core/<area>/<area>_error.dart';
import 'package:<pkg>/core/<area>/ports/<port_snake>.dart';
import 'package:<pkg>/core/errors/result.dart';
import 'package:<pkg>/core/time/ports/clock.dart';
import 'package:meta/meta.dart';

/// <One sentence, third person, ends with a period, does not repeat the name.>
///
/// Version: 1 · Since: <yyyy-mm-dd>
/// Rollback: n/a, first version
///
/// <Units and ranges.> Returns [Ok] with <shape>, or [Err] with a [<Area>Error]
/// whose code is `<UPPER_SNAKE>` when <condition>. Pinned by `contracts/<area>/v1/golden.json`.
@immutable
final class <UnitPascal> {
  /// Creates the use case from its driven ports.
  const <UnitPascal>({required <Port> port, required Clock clock}) : _port = port, _clock = clock;

  final <Port> _port;
  final Clock _clock;

  /// <What the call does and which [Result] variants it returns.>
  Future<Result<<Out>, <Area>Error>> call(<In> input) async {
    // ...
  }
}
```

The error family the unit returns (one per area, in its own library; the root is `abstract`, the family is `sealed`):

```dart
// lib/core/<area>/<area>_error.dart
sealed class <Area>Error extends AppError { /* final subtypes, one per code */ }
```

`test/<layer>/<area>/<unit_snake>/v1_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:<pkg>/<layer>/<area>/<unit_snake>/v1.dart';

import '../../../support/builders.dart';
import '../../../support/fakes.dart';
import '../../../support/fixtures.dart';

void main() {
  group('<UnitPascal> v1', () {
    test('<states the rule in a sentence>', () async {
      final input = build<In>(loadFixture('<area>/v1/<case>.json'));
      final expected = build<Out>(loadFixture('<area>/v1/<case>.expected.json'));

      final out = await <UnitPascal>(port: Fake<Port>(), clock: FakeClock()).call(input);

      expect(out, equals(Ok<<Out>, <Area>Error>(expected)));
    });
  });
}
```

No `const` on the use case in tests: the in-memory fakes hold state, so their constructors are not `const`. `build<In>` / `build<Out>` live in test support and turn fixture JSON into domain values, so the use case never receives a wire shape (`core/architecture-hexagonal.md`, "Adapters translate at the boundary"); a builder reuses the adapter's mapper rather than restating it (`core/dry.md`).

Pointer test, one line per unit in `test/architecture/pointers_<layer>_test.dart` (or `pointers_test.dart`):

```dart
import 'package:<pkg>/<layer>/<area>/<unit_snake>/current.dart' as current;
import 'package:<pkg>/<layer>/<area>/<unit_snake>/v1.dart' as v1;

test('<unit> pointer exports v1', () => expect(identical(current.<UnitPascal>.new, v1.<UnitPascal>.new), isTrue));
```

Bumping to v2 is one PR: `v2.dart` (`Version: 2 · Since · Supersedes: v1 · Change · Rollback`), `v2_test.dart` in the mirrored tree, the one-line change in `current.dart`, and the pointer-test update. When a bump is allowed: `stack/versioning.md`.

---
paths:
  - "**/*.rs"
  - "**/Cargo.toml"
  - "**/clippy.toml"
  - "**/deny.toml"
---

# Rust (desktop core and Tauri shell)

Scope: Rust crates in dk-coding repos (desktop cores and Tauri shells). Owner ruling D13, 2026-10-18. Layer rules: `core/architecture-hexagonal.md`. DRY: `core/dry.md`. Errors: `stack/errors-and-resilience.md`. Tests: `stack/testing.md`. This file maps those rules onto Rust and adds only what is Rust-specific.

## Layer map

| Role | Where |
|---|---|
| Domain, ports, use cases (pure) | the core crate: `src/domain/`, `src/ports/`, `src/usecases/` |
| Driven adapters | the adapters crate. The only crate that touches the file system, processes, SQLite, the network or OS APIs |
| Driving adapters | Tauri `commands/`: parse input, call one use case, map the result to a DTO or `ErrorDto` |
| Composition root | the shell's `composition.rs`: the only place that reads env, resolves paths, builds adapters and binds them to ports |
| Wire types | the contracts crate (serde + schemars); its `gen` binary writes `contracts/` and generated TS, with `--check` |
| Fakes and port contract suites | the testkit crate, a dev-dependency only |

- The core crate's `Cargo.toml` depends only on `serde`. Its `clippy.toml` bans, through `disallowed-methods` and `disallowed-types`: `std::time::SystemTime::now`, `std::time::Instant::now`, `std::fs::*`, `std::process::*`, `std::env::var`, `std::env::var_os`, `std::net::*`, and `println!`, `eprintln!`, `dbg!` (via `clippy::print_stdout`, `print_stderr`, `dbg_macro` = deny). Inject time through `Clock`, ids through `IdGenerator`.
- Ports are traits in the core, `Send + Sync`, in domain types only. Adapters are named `<Tech><Port>` (`SqliteCatalogue`, `FfprobeMediaProbe`).

## Errors

- One `AppError { code: ErrorCode, message: String }`; `ErrorCode` serialises as `UPPER_SNAKE` and is the one source the contracts crate exports.
- Expected failures return `Result<T, AppError>`. Adapters map every library and process error to an `AppError` at the boundary; no `std::io::Error`, `rusqlite::Error` or `serde_json::Error` crosses a port.
- `unwrap()`, `expect()`, `panic!`, `todo!`, `unimplemented!` are denied outside `#[cfg(test)]`, tests and `main.rs` startup (`clippy::unwrap_used`, `expect_used`, `panic`, `todo`, `unimplemented`).
- Every child process and blocking IO call has an explicit timeout set in the composition root.

## Size and style

- `rustfmt` defaults with `max_width = 100`.
- `clippy.toml`: `too-many-lines-threshold = 40`, `too-many-arguments-threshold = 4`, `cognitive-complexity-threshold = 10`. Files ≤ 300 non-blank, non-comment lines (checked by the repo's CI script).
- Doc comments (`///`) on every `pub` item in the core and adapters crates (`missing_docs` = warn, which `-D warnings` makes an error). First line one sentence; state units and failure codes.

## Versioning

- Rust crates are not versioned (`v<N>` files) until a rollback need appears (D13). Behaviour changes are reviewed through tests and the PR. When a rollback need appears, add a section here before the first `v2`.

## Dependencies

- `stack/supply-chain.md` applies. Exact versions in `Cargo.toml` (`=x.y.z`), `Cargo.lock` committed, `cargo deny check licenses advisories` in CI with an allow-list of MIT, Apache-2.0, BSD-2/3-Clause, ISC, Zlib, Unicode-3.0, CC0-1.0 and BSL-1.0 (owner approves any addition).
- Pin the toolchain in `rust-toolchain.toml`.

## Gates (CI order)

`cargo fmt --all --check` → `cargo clippy --workspace --all-targets -- -D warnings -W clippy::pedantic` → file-size check → `cargo test --workspace` → `cargo deny check licenses advisories` → contracts `gen --check`.

## Tests

- Port contract suites: `pub fn run_<port>_contract(make: &dyn Fn() -> Box<dyn Port>)` in the testkit crate, called from the adapters crate's `tests/contract_<port>.rs` and from the testkit's own test against the fake.
- Unit tests for pure code live in a `#[cfg(test)] mod tests` in the same file. Adapter tests use `tempfile` directories and generated fixtures, never the user's files.
- Property tests use `proptest` with the seed printed on failure.

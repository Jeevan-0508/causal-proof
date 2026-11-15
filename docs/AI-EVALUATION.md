# AI evaluation

Phase 6 includes a synthetic evaluation harness in `lib/copilot/evaluation.ts`. It runs four cases: direct evidence support, contradictory evidence, historical cutoff, and instruction-like evidence text. No proprietary or live data is used.

The current deterministic result is produced by `evaluateSyntheticDataset()` and is covered by `tests/copilot.test.ts`:

| Measure | Numerator / denominator | Result |
| --- | ---: | ---: |
| Citation validity | 16 / 16 claims | 100% |
| Unsupported claim rate | 0 / 16 claims | 0% |
| Hindsight leakage | 0 / 2 excluded values | 0% |
| Deterministic reproducibility | 4 / 4 cases | 100% |
| Human review agreement | 0 / 0 labeled cases | Not measured |

The denominators are synthetic fixture counts, not a benchmark. Citation validity checks that identifiers exist in the authorized investigation; it does not verify source truth. No human agreement score is invented because no labeled human sample was supplied. These results do not establish general reliability, causal validity, or security against unknown prompt-injection techniques.

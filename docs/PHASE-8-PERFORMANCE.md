# Phase 8 performance measurements

`npm run measure:phase8` uses deterministic synthetic records and measures historical cutoff filtering plus canonical hashing on Node `v24.21.0`. One observed run produced:

| synthetic records | elapsed milliseconds |
| ---: | ---: |
| 10 | 1.757 |
| 100 | 0.195 |
| 1,000 | 2.673 |

These are local micro-measurements, not service-level objectives. They do not represent SQLite, PDF, browser, or production multi-user latency. Repeat on the target environment before setting budgets.

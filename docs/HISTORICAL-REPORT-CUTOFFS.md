# Historical report cutoffs

An explicit decision replay cutoff is a knowledge cutoff, not merely an occurrence timestamp. Evidence availability and mutation timestamps, event knowledge time, graph-version creation time, replay knowledge cutoff, branch fork time, copilot knowledge cutoff, review time, and report provenance are filtered against the same boundary.

Artifacts recorded later are excluded and listed in provenance. Current-state reports use the latest event knowledge time as their deterministic local boundary. This is a historical reconstruction, not hindsight-free proof of what an actor should have known beyond the recorded clocks.

# Graph Studio

Graph Studio exposes node creation, intervention-node creation, node label
editing, edge creation, node removal with dependent-edge removal, graph history,
and restore-as-new-revision. The server accepts a complete candidate graph only
after authentication, authorization, optimistic parent checks, schema
validation, duplicate detection, DAG cycle detection, temporal checks, known
evidence checks, confounder checks, and intervention checks.

The SVG remains a projection of the authoritative graph. It is not a second
causal model. Failed mutations are displayed as rejected errors and do not
change the investigation.

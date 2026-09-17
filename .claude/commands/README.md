# Slash commands

One file per recurring job. Each command tells Claude Code exactly which CLI command to run and how to present the result, so the operator never re-explains the job.

The daily doors: `/attention` (what needs a decision), `/availability` (the phone call), `/runsheet` (the trucks), `/board` (the contracts), `/off-hires` (the queue that becomes disputes). The weekly rhythm: `/billing-run`, `/debtors`, `/service-due`, `/weekly-review`, `/compliance`.

Add a command every time the same ask comes twice. Frontmatter needs a `description:` line. The body is the brief.

# Authorization model

Permission checks are enforced in server-side route handlers after session authentication and CSRF validation. Membership scope is checked for investigation-specific operations.

| Permission | Administrator | Lead Investigator | Investigator | Reviewer | Read-only Auditor |
| --- | --- | --- | --- | --- | --- |
| Manage users / global keys | Yes | No | No | No | No |
| Create investigations | Yes | Yes | No | No | No |
| Read permitted investigation | Yes | Membership | Membership | Membership | Membership |
| Full investigation write | Yes | Membership | No | No | No |
| Add/challenge/withdraw/restore evidence | Yes | Membership | Membership | Membership | No |
| Run replay / simulation | Yes | Membership | Membership | Membership | No |
| Create immutable branch | Yes | Membership | Membership | No | No |
| Export permitted investigation | Yes | Membership | Membership | Membership | Membership |
| Verify integrity | Yes | Membership | Membership | Membership | Membership |
| Manage investigation members | Yes | Membership | No | No | No |
| Publish external anchor | Yes | Membership | No | No | No |
| Manage encrypted backup | Yes | Membership | No | No | No |
| Manage retention policy/action | Yes | Membership | No | No | No |

Administrator is global. All other roles require an `investigation_members` row for investigation-scoped permissions. Membership roles cannot grant the global administrator role. Auditors have no state-changing permissions even if they call routes directly.

## Escalation boundaries

- A user cannot assign themselves a role or membership.
- Investigation import requires create permission and assigns the importing identity as a lead membership.
- Full JSON replacement is limited to lead/administrator; evidence mutations use a dedicated server-side action route.
- Unauthorized IDs use not-found semantics where appropriate.
- Passwords, session tokens, CSRF tokens, private keys, and passphrases are not written to security activity.

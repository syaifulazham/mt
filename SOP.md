# Standard Operating Procedure (SOP)
## Malaysia Techlympics 2026 — Platform Data Handling

**Document ref:** MT2026-SOP-001  
**Version:** 1.0  
**Effective date:** 2026-01-01  
**Owner:** Platform Administrator  

---

## 1. Purpose

This SOP defines the rules and responsibilities for collecting, processing, displaying, and disposing of personal data within the Malaysia Techlympics 2026 platform. All staff, organizers, and system operators must read, understand, and comply with this document before accessing participant data.

---

## 2. Scope

Applies to all modules of the platform including:

- Participant and contestant registration
- Team and contingent management
- Event and competition management
- Results, certificates, and reporting
- Administrative dashboards and exports

---

## 3. Legal Basis — PDPA Compliance

**All data handling on this platform must comply with the Personal Data Protection Act 2010 (PDPA), Malaysia (Act 709).**

### 3.1 Seven Principles of PDPA

| Principle | Obligation |
|---|---|
| **General** | Personal data may only be processed for the purpose it was collected |
| **Notice & Choice** | Data subjects must be informed of how their data will be used; consent must be obtained |
| **Disclosure** | Personal data must not be disclosed to third parties without consent or legal authority |
| **Security** | Practical steps must be taken to protect personal data from loss, misuse, or unauthorised access |
| **Retention** | Personal data must not be kept longer than necessary |
| **Data Integrity** | Personal data must be accurate, complete, and kept up to date |
| **Access** | Data subjects have the right to access and correct their personal data |

### 3.2 Categories of Personal Data Collected

| Category | Examples | Sensitivity |
|---|---|---|
| Identity | Full name, IC number, passport number | **High** |
| Contact | Email address, phone number, address | Medium |
| Demographic | Date of birth, gender, nationality, state | Medium |
| Institutional | School name, team name, contingent | Low |
| Performance | Competition scores, ranking, results | Low |

---

## 4. Display and Reporting Rules

### 4.1 Identity Card (IC) Numbers

> **IC numbers must never be displayed in any list, table, leaderboard, export, or printed report that shows participant names.**

Rationale: IC numbers are high-sensitivity identifiers under PDPA. Exposing them alongside names in aggregated views constitutes unnecessary disclosure and creates risk of identity fraud.

**Permitted use of IC numbers:**

- Individual participant profile pages (visible only to the data subject or authorised admin)
- Backend verification workflows (e.g., age eligibility check, duplicate detection) — results only, not raw IC
- Secure audit logs with access-controlled visibility
- Official correspondence directed to the individual (e.g., printed certificate dispatch, government reporting under legal obligation)

**Prohibited:**

- Participant lists, name tables, or search result rows
- Exported spreadsheets shared with committee members, coaches, or judges
- Printed programme books, scoresheets, or public-facing result boards
- Any screen or report accessible to participants other than the data subject

### 4.2 Acceptable Identifiers in Name Lists

Use the following identifiers instead of IC numbers when a unique reference is needed alongside a name:

| Context | Use instead |
|---|---|
| Participant lists | Registration ID (system-generated) |
| Competition results | Participant code / bib number |
| Certificate matching | Certificate number |
| Admin deduplication | Masked IC: `\*\*0123` (last 4 digits only, internal use) |

### 4.3 Other Sensitive Fields

| Field | Display rule |
|---|---|
| Full IC number | Never in lists — see §4.1 |
| Passport number | Same rule as IC |
| Date of birth | Age group label only in public views (e.g., "Under 18") |
| Phone number | Hidden in all list views; visible in individual profile to authorised admin only |
| Home address | Never displayed in any UI — for logistics use only, handled offline |
| Parent/guardian name | Not shown in participant lists; visible in individual profile only |

---

## 5. Access Control

### 5.1 Role-Based Access

| Role | Can view IC | Can export raw data | Can edit participant data |
|---|---|---|---|
| Super Admin | Yes (audit logged) | Yes (restricted formats) | Yes |
| Organizer Admin | No | No | Event-scoped fields only |
| Judge / Evaluator | No | No | No |
| Coach / Manager | No | Own contingent only (no IC) | No |
| Participant | Own IC only (own profile) | No | Own profile |
| Public | No | No | No |

### 5.2 Audit Logging

Any access to full IC numbers or passport numbers must be logged with:

- Timestamp
- User ID and role
- Reason / action taken
- IP address

Logs must be retained for a minimum of **12 months**.

---

## 6. Data Retention

| Data type | Retention period | Disposal method |
|---|---|---|
| Registration records (active) | Duration of event + 2 years | Archive to cold storage |
| Registration records (withdrawn) | 90 days after withdrawal | Secure deletion |
| IC / passport numbers | Event duration + 1 year | Secure deletion |
| Competition results | Indefinite (public record) | N/A |
| Audit logs | 12 months | Secure deletion |
| Payment records | 7 years | Archive (financial compliance) |

---

## 7. Data Export and Sharing

- All data exports must be approved by the Platform Administrator.
- Exported files containing personal data must be password-protected.
- IC numbers must be excluded from all exports by default. If required for official government reporting, a separate export workflow requiring Super Admin approval must be used.
- Data must not be shared via personal email, messaging apps (WhatsApp, Telegram), or unsecured channels.
- Physical printouts containing personal data must be handled as confidential and shredded after use.

---

## 8. Breach Response

If a data breach is suspected or confirmed:

1. Immediately notify the Platform Administrator.
2. Isolate affected system components if safe to do so.
3. Document the scope, nature, and timeline of the breach.
4. If the breach involves sensitive personal data (IC, passport, contact), notify the **Personal Data Protection Commissioner** within **72 hours** as required under PDPA.
5. Notify affected data subjects without undue delay.

---

## 9. Compliance Checklist for Developers and Operators

Before deploying any feature that handles personal data, verify:

- [ ] IC numbers are not rendered in any list or table component
- [ ] API responses serving list endpoints exclude IC and passport fields
- [ ] New participant-facing pages do not expose other participants' contact details
- [ ] Export functions default to excluding IC numbers
- [ ] Any new role introduced follows the access control matrix in §5.1
- [ ] Audit logging is in place for any access to high-sensitivity fields

---

## 10. Review

This SOP is reviewed annually or whenever significant changes are made to the platform's data model, user roles, or applicable legislation.

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-01-01 | Platform Administrator | Initial release |

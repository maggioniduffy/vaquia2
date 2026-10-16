# Phase 6 — Man-hours, incidents, KPIs

**Goal:** live, correct KPIs; when data is missing the system says "incompleto", never shows a wrong number.
**Refs:** spec/domain.md#KPIs · spec/data-model.md#KPIs & periods · spec/design.md

## Tasks
- [ ] **6.1** (implementer) Migrations: `man_hours` (month × crew), `incidents` (kind, days_lost, classified_by).
- [ ] **6.2** (implementer) Man-hours input: monthly grid per crew + CSV import.
- [ ] **6.3** (implementer) Incident quick-report (field, offline via phase 2 infra) + HSE classification in office.
- [ ] **6.4** (implementer) `[test-now]` SQL views: lagging (TRIR, LTIFR, severity, FAR, HH since last LTI) and leading (talk compliance, ATS count, actions on time %, near-miss rate). Base (200k / 1M) from `companies.settings.kpi_base`. Each KPI returns `{value, complete: bool, missing: []}`.
- [ ] **6.5** (implementer) Planned-vs-done: talks planned = working days × crews (configurable per crew).
- [ ] **6.6** (implementer) Dashboard: KPI row (mono numbers, delta vs prev month), small line charts (12 months), filters crew/location. Per spec/design.md: no color except meaning.
- [ ] **6.7** (tester) Hand-computed fixture (3 months, 4 crews) → views must match to 2 decimals; missing HH → `complete=false`.

## Acceptance
- Fixture KPIs match hand calculation.
- Missing man-hours for one crew shows "incompleto" with the reason.

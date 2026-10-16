# Domain reference

## Record types
| Type | Frequency | By | MVP |
|---|---|---|---|
| Toolbox talk (charla 5 min) | Daily per shift | Supervisor | ✅ |
| ATS / JSA | Per critical task | Supervisor + crew | ✅ |
| Incident / near-miss quick report | On event | Anyone | ✅ (phase 6) |
| Work permit (general, hot, height, confined, electrical) | Per high-risk task | HSE + supervisor + receiver | backlog |
| Observation card (STOP/SOC) | Monthly targets | Everyone | backlog |
| LOTO | Per energized intervention | Operator + supervisor | backlog |
| PPE / equipment inspection | Weekly / pre-use | HSE / operator | backlog |
| Investigation (cause tree, 5 Whys, ICAM) | Post-incident | HSE + manager | backlog |

## KPIs
Base default 200,000 HH; **configurable** (some operators use 1,000,000).
| KPI | Type | Formula |
|---|---|---|
| TRIR | lagging | recordable × base / HH |
| LTIFR | lagging | lost-time injuries × base / HH |
| Severity rate | lagging | days lost × base / HH |
| FAR | lagging | fatalities × 100,000,000 / HH |
| HH since last LTI | lagging | running sum |
| Talk compliance | leading | talks done / planned |
| Near-miss rate | leading | near misses / HH (low = likely underreporting) |
| Actions on time | leading | closed on time / total due |
| Inspections done | leading | done / planned (backlog) |

Incident kinds: `near_miss, first_aid, recordable, lti, fatal, environmental`. "Recordable" definition → confirm with pilot operator.

## Qualification seed list
Operator induction (per operator), work at height (IRAM 3625), confined spaces, defensive driving, first aid/CPR, firefighting, HAZMAT, field driver's license, rigger/crane operator, radiation protection (ARN).

## Task types (seed)
general, altura, espacio_confinado, trabajo_en_caliente, electrico, izaje.

## Legal framework
Ley 19.587 + Dec. 351/79; Dec. 911/96; Res. SRT 299/11; IRAM 3625/3528; API RP 54; NFPA 704; GHS/SDS.

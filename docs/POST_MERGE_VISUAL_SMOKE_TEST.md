# Post-Merge Visual Smoke Test

**Production HEAD:** `17779e8`
**Tag:** `stable-stitch-full-ui-rewrite-v1`
**Date:** 2026-06-10
**Tester:** Claude Code (Chrome DevTools MCP)
**Environment:** Vite dev server (localhost:5173) + Backend (localhost:48211)

---

## # Passed

### Sidebar
| Check | Result |
|-------|--------|
| White/light background in Light Mode | ✅ |
| Material Symbols Outlined icons rendering as icons (not raw text) | ✅ |
| All 18 nav items visible for SYSTEM_ADMIN | ✅ |
| Active item clearly highlighted in blue | ✅ |
| No overflow or broken layout | ✅ |
| Group labels (العمليات الأساسية / الإدارة المالية / النظام / الأدوات) | ✅ |

### Topbar
| Check | Result |
|-------|--------|
| Light glass effect (rgba white) | ✅ |
| No overflow | ✅ |
| EN/AR language toggle works | ✅ |
| Dark/Light theme toggle works | ✅ |
| User fullName + role displayed | ✅ |

### Dashboard — Light Mode (Critical Fix Verified)
| Check | Result |
|-------|--------|
| Hero section (مرحباً + اسم المستخدم + تاريخ) | ✅ |
| KPI financial cards — white background | ✅ |
| Quick action buttons (4 colored buttons) | ✅ |
| Chip badges (العقود الفعالة، الفواتير المستحقة، المعدات) | ✅ |
| **Chart card: حالة العقود — white background** | ✅ **FIX VERIFIED** |
| **Chart card: التدفق المالي — white background** | ✅ **FIX VERIFIED** |
| **Chart card: حضور اليوم — white background** | ✅ **FIX VERIFIED** |
| **Chart card: حالة الفواتير — white background** | ✅ **FIX VERIFIED** |
| Recent data tables (فواتير / مصروفات / عقود) — light bg | ✅ |
| Operational alerts (تنبيهات العمليات) colored cards | ✅ |

### Dark Mode
| Check | Result |
|-------|--------|
| Sidebar switches to dark navy | ✅ |
| Active item solid blue (not translucent) | ✅ |
| KPI financial cards — dark background | ✅ |
| Chart cards — dark, consistent | ✅ |
| All text readable | ✅ |
| Toggle back to Light Mode | ✅ |

### RTL (Arabic)
| Check | Result |
|-------|--------|
| Sidebar on right | ✅ |
| Arabic labels | ✅ |
| Tables right-aligned | ✅ |

### LTR (English)
| Check | Result |
|-------|--------|
| Sidebar moves to left | ✅ |
| English navigation labels | ✅ |
| "Road Contracting Management" subtitle | ✅ |
| Dashboard KPI cards light in LTR | ✅ |

### Core Pages — Light Mode
| Page | Result |
|------|--------|
| العملاء والجهات (Customers) | ✅ White bg, DataTable, add button |
| الموظفون والكوادر (Employees) | ✅ White bg, bilingual name table |
| الرواتب (Salaries) | ✅ White bg, KPI cards, month filter |
| المخزون والمشتريات (Inventory) | ✅ White bg, 6 tabs, KPI cards |
| القيود المحاسبية (Accounting) | ✅ White bg, summary KPI cards, P&L panel |
| التقارير الشاملة (Reports) | ✅ White bg, filter panel |
| إدارة الشيكات (Cheques) | ✅ White bg, Gulf Bank preview intact |
| سجل التدقيق (Audit Log) | ✅ White bg, colored action badges |
| استيراد البيانات (Data Import) | ✅ White bg, bilingual column mapping |
| تسجيل الدخول (Login) | ✅ White card, dark gradient background |

### RBAC
| Check | Result |
|-------|--------|
| SYSTEM_ADMIN sees all 18 sidebar items | ✅ |
| NAV filter logic: `!it.permission \|\| hasPermission(it.permission)` | ✅ Verified in code |
| contracts_uat has 14 correct permissions from API | ✅ Verified via `/auth/me` |
| `hasPermission` returns false for non-SYSTEM_ADMIN without permission | ✅ Verified in authStore.ts |

### Console
| Check | Result |
|-------|--------|
| JavaScript errors | ✅ Zero |
| Failed network requests | ✅ None |
| Missing font/asset loads | ✅ None |
| Failed API calls | ✅ None |

---

## # Minor Issues

| # | Issue | Severity | Origin |
|---|-------|----------|--------|
| 1 | Recharts `width(-1)/height(-1)` warning — chart container sizing | Low | Pre-existing, not from Stitch |
| 2 | React Router v7 future flag warnings (`v7_startTransition`, `v7_relativeSplatPath`) | Low | Pre-existing, upgrade path |

---

## # Critical Issues

None.

---

## # Console Errors

None. Zero JavaScript errors recorded across the full test session (Dashboard, Customers, Employees, Salaries, Inventory, Accounting, Cheques, Audit Log, Data Import, Dark Mode, LTR, Login).

---

## # Final Decision

```
PASS
```

**Summary:** The Stitch Full UI Rewrite merge to production (`17779e8`) is visually and functionally stable. The primary fix (dashboard chart cards dark in light mode) is confirmed working — all 4 chart card sections render with white/light backgrounds in Light Mode. Dark Mode, RTL, LTR, RBAC logic, and all 9 core pages pass visual inspection. Zero console errors detected throughout the session.

---

*Smoke test conducted: 2026-06-10 — Claude Code (Chrome DevTools MCP)*

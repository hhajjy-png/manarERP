# Equipment Maintenance Module — Backend Audit

**Date:** 2026-06-10
**Branch:** feature/equipment-maintenance-ui-phase1
**Auditor:** Claude Code
**Purpose:** Pre-UI audit to verify backend readiness before building frontend

---

## 1. Route Registration

**File:** `backend/src/app.ts`

```typescript
import maintenanceRoutes from './modules/maintenance/maintenance.routes'
app.use('/api/maintenance', maintenanceRoutes)
```

✅ Registered at `/api/maintenance`

---

## 2. Available Endpoints

**File:** `backend/src/modules/maintenance/maintenance.routes.ts`

| Method | Path | Permission Required | Description |
|--------|------|---------------------|-------------|
| GET | `/records` | `maintenance.read` OR `equipment.read` | List all maintenance records |
| POST | `/records` | `maintenance.create` OR `equipment.update` | Create maintenance record |
| GET | `/due` | `maintenance.read` OR `equipment.read` | Records due in next 30 days |
| GET | `/fuel` | `maintenance.read` OR `equipment.read` | List fuel logs |
| POST | `/fuel` | `maintenance.create` OR `equipment.update` | Add fuel log |
| GET | `/breakdowns` | `maintenance.read` OR `equipment.read` | List breakdowns (filterable by equipmentId, status) |
| POST | `/breakdowns` | `maintenance.create` OR `equipment.update` | Report breakdown |
| PATCH | `/breakdowns/:id/resolve` | `maintenance.create` OR `equipment.update` | Resolve breakdown |
| GET | `/spare-parts` | `maintenance.read` OR `equipment.read` | List spare part usage |
| POST | `/spare-parts` | `maintenance.create` OR `equipment.update` | Record spare part usage |

**Permission logic:** `requirePermission('maintenance.read', 'equipment.read')` → OR (any one grants access)

### CRUD Gap Summary

| Sub-module | Create | Read | Update | Delete |
|------------|--------|------|--------|--------|
| Records | ✅ | ✅ | ❌ | ❌ |
| Fuel | ✅ | ✅ | ❌ | ❌ |
| Breakdowns | ✅ | ✅ | ✅ (resolve only) | ❌ |
| Spare Parts | ✅ | ✅ | ❌ | ❌ |

**Decision:** UI will be Create + Read only. Edit/Delete buttons omitted. Breakdown has a special "Resolve" action button.

---

## 3. Service Logic

**File:** `backend/src/modules/maintenance/maintenance.service.ts`

### Records (`/records`)
- `listRecords(equipmentId?)` — returns records including `equipment: { id, code, name }`
- `createRecord(input)` — side effects:
  - If `status === IN_PROGRESS` → sets equipment status to `NOT_WORKING`
  - If `status === COMPLETED` → sets equipment status to `WORKING`

### Due Maintenance (`/due`)
- `dueMaintenance(days=30)` — records where `nextDueDate ≤ now + 30 days`

### Fuel (`/fuel`)
- `listFuel(equipmentId?)` — returns fuel logs
- `addFuel(input)` — no side effects

### Breakdowns (`/breakdowns`)
- `listBreakdowns(equipmentId?, status?)` — filterable
- `reportBreakdown(input)` — side effects:
  - If `severity === CRITICAL` or `HIGH` → sets equipment to `NOT_WORKING`
- `resolveBreakdown(id)` — side effects:
  - Sets `status = RESOLVED`, `resolvedAt = now`
  - Restores equipment to `WORKING` if no other open breakdowns

### Spare Parts (`/spare-parts`)
- `listSpareParts(equipmentId?)` — returns usage records
- `addSparePart(input)` — auto-calculates `totalCost = quantity * unitCost`

---

## 4. Request Schemas

**File:** `backend/src/modules/maintenance/maintenance.schema.ts`

### createMaintenanceSchema
```typescript
{
  equipmentId: number (required)
  type: 'PREVENTIVE' | 'CORRECTIVE' (required)
  description: string (required)
  cost: number (optional, ≥ 0)
  performedBy: string (optional)
  date: datetime string (optional, default: now)
  nextDueDate: datetime string (optional)
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' (optional, default: 'COMPLETED')
}
```

### createFuelSchema
```typescript
{
  equipmentId: number (required)
  liters: number (required, > 0)
  cost: number (required, ≥ 0)
  odometer: number (optional)
  date: datetime string (optional)
  notes: string (optional)
}
```

### createBreakdownSchema
```typescript
{
  equipmentId: number (required)
  description: string (required)
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' (optional, default: 'MEDIUM')
}
```

### createSparePartSchema
```typescript
{
  equipmentId: number (required)
  partName: string (required)
  quantity: number (required, > 0)
  unitCost: number (required, ≥ 0)
  date: datetime string (optional)
}
```

---

## 5. Prisma Models

**File:** `backend/prisma/schema.prisma`

### MaintenanceRecord
```
id            Int
equipmentId   Int (FK → Equipment)
type          String  (PREVENTIVE | CORRECTIVE)
description   String
cost          Float?
performedBy   String?
date          DateTime
nextDueDate   DateTime?
status        String  (SCHEDULED | IN_PROGRESS | COMPLETED)
createdAt     DateTime
equipment     Equipment (relation)
```

### FuelLog
```
id          Int
equipmentId Int (FK → Equipment)
liters      Float
cost        Float
odometer    Float?
date        DateTime
notes       String?
equipment   Equipment (relation)
```

### Breakdown
```
id          Int
equipmentId Int (FK → Equipment)
description String
reportedAt  DateTime
resolvedAt  DateTime?
severity    String  (LOW | MEDIUM | HIGH | CRITICAL)
status      String  (OPEN | RESOLVED)
equipment   Equipment (relation)
```

### SparePartUsage
```
id          Int
equipmentId Int (FK → Equipment)
partName    String
quantity    Int
unitCost    Float
totalCost   Float  (auto-calculated: quantity * unitCost)
date        DateTime
equipment   Equipment (relation)
```

---

## 6. Permission Keys

**File:** `backend/src/config/constants.ts` + seed

| Key | Granted To |
|-----|-----------|
| `maintenance.read` | EQUIPMENT_MANAGER, SYSTEM_ADMIN |
| `maintenance.create` | EQUIPMENT_MANAGER, SYSTEM_ADMIN |
| `maintenance.update` | EQUIPMENT_MANAGER, SYSTEM_ADMIN |
| `maintenance.delete` | SYSTEM_ADMIN only |
| `maintenance.export` | EQUIPMENT_MANAGER, SYSTEM_ADMIN |
| `equipment.read` | also grants read access to maintenance endpoints |
| `equipment.update` | also grants write access to maintenance endpoints |

---

## 7. UI Design Decisions

Based on the audit, the frontend will:

1. **4 Tabs:** سجلات الصيانة (Records) | الوقود (Fuel) | الأعطال (Breakdowns) | قطع الغيار (Spare Parts)
2. **KPI Summary** (top of page): Total Records | Open Breakdowns | Completed Records | Due Soon
3. **Create forms** for all 4 sub-modules (modal dialogs)
4. **No Edit/Delete** — backend does not provide update/delete endpoints for records/fuel/spare-parts
5. **Resolve button** on Breakdown rows (OPEN status only) — calls `PATCH /breakdowns/:id/resolve`
6. **Equipment selector** for filtering — calls `GET /equipment` to populate dropdown
7. **Status badges:**
   - Records: SCHEDULED (amber), IN_PROGRESS (blue), COMPLETED (green)
   - Breakdowns: OPEN (red), RESOLVED (green)
   - Severity: LOW (gray), MEDIUM (amber), HIGH (orange/red), CRITICAL (red)
8. **Date filter** on Records and Fuel tabs
9. **RBAC:** Create button shown only when `hasPermission('maintenance.create')`
10. **Status field:** No CANCELLED in backend schema — UI will only show SCHEDULED/IN_PROGRESS/COMPLETED

---

## 8. Verdict

**Backend is FULLY READY for Phase 1 UI implementation.**

All endpoints are registered, permissions are seeded, and schemas are validated. The only gap is the absence of update/delete endpoints for records, fuel, and spare-parts — the UI will be designed accordingly (create + read + resolve only).

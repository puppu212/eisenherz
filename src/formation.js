const ROLE_ORDER = Object.freeze(["frontline", "rearGuard"]);

export const FORMATION_LAYOUT = Object.freeze({
  unitSpacing: 92,
  blockGap: 96,
  roleGap: 190,
  squareColumns: 2,
  denseColumns: 5,
  denseUnitSpacing: 64,
});

export function buildFormationDestinations({
  centerX,
  centerY,
  angle,
  units,
  style = "line",
  layout = FORMATION_LAYOUT,
}) {
  if (units.length === 0) return [];
  const forward = { x: Math.cos(angle), y: Math.sin(angle) };
  const lateral = { x: -Math.sin(angle), y: Math.cos(angle) };
  const roleGroups = groupSelectedFormations(units);

  if (style === "square") {
    return squareFormationDestinations(centerX, centerY, angle, forward, lateral, roleGroups, layout);
  }
  if (style === "dense") {
    return denseFormationDestinations(centerX, centerY, angle, forward, lateral, roleGroups, layout);
  }
  return lineFormationDestinations(centerX, centerY, angle, forward, lateral, roleGroups, layout);
}

export function lineFormationDestinations(
  centerX,
  centerY,
  angle,
  forward,
  lateral,
  roleGroups,
  layout = FORMATION_LAYOUT
) {
  const destinations = [];

  for (const role of ROLE_ORDER) {
    const formations = roleGroups.get(role);
    if (!formations?.length) continue;
    const roleOffset = role === "frontline" ? 0 : -layout.roleGap;
    const blockWidths = formations.map(formation =>
      Math.max(layout.unitSpacing, (formation.units.length - 1) * layout.unitSpacing)
    );
    const totalWidth = blockWidths.reduce((sum, width) => sum + width, 0) +
      Math.max(0, formations.length - 1) * layout.blockGap;
    let cursor = -totalWidth / 2;
    formations.forEach((formation, formationIndex) => {
      const blockWidth = blockWidths[formationIndex];
      const blockCenter = cursor + blockWidth / 2;
      const unitStart = -((formation.units.length - 1) * layout.unitSpacing) / 2;
      formation.units.forEach((unit, unitIndex) => {
        const unitOffset = blockCenter + unitStart + unitIndex * layout.unitSpacing;
        destinations.push({
          unitId: unit.id,
          x: centerX + lateral.x * unitOffset + forward.x * roleOffset,
          y: centerY + lateral.y * unitOffset + forward.y * roleOffset,
          angle,
          role: unit.role,
          formationId: unit.formationId,
        });
      });
      cursor += blockWidth + layout.blockGap;
    });
  }
  return destinations;
}

export function squareFormationDestinations(
  centerX,
  centerY,
  angle,
  forward,
  lateral,
  roleGroups,
  layout = FORMATION_LAYOUT
) {
  const destinations = [];
  let rowCursor = 0;
  for (const role of ROLE_ORDER) {
    const formations = roleGroups.get(role);
    if (!formations?.length) continue;
    const rows = Math.ceil(formations.length / layout.squareColumns);
    formations.forEach((formation, formationIndex) => {
      const column = formationIndex % layout.squareColumns;
      const row = Math.floor(formationIndex / layout.squareColumns);
      const columnsInRow = Math.min(
        layout.squareColumns,
        formations.length - row * layout.squareColumns
      );
      const formationOffset = centeredGridOffset(
        column,
        rowCursor + row,
        columnsInRow,
        layout.blockGap,
        layout.roleGap
      );
      pushFormationUnitDestinations(
        destinations,
        formation,
        centerX,
        centerY,
        angle,
        forward,
        lateral,
        formationOffset,
        layout
      );
    });
    rowCursor += rows + 1;
  }
  return destinations;
}

export function denseFormationDestinations(
  centerX,
  centerY,
  angle,
  forward,
  lateral,
  roleGroups,
  layout = FORMATION_LAYOUT
) {
  const destinations = [];
  const units = [];
  for (const role of ROLE_ORDER) {
    for (const formation of roleGroups.get(role) ?? []) {
      units.push(...formation.units);
    }
  }

  const columns = Math.min(layout.denseColumns, units.length);
  units.forEach((unit, unitIndex) => {
    const row = Math.floor(unitIndex / columns);
    const rowStart = row * columns;
    const columnsInRow = Math.min(columns, units.length - rowStart);
    const column = unitIndex - rowStart;
    const unitOffset = centeredGridOffset(
      column,
      row,
      columnsInRow,
      layout.denseUnitSpacing,
      layout.denseUnitSpacing
    );
    destinations.push({
      unitId: unit.id,
      x: centerX + lateral.x * unitOffset.lateral + forward.x * unitOffset.forward,
      y: centerY + lateral.y * unitOffset.lateral + forward.y * unitOffset.forward,
      angle,
      role: unit.role,
      formationId: unit.formationId,
    });
  });
  return destinations;
}

export function pushFormationUnitDestinations(
  destinations,
  formation,
  centerX,
  centerY,
  angle,
  forward,
  lateral,
  formationOffset,
  layout = FORMATION_LAYOUT
) {
  const columns = Math.min(layout.squareColumns, formation.units.length);
  formation.units.forEach((unit, unitIndex) => {
    const column = unitIndex % columns;
    const row = Math.floor(unitIndex / columns);
    const unitOffset = centeredGridOffset(
      column,
      row,
      columns,
      layout.unitSpacing,
      layout.unitSpacing
    );
    const lateralOffset = formationOffset.lateral + unitOffset.lateral;
    const forwardOffset = formationOffset.forward + unitOffset.forward;
    destinations.push({
      unitId: unit.id,
      x: centerX + lateral.x * lateralOffset + forward.x * forwardOffset,
      y: centerY + lateral.y * lateralOffset + forward.y * forwardOffset,
      angle,
      role: unit.role,
      formationId: unit.formationId,
    });
  });
}

export function centeredGridOffset(column, row, columns, lateralSpacing, forwardSpacing) {
  return {
    lateral: (column - (columns - 1) / 2) * lateralSpacing,
    forward: -row * forwardSpacing,
  };
}

export function groupSelectedFormations(units) {
  const roleGroups = new Map();
  for (const unit of units) {
    if (!roleGroups.has(unit.role)) roleGroups.set(unit.role, new Map());
    const formations = roleGroups.get(unit.role);
    if (!formations.has(unit.formationId)) {
      formations.set(unit.formationId, {
        id: unit.formationId,
        units: [],
      });
    }
    formations.get(unit.formationId).units.push(unit);
  }
  const ordered = new Map();
  for (const role of ROLE_ORDER) {
    const formations = roleGroups.get(role);
    if (!formations) continue;
    ordered.set(role, [...formations.values()].sort((a, b) => a.id.localeCompare(b.id)));
  }
  return ordered;
}

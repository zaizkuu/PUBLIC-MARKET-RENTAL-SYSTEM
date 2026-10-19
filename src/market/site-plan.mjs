// Historical OpenStreetMap building outlines. These do not establish current
// interior partitions, stall boundaries, entrances, or record assignments.
export const projection = {
 originLongitude: 125.01878,
 originLatitude: 11.1098,
 referenceLatitude: 11.1092,
 scale: 780000,
 padding: 35,
};

// Each source pair is [longitude, latitude] in WGS84 degrees.
export const sourceCoordinates = {
 main: [
  [125.0192039, 11.1095800],
  [125.0193529, 11.1095242],
  [125.0192281, 11.1092255],
  [125.0190793, 11.1092821],
 ],
 wet: [
  [125.0188996, 11.1088662],
  [125.0190451, 11.1088086],
  [125.0192188, 11.1092136],
  [125.0190766, 11.1092715],
 ],
};

export const sourceInfo = {
 provider: 'OpenStreetMap',
 coordinateSystem: 'WGS84 longitude/latitude',
 geometryDate: '2011-03-30',
 features: {
  main: { wayId: 106474064, version: 5, featureDate: '2020-03-12' },
  wet: { wayId: 106474048, version: 6, featureDate: '2024-05-30' },
 },
};

// A local equirectangular projection preserves the supplied outline proportions
// with north pointing up. Canvas coordinates are not surveyed dimensions.
export function project(lon, lat) {
 return {
  x: projection.padding + (lon - projection.originLongitude) * projection.scale * Math.cos(projection.referenceLatitude * Math.PI / 180),
  y: projection.padding + (projection.originLatitude - lat) * projection.scale,
 };
}

export const footprints = [
 { id: 'main', name: 'Main market building', points: sourceCoordinates.main.map(([lon, lat]) => project(lon, lat)) },
 { id: 'wet', name: 'Wet market building', points: sourceCoordinates.wet.map(([lon, lat]) => project(lon, lat)) },
];

function contains(points, x, y) {
 let inside = false;
 for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
  const a = points[j], b = points[i];
  const dx = b.x - a.x, dy = b.y - a.y;
  const cross = (x - a.x) * dy - (y - a.y) * dx;
  // Include the boundary, allowing only negligible floating-point roundoff.
  if (Math.abs(cross) <= 1e-7 * Math.hypot(dx, dy)
   && x >= Math.min(a.x, b.x) - 1e-7 && x <= Math.max(a.x, b.x) + 1e-7
   && y >= Math.min(a.y, b.y) - 1e-7 && y <= Math.max(a.y, b.y) + 1e-7) return true;
  if ((a.y > y) !== (b.y > y) && x < a.x + (y - a.y) * dx / dy) inside = !inside;
 }
 return inside;
}

export function buildingAt(x, y) {
 if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
 return footprints.find(building => contains(building.points, x, y))?.id;
}

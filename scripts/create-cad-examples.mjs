import { writeFile } from 'node:fs/promises';
import { BoxGeometry, Mesh } from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';

// Original calibration block: 1000 × 2000 × 3000 mm, corner at (0,0,0).
const geometry = new BoxGeometry(1000, 2000, 3000);
geometry.translate(500, 1000, 1500);
const mesh = new Mesh(geometry);
await writeFile('examples/calibration-block.stl', new STLExporter().parse(mesh));

// Minimal AP203 faceted BREP, authored here (no external CAD model assets).
const entities = [];
const add = (text) => {
  entities.push(`#${entities.length + 1}=${text};`);
  return `#${entities.length}`;
};
const app = add(
  "APPLICATION_CONTEXT('configuration controlled 3d designs of mechanical parts and assemblies')",
);
add(
  `APPLICATION_PROTOCOL_DEFINITION('international standard','config_control_design',1994,${app})`,
);
const pc = add(`PRODUCT_CONTEXT('',${app},'mechanical')`);
const product = add(
  `PRODUCT('calibration-block','Calibration block','Original Sensor Layout Studio example',(${pc}))`,
);
const formation = add(
  `PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE('','',${product},.NOT_KNOWN.)`,
);
const dc = add(`PRODUCT_DEFINITION_CONTEXT('part definition',${app},'design')`);
const definition = add(`PRODUCT_DEFINITION('design','',${formation},${dc})`);
const shape = add(`PRODUCT_DEFINITION_SHAPE('','',${definition})`);
const length = add('(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))');
const angle = add('(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))');
const solidAngle = add('(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())');
const uncertainty = add(
  `UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(0.000001),${length},'distance_accuracy_value','')`,
);
const context = add(
  `(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${uncertainty}))GLOBAL_UNIT_ASSIGNED_CONTEXT((${length},${angle},${solidAngle}))REPRESENTATION_CONTEXT('',''))`,
);
const points = [
  [0, 0, 0],
  [1000, 0, 0],
  [1000, 2000, 0],
  [0, 2000, 0],
  [0, 0, 3000],
  [1000, 0, 3000],
  [1000, 2000, 3000],
  [0, 2000, 3000],
].map((p) => add(`CARTESIAN_POINT('',(${p.map((n) => `${n}.`).join(',')}))`));
const normals = [
  [0, 0, -1],
  [0, 0, 1],
  [0, -1, 0],
  [1, 0, 0],
  [0, 1, 0],
  [-1, 0, 0],
];
const directions = [
  [0, 1, 0],
  [1, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
  [-1, 0, 0],
  [0, -1, 0],
];
const faces = [
  [0, 3, 2, 1],
  [4, 5, 6, 7],
  [0, 1, 5, 4],
  [1, 2, 6, 5],
  [2, 3, 7, 6],
  [3, 0, 4, 7],
].map((indices, i) => {
  const loop = add(`POLY_LOOP('',(${indices.map((i) => points[i]).join(',')}))`);
  const bound = add(`FACE_OUTER_BOUND('',${loop},.T.)`);
  const normal = add(`DIRECTION('',(${normals[i].map((n) => `${n}.`).join(',')}))`);
  const direction = add(`DIRECTION('',(${directions[i].map((n) => `${n}.`).join(',')}))`);
  const placement = add(`AXIS2_PLACEMENT_3D('',${points[indices[0]]},${normal},${direction})`);
  const plane = add(`PLANE('',${placement})`);
  return add(`FACE_SURFACE('',(${bound}),${plane},.T.)`);
});
const shell = add(`CLOSED_SHELL('',(${faces.join(',')}))`);
const brep = add(`FACETED_BREP('Calibration block',${shell})`);
const representation = add(`FACETED_BREP_SHAPE_REPRESENTATION('',(${brep}),${context})`);
add(`SHAPE_DEFINITION_REPRESENTATION(${shape},${representation})`);
await writeFile(
  'examples/calibration-block.step',
  `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('Original calibration block'),'2;1');\nFILE_NAME('calibration-block.step','2026-10-27T00:00:00',('Sensor Layout Studio'),(''),'Sensor Layout Studio','Sensor Layout Studio','');\nFILE_SCHEMA(('CONFIG_CONTROL_DESIGN'));\nENDSEC;\nDATA;\n${entities.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`,
);
geometry.dispose();
mesh.material.dispose();
console.log('Generated original STL and STEP calibration blocks (mm).');

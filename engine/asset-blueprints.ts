export type SofaBlueprint = {
  id: string;
  referenceAssetId: string;
  proportions: {
    baseHeight: number;
    seatHeight: number;
    backHeight: number;
    armRadius: number;
    armInset: number;
    cushionGap: number;
    legHeight: number;
  };
  parts: readonly string[];
};

/**
 * Measured reconstruction data extracted from the approved four-view study.
 * Values are normalized against each placed sofa's width/depth, so the same
 * authored construction can be reused at different real-world dimensions.
 */
export const lateCenturySofaBlueprint: SofaBlueprint = {
  id: 'sofa.late-century.v1',
  referenceAssetId: 'prop.sofa',
  proportions: {
    baseHeight: 0.2,
    seatHeight: 0.45,
    backHeight: 0.88,
    armRadius: 0.105,
    armInset: 0.075,
    cushionGap: 0.018,
    legHeight: 0.16,
  },
  parts: [
    'walnut-frame',
    'seat-deck',
    'left-arm-roll',
    'right-arm-roll',
    'seat-cushion-left',
    'seat-cushion-center',
    'seat-cushion-right',
    'back-cushion-left',
    'back-cushion-center',
    'back-cushion-right',
    'leg-front-left',
    'leg-front-right',
    'leg-back-left',
    'leg-back-right',
  ],
};

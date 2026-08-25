const NDL_TABLE_M_MIN = [
  [10, 219],
  [12, 147],
  [15, 72],
  [18, 56],
  [21, 40],
  [24, 30],
  [27, 23],
  [30, 20],
  [33, 15],
  [36, 12],
  [39, 9],
];

function getNoDecompressionLimitMinutes(depthM) {
  if (depthM <= NDL_TABLE_M_MIN[0][0]) return NDL_TABLE_M_MIN[0][1];

  const last = NDL_TABLE_M_MIN[NDL_TABLE_M_MIN.length - 1];
  if (depthM >= last[0]) return last[1];

  for (let i = 0; i < NDL_TABLE_M_MIN.length - 1; i++) {
    const [d1, t1] = NDL_TABLE_M_MIN[i];
    const [d2, t2] = NDL_TABLE_M_MIN[i + 1];
    if (depthM >= d1 && depthM <= d2) {
      const frac = (depthM - d1) / (d2 - d1);
      return t1 + frac * (t2 - t1);
    }
  }
  return last[1];
}
const { SAFETY_STOP_DEPTH_M, SAFETY_STOP_DURATION_SEC } = require('./constants');
const NDL_APPROACHING_FRACTION = 0.8;

module.exports = {
  getNoDecompressionLimitMinutes,
  SAFETY_STOP_DEPTH_M,
  SAFETY_STOP_DURATION_SEC,
  NDL_APPROACHING_FRACTION,
};

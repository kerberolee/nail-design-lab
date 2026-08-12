import * as THREE from "three";
import type { NailLength, NailShape } from "../studio";

/** 甲片长度系数：相对天然甲床的延展比例（甲根固定，向甲尖延伸） */
const lengthScale: Record<NailLength, number> = {
  短款: 0.95,
  中款: 1.35,
  长款: 1.75,
};

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** 不同甲型的横向宽度轮廓（v: 0 甲根 → 1 甲尖），作用于实测甲沟宽度之上 */
function widthProfile(shape: NailShape, v: number): number {
  switch (shape) {
    case "方形":
      return 1 - 0.03 * smoothstep(0.85, 1, v);
    case "方圆":
      return 1 - 0.14 * smoothstep(0.62, 1, v);
    case "芭蕾":
      return 1 + 0.03 * smoothstep(0, 0.35, v) - 0.36 * smoothstep(0.5, 1, v);
    case "杏仁":
    default:
      return 1 - 0.82 * smoothstep(0.44, 1, v);
  }
}

/** 离线 shrink-wrap 的甲床模具：逐顶点表面高度与法线（均为甲床局部坐标系分量） */
export type MoldCol = { u: number; z: number; n: [number, number, number] };
export type MoldRow = { v: number; halfW: number; cols: MoldCol[] };
export type NailMold = {
  bedLen: number;
  vMax: number;
  shell: number;
  rows: MoldRow[];
};

export type NailMetrics = { width: number; len: number };

export function getNailMetrics(length: NailLength, mold: NailMold): NailMetrics {
  return { width: mold.rows[0].halfW * 2, len: mold.bedLen * lengthScale[length] };
}

/** 甲根圆弧幅度（proximal margin：中心靠近甲小皮，侧角略向远端收拢） */
const CUTICLE_ARC = 0.34;

/** 甲根圆弧前移量：中心固定在甲根，左右侧角沿甲沟略向远端收拢 */
function cuticleArc(mold: NailMold, uFrac: number, v: number): number {
  const vArc = mold.bedLen * 0.2;
  if (v >= vArc) return 0;
  const lateral = Math.pow(Math.abs(2 * uFrac - 1), 1.65);
  return vArc * CUTICLE_ARC * lateral * (1 - v / vArc);
}

type MoldSample = { x: number; y: number; z: number; n: [number, number, number] };

/**
 * 在 (uFrac 横向 0..1, v 纵向距离) 处采样模具表面。
 * v ≤ vMax：双线性插值实测网格；v > vMax：沿末两行趋势 C1 连续延长并下垂。
 */
function sampleMoldBase(
  mold: NailMold,
  shape: NailShape,
  len: number,
  uFrac: number,
  v: number,
): MoldSample {
  const rows = mold.rows;
  const vFrac = len > 0 ? v / len : 0;
  const y = v + cuticleArc(mold, uFrac, v);
  const surfaceEnd = Math.min(mold.bedLen, mold.vMax);
  // 目标半宽：该行实测甲沟宽 × 甲型轮廓
  const halfW = (vv: number) => {
    if (vv <= rows[0].v) return rows[0].halfW;
    for (let i = 1; i < rows.length; i += 1) {
      if (vv <= rows[i].v) {
        const k = (vv - rows[i - 1].v) / (rows[i].v - rows[i - 1].v);
        return rows[i - 1].halfW + (rows[i].halfW - rows[i - 1].halfW) * k;
      }
    }
    return rows[rows.length - 1].halfW;
  };
  const bedRows = rows.filter((row) => row.v <= mold.bedLen * 0.55);
  const bedHalf =
    bedRows.reduce((sum, row) => sum + row.halfW, 0) /
    Math.max(1, bedRows.length);
  const measuredHalf = halfW(Math.min(y, surfaceEnd));
  const stableBedHalf = Math.min(
    bedHalf * 1.03,
    Math.max(
      measuredHalf,
      bedHalf * (1 - 0.15 * smoothstep(0, surfaceEnd, y)),
    ),
  );
  const half = Math.max(
    0.02,
    stableBedHalf * widthProfile(shape, vFrac) * 0.92,
  );
  const x = (uFrac - 0.5) * 2 * half;

  const sampleCol = (row: MoldRow, xx: number): MoldCol => {
    const cols = row.cols;
    if (xx <= cols[0].u) return cols[0];
    for (let i = 1; i < cols.length; i += 1) {
      if (xx <= cols[i].u) {
        const k = (xx - cols[i - 1].u) / (cols[i].u - cols[i - 1].u);
        const n0 = cols[i - 1].n;
        const n1 = cols[i].n;
        return {
          u: xx,
          z: cols[i - 1].z + (cols[i].z - cols[i - 1].z) * k,
          n: [
            n0[0] + (n1[0] - n0[0]) * k,
            n0[1] + (n1[1] - n0[1]) * k,
            n0[2] + (n1[2] - n0[2]) * k,
          ],
        };
      }
    }
    return cols[cols.length - 1];
  };

  const sampleSurface = (vv: number, xx: number): MoldCol => {
    let r1 = rows[0];
    let r2 = rows[0];
    let k = 0;
    if (vv <= rows[0].v) return sampleCol(rows[0], xx);
    for (let i = 1; i < rows.length; i += 1) {
      if (vv <= rows[i].v) {
        r1 = rows[i - 1];
        r2 = rows[i];
        k = (vv - r1.v) / (r2.v - r1.v);
        break;
      }
    }
    const c1 = sampleCol(r1, xx);
    const c2 = sampleCol(r2, xx);
    const nx = c1.n[0] + (c2.n[0] - c1.n[0]) * k;
    const ny = c1.n[1] + (c2.n[1] - c1.n[1]) * k;
    const nz = c1.n[2] + (c2.n[2] - c1.n[2]) * k;
    const nl = Math.hypot(nx, ny, nz) || 1;
    return {
      u: xx,
      z: c1.z + (c2.z - c1.z) * k,
      n: [nx / nl, ny / nl, nz / nl],
    };
  };

  if (y <= surfaceEnd) {
    const surface = sampleSurface(y, x);
    return {
      x,
      y,
      z: surface.z,
      n: surface.n,
    };
  }

  // 延长段：在天然甲床结束处脱离指尖，不跟随指腹圆帽向掌侧回卷。
  // 使用甲床末段的稳定切线外推，再添加极轻微的自然下垂。
  const end = sampleSurface(surfaceEnd, x);
  const prevV = Math.max(rows[0].v, surfaceEnd - mold.bedLen * 0.18);
  const prev = sampleSurface(prevV, x);
  const rawSlope = (end.z - prev.z) / Math.max(surfaceEnd - prevV, 1e-5);
  const slope = Math.min(0.22, Math.max(-0.12, rawSlope));
  const dv = y - surfaceEnd;
  const droop = 0.1 * dv * dv;
  const z = end.z + slope * dv - droop;
  const tipSlope = slope - 0.2 * dv;
  const n0 = end.n;
  const nx = n0[0];
  const ny = n0[1] + n0[2] * tipSlope * -1;
  const nz = n0[2] + n0[1] * tipSlope;
  const nl = Math.hypot(nx, ny, nz) || 1;
  const n: [number, number, number] = [nx / nl, ny / nl, nz / nl];
  return { x, y, z, n };
}

/**
 * 用最终甲型曲面的横、纵切线重建法线，再沿真实法线形成防穿模壳层。
 * 离线模具法线只用于采样提示，不能直接用于甲尖或收窄后的甲型。
 */
export function sampleMold(
  mold: NailMold,
  shape: NailShape,
  len: number,
  uFrac: number,
  v: number,
): MoldSample {
  const center = sampleMoldBase(mold, shape, len, uFrac, v);
  const du = 0.012;
  const dv = Math.max(mold.bedLen * 0.012, 0.003);
  const left = sampleMoldBase(mold, shape, len, Math.max(0, uFrac - du), v);
  const right = sampleMoldBase(mold, shape, len, Math.min(1, uFrac + du), v);
  const back = sampleMoldBase(mold, shape, len, uFrac, Math.max(0, v - dv));
  const front = sampleMoldBase(mold, shape, len, uFrac, Math.min(len, v + dv));

  const ux = right.x - left.x;
  const uy = right.y - left.y;
  const uz = right.z - left.z;
  const vx = front.x - back.x;
  const vy = front.y - back.y;
  const vz = front.z - back.z;
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  if (nz < 0) {
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }
  const nl = Math.hypot(nx, ny, nz) || 1;
  const n: [number, number, number] = [nx / nl, ny / nl, nz / nl];
  const clearance = Math.max(0.018, mold.shell * 1.5);
  return {
    x: center.x + n[0] * clearance,
    y: center.y + n[1] * clearance,
    z: center.z + n[2] * clearance,
    n,
  };
}

/** 甲面在 (uFrac, v) 处的高度（供饰品贴面，与几何同一采样） */
export function nailSurfaceZ(mold: NailMold, shape: NailShape, len: number, u: number, v: number): number {
  return sampleMold(mold, shape, len, u, v).z;
}

/**
 * 由 shrink-wrap 模具生成甲片网格：甲床段逐顶点贴面（位置+法线实测），
 * 甲根椭圆弧边，延长段与甲床段 C1 连续。
 */
export function createNailGeometry(
  shape: NailShape,
  len: number,
  mold: NailMold,
): THREE.BufferGeometry {
  const segU = 18;
  const segV = 32;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let j = 0; j <= segV; j += 1) {
    const v = (j / segV) * len;
    for (let i = 0; i <= segU; i += 1) {
      const u = i / segU;
      const s = sampleMold(mold, shape, len, u, v);
      positions.push(s.x, s.y, s.z);
      uvs.push(u, j / segV);
    }
  }

  for (let j = 0; j < segV; j += 1) {
    for (let i = 0; i < segU; i += 1) {
      const a = j * (segU + 1) + i;
      const b = a + 1;
      const c = a + segU + 1;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  // 由最终顶点位置重新计算法线，避免离线法线与甲型收窄后的几何切线不一致。
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

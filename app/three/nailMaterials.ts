import * as THREE from "three";
import type { Finish, Pattern } from "../studio";

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mix(hex: string, other: string, ratio: number): string {
  const [r1, g1, b1] = hexToRgb(hex);
  const [r2, g2, b2] = hexToRgb(other);
  const r = Math.round(r1 + (r2 - r1) * ratio);
  const g = Math.round(g1 + (g2 - g1) * ratio);
  const b = Math.round(b1 + (b2 - b1) * ratio);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * 为图案生成甲面贴图。canvas 顶部对应 uv v=1（甲尖）。
 * 纯色返回 null，材质直接使用 color。
 */
export function createPatternTexture(pattern: Pattern, color: string): THREE.CanvasTexture | null {
  if (pattern === "纯色") return null;

  const w = 256;
  const h = 384;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  if (pattern === "法式") {
    ctx.fillStyle = mix(color, "#f2e8df", 0.55);
    ctx.fillRect(0, 0, w, h);
    // 微笑线法式白边（甲尖在 canvas 顶部）
    const tipHeight = h * 0.24;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(w, tipHeight * 0.72);
    ctx.quadraticCurveTo(w * 0.5, tipHeight * 1.55, 0, tipHeight * 0.72);
    ctx.closePath();
    ctx.fillStyle = "#f5ede4";
    ctx.fill();
  } else if (pattern === "渐变") {
    // 甲根浅、甲尖饱和
    const gradient = ctx.createLinearGradient(0, h, 0, 0);
    gradient.addColorStop(0, mix(color, "#f2ded2", 0.65));
    gradient.addColorStop(0.78, color);
    gradient.addColorStop(1, mix(color, "#000000", 0.08));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  } else {
    // 晕染：柔和底 + 深浅色团
    ctx.fillStyle = mix(color, "#ecd9cd", 0.22);
    ctx.fillRect(0, 0, w, h);
    const blobs: Array<[number, number, number, string]> = [
      [0.68, 0.24, 0.32, mix(color, "#ffffff", 0.35)],
      [0.3, 0.62, 0.42, mix(color, "#4a1a26", 0.4)],
      [0.62, 0.78, 0.3, color],
      [0.25, 0.18, 0.24, mix(color, "#ffffff", 0.55)],
      [0.5, 0.45, 0.36, mix(color, "#2e0f16", 0.25)],
    ];
    for (const [cx, cy, radius, fill] of blobs) {
      const g = ctx.createRadialGradient(cx * w, cy * h, 0, cx * w, cy * h, radius * w);
      g.addColorStop(0, fill);
      g.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** 猫眼：在 standard/physical 着色器上叠加随视角游走的磁粉光带 */
function patchCatEye(material: THREE.MeshPhysicalMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      {
        vec3 bandDir = normalize(vec3(0.85, 0.28, 0.44));
        vec3 nrm = normalize(vNormal);
        float band = pow(1.0 - abs(dot(nrm, bandDir)), 7.0);
        float shimmer = pow(1.0 - abs(dot(nrm, normalize(vec3(-0.5, 0.8, 0.3)))), 18.0);
        totalEmissiveRadiance += diffuseColor.rgb * band * 1.1
          + vec3(1.0, 0.96, 0.86) * (band * 0.4 + shimmer * 0.25);
      }`,
    );
  };
  material.customProgramCacheKey = () => "cat-eye";
}

type FinishProps = Partial<THREE.MeshPhysicalMaterialParameters>;

const finishProps: Record<Finish, FinishProps> = {
  亮面: {
    roughness: 0.3,
    clearcoat: 0.72,
    clearcoatRoughness: 0.14,
    envMapIntensity: 0.52,
  },
  哑光: {
    roughness: 0.88,
    clearcoat: 0,
    envMapIntensity: 0.35,
    sheen: 0.4,
    sheenRoughness: 0.9,
  },
  猫眼: {
    roughness: 0.28,
    metalness: 0.4,
    clearcoat: 0.9,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.25,
  },
  镜面: {
    roughness: 0.05,
    metalness: 0.88,
    clearcoat: 0.5,
    clearcoatRoughness: 0.1,
    envMapIntensity: 2.2,
  },
  果冻: {
    roughness: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    transmission: 0.55,
    thickness: 0.45,
    ior: 1.42,
    attenuationDistance: 0.9,
    envMapIntensity: 1.0,
  },
};

/** 按质感 + 图案构建甲片物理材质；调用方负责 dispose */
export function createNailMaterial(
  finish: Finish,
  pattern: Pattern,
  color: string,
): THREE.MeshPhysicalMaterial {
  const map = createPatternTexture(pattern, color);
  const material = new THREE.MeshPhysicalMaterial({
    ...finishProps[finish],
    color: map ? "#ffffff" : color,
    ...(map ? { map } : {}),
    side: THREE.DoubleSide,
  });
  if (finish === "果冻") {
    material.attenuationColor = new THREE.Color(color);
    material.color = new THREE.Color(mix(color, "#ffffff", 0.35));
  }
  if (finish === "猫眼") {
    patchCatEye(material);
  }
  return material;
}

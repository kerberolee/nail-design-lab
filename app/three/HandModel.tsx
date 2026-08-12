"use client";

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { useCursor, useGLTF } from "@react-three/drei";
import type { NailDesign, NailLength, NailShape } from "../studio";
import {
  createNailGeometry,
  getNailMetrics,
  sampleMold,
  type NailMold,
  type NailMetrics,
} from "./nailGeometry";
import { createNailMaterial } from "./nailMaterials";
import anchorsJson from "./hand-anchors.json";

const HAND_URL = "/models/female-hand.glb";
const FINGER_ORDER = ["thumb", "index", "middle", "ring", "pinky"] as const;
type FingerName = (typeof FINGER_ORDER)[number];

type FingerAnchor = {
  origin: number[];
  y: number[];
  z: number[];
  x: number[];
  bedLen: number;
  vMax: number;
  shell: number;
  rows: NailMold["rows"];
};

const ANCHORS = anchorsJson.fingers as Record<FingerName, FingerAnchor>;

function anchorFit(anchor: FingerAnchor): NailMold {
  return {
    bedLen: anchor.bedLen,
    vMax: anchor.vMax,
    shell: anchor.shell,
    rows: anchor.rows,
  };
}

/** 由离线采样锚点构建甲床局部坐标系（x 横向、y 纵向、z 甲面外法线） */
function useNailFrame(anchor: FingerAnchor) {
  return useMemo(() => {
    const origin = new THREE.Vector3(...(anchor.origin as [number, number, number]));
    const y = new THREE.Vector3(...(anchor.y as [number, number, number])).normalize();
    const z = new THREE.Vector3(...(anchor.z as [number, number, number]));
    z.sub(y.clone().multiplyScalar(z.dot(y))).normalize();
    const x = new THREE.Vector3().crossVectors(y, z).normalize();
    z.crossVectors(x, y).normalize();
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(x, y, z),
    );
    return { origin, quaternion };
  }, [anchor]);
}

type FingerNailProps = {
  design: NailDesign;
  shape: NailShape;
  length: NailLength;
  anchor: FingerAnchor;
  active: boolean;
  onSelect: () => void;
};

function FingerNail({ design, shape, length, anchor, active, onSelect }: FingerNailProps) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const frame = useNailFrame(anchor);
  const debug = process.env.NEXT_PUBLIC_DEBUG_ANCHORS === "1";

  const fit = useMemo(() => anchorFit(anchor), [anchor]);
  const metrics = useMemo(() => getNailMetrics(length, fit), [length, fit]);
  const geometry = useMemo(
    () => createNailGeometry(shape, metrics.len, fit),
    [shape, metrics.len, fit],
  );
  const material = useMemo(() => {
    if (debug) {
      return new THREE.MeshBasicMaterial({ color: "#ff2255", side: THREE.DoubleSide });
    }
    const next = createNailMaterial(design.finish, design.pattern, design.color);
    if (active) {
      next.emissive.set("#7d3140");
      next.emissiveIntensity = 0.14;
    }
    return next;
  }, [design.finish, design.pattern, design.color, active, debug]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.map?.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  return (
    <group position={frame.origin} quaternion={frame.quaternion}>
      <mesh
        geometry={geometry}
        material={material}
        castShadow
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      />
      <NailAccessory
        accessory={design.accessory}
        fit={fit}
        metrics={metrics}
        shape={shape}
      />
    </group>
  );
}

type AccessoryProps = {
  accessory: NailDesign["accessory"];
  fit: NailMold;
  metrics: NailMetrics;
  shape: NailShape;
};

function NailAccessory({ accessory, fit, metrics, shape }: AccessoryProps) {
  const pearlMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#f2e9db",
        roughness: 0.2,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        iridescence: 0.55,
        iridescenceIOR: 1.3,
        envMapIntensity: 1.2,
      }),
    [],
  );
  const crystalMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#eaf4f6",
        roughness: 0.04,
        transmission: 0.85,
        thickness: 0.25,
        ior: 1.8,
        clearcoat: 1,
        envMapIntensity: 1.5,
      }),
    [],
  );
  const goldMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#d9b36a",
        metalness: 1,
        roughness: 0.24,
        envMapIntensity: 1.4,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      pearlMaterial.dispose();
      crystalMaterial.dispose();
      goldMaterial.dispose();
    };
  }, [pearlMaterial, crystalMaterial, goldMaterial]);

  if (accessory === "无饰品") return null;

  // 与甲片同一模具采样：饰品底部贴合甲面，不浮不吞
  const surfacePoint = (u: number, v: number) =>
    sampleMold(fit, shape, metrics.len, u, v * metrics.len);

  if (accessory === "微珠") {
    const beads: Array<[number, number, number]> = [
      [0.36, 0.42, 0.045],
      [0.62, 0.52, 0.052],
      [0.47, 0.62, 0.04],
    ];
    return (
      <group>
        {beads.map(([u, v, r], index) => {
          const s = surfacePoint(u, v);
          return (
            <mesh
              key={index}
              material={pearlMaterial}
              castShadow
              position={[
                s.x + s.n[0] * r * 0.72,
                s.y + s.n[1] * r * 0.72,
                s.z + s.n[2] * r * 0.72,
              ]}
            >
              <sphereGeometry args={[r, 14, 12]} />
            </mesh>
          );
        })}
      </group>
    );
  }

  if (accessory === "水晶") {
    const stones: Array<[number, number, number]> = [
      [0.58, 0.4, 0.065],
      [0.36, 0.6, 0.052],
    ];
    return (
      <group>
        {stones.map(([u, v, r], index) => {
          const s = surfacePoint(u, v);
          return (
            <mesh
              key={index}
              material={crystalMaterial}
              castShadow
              rotation={[0.4, 0.3 * index, 0.2]}
              position={[
                s.x + s.n[0] * r * 0.58,
                s.y + s.n[1] * r * 0.58,
                s.z + s.n[2] * r * 0.58,
              ]}
            >
              <octahedronGeometry args={[r, 0]} />
            </mesh>
          );
        })}
      </group>
    );
  }

  // 金线：斜跨甲面的细金属丝
  const v = 0.48;
  const s = surfacePoint(0.5, v);
  return (
    <mesh
      material={goldMaterial}
      castShadow
      position={[
        s.x + s.n[0] * 0.014,
        s.y + s.n[1] * 0.014,
        s.z + s.n[2] * 0.014,
      ]}
      rotation={[0, 0, -0.38]}
    >
      <cylinderGeometry args={[0.012, 0.012, metrics.width * 0.98, 8]} />
    </mesh>
  );
}

/** 载入 CC0 手部网格并替换为统一肤质 PBR 材质 */
function useHandMesh() {
  const { scene } = useGLTF(HAND_URL);
  return useMemo(() => {
    const debug = process.env.NEXT_PUBLIC_DEBUG_ANCHORS === "1";
    const skin = new THREE.MeshPhysicalMaterial({
      color: "#ddae91",
      roughness: 0.5,
      metalness: 0,
      sheen: 0.55,
      sheenColor: new THREE.Color("#f7d9c4"),
      sheenRoughness: 0.55,
      clearcoat: 0.07,
      clearcoatRoughness: 0.5,
      envMapIntensity: 0.55,
      ...(debug ? { transparent: true, opacity: 0.35, depthWrite: false } : {}),
    });
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.material = skin;
        object.castShadow = true;
        object.receiveShadow = false;
      }
    });
    return scene;
  }, [scene]);
}

export type HandModelProps = {
  shape: NailShape;
  length: NailLength;
  nails: NailDesign[];
  activeFinger: number;
  onSelectFinger: (index: number) => void;
};

export default function HandModel({ shape, length, nails, activeFinger, onSelectFinger }: HandModelProps) {
  const handScene = useHandMesh();

  return (
    <group position={[0, -1.6, 0]} rotation={[-0.08, 0.12, -0.04]}>
      <primitive object={handScene} />
      {FINGER_ORDER.map((name, index) => (
        <FingerNail
          key={name}
          design={nails[index]}
          shape={shape}
          length={length}
          anchor={ANCHORS[name]}
          active={activeFinger === index}
          onSelect={() => onSelectFinger(index)}
        />
      ))}
    </group>
  );
}

useGLTF.preload(HAND_URL);

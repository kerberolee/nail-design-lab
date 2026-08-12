"use client";

import { Canvas } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls } from "@react-three/drei";
import HandModel, { type HandModelProps } from "./HandModel";

/**
 * 柔光棚 3D 试戴场景：
 * - 纯色棚拍背景（不透明画布，遮住 2D 网格背景）
 * - 主光 + 补光 + 轮廓光，背景板接收柔和阴影
 * - Lightformer 程序环境（无外部 HDR 请求）供镜面/猫眼反射
 * - frameloop="demand" + DPR 上限，避免常驻渲染开销
 */
export default function HandCanvas(props: HandModelProps) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      frameloop="demand"
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      camera={{ fov: 33, position: [0, 0.9, 8.8], near: 0.5, far: 40 }}
    >
      <color attach="background" args={["#ede6db"]} />

      {/* 柔光棚三点布光 */}
      <hemisphereLight args={["#fff4e8", "#9a7c6a", 0.5]} />
      <directionalLight
        position={[3, 6, 4.5]}
        intensity={1.45}
        color="#fff1e2"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0002}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={5}
        shadow-camera-bottom={-4}
      />
      <directionalLight position={[-4.5, 1.5, 2.5]} intensity={0.5} color="#e8ecf2" />
      <spotLight position={[0, 3.5, -4.5]} intensity={1.1} angle={0.7} penumbra={1} color="#ffe6d4" />

      {/* 程序生成的棚拍反射环境，不加载外部资源；底色保证镜面呈现银灰而非死黑 */}
      <Environment resolution={256} frames={1}>
        <color attach="background" args={["#9c8f88"]} />
        <Lightformer form="rect" intensity={3.2} position={[0, 4, 3]} scale={[5, 3, 1]} color="#fff6ea" />
        <Lightformer form="rect" intensity={1.6} position={[-4, 1, 2]} rotation-y={Math.PI / 3} scale={[3, 2, 1]} color="#f3e4da" />
        <Lightformer form="rect" intensity={1.2} position={[4, 0.5, 1]} rotation-y={-Math.PI / 3} scale={[2.5, 2, 1]} color="#e8ded8" />
        <Lightformer form="circle" intensity={1.4} position={[0, 1, -4]} scale={[3, 3, 1]} color="#d8c8c0" />
      </Environment>

      <HandModel {...props} />

      {/* 背景板：只承接柔和阴影，本体不可见 */}
      <mesh position={[0, 0.6, -2.4]} receiveShadow>
        <planeGeometry args={[20, 14]} />
        <shadowMaterial transparent opacity={0.13} color="#5e4037" />
      </mesh>

      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.7}
        minDistance={4.5}
        maxDistance={12}
        minPolarAngle={0.8}
        maxPolarAngle={1.95}
        minAzimuthAngle={-0.9}
        maxAzimuthAngle={0.9}
        target={[0, 0.4, 0]}
      />
    </Canvas>
  );
}

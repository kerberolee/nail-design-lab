"use client";

import {
  Component,
  lazy,
  Suspense,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { NailDesign, NailLength, NailShape } from "../studio";

// three.js 体积较大，按需分包懒加载，避免阻塞首屏
const HandCanvas = lazy(() => import("./HandCanvas"));

export type NailPreview3DProps = {
  shape: NailShape;
  length: NailLength;
  nails: NailDesign[];
  activeFinger: number;
  onSelectFinger: (index: number) => void;
  /** WebGL 不可用或 3D 加载失败时渲染的 2D 降级内容 */
  fallback: ReactNode;
};

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl2") ?? canvas.getContext("webgl")),
    );
  } catch {
    return false;
  }
}

type BoundaryProps = { fallback: ReactNode; children: ReactNode };
type BoundaryState = { failed: boolean };

class CanvasErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("3D 预览加载失败，已切换为 2D 预览", error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function NailPreview3D({ fallback, ...handProps }: NailPreview3DProps) {
  // 服务端与水合首帧返回 null → 一律先渲染 2D；客户端再按 WebGL 能力切换
  const webgl = useSyncExternalStore(
    () => () => {},
    () => supportsWebGL(),
    () => null,
  );

  if (webgl !== true) {
    return <>{fallback}</>;
  }

  return (
    <CanvasErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <div className="hand-canvas" aria-hidden="true">
          <HandCanvas {...handProps} />
        </div>
      </Suspense>
    </CanvasErrorBoundary>
  );
}

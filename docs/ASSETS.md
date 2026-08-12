# 第三方 3D 资产来源与许可

## `public/models/female-hand.glb`（手部网格）

- **来源**: MakeHuman / MPFB2 项目的基础人体网格 `src/mpfb/data/3dobjs/base.obj`
- **上游仓库**: https://github.com/makehumancommunity/mpfb2
- **许可**: **CC0 1.0（公有领域）**。资产文件头部明确声明：
  > This asset was explicitly released as CC0 in september 2020.
  >
  > Copyright (C) 2020 Data Collection AB, https://www.datacollection.se
  > Copyright (C) 2020 Joel Palmius
  > Copyright (C) 2020 Jonas Hauquier
- **许可原文**: 见上游仓库根目录的 CC0 许可文件（`LICENSE.CC0` / `LICENSE.ASSETS`）。
- **本地加工**: 由 `scripts/build-hand-model.py` 离线生成——从全身网格切出右手、重摆展示姿态、
  两次细分 + 拉普拉斯平滑、按关节立方体与末节指骨归属采样甲床锚点
  （`app/three/hand-anchors.json`）。GLB 与锚点均为本仓库构建产物，CC0 允许任意使用与再分发。

## 重新生成

```bash
python -m venv .venv-hand && .venv-hand/bin/pip install trimesh numpy scipy networkx rtree
curl -L -o base.obj https://raw.githubusercontent.com/makehumancommunity/mpfb2/master/src/mpfb/data/3dobjs/base.obj
.venv-hand/bin/python scripts/build-hand-model.py   # 需在含 base.obj 的目录下运行
# 产出 female-hand.glb 与 hand-anchors.json，分别拷入 public/models/ 与 app/three/
```

## 其他

- 甲片、饰品（微珠/水晶/金线）网格与全部材质均为本仓库程序化生成，无第三方资产。
- 反射环境由 drei `Lightformer` 程序生成，不加载外部 HDR 贴图。

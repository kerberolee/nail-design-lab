"""从 MakeHuman CC0 基础网格提取右手并输出展示用手模 + 甲床锚点。

流程：切割右手 -> 姿态（手指收拢、拉直、轻弯、拇指对掌） ->
在“未细分的姿态网格”上按指节归属采样末节甲床（中心/法线/朝向/宽度/床长）
-> 两次细分+拉普拉斯平滑导出 GLB -> 锚点与 GLB 同一归一化坐标系。
应用端会再沿法线把锚点吸附到平滑后表面，抵消平滑回缩。
"""
import json
import numpy as np
import trimesh
from collections import defaultdict

OBJ = "base.obj"

# ---------- 1. 解析 OBJ（按 g 分组） ----------
verts = []
group_faces = defaultdict(list)
current_group = None
with open(OBJ) as f:
    for line in f:
        if line.startswith("v "):
            p = line.split()
            verts.append([float(p[1]), float(p[2]), float(p[3])])
        elif line.startswith("g "):
            current_group = line.split()[1]
        elif line.startswith("f "):
            idx = [int(x.split("/")[0]) - 1 for x in line.split()[1:]]
            for i in range(1, len(idx) - 1):
                group_faces[current_group].append((idx[0], idx[i], idx[i + 1]))

V = np.array(verts)
print("verts", len(V), "body faces", len(group_faces["body"]))

def joint_pts(name):
    faces = group_faces[name]
    ids = sorted(set(i for f in faces for i in f))
    return np.array(ids), V[ids].copy()

def joint_center(name):
    return joint_pts(name)[1].mean(axis=0)

joints = {"wrist": joint_center("joint-r-hand"), "elbow": joint_center("joint-r-elbow")}
for n in range(1, 6):
    for k in range(1, 5):
        joints[f"f{n}-{k}"] = joint_center(f"joint-r-finger-{n}-{k}")

# ---------- 2. 截取右手 ----------
arm_axis = joints["wrist"] - joints["elbow"]
arm_axis /= np.linalg.norm(arm_axis)
cut_center = joints["wrist"] - arm_axis * 0.35
body_faces = np.array(group_faces["body"])
sel = (V[body_faces] - cut_center) @ arm_axis
hand_faces = body_faces[(sel > 0).all(axis=1)]
mesh = trimesh.Trimesh(V, hand_faces, process=False)
parts = mesh.split(only_watertight=False)
mesh = max(parts, key=lambda m: len(m.faces))
print("hand verts", len(mesh.vertices), "faces", len(mesh.faces))

# ---------- 3. 掌/背方向 ----------
kn2, kn5 = joints["f2-1"], joints["f5-1"]
palm_n = np.cross(kn2 - joints["wrist"], kn5 - joints["wrist"])
palm_n /= np.linalg.norm(palm_n)
# 解剖学判定：拇指根（鱼际隆起）位于掌心侧
thumb_side = joints["f1-1"] - kn2
if np.dot(thumb_side, palm_n) < 0:
    palm_n = -palm_n
dorsal_n = -palm_n
print("palm_n", np.round(palm_n, 3), "dorsal", np.round(dorsal_n, 3))

# ---------- 4. 顶点分配到最近指链 ----------
def chain_points(n):
    return np.array([joints[f"f{n}-{k}"] for k in range(1, 5)])

chains = {n: chain_points(n) for n in range(1, 6)}

def seg_assign(P, chain):
    best_d = np.full(len(P), 1e9)
    best_s = np.zeros(len(P), dtype=int)
    for s in range(len(chain) - 1):
        a, b = chain[s], chain[s + 1]
        ab = b - a
        t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1)
        d = np.linalg.norm(P - (a + t[:, None] * ab), axis=1)
        upd = d < best_d
        best_d[upd] = d[upd]
        best_s[upd] = s
    return best_d, best_s

P = mesh.vertices.copy()
assign_finger = np.full(len(P), -1)
assign_seg = np.zeros(len(P), dtype=int)
best_dist = np.full(len(P), 1e9)
for n, ch in chains.items():
    d_, s_ = seg_assign(P, ch)
    upd = d_ < best_dist
    best_dist[upd] = d_[upd]
    assign_finger[upd] = n
    assign_seg[upd] = s_[upd]

joint_cube = {}
for n in range(1, 6):
    for k in range(1, 5):
        joint_cube[f"f{n}-{k}"] = list(joint_pts(f"joint-r-finger-{n}-{k}"))

def rotate_points(Pts, center, axis, angle):
    if abs(angle) < 1e-9:
        return Pts
    axis = axis / np.linalg.norm(axis)
    K = np.array([[0, -axis[2], axis[1]], [axis[2], 0, -axis[0]], [-axis[1], axis[0], 0]])
    R = np.eye(3) + np.sin(angle) * K + (1 - np.cos(angle)) * (K @ K)
    return (Pts - center) @ R.T + center

def refresh_chain(n):
    for k in range(4):
        chains[n][k] = joint_cube[f"f{n}-{k+1}"][1].mean(axis=0)

def rotate_finger(n, center, axis, angle, seg_min=0):
    mask = (assign_finger == n) & (assign_seg >= seg_min)
    P[mask] = rotate_points(P[mask], center, axis, angle)
    for k in range(seg_min, 4):
        key = f"f{n}-{k+1}"
        joint_cube[key][1] = rotate_points(joint_cube[key][1], center, axis, angle)
    refresh_chain(n)

# ---------- 5. 姿态 ----------
mid_dir = chains[3][3] - chains[3][0]
mid_dir /= np.linalg.norm(mid_dir)
mid_p = mid_dir - palm_n * np.dot(mid_dir, palm_n)
mid_p /= np.linalg.norm(mid_p)
STYLE_FAN = {2: 0.05, 3: 0.0, 4: -0.04, 5: -0.09}
for n in (2, 4, 5):  # 拇指不参与收拢，保持自然外展
    d = chains[n][3] - chains[n][0]
    d /= np.linalg.norm(d)
    d_p = d - palm_n * np.dot(d, palm_n)
    d_p /= np.linalg.norm(d_p)
    angle = np.arctan2(np.dot(np.cross(mid_p, d_p), palm_n), np.dot(mid_p, d_p))
    rotate_finger(n, chains[n][0], palm_n, -angle * 0.8 + STYLE_FAN[n])

# 拇指姿态：先按 5a 收拢，再自动求解把拇指尖转到掌平面前方（+Z，可见）
axis = chains[3][0] - joints["wrist"]
axis /= np.linalg.norm(axis)
rotate_finger(1, chains[1][0], palm_n, 0.05)

# 自动前摆：绕手掌横轴（right_o）旋转拇指链，把拇指尖摆到掌平面前方
up_axis = chains[3][0] - joints["wrist"]
up_axis /= np.linalg.norm(up_axis)
dorsal_o = dorsal_n - up_axis * np.dot(dorsal_n, up_axis)
dorsal_o /= np.linalg.norm(dorsal_o)
right_o = np.cross(up_axis, dorsal_o)
tip0 = chains[1][3].copy()
pivot0 = chains[1][0].copy()
idx_kn_x = float(np.dot(chains[2][0] - joints["wrist"], right_o))
best_phi, best_score = 0.0, -1e9
for phi in np.linspace(-1.0, 1.0, 81):
    tp = rotate_points(tip0[None, :], pivot0, right_o, phi)[0]
    z = float(np.dot(tp - joints["wrist"], dorsal_o))
    x = float(np.dot(tp - joints["wrist"], right_o))
    # 目标姿态：拇指尖留在掌缘外侧（x≈-0.55dm）且略向前（z≈+0.08dm）
    score = -((x + 0.55) ** 2 * 4.0 + (z - 0.08) ** 2 * 2.0) - abs(phi) * 0.15
    if score > best_score:
        best_score, best_phi = score, phi
rotate_finger(1, pivot0, right_o, best_phi)
print("thumb forward phi", round(best_phi, 3), "tip z", round(best_score, 3))

# 拉直基础姿态的屈曲（展示姿态需要甲面朝向观察者）
for n in range(1, 6):
    for s in (1, 2):
        d_prev = chains[n][s] - chains[n][s - 1]
        d_cur = chains[n][s + 1] - chains[n][s]
        d_prev /= np.linalg.norm(d_prev)
        d_cur /= np.linalg.norm(d_cur)
        ax = np.cross(d_prev, d_cur)
        alen = np.linalg.norm(ax)
        if alen < 1e-6:
            continue
        ax /= alen
        angle = np.arctan2(alen, np.dot(d_prev, d_cur))
        rotate_finger(n, chains[n][s], ax, angle * 0.72, seg_min=s)

# 极轻弯（自然放松感，向掌心侧）
CURL = [(0, 0.02), (1, 0.05), (2, 0.03)]
THUMB_CURL = [(0, 0.02), (1, 0.04), (2, 0.03)]
for n in range(1, 6):
    for seg_i, ang in (THUMB_CURL if n == 1 else CURL):
        center = chains[n][seg_i]
        d2 = chains[n][min(seg_i + 1, 3)] - center
        d2 /= np.linalg.norm(d2)
        ax = np.cross(d2, palm_n)
        ax /= np.linalg.norm(ax)
        test = rotate_points(d2[None, :], np.zeros(3), ax, ang)[0]
        if np.dot(test - d2, palm_n) < 0:
            ax = -ax
        rotate_finger(n, center, ax, ang, seg_min=seg_i)

mesh.vertices = P
mesh.fill_holes()
posed_normals = mesh.vertex_normals.copy()

# ---------- 6. 归一化参数（腕部原点、中指 +Y、指背 +Z） ----------
wrist = joints["wrist"]
up = chains[3][0] - wrist
up /= np.linalg.norm(up)
dorsal = dorsal_n - up * np.dot(dorsal_n, up)
dorsal /= np.linalg.norm(dorsal)
right = np.cross(up, dorsal)
M = np.stack([right, up, dorsal])
scale = 1.55 / np.linalg.norm((chains[3][3] - chains[3][0]))

def to_local(Pts):
    return (np.atleast_2d(np.asarray(Pts, dtype=float)) - wrist) @ M.T * scale

mirror = 1.0
if to_local(chains[1][3])[0][0] > 0:
    mirror = -1.0
    print("mirrored x")

def to_final(Pts):
    out = to_local(Pts)
    out[:, 0] *= mirror
    return out

def dir_final(Vec):
    out = np.atleast_2d(np.asarray(Vec, dtype=float)) @ M.T * scale
    out[:, 0] *= mirror
    return out

# ---------- 7. 两次细分 + 拉普拉斯平滑，归一化到最终坐标 ----------
mesh.vertices = P
sv, sf = trimesh.remesh.subdivide(mesh.vertices, mesh.faces)
mesh = trimesh.Trimesh(sv, sf, process=False)
trimesh.smoothing.filter_laplacian(mesh, lamb=0.6, iterations=4)
sv, sf = trimesh.remesh.subdivide(mesh.vertices, mesh.faces)
mesh = trimesh.Trimesh(sv, sf, process=False)
trimesh.smoothing.filter_laplacian(mesh, lamb=0.5, iterations=2)
print("smoothed verts", len(mesh.vertices), "faces", len(mesh.faces))

mesh.vertices = to_local(mesh.vertices)
if mirror < 0:
    mesh.vertices[:, 0] *= -1
    mesh.faces = mesh.faces[:, ::-1]

# ---------- 8. 逐顶点 shrink-wrap：甲床网格全顶点 raycast 贴面 ----------
Vf = mesh.vertices
Nf = mesh.vertex_normals
ZAXIS = np.array([0.0, 0.0, 1.0])
finger_names = {1: "thumb", 2: "index", 3: "middle", 4: "ring", 5: "pinky"}
SHELL = 0.012  # 壳层厚度（甲面与皮肤的防穿模间隙）

def ray_surface(point, direction, max_dist=0.8):
    """从 point 外侧沿 -direction 发射，返回最近命中点与插值法线；未命中返回 None"""
    origin = (point + direction * max_dist)[None, :]
    locs, _, tris = mesh.ray.intersects_location(origin, (-direction)[None, :])
    if len(locs) == 0:
        return None
    along = np.linalg.norm(locs - origin, axis=1)
    i = int(along.argmin())
    tri = mesh.faces[tris[i]]
    bary = trimesh.triangles.points_to_barycentric(
        mesh.triangles[tris[i]][None, :], locs[i][None, :])[0]
    nrm = (Nf[tri] * bary[:, None]).sum(axis=0)
    return locs[i], nrm

def bed_center_ray(bone_p, zdir):
    res = ray_surface(bone_p, zdir)
    if res is None:
        return None
    return res[0], res[1] / np.linalg.norm(res[1])

def measure_halfwidth(chit, yv, xv, zv):
    """沿 xv 双向行进扫描，法线转角 44° 为甲缘，返回 (half_w, drop)"""
    edges = []
    for sign in (-1.0, 1.0):
        hw, prev_dot = 0.10, 1.0
        for u in np.linspace(0.02, 0.24, 12):
            res = ray_surface(chit + xv * (sign * u), zv, max_dist=0.5)
            if res is None:
                hw = u - 0.02
                break
            hn = res[1] / np.linalg.norm(res[1])
            hd = float(np.dot(hn, zv))
            if hd < 0.72:
                hw = float(u - 0.02 + 0.02 * (prev_dot - 0.72) / max(prev_dot - hd, 1e-6))
                break
            prev_dot = hd
            hw = u
        edges.append(hw)
    return float(min(edges))

anchors = {}
for n in range(1, 6):
    j3f = to_final(chains[n][2])[0]
    j4f = to_final(chains[n][3])[0]
    seg = j4f - j3f
    L = float(np.linalg.norm(seg))
    d_chain = seg / L
    tip_m = Vf[np.linalg.norm(Vf - j4f, axis=1).argmin()]

    # 1) 初始中心列：用全局背侧投影作初猜，求纵轴
    dz0 = ZAXIS - d_chain * np.dot(ZAXIS, d_chain)
    dz0 /= np.linalg.norm(dz0)
    ch0, cn0 = [], []
    for st in (0.15, 0.35, 0.55, 0.75, 0.9):
        res = bed_center_ray(tip_m - d_chain * (L - st * L), dz0)
        if res is not None:
            ch0.append(res[0])
            cn0.append(res[1])
    ch0 = np.array(ch0)
    cn0 = np.array(cn0)
    ch_c = ch0.mean(axis=0)
    _, _, vh = np.linalg.svd(ch0 - ch_c, full_matrices=False)
    y = vh[0]
    if np.dot(y, d_chain) < 0:
        y = -y
    y /= np.linalg.norm(y)
    z0 = cn0.mean(axis=0)
    z0 -= y * np.dot(z0, y)
    z0 /= np.linalg.norm(z0)
    if np.dot(z0, dz0) < 0:
        z0 = -z0
    x0 = np.cross(y, z0)

    # 2) 绕纵轴滚转搜索：背侧甲床是最宽最平的截面（拇指横断面方向与四指不同）
    best = None  # (score, roll, zv, xv, halfw)
    mid_bone = tip_m - d_chain * (L - 0.55 * L)
    for roll in np.linspace(-np.pi, np.pi, 49):
        zv = z0 * np.cos(roll) + x0 * np.sin(roll)
        zv -= y * np.dot(zv, y)
        zv /= np.linalg.norm(zv)
        xv = np.cross(y, zv)
        res = bed_center_ray(mid_bone, zv)
        if res is None:
            continue
        hw = measure_halfwidth(res[0], y, xv, zv)
        score = min(hw, 0.16) - abs(roll) * 0.01
        if best is None or score > best[0]:
            best = (score, roll, zv, xv, hw)
    _, roll, z, x, _ = best
    z -= y * np.dot(z, y)
    z /= np.linalg.norm(z)
    x = np.cross(y, z)
    x /= np.linalg.norm(x)
    z = np.cross(x, y)

    # 3) 甲根原点：t=0.07L 处表面点
    res = bed_center_ray(tip_m - d_chain * (L - 0.15 * L), z)
    origin = res[0] - y * (0.08 * L)
    bed_len = (0.92 - 0.07) * L

    # 4) 逐顶点 shrink-wrap 网格（行=纵向，列=横向绝对偏移）
    rows_v = np.linspace(0.0, 1.04 * L, 20)
    cols_u = np.linspace(-0.2, 0.2, 17)
    rows = []
    for v in rows_v:
        base = origin + y * v
        cols = []
        half_w = 0.0
        for u in cols_u:
            res = ray_surface(base + x * u, z, max_dist=0.5)
            if res is None:
                cols.append(None)
                continue
            hit, hn = res
            hn /= np.linalg.norm(hn)
            # 法线过分侧倾或命中点偏离行平面太多视为甲缘之外
            if float(np.dot(hn, z)) < 0.35 or abs(float(np.dot(hit - base, y))) > 0.06 * L:
                cols.append(None)
                continue
            zz = float(np.dot(hit - base, z))
            xx = float(np.dot(hit - base, x))
            hno = hn - y * np.dot(hn, y)
            hno /= max(np.linalg.norm(hno), 1e-6)
            cols.append({
                "u": float(xx), "z": zz,
                "n": [float(np.dot(hno, x)), float(np.dot(hno, y)), float(np.dot(hno, z))],
            })
        valid = [c for c in cols if c is not None]
        if len(valid) >= 5:
            half_w = float(min(abs(valid[0]["u"]), abs(valid[-1]["u"])))
            rows.append({"v": float(v), "halfW": half_w, "cols": valid})
    # 甲床有效结束于最后一行完整命中处
    v_max = rows[-1]["v"] if rows else bed_len

    # 5) 数值验证：壳层偏移后所有网格点不得穿入皮肤
    min_gap = 1e9
    for row in rows:
        base = origin + y * row["v"]
        for c in row["cols"]:
            p = base + x * c["u"] + z * (c["z"] + SHELL)
            dmin = float(np.linalg.norm(Vf - p, axis=1).min())
            min_gap = min(min_gap, dmin)

    anchors[finger_names[n]] = {
        "origin": [float(v) for v in origin],
        "y": [float(v) for v in y],
        "z": [float(v) for v in z],
        "x": [float(v) for v in x],
        "bedLen": float(bed_len),
        "vMax": float(v_max),
        "shell": SHELL,
        "rows": rows,
    }
    print(finger_names[n], "roll", round(float(roll), 2), "rows", len(rows),
          "vMax", round(v_max, 3), "minGap", round(min_gap, 4),
          "halfW0", round(rows[0]["halfW"], 3) if rows else None)

mesh.export("female-hand.glb")
with open("hand-anchors.json", "w") as f:
    json.dump({"fingers": anchors}, f, indent=2)
print("exported female-hand.glb + hand-anchors.json")

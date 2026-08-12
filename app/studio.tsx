"use client";

import { useEffect, useMemo, useState } from "react";
import NailPreview3D from "./three/NailPreview3D";

export type NailShape = "杏仁" | "方圆" | "方形" | "芭蕾";
export type NailLength = "短款" | "中款" | "长款";
export type Finish = "亮面" | "哑光" | "猫眼" | "镜面" | "果冻";
export type Pattern = "纯色" | "法式" | "渐变" | "晕染";
export type Accessory = "无饰品" | "微珠" | "水晶" | "金线";

export type NailDesign = {
  color: string;
  finish: Finish;
  pattern: Pattern;
  accessory: Accessory;
};

const fingers = ["拇指", "食指", "中指", "无名指", "小指"];
const colors = [
  { name: "燕麦奶", value: "#c8a995" },
  { name: "裸粉", value: "#b97578" },
  { name: "浆果酒", value: "#712d3d" },
  { name: "深夜黑", value: "#282326" },
  { name: "贝母白", value: "#e8ddd2" },
  { name: "鼠尾草", value: "#879080" },
];
const initialNails: NailDesign[] = [
  { color: "#b97578", finish: "亮面", pattern: "纯色", accessory: "无饰品" },
  { color: "#b97578", finish: "亮面", pattern: "纯色", accessory: "微珠" },
  { color: "#b97578", finish: "亮面", pattern: "晕染", accessory: "无饰品" },
  { color: "#b97578", finish: "亮面", pattern: "纯色", accessory: "水晶" },
  { color: "#b97578", finish: "亮面", pattern: "纯色", accessory: "无饰品" },
];

const shapeClass: Record<NailShape, string> = {
  杏仁: "shape-almond",
  方圆: "shape-squoval",
  方形: "shape-square",
  芭蕾: "shape-coffin",
};

const lengthClass: Record<NailLength, string> = {
  短款: "length-short",
  中款: "length-medium",
  长款: "length-long",
};

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 3h11l3 3v15H5zM8 3v6h8V3M8 21v-8h8v8" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 4v6h6M5.5 15a7 7 0 1 0 .8-7.8L4 10" />
    </svg>
  );
}

type HandPreviewProps = {
  shape: NailShape;
  length: NailLength;
  nails: NailDesign[];
  activeFinger: number;
  onSelectFinger: (index: number) => void;
};

/** 2D CSS 手部预览：SSR 首帧、WebGL 不可用或 3D 加载失败时的可靠降级 */
function CssHandPreview({ shape, length, nails, activeFinger, onSelectFinger }: HandPreviewProps) {
  return (
    <div className="hand">
      <div className="palm" />
      {nails.map((nail, index) => (
        <button
          key={fingers[index]}
          className={`finger finger-${index} ${activeFinger === index ? "active" : ""}`}
          onClick={() => onSelectFinger(index)}
          aria-label={`编辑${fingers[index]}`}
          aria-pressed={activeFinger === index}
        >
          <span className="finger-skin" />
          <span
            className={`nail ${shapeClass[shape]} ${lengthClass[length]} finish-${nail.finish} pattern-${nail.pattern}`}
            style={{ "--nail-color": nail.color } as React.CSSProperties}
          >
            <span className="nail-gloss" />
            <span className={`accessory accessory-${nail.accessory}`} />
          </span>
        </button>
      ))}
    </div>
  );
}

export default function NailStudio() {
  const [shape, setShape] = useState<NailShape>("杏仁");
  const [length, setLength] = useState<NailLength>("中款");
  const [activeFinger, setActiveFinger] = useState(2);
  const [nails, setNails] = useState<NailDesign[]>(initialNails);
  const [applyAll, setApplyAll] = useState(false);
  const [saved, setSaved] = useState(false);
  const current = nails[activeFinger];

  useEffect(() => {
    const stored = window.localStorage.getItem("nail-lab-design");
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      if (parsed.shape && parsed.length && Array.isArray(parsed.nails)) {
        const restoreId = window.setTimeout(() => {
          setShape(parsed.shape);
          setLength(parsed.length);
          setNails(parsed.nails);
        }, 0);
        return () => window.clearTimeout(restoreId);
      }
    } catch {
      window.localStorage.removeItem("nail-lab-design");
    }
  }, []);

  const updateCurrent = (patch: Partial<NailDesign>) => {
    setSaved(false);
    setNails((previous) =>
      previous.map((nail, index) =>
        applyAll || index === activeFinger ? { ...nail, ...patch } : nail,
      ),
    );
  };

  const total = useMemo(() => {
    const base = length === "短款" ? 168 : length === "中款" ? 198 : 228;
    const finishCost = nails.reduce(
      (sum, nail) => sum + (nail.finish === "亮面" ? 0 : nail.finish === "哑光" ? 6 : 12),
      0,
    );
    const decorCost = nails.reduce(
      (sum, nail) =>
        sum +
        (nail.accessory === "无饰品"
          ? 0
          : nail.accessory === "微珠"
            ? 5
            : nail.accessory === "金线"
              ? 8
              : 15),
      0,
    );
    return base + finishCost + decorCost;
  }, [length, nails]);

  const saveDesign = () => {
    window.localStorage.setItem(
      "nail-lab-design",
      JSON.stringify({ shape, length, nails }),
    );
    setSaved(true);
  };

  const resetDesign = () => {
    setShape("杏仁");
    setLength("中款");
    setNails(initialNails);
    setActiveFinger(2);
    setApplyAll(false);
    setSaved(false);
    window.localStorage.removeItem("nail-lab-design");
  };

  const warnings = [];
  if (length === "长款") warnings.push("长款日常受力更明显，建议避免频繁开罐或搬运重物。");
  if (nails.some((nail) => nail.accessory === "水晶"))
    warnings.push("立体水晶建议使用加固胶，并在 2–3 周内卸除或补胶。");

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#studio" aria-label="甲作实验室首页">
          <span className="brand-mark">N</span>
          <span>
            <b>NAILFORM</b>
            <small>甲作实验室</small>
          </span>
        </a>
        <div className="step-indicator" aria-label="当前设计进度">
          <span className="step active"><i>01</i> 甲型</span>
          <span className="line" />
          <span className="step active"><i>02</i> 设计</span>
          <span className="line" />
          <span className="step"><i>03</i> 确认</span>
        </div>
        <button className="ghost-button" onClick={saveDesign}>
          <SaveIcon />
          {saved ? "已保存" : "保存方案"}
        </button>
      </header>

      <section className="studio" id="studio">
        <aside className="left-panel" aria-label="基础甲型设置">
          <div className="section-kicker">01 · FOUNDATION</div>
          <h1>先找到适合你的<br /><em>指尖轮廓</em></h1>
          <p className="lead">甲型决定整体气质，也影响牢固度与日常使用感。</p>

          <fieldset className="control-group">
            <legend>甲型</legend>
            <div className="shape-grid">
              {(["杏仁", "方圆", "方形", "芭蕾"] as NailShape[]).map((item) => (
                <button
                  className={shape === item ? "shape-card selected" : "shape-card"}
                  key={item}
                  onClick={() => {
                    setShape(item);
                    setSaved(false);
                  }}
                  aria-pressed={shape === item}
                >
                  <span className={`shape-swatch ${shapeClass[item]}`} />
                  <b>{item}</b>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="control-group">
            <legend>长度</legend>
            <div className="segmented">
              {(["短款", "中款", "长款"] as NailLength[]).map((item) => (
                <button
                  key={item}
                  className={length === item ? "selected" : ""}
                  onClick={() => {
                    setLength(item);
                    setSaved(false);
                  }}
                  aria-pressed={length === item}
                >
                  {item}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="care-note">
            <span>匹配建议</span>
            <p>{shape === "杏仁" ? "修饰指型，视觉上更纤长；中长甲效果最佳。" : shape === "方圆" ? "自然耐用，适合键盘办公与日常通勤。" : shape === "方形" ? "线条利落，短甲也能呈现干净的现代感。" : "时装感突出，更适合中长甲与几何装饰。"}</p>
          </div>
        </aside>

        <section className="preview-panel" aria-label="美甲实时预览">
          <div className="preview-toolbar">
            <div>
              <span className="live-dot" />
              实时材质预览
            </div>
            <span>点击指甲单独编辑</span>
          </div>

          <div className="hand-stage">
            <div className="ambient ambient-one" />
            <div className="ambient ambient-two" />
            <NailPreview3D
              shape={shape}
              length={length}
              nails={nails}
              activeFinger={activeFinger}
              onSelectFinger={(index) => {
                setActiveFinger(index);
                setApplyAll(false);
              }}
              fallback={
                <CssHandPreview
                  shape={shape}
                  length={length}
                  nails={nails}
                  activeFinger={activeFinger}
                  onSelectFinger={(index) => {
                    setActiveFinger(index);
                    setApplyAll(false);
                  }}
                />
              }
            />
            <div className="surface-shadow" />
          </div>

          <div className="finger-tabs">
            {fingers.map((finger, index) => (
              <button
                key={finger}
                className={activeFinger === index ? "active" : ""}
                onClick={() => {
                  setActiveFinger(index);
                  setApplyAll(false);
                }}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                {finger}
              </button>
            ))}
          </div>
        </section>

        <aside className="right-panel" aria-label="美甲样式设置">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">02 · DESIGN</span>
              <h2>{applyAll ? "编辑全部指甲" : `编辑${fingers[activeFinger]}`}</h2>
            </div>
            <label className="apply-switch">
              <input
                type="checkbox"
                checked={applyAll}
                onChange={(event) => setApplyAll(event.target.checked)}
              />
              <span />
              应用全部
            </label>
          </div>

          <fieldset className="control-group compact">
            <legend>主色</legend>
            <div className="color-row">
              {colors.map((color) => (
                <button
                  key={color.name}
                  className={current.color === color.value ? "color-chip selected" : "color-chip"}
                  style={{ "--chip-color": color.value } as React.CSSProperties}
                  onClick={() => updateCurrent({ color: color.value })}
                  aria-label={color.name}
                  title={color.name}
                />
              ))}
            </div>
            <div className="selected-name">
              {colors.find((color) => color.value === current.color)?.name ?? "自定义色"}
              <code>{current.color.toUpperCase()}</code>
            </div>
          </fieldset>

          <fieldset className="control-group compact">
            <legend>质感</legend>
            <div className="option-list">
              {(["亮面", "哑光", "猫眼", "镜面", "果冻"] as Finish[]).map((item) => (
                <button
                  key={item}
                  className={current.finish === item ? "option selected" : "option"}
                  onClick={() => updateCurrent({ finish: item })}
                >
                  <span className={`material-dot finish-${item}`} style={{ "--nail-color": current.color } as React.CSSProperties} />
                  {item}
                  <ChevronIcon />
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="control-group compact">
            <legend>图案</legend>
            <div className="pattern-grid">
              {(["纯色", "法式", "渐变", "晕染"] as Pattern[]).map((item) => (
                <button
                  key={item}
                  className={current.pattern === item ? "selected" : ""}
                  onClick={() => updateCurrent({ pattern: item })}
                >
                  <span className={`pattern-preview pattern-${item}`} style={{ "--nail-color": current.color } as React.CSSProperties} />
                  {item}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="control-group compact last">
            <legend>点缀</legend>
            <div className="accessory-row">
              {(["无饰品", "微珠", "水晶", "金线"] as Accessory[]).map((item) => (
                <button
                  key={item}
                  className={current.accessory === item ? "selected" : ""}
                  onClick={() => updateCurrent({ accessory: item })}
                >
                  {item}
                </button>
              ))}
            </div>
          </fieldset>
        </aside>
      </section>

      <footer className="summary-bar">
        <button className="reset-button" onClick={resetDesign}>
          <ResetIcon />
          重置
        </button>
        <div className="summary-details">
          <span><b>{shape}</b> · {length}</span>
          <i />
          <span>{new Set(nails.map((nail) => nail.color)).size} 种配色</span>
          <i />
          <span>预计 90–120 分钟</span>
        </div>
        {warnings.length > 0 && (
          <div className="warning" title={warnings.join("\n")}>
            <span>i</span>
            {warnings[0]}
          </div>
        )}
        <div className="price">
          <small>方案参考价</small>
          <strong>¥{total}</strong>
        </div>
        <button className="primary-button" onClick={saveDesign}>
          {saved ? "方案已保存" : "完成这套设计"}
          <ChevronIcon />
        </button>
      </footer>
    </main>
  );
}

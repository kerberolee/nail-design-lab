import type { Metadata } from "next";
import NailStudio from "./studio";

export const metadata: Metadata = {
  title: "甲作实验室 · DIY 美甲工作台",
  description: "在指尖完成配色、甲型、材质与饰品的搭配预演。",
};

export default function Home() {
  return <NailStudio />;
}

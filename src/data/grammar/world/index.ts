import type { StoredWorldArea } from "@/lib/grammar-world";
import order from "./order.json";
import dongTu from "./dong-tu.json";
import maoTu from "./mao-tu.json";
import cauHoi from "./cau-hoi.json";
import gioiTu from "./gioi-tu.json";

/**
 * One file per tab. `order.json` is the left-to-right order.
 * A new tab is a `<id>.json` file, a line in `order.json`, and an import here.
 */
const byId: Record<string, StoredWorldArea> = {
  "dong-tu": dongTu as StoredWorldArea,
  "mao-tu": maoTu as StoredWorldArea,
  "cau-hoi": cauHoi as StoredWorldArea,
  "gioi-tu": gioiTu as StoredWorldArea,
};

export const worldAreas: StoredWorldArea[] = (order as string[]).map((id) => {
  const area = byId[id];
  if (!area) throw new Error(`Grammar tab "${id}" is listed in order.json but not imported`);
  return area;
});

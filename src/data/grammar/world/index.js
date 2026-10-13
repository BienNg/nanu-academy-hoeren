"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.worldAreas = void 0;
const order_json_1 = __importDefault(require("./order.json"));
const dong_tu_json_1 = __importDefault(require("./dong-tu.json"));
const mao_tu_json_1 = __importDefault(require("./mao-tu.json"));
const cau_hoi_json_1 = __importDefault(require("./cau-hoi.json"));
const gioi_tu_json_1 = __importDefault(require("./gioi-tu.json"));
/**
 * One file per tab. `order.json` is the left-to-right order.
 * A new tab is a `<id>.json` file, a line in `order.json`, and an import here.
 */
const byId = {
    "dong-tu": dong_tu_json_1.default,
    "mao-tu": mao_tu_json_1.default,
    "cau-hoi": cau_hoi_json_1.default,
    "gioi-tu": gioi_tu_json_1.default,
};
exports.worldAreas = order_json_1.default.map((id) => {
    const area = byId[id];
    if (!area)
        throw new Error(`Grammar tab "${id}" is listed in order.json but not imported`);
    return area;
});

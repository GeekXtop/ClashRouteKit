/**
 * web 侧统一 fetcher 签名（与各调用点既有 Fetcher 形状一致）。
 * hit-simulator 终审 Minor 收口：routeSimulator / HitSimulatorPanel / RoutingPage
 * 的重复本地定义收口到此。
 */
export type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

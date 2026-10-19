import { useState } from "react";
import type { RouteTraceRow, SimulateRouteResult } from "@clash-route-kit/core";
import { Alert, Button, Collapse, Input, Space, Table, Tag, Typography } from "antd";
import { simulateRouteHit } from "../routeSimulator.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const OUTCOME_TEXT: Record<string, string> = {
  hit: "命中",
  miss: "未中",
  skipped: "跳过",
  "not-evaluated": "未评估",
};

/**
 * 命中模拟面板（spec: 2026-10-19-hit-simulator-design.md §5 web 部分）：
 * 输入域名 → 展示命中路由 / 策略链 / 可能终点 / 可折叠评估轨迹。
 * 传入 yaml（草稿）时按草稿评估，否则按服务端磁盘配置。
 */
export function HitSimulatorPanel(props: { yaml?: string; fetcher?: Fetcher }) {
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SimulateRouteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (): Promise<void> => {
    const trimmed = domain.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await simulateRouteHit(trimmed, props.yaml, props.fetcher));
    } catch (cause) {
      setResult(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  };

  const matched = result?.matched;

  return (
    <Space direction="vertical" style={{ width: "100%" }} size={8}>
      <Space.Compact style={{ width: "100%", maxWidth: 520 }}>
        <Input
          placeholder="输入域名，如 www.example.com"
          value={domain}
          onChange={(event) => setDomain(event.target.value)}
          onPressEnter={() => void run()}
          allowClear
        />
        <Button type="primary" loading={loading} onClick={() => void run()}>
          模拟
        </Button>
      </Space.Compact>
      {error ? <Alert type="error" showIcon message={error} /> : null}
      {result && !matched ? (
        <Typography.Text type="secondary">未命中且无 final 兜底：{result.domain}</Typography.Text>
      ) : null}
      {result && matched ? (
        <Space direction="vertical" size={4} style={{ width: "100%" }}>
          <Typography.Text>
            命中路由：{matched.label}（第 {matched.index + 1} 条）→ {matched.policyLabel}
          </Typography.Text>
          {matched.chain.length > 0 ? (
            <Typography.Text type="secondary">
              策略链：{matched.chain.map((node) => node.name).join(" → ")}
            </Typography.Text>
          ) : null}
          <Space size={4} wrap>
            {matched.possibleTerminals.map((terminal) => (
              <Tag key={terminal} color={terminal === "direct" ? "green" : terminal === "reject" ? "red" : "blue"}>
                {terminal}
              </Tag>
            ))}
          </Space>
          <Collapse
            ghost
            items={[
              {
                key: "trace",
                label: "评估轨迹",
                children: (
                  <Table<RouteTraceRow>
                    size="small"
                    pagination={false}
                    rowKey={(row) => `${row.index}`}
                    dataSource={result.trace}
                    columns={[
                      { title: "#", dataIndex: "index", width: 48 },
                      { title: "路由", dataIndex: "routeId", width: 120 },
                      { title: "源", dataIndex: "label" },
                      {
                        title: "结果",
                        dataIndex: ["outcome", "kind"],
                        width: 160,
                        render: (_: unknown, row) =>
                          row.outcome.kind === "skipped"
                            ? `跳过：${row.outcome.reason}`
                            : (OUTCOME_TEXT[row.outcome.kind] ?? row.outcome.kind),
                      },
                    ]}
                  />
                ),
              },
            ]}
          />
        </Space>
      ) : null}
    </Space>
  );
}

import { useEffect, useState } from "react";
import { Alert, Button, Drawer, Input, InputNumber, Select, Space, Tabs } from "antd";
import type { RouteKitDefaults } from "@clash-route-kit/core";
import {
  createProjectDefaultsDraft,
  finalizeProjectDefaultsDraft,
} from "../drawerDrafts.js";

export type ProjectDefaultsSection = "proxy-groups" | "rule-sets";

export function ProjectDefaultsDrawer(props: {
  open: boolean;
  initialSection: ProjectDefaultsSection;
  defaults?: RouteKitDefaults;
  onSave: (defaults: RouteKitDefaults) => void;
  onCancel: () => void;
}) {
  const [activeSection, setActiveSection] = useState<ProjectDefaultsSection>(
    props.initialSection,
  );
  const [draft, setDraft] = useState<RouteKitDefaults>(() =>
    createProjectDefaultsDraft(props.defaults),
  );
  const [error, setError] = useState("");

  useEffect(() => {
    if (props.open) {
      setActiveSection(props.initialSection);
      setDraft(createProjectDefaultsDraft(props.defaults));
      setError("");
    }
  }, [props.initialSection, props.open]);

  const healthCheck = draft.proxyGroups?.healthCheck;
  const ruleSets = draft.ruleSets;

  function updateHealthCheck(
    patch: Partial<NonNullable<NonNullable<RouteKitDefaults["proxyGroups"]>["healthCheck"]>>,
  ) {
    setDraft((current) => ({
      ...current,
      proxyGroups: {
        ...current.proxyGroups,
        healthCheck: { ...current.proxyGroups?.healthCheck, ...patch },
      },
    }));
    setError("");
  }

  function updateRuleSets(patch: Partial<NonNullable<RouteKitDefaults["ruleSets"]>>) {
    setDraft((current) => ({
      ...current,
      ruleSets: { ...current.ruleSets, ...patch },
    }));
    setError("");
  }

  function handleSave() {
    const result = finalizeProjectDefaultsDraft(draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    props.onSave(result.value);
  }

  return (
    <Drawer
      open={props.open}
      onClose={props.onCancel}
      width={480}
      title="项目默认值"
      footer={(
        <Space style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button onClick={props.onCancel}>取消</Button>
          <Button type="primary" onClick={handleSave}>保存</Button>
        </Space>
      )}
    >
      {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} /> : null}
      <Tabs
        activeKey={activeSection}
        onChange={(key) => setActiveSection(key as ProjectDefaultsSection)}
        items={[
          {
            key: "proxy-groups",
            label: "策略组健康检查",
            children: (
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                <div>
                  <div className="rk-field-label">项目测速 URL</div>
                  <Input
                    aria-label="项目测速 URL"
                    value={healthCheck?.url ?? ""}
                    placeholder="https://cp.cloudflare.com/generate_204"
                    onChange={(event) =>
                      updateHealthCheck({ url: event.target.value || undefined })
                    }
                  />
                </div>
                <div>
                  <div className="rk-field-label">项目测速间隔（秒）</div>
                  <InputNumber
                    aria-label="项目测速间隔（秒）"
                    value={healthCheck?.interval}
                    min={1}
                    precision={0}
                    placeholder="300"
                    style={{ width: "100%" }}
                    onChange={(value) =>
                      updateHealthCheck({ interval: value ?? undefined })
                    }
                  />
                </div>
                <div>
                  <div className="rk-field-label">项目测速超时（秒）</div>
                  <InputNumber
                    aria-label="项目测速超时（秒）"
                    value={healthCheck?.timeout}
                    min={1}
                    precision={0}
                    placeholder="5"
                    style={{ width: "100%" }}
                    onChange={(value) => updateHealthCheck({ timeout: value ?? undefined })}
                  />
                </div>
                <div>
                  <div className="rk-field-label">项目 URLTest 容差（毫秒）</div>
                  <InputNumber
                    aria-label="项目 URLTest 容差（毫秒）"
                    value={draft.proxyGroups?.urlTest?.tolerance}
                    min={0}
                    precision={0}
                    placeholder="50"
                    style={{ width: "100%" }}
                    onChange={(value) => {
                      setDraft((current) => ({
                        ...current,
                        proxyGroups: {
                          ...current.proxyGroups,
                          urlTest: { tolerance: value ?? undefined },
                        },
                      }));
                      setError("");
                    }}
                  />
                </div>
              </Space>
            ),
          },
          {
            key: "rule-sets",
            label: "规则默认值",
            children: (
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                <div>
                  <div className="rk-field-label">Rule Provider 刷新间隔（秒）</div>
                  <InputNumber
                    aria-label="Rule Provider 刷新间隔（秒）"
                    value={ruleSets?.ruleProviderInterval}
                    min={1}
                    precision={0}
                    placeholder="28800"
                    style={{ width: "100%" }}
                    onChange={(value) =>
                      updateRuleSets({ ruleProviderInterval: value ?? undefined })
                    }
                  />
                </div>
                <div>
                  <div className="rk-field-label">GEOIP 默认 no-resolve</div>
                  <Select
                    aria-label="GEOIP 默认 no-resolve"
                    value={ruleSets?.geoipNoResolve === false ? "disabled" : "enabled"}
                    style={{ width: "100%" }}
                    options={[
                      { value: "enabled", label: "开启" },
                      { value: "disabled", label: "关闭" },
                    ]}
                    onChange={(value) =>
                      updateRuleSets({ geoipNoResolve: value === "enabled" })
                    }
                  />
                </div>
              </Space>
            ),
          },
        ]}
      />
    </Drawer>
  );
}

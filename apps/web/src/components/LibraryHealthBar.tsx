import { useState } from "react";
import { CircleCheck, HeartPulse } from "lucide-react";

export interface LibraryHealthItem {
  id: string;
  title: string;
  detail?: string;
  /** 携带时可定位到侧栏对应规则源行。 */
  providerName?: string;
  /** 携带时可打开项目默认值抽屉对应分节。 */
  defaultsSection?: "proxy-groups" | "rule-sets";
}

export type LibraryHealthSectionKey = "pending" | "stale" | "blocking";

const SECTION_LABELS: Record<LibraryHealthSectionKey, string> = {
  pending: "待补全来源",
  stale: "失效来源",
  blocking: "阻断生成",
};

/** 规则库页顶汇总条：待补全 / 失效 / 阻断生成三类计数，点击展开列表并可定位处理。 */
export function LibraryHealthBar(props: {
  pending: readonly LibraryHealthItem[];
  stale: readonly LibraryHealthItem[];
  blocking: readonly LibraryHealthItem[];
  onLocate: (item: LibraryHealthItem) => void;
}) {
  const [expanded, setExpanded] = useState<Record<LibraryHealthSectionKey, boolean>>({
    pending: false,
    stale: false,
    blocking: false,
  });
  const sections = [
    { key: "pending" as const, items: props.pending },
    { key: "stale" as const, items: props.stale },
    { key: "blocking" as const, items: props.blocking },
  ];
  const total = sections.reduce((sum, section) => sum + section.items.length, 0);

  if (total === 0) {
    return (
      <div className="rk-health ok" role="status">
        <CircleCheck size={14} aria-hidden />
        <span>规则库健康：无待补全来源、无失效来源、无阻断生成</span>
      </div>
    );
  }

  return (
    <div className="rk-health">
      <div className="rk-health-head">
        <HeartPulse size={14} aria-hidden />
        <span>规则库体检：</span>
        {sections.map((section) => {
          if (section.items.length === 0) {
            return (
              <span key={section.key} className="rk-health-chip zero">
                0 {SECTION_LABELS[section.key]}
              </span>
            );
          }
          const open = expanded[section.key];
          return (
            <button
              key={section.key}
              type="button"
              className="rk-health-chip"
              aria-expanded={open}
              title="点击展开列表"
              onClick={() =>
                setExpanded((current) => ({ ...current, [section.key]: !current[section.key] }))
              }
            >
              <span
                className={`rk-health-count ${section.key === "blocking" ? "error" : "warn"}`}
              >
                {section.items.length}
              </span>
              {" "}
              {SECTION_LABELS[section.key]}
            </button>
          );
        })}
      </div>
      {sections.map((section) => {
        if (!expanded[section.key] || section.items.length === 0) return null;
        return (
          <ul key={section.key} className="rk-health-list">
            {section.items.map((item) => {
              const locatable = Boolean(item.providerName || item.defaultsSection);
              return (
                <li key={item.id} className="rk-health-item">
                  {locatable ? (
                    <button
                      type="button"
                      className="rk-validation-locate"
                      title="点击定位到对应条目"
                      onClick={() => props.onLocate(item)}
                    >
                      <span className="rk-health-title">{item.title}</span>
                      {item.detail ? (
                        <span className="rk-health-detail">{item.detail}</span>
                      ) : null}
                    </button>
                  ) : (
                    <span className="rk-validation-plain">
                      <span className="rk-health-title">{item.title}</span>
                      {item.detail ? (
                        <span className="rk-health-detail">{item.detail}</span>
                      ) : null}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        );
      })}
    </div>
  );
}

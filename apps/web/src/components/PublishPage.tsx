import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import type { ProjectValidationState } from "../projectController.js";
import { ConfigYamlSection } from "./ConfigYamlSection.js";
import { PublishLeftPanel } from "./PublishLeftPanel.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function PublishPage(props: {
  config: RouteKitProjectConfig;
  validation: ProjectValidationState;
  onRunCheck: () => void;
  fetcher?: Fetcher;
}) {
  const subconverterUrl = props.config.subconverterUrl ?? "http://10.0.0.3:25500/sub";
  return (
    <div className="rk-publish-split">
      <div className="rk-pane rk-publish-col">
        <PublishLeftPanel
          config={props.config}
          validation={props.validation}
          onRunCheck={props.onRunCheck}
          fetcher={props.fetcher}
        />
      </div>
      <div className="rk-pane rk-publish-col">
        <ConfigYamlSection
          publishBaseUrl={props.config.publishBaseUrl}
          templateOutput={props.config.template.output}
          subconverterUrl={subconverterUrl}
        />
      </div>
    </div>
  );
}
